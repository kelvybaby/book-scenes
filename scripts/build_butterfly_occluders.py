"""Build registered depth masks for the bounded right-flower butterfly proof.

Both masks reuse the exact alpha from the five flower branches already
partitioned from Study Q. Splitting those registered cutouts into middle and
near groups gives the butterflies two useful depth thresholds without asking a
colour key to guess where foliage ends and the similarly painted wall begins.
Neither mask reaches Fermina, the doorway, or the bare architecture.

Requires Pillow.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public/assets/scenes/under-the-almond-trees"
SCENE_SOURCE = ASSET_DIR / "under-the-almond-trees-study-q.png"
OUTPUT_MID = (
    ASSET_DIR / "under-the-almond-trees-butterfly-occluder-mid-v1.png"
)
OUTPUT_NEAR = (
    ASSET_DIR / "under-the-almond-trees-butterfly-occluder-near-v1.png"
)

BRANCHES = {
    "upper": (1571, 524),
    "center": (1582, 577),
    "right": (1628, 584),
    "lower-left": (1557, 631),
    "lower-right": (1632, 635),
}

def branch_mask(size: tuple[int, int], names: tuple[str, ...]) -> Image.Image:
    combined = Image.new("L", size, 0)
    for name in names:
        position = BRANCHES[name]
        source = Image.open(
            ASSET_DIR / f"under-the-almond-trees-flower-branch-{name}-v1.png"
        ).convert("RGBA")
        layer = Image.new("L", size, 0)
        layer.paste(source.getchannel("A"), position)
        combined = ImageChops.lighter(combined, layer)
    return combined


def finish(mask: Image.Image) -> Image.Image:
    expanded = mask.filter(ImageFilter.MaxFilter(3))
    softened = expanded.filter(ImageFilter.GaussianBlur(0.55))
    output = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    output.putalpha(softened)
    return output


def main() -> None:
    scene = Image.open(SCENE_SOURCE).convert("RGBA")
    mid = branch_mask(scene.size, ("upper", "center", "lower-left"))
    near = branch_mask(scene.size, ("right", "lower-right"))

    finish(mid).save(OUTPUT_MID, optimize=True)
    finish(near).save(OUTPUT_NEAR, optimize=True)

    if mid.getbbox() is None or near.getbbox() is None:
        raise RuntimeError("A butterfly occluder mask is empty")
    if mid.getbbox()[0] < 1490 or near.getbbox()[0] < 1490:
        raise RuntimeError("A butterfly occluder escaped the right-flower region")

    print(f"mid bounds: {mid.getbbox()}")
    print(f"near bounds: {near.getbbox()}")


if __name__ == "__main__":
    main()
