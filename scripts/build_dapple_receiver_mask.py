"""Build the strict existing-shadow receiver for the dappled-light prototype.

The receiver is intentionally conservative: an authored ground polygon is
intersected with the approved Study Q luminance, then figures, bench, visible
plants, and the sunlit road are excluded. The final alpha feathers inward so
animated light reaches zero before the established sunlit boundary.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png"
)
OUTPUT = (
    ROOT
    / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-dapple-receiver-v1.png"
)
DEBUG = ROOT / "design/layers/under-the-almond-trees-dapple-receiver-v1.png"

WIDTH = 1672
HEIGHT = 941


def polygon_mask(points: list[tuple[int, int]], fill: int = 255) -> Image.Image:
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(mask).polygon(points, fill=fill)
    return mask


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    if source.size != (WIDTH, HEIGHT):
        raise ValueError(f"Unexpected source size: {source.size}")

    rgb = np.asarray(source, dtype=np.float32) / 255
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = (
        linear[..., 0] * 0.2126
        + linear[..., 1] * 0.7152
        + linear[..., 2] * 0.0722
    )

    # Authored scope: only shaded foreground earth under the left canopy. Its
    # upper boundary stays below the bright crossable road.
    authored = polygon_mask(
        [
            (72, 678),
            (330, 668),
            (540, 704),
            (744, 744),
            (1008, 782),
            (1125, 841),
            (1050, 941),
            (70, 941),
        ]
    )

    # Smooth ramp derived from the source luminance. Pixels already in deep or
    # middle shade receive the effect; brighter source pixels approach zero.
    shade = np.clip((0.31 - luminance) / 0.17, 0, 1)
    shade = np.power(shade, 0.72)
    mask = np.asarray(authored, dtype=np.float32) / 255 * shade

    exclusions = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(exclusions)
    # Florentino, book, and bench, including a soft safety margin.
    draw.polygon(
        [(205, 568), (385, 558), (503, 651), (540, 791), (456, 831), (235, 773)],
        fill=255,
    )
    # Visible left planting and trunk mass.
    draw.polygon([(0, 570), (222, 554), (292, 706), (230, 941), (0, 941)], fill=255)
    # Visible lower foreground blades and the right-side plant bed.
    draw.polygon(
        [(442, 871), (610, 817), (775, 840), (863, 941), (420, 941)], fill=255
    )
    draw.polygon(
        [(950, 816), (1175, 763), (1672, 735), (1672, 941), (930, 941)], fill=255
    )
    # The road and curb are kept stable even where local stones are dark.
    draw.polygon([(332, 566), (1672, 632), (1672, 786), (788, 744), (520, 696)], fill=255)

    exclusion_alpha = np.asarray(
        exclusions.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32
    ) / 255
    mask *= 1 - exclusion_alpha

    # Feather inward at the authored perimeter; never grow the receiver outward.
    authored_soft = np.asarray(
        authored.filter(ImageFilter.GaussianBlur(16)), dtype=np.float32
    ) / 255
    mask *= authored_soft
    mask = np.clip(mask, 0, 1)

    receiver = Image.fromarray(np.round(mask * 255).astype(np.uint8), mode="L")
    # Remove antialias-only specks that cannot survive browser compositing
    # consistently. The visible transition still feathers through 8–255 alpha.
    receiver_values = np.asarray(receiver).copy()
    receiver_values[receiver_values < 8] = 0
    receiver = Image.fromarray(receiver_values, mode="L")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    receiver.save(OUTPUT, optimize=True)
    receiver.save(DEBUG, optimize=True)

    values = np.asarray(receiver)
    nonzero = values > 0
    strong = values >= 96
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    print(f"wrote {DEBUG.relative_to(ROOT)}")
    print(f"bounds={receiver.getbbox()} nonzero={int(nonzero.sum())} strong={int(strong.sum())}")
    print(f"alpha={receiver.getextrema()} mean_nonzero={values[nonzero].mean():.2f}")


if __name__ == "__main__":
    main()
