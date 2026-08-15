"""Build the bounded cast-shadow repair for Under the Almond Trees.

The generated ground edit is used only inside a feathered road/park mask. The
new cast shadows are deterministic silhouettes derived from the approved scene
and foreground-canopy geometry. No interaction or moving-plant asset is changed.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SCENE_DIR = ROOT / "public/assets/scenes/under-the-almond-trees"
BASE_PATH = SCENE_DIR / "under-the-almond-trees-study-q.png"
GROUND_SOURCE_PATH = (
    ROOT / "design/layers/under-the-almond-trees-ground-shadow-repair-source-v1.png"
)
OVERLAY_PATH = SCENE_DIR / "under-the-almond-trees-shadow-repair-v1.png"
REPAIRED_SCENE_PATH = (
    ROOT / "design/layers/under-the-almond-trees-shadow-repair-composite-v15.png"
)

WIDTH = 1672
HEIGHT = 941
SCALE = 2


def feathered_polygon(points: list[tuple[int, int]], blur: float, opacity: int) -> Image.Image:
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(mask).polygon(points, fill=opacity)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def rotated_leaf(
    layer: Image.Image,
    center: tuple[float, float],
    size: tuple[float, float],
    angle: float,
    value: int,
) -> None:
    leaf_width = max(4, round(size[0] * SCALE))
    leaf_height = max(3, round(size[1] * SCALE))
    leaf = Image.new("L", (leaf_width + 8, leaf_height + 8), 0)
    ImageDraw.Draw(leaf).ellipse((4, 4, leaf_width + 3, leaf_height + 3), fill=value)
    leaf = leaf.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    x = round(center[0] * SCALE - leaf.width / 2)
    y = round(center[1] * SCALE - leaf.height / 2)
    existing = layer.crop((x, y, x + leaf.width, y + leaf.height))
    layer.paste(ImageChops.lighter(existing, leaf), (x, y))


def ground_foliage_shadow() -> Image.Image:
    """A soft, directional projection from the left foreground almond canopy."""
    rng = random.Random(1427)
    large = Image.new("L", (WIDTH * SCALE, HEIGHT * SCALE), 0)
    draw = ImageDraw.Draw(large)
    branches = [
        [(624, 674), (724, 694), (846, 716), (977, 739), (1118, 755)],
        [(648, 685), (760, 716), (884, 746), (1020, 769)],
        [(684, 691), (790, 682), (905, 696), (1048, 724)],
        [(724, 719), (832, 738), (920, 767), (1012, 785)],
    ]
    for index, branch in enumerate(branches):
        scaled = [(x * SCALE, y * SCALE) for x, y in branch]
        draw.line(scaled, fill=74 - index * 7, width=(5 - index) * SCALE, joint="curve")

        for segment_index, (start, end) in enumerate(zip(branch, branch[1:])):
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            segment_angle = math.degrees(math.atan2(dy, dx))
            count = 22 - index * 2
            for item_index in range(count):
                t = (item_index + rng.random()) / count
                x = start[0] + dx * t + rng.uniform(-15, 15)
                y = start[1] + dy * t + rng.uniform(-12, 12)
                progress = (segment_index + t) / max(1, len(branch) - 1)
                value = round((83 - index * 7) * (1 - 0.42 * progress))
                rotated_leaf(
                    large,
                    (x, y),
                    (rng.uniform(10, 20), rng.uniform(3.4, 7.2)),
                    segment_angle + rng.uniform(-38, 38),
                    value,
                )

    # Break up the projection so it reads as perforated canopy, not a painted stripe.
    openings = Image.new("L", large.size, 255)
    opening_draw = ImageDraw.Draw(openings)
    for _ in range(58):
        x = rng.uniform(630, 1120) * SCALE
        y = rng.uniform(665, 795) * SCALE
        rx = rng.uniform(7, 25) * SCALE
        ry = rng.uniform(4, 13) * SCALE
        opening_draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=rng.randint(70, 185))
    large = Image.fromarray(
        ((np.asarray(large, dtype=np.uint16) * np.asarray(openings, dtype=np.uint16)) // 255).astype(
            np.uint8
        ),
        mode="L",
    )
    shadow = large.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.7))

    # Fade toward the right and confine the shadow to the road/park surface.
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH]
    horizontal = np.clip((1190 - x) / 520, 0, 1)
    vertical = np.clip(1 - np.abs(y - 728) / 112, 0, 1)
    surface = ((x >= 610) & (x <= 1190) & (y >= 635) & (y <= 820)).astype(float)
    left_fade = np.clip((x - 610) / 42, 0, 1)
    fade = np.clip(horizontal * 0.72 + 0.28, 0, 1) * np.sqrt(vertical) * left_fade * surface
    return Image.fromarray(
        np.clip(np.asarray(shadow, dtype=float) * fade * 1.45, 0, 255).astype(np.uint8),
        mode="L",
    )


def wall_foliage_shadow(base: Image.Image) -> Image.Image:
    """Draw nearby branches down/right across only the pale façade planes."""
    rgb = np.asarray(base.convert("RGB"), dtype=np.int16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH]

    rng = random.Random(913)
    large = Image.new("L", (WIDTH * SCALE, HEIGHT * SCALE), 0)
    draw = ImageDraw.Draw(large)
    branches = [
        [(724, 262), (776, 305), (818, 355), (848, 414)],
        [(766, 278), (821, 310), (878, 337), (931, 379)],
        [(935, 268), (968, 315), (996, 367), (1020, 425)],
        [(1238, 278), (1280, 318), (1315, 372), (1337, 429)],
        [(1510, 238), (1545, 286), (1576, 337), (1608, 390)],
    ]
    for index, branch in enumerate(branches):
        scaled = [(px * SCALE, py * SCALE) for px, py in branch]
        draw.line(scaled, fill=40 - index % 2 * 4, width=2 * SCALE, joint="curve")
        for start, end in zip(branch, branch[1:]):
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            segment_angle = math.degrees(math.atan2(dy, dx))
            for leaf_index in range(12):
                t = (leaf_index + rng.random()) / 12
                px = start[0] + dx * t + rng.uniform(-9, 9)
                py = start[1] + dy * t + rng.uniform(-7, 7)
                rotated_leaf(
                    large,
                    (px, py),
                    (rng.uniform(7, 13), rng.uniform(2.8, 5.3)),
                    segment_angle + rng.uniform(-46, 46),
                    rng.randint(31, 48),
                )

    shifted = large.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    shifted = shifted.filter(ImageFilter.GaussianBlur(1.25))

    # Pale, low-chroma plaster only. Open arches, window, tree, figures, and chairs
    # remain protected even if their local values happen to resemble the wall.
    lightness = rgb.mean(axis=2)
    plaster = (
        (x >= 700)
        & (x <= 1640)
        & (y >= 205)
        & (y <= 665)
        & (lightness > 104)
        & (chroma < 92)
        & (red > blue + 5)
    )
    exclusions = Image.new("L", (WIDTH, HEIGHT), 0)
    exclusion_draw = ImageDraw.Draw(exclusions)
    for box in [
        (813, 335, 985, 665),   # left arch and fountain opening
        (1050, 330, 1172, 625), # barred window and wall-side trunk
        (1160, 250, 1325, 710), # main tree and dense planting
        (1330, 280, 1585, 715), # doorway, Fermina, empty chair
        (1570, 330, 1672, 690), # right window and flower pot
    ]:
        exclusion_draw.rectangle(box, fill=255)
    plaster &= np.asarray(exclusions) == 0

    result = np.asarray(shifted, dtype=np.uint8)
    result = np.where(plaster, np.minimum(result * 1.15, 54), 0).astype(np.uint8)
    return Image.fromarray(result, mode="L")


def colored_layer(color: tuple[int, int, int], alpha: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (*color, 0))
    layer.putalpha(alpha)
    return layer


def main() -> None:
    base = Image.open(BASE_PATH).convert("RGB")
    if base.size != (WIDTH, HEIGHT):
        raise ValueError(f"Unexpected base size: {base.size}")

    ground_source = Image.open(GROUND_SOURCE_PATH).convert("RGB")
    ground_source = ground_source.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ground_repair_mask = feathered_polygon(
        [(700, 646), (1158, 646), (1190, 704), (1162, 796), (720, 804), (670, 724)],
        blur=15,
        opacity=232,
    )
    ground_repair = ground_source.convert("RGBA")
    ground_repair.putalpha(ground_repair_mask)
    overlay = Image.alpha_composite(overlay, ground_repair)

    overlay = Image.alpha_composite(
        overlay,
        colored_layer((61, 58, 39), ground_foliage_shadow()),
    )
    overlay = Image.alpha_composite(
        overlay,
        colored_layer((74, 67, 45), wall_foliage_shadow(base)),
    )

    repaired = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    OVERLAY_PATH.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(OVERLAY_PATH, optimize=True)
    repaired.save(REPAIRED_SCENE_PATH, optimize=True)

    alpha = overlay.getchannel("A")
    print(f"wrote {OVERLAY_PATH.relative_to(ROOT)}")
    print(f"wrote {REPAIRED_SCENE_PATH.relative_to(ROOT)}")
    print(f"overlay alpha bounds: {alpha.getbbox()}, extrema: {alpha.getextrema()}")


if __name__ == "__main__":
    main()
