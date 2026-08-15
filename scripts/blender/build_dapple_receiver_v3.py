#!/usr/bin/env python3
"""Build the revision-3 foreground-shadow receiver and its color diagnostic.

This is an offline Blender-review asset. It does not replace the runtime v1 mask.
The receiver combines an authored painted-shadow domain, a broad irregular inward
transition, and sparse multiscale fringe fragments. Protected objects remain zero.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT = ROOT / "design/tooling/blender-dapple-poc-v4"
SOURCE = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png"
REPAIR = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-shadow-repair-v1.png"
RIGHT_FOREGROUND = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-static-v3.png"
OUTPUT = EXPERIMENT / "receiver/foreground-shadow-receiver-v4.png"
DIAGNOSTIC = EXPERIMENT / "receiver/foreground-shadow-receiver-diagnostic.png"

WIDTH = 1672
HEIGHT = 941


def polygon(points: list[tuple[int, int]]) -> Image.Image:
    image = Image.new("L", (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(image).polygon(points, fill=255)
    return image


def multiscale_noise(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    result = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    for grid_size, weight in ((28, 0.46), (57, 0.31), (113, 0.16), (231, 0.07)):
        grid_height = max(3, round(grid_size * HEIGHT / WIDTH))
        grid = np.uint8(rng.random((grid_height, grid_size)) * 255)
        expanded = Image.fromarray(grid, mode="L").resize(
            (WIDTH, HEIGHT), Image.Resampling.BICUBIC
        )
        result += np.asarray(expanded, dtype=np.float32) / 255 * weight
    return np.clip(result, 0, 1)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    repair = Image.open(REPAIR).convert("RGBA")
    painting = Image.alpha_composite(source, repair).convert("RGB")
    rgb = np.asarray(painting, dtype=np.float32) / 255
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = linear[..., 0] * 0.2126 + linear[..., 1] * 0.7152 + linear[..., 2] * 0.0722

    # The full permissive receiver follows the user's red outline. It spans the
    # complete potential foreground shadow ground, while the animated topology
    # is designed to fragment and disappear well before much of this boundary.
    scope = polygon(
        [
            (270, 908), (298, 870), (316, 804), (330, 788), (370, 778),
            (430, 778), (458, 768), (458, 730), (452, 712), (470, 702),
            (511, 701), (536, 714), (548, 735), (574, 746), (641, 748),
            (681, 736), (704, 740), (771, 737), (839, 723), (840, 727),
            (875, 733), (920, 757), (939, 769), (999, 772), (1019, 784),
            (1062, 809), (1091, 815), (1115, 809), (1270, 811), (1432, 811),
            (1544, 817), (1601, 830), (1634, 856), (1652, 887), (1640, 899),
            (1530, 912), (1404, 932), (1240, 941), (1080, 941), (955, 925),
            (810, 930), (690, 932), (530, 926), (356, 917),
        ]
    )

    scope_values = np.asarray(scope.filter(ImageFilter.GaussianBlur(18)), dtype=np.float32) / 255
    noise = multiscale_noise(31073)
    fine_noise = multiscale_noise(94117)

    # A generous shadow-likelihood ramp admits painted highlight texture within
    # the shaded earth but decays before the genuinely bright road.
    shade = np.clip((0.43 - luminance) / 0.31, 0, 1) ** 0.48

    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]
    # This sloped curve tracks the painted foreground-shadow boundary. Eighty
    # pixels of multiscale displacement prevent a readable geometric cutoff.
    boundary = 684 + 0.086 * xx + (noise - 0.5) * 112 + (fine_noise - 0.5) * 34
    signed_distance = yy - boundary
    broad_transition = np.clip((signed_distance + 54) / 218, 0, 1)
    broad_transition = broad_transition * broad_transition * (3 - 2 * broad_transition)

    # Peripheral fragments cross above and below the average boundary. They are
    # correlated across scales, producing clustered slivers and pinholes rather
    # than stamped leaf icons.
    fringe_zone = np.clip((signed_distance + 138) / 96, 0, 1) * np.clip(
        (52 - signed_distance) / 88, 0, 1
    )
    fragments = np.clip((fine_noise - 0.46) / 0.17, 0, 1)
    fragments *= np.clip((noise - 0.36) / 0.27, 0, 1)

    # This remains a permissive receiver: its core is broad and relatively even.
    # The final visible shadow falloff comes from the topology map, not this mask.
    receiver = np.maximum(broad_transition * (0.90 + noise * 0.10), fringe_zone * fragments * 0.42)
    receiver *= scope_values
    receiver *= shade

    exclusions = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(exclusions)
    # Florentino, book, and the bench traced close to their visible footprint.
    draw.polygon(
        [
            (272, 583),
            (346, 568),
            (390, 604),
            (410, 655),
            (465, 706),
            (461, 759),
            (426, 789),
            (375, 764),
            (336, 720),
            (294, 682),
            (253, 652),
        ],
        fill=255,
    )
    draw.polygon(
        [(218, 635), (270, 623), (418, 680), (467, 743), (443, 804), (383, 793), (345, 746), (242, 705)],
        fill=255,
    )
    # Visible left vegetation and trunk mass.
    draw.polygon(
        [(0, 548), (170, 548), (218, 613), (250, 700), (225, 810), (196, 941), (0, 941)],
        fill=255,
    )
    # Bright curb and genuinely sunlit road remain outside even where individual
    # stones are dark. This ends above the irregular painted shadow transition.
    draw.polygon([(292, 545), (1672, 600), (1672, 768), (1280, 748), (930, 704), (650, 660), (455, 630)], fill=255)
    # Use the registered right-foreground alpha instead of a broad polygon, so
    # valid shaded ground between stems remains available inside the red region.
    right_alpha = Image.open(RIGHT_FOREGROUND).convert("RGBA").getchannel("A")
    right_soft = right_alpha.filter(ImageFilter.MaxFilter(13))
    exclusions = Image.fromarray(
        np.maximum(np.asarray(exclusions), np.asarray(right_soft)).astype(np.uint8),
        mode="L",
    )

    exclusion_soft = np.asarray(
        exclusions.filter(ImageFilter.GaussianBlur(24)), dtype=np.float32
    ) / 255
    receiver *= 1 - exclusion_soft

    # A second tight silhouette matte guarantees protected pixels are exactly
    # zero. It is independent of the broad soft moat, so the outer receiver does
    # not inherit a chunky safety-polygon contour.
    protected = Image.new("L", (WIDTH, HEIGHT), 0)
    hard = ImageDraw.Draw(protected)
    hard.polygon(
        [
            (292, 581), (342, 574), (375, 597), (390, 637), (378, 667),
            (421, 704), (455, 735), (456, 764), (430, 783), (395, 765),
            (370, 732), (340, 713), (315, 679), (284, 661), (270, 619),
        ],
        fill=255,
    )
    hard.polygon(
        [
            (230, 650), (270, 635), (330, 649), (392, 675), (438, 714),
            (462, 753), (449, 793), (407, 793), (375, 760), (330, 733),
            (278, 716), (242, 696),
        ],
        fill=255,
    )
    hard.polygon([(0, 570), (155, 570), (205, 625), (220, 700), (188, 941), (0, 941)], fill=255)
    hard.polygon([(310, 555), (1672, 605), (1672, 742), (1280, 730), (940, 690), (655, 648), (455, 620)], fill=255)
    protected = Image.fromarray(
        np.maximum(np.asarray(protected), np.asarray(right_alpha)).astype(np.uint8),
        mode="L",
    )
    exclusion_hard = np.asarray(protected, dtype=np.uint8) > 0
    receiver[exclusion_hard] = 0
    receiver = np.clip(receiver, 0, 1)
    receiver[receiver < 0.025] = 0

    receiver_image = Image.fromarray(np.uint8(np.round(receiver * 255)), mode="L")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    receiver_image.save(OUTPUT, optimize=True)

    # Bright diagnostic color over the exact composited painting. Core is cyan;
    # low-weight transition/fringe grades toward yellow so the boundary design is
    # legible without inventing coverage.
    core_color = np.array((0.0, 1.0, 0.92), dtype=np.float32)
    fringe_color = np.array((1.0, 0.22, 0.0), dtype=np.float32)
    weight = receiver[..., None]
    color_mix = np.clip(receiver[..., None] * 1.9, 0, 1)
    diagnostic_color = fringe_color * (1 - color_mix) + core_color * color_mix
    diagnostic = rgb * (1 - weight * 0.82) + diagnostic_color * weight * 0.82
    Image.fromarray(np.uint8(np.round(np.clip(diagnostic, 0, 1) * 255))).save(
        DIAGNOSTIC, optimize=True
    )

    nonzero = receiver > 0
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    print(f"wrote {DIAGNOSTIC.relative_to(ROOT)}")
    print(
        {
            "bounds": receiver_image.getbbox(),
            "nonzero_pixels": int(nonzero.sum()),
            "mean_nonzero": round(float(receiver[nonzero].mean()), 4),
            "strong_pixels": int((receiver >= 0.55).sum()),
            "fringe_pixels": int(((receiver > 0) & (receiver < 0.20)).sum()),
        }
    )


if __name__ == "__main__":
    main()
