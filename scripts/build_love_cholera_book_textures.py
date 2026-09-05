#!/usr/bin/env python3
"""Build rectified web textures from the reader's Love in the Time of Cholera copy.

The source photographs remain outside the repository. This script invokes macOS
`sips` only for HEIC decoding, then performs a deterministic projective warp with
Pillow and NumPy. Coordinates are normalized against the orientation-corrected
photographs so rebuilding at the original camera resolution remains possible.
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


@dataclass(frozen=True)
class TextureSpec:
    source: str
    output: str
    width: int
    height: int
    # Source points in display orientation: top-left, top-right, bottom-right,
    # bottom-left. Values are normalized to preserve the full HEIC resolution.
    quad: tuple[tuple[float, float], ...]
    exposure: float = 1.0
    saturation: float = 1.0
    post_crop: tuple[float, float, float, float] | None = None
    edge_bleed: int = 0


TEXTURES = (
    TextureSpec(
        source="IMG_2812 2.heic",
        output="front-cover-v1.jpg",
        width=1536,
        height=2381,
        # Corners sit just inside the physical contour so bicubic sampling
        # cannot pull the dark deck into the rectified cover.
        quad=((0.193, 0.190), (0.757, 0.175), (0.765, 0.858), (0.194, 0.839)),
        exposure=1.01,
        saturation=0.98,
        edge_bleed=6,
    ),
    TextureSpec(
        source="IMG_2814.HEIC",
        output="back-cover-v1.jpg",
        width=1536,
        height=2381,
        quad=((0.171, 0.156), (0.790, 0.157), (0.789, 0.877), (0.171, 0.877)),
        exposure=1.005,
        saturation=0.98,
        edge_bleed=6,
    ),
    TextureSpec(
        source="IMG_2813.HEIC",
        output="spine-v1.jpg",
        width=320,
        height=2381,
        quad=((0.399, 0.079), (0.516, 0.079), (0.517, 0.918), (0.383, 0.918)),
        exposure=1.005,
        saturation=0.98,
        edge_bleed=5,
    ),
    TextureSpec(
        source="IMG_2817.HEIC",
        output="page-edge-top-v1.jpg",
        width=1536,
        height=270,
        # The source view is foreshortened: image-top is the glued spine and
        # image-bottom is the loose edge. The rotated quad unwraps that wedge.
        quad=((0.463, 0.318), (0.415, 0.695), (0.635, 0.695), (0.539, 0.318)),
        exposure=1.0,
        saturation=0.9,
        post_crop=(0.002, 0.0, 0.998, 0.88),
        edge_bleed=3,
    ),
    TextureSpec(
        source="IMG_2817.HEIC",
        output="page-edge-bottom-v1.jpg",
        width=1536,
        height=270,
        # The lower edge did not naturally splay during capture; reusing the
        # same physical page-edge photograph is more faithful than fabricating it.
        quad=((0.463, 0.318), (0.415, 0.695), (0.635, 0.695), (0.539, 0.318)),
        exposure=0.985,
        saturation=0.88,
        post_crop=(0.002, 0.0, 0.998, 0.88),
        edge_bleed=3,
    ),
    TextureSpec(
        source="IMG_2832.heic",
        output="page-edge-fore-v1.jpg",
        width=270,
        height=2381,
        # Only the central page block is unwrapped. The separated front leaf
        # becomes actual geometry and is mirrored for the rear side.
        quad=((0.287, 0.073), (0.566, 0.073), (0.578, 0.827), (0.353, 0.827)),
        exposure=0.99,
        saturation=0.86,
        post_crop=(0.025, 0.004, 0.985, 0.974),
        edge_bleed=5,
    ),
    TextureSpec(
        source="IMG_2823.HEIC",
        output="title-page-v1.jpg",
        width=1536,
        height=2381,
        quad=((0.155, 0.200), (0.789, 0.199), (0.789, 0.960), (0.155, 0.960)),
        exposure=1.0,
        saturation=0.84,
        edge_bleed=5,
    ),
)


def decode_source(path: Path, scratch: Path) -> Image.Image:
    decoded = scratch / f"{path.stem}.jpg"
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "best", str(path), "--out", str(decoded)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return ImageOps.exif_transpose(Image.open(decoded)).convert("RGB")


def perspective_coefficients(
    destination: tuple[tuple[float, float], ...],
    source: tuple[tuple[float, float], ...],
) -> tuple[float, ...]:
    matrix: list[list[float]] = []
    values: list[float] = []
    for (dx, dy), (sx, sy) in zip(destination, source, strict=True):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        values.append(sx)
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        values.append(sy)
    return tuple(np.linalg.solve(np.asarray(matrix), np.asarray(values)).tolist())


def rectify(image: Image.Image, spec: TextureSpec) -> Image.Image:
    src = tuple((x * image.width, y * image.height) for x, y in spec.quad)
    dst = (
        (0.0, 0.0),
        (float(spec.width), 0.0),
        (float(spec.width), float(spec.height)),
        (0.0, float(spec.height)),
    )
    coefficients = perspective_coefficients(dst, src)
    result = image.transform(
        (spec.width, spec.height),
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
    )
    if spec.post_crop is not None:
        left, top, right, bottom = spec.post_crop
        result = result.crop(
            (
                round(result.width * left),
                round(result.height * top),
                round(result.width * right),
                round(result.height * bottom),
            ),
        ).resize((spec.width, spec.height), Image.Resampling.LANCZOS)
    if spec.exposure != 1.0:
        result = ImageEnhance.Brightness(result).enhance(spec.exposure)
    if spec.saturation != 1.0:
        result = ImageEnhance.Color(result).enhance(spec.saturation)
    if spec.edge_bleed:
        result = bleed_texture_edges(result, spec.edge_bleed)
    return result


def bleed_texture_edges(image: Image.Image, pixels: int) -> Image.Image:
    """Dilate valid edge pixels into texture padding used by GPU filtering."""

    pixels = min(pixels, image.width // 4, image.height // 4)
    if pixels <= 0:
        return image
    width, height = image.size
    result = image.copy()
    inner_width = width - pixels * 2
    inner_height = height - pixels * 2

    left = image.crop((pixels, pixels, pixels + 1, height - pixels)).resize(
        (pixels, inner_height), Image.Resampling.NEAREST
    )
    right = image.crop((width - pixels - 1, pixels, width - pixels, height - pixels)).resize(
        (pixels, inner_height), Image.Resampling.NEAREST
    )
    top = image.crop((pixels, pixels, width - pixels, pixels + 1)).resize(
        (inner_width, pixels), Image.Resampling.NEAREST
    )
    bottom = image.crop((pixels, height - pixels - 1, width - pixels, height - pixels)).resize(
        (inner_width, pixels), Image.Resampling.NEAREST
    )
    result.paste(left, (0, pixels))
    result.paste(right, (width - pixels, pixels))
    result.paste(top, (pixels, 0))
    result.paste(bottom, (pixels, height - pixels))

    for source, destination in (
        ((pixels, pixels), (0, 0)),
        ((width - pixels - 1, pixels), (width - pixels, 0)),
        ((pixels, height - pixels - 1), (0, height - pixels)),
        ((width - pixels - 1, height - pixels - 1), (width - pixels, height - pixels)),
    ):
        corner = Image.new("RGB", (pixels, pixels), image.getpixel(source))
        result.paste(corner, destination)
    return result


def make_paper_roughness(size: tuple[int, int], seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    coarse = rng.normal(0.0, 1.0, (max(8, size[1] // 16), max(8, size[0] // 16)))
    coarse -= coarse.min()
    coarse /= max(coarse.max(), 1e-9)
    noise = Image.fromarray(np.uint8(coarse * 255), mode="L").resize(size, Image.Resampling.BICUBIC)
    noise = noise.filter(ImageFilter.GaussianBlur(radius=max(size) / 560.0))
    array = np.asarray(noise, dtype=np.float32) / 255.0
    array = np.uint8(np.clip(205 + (array - 0.5) * 26, 0, 255))
    return Image.fromarray(array, mode="L")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("design/tooling/love-in-the-time-of-cholera-book/textures"),
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="love-cholera-book-") as temp:
        scratch = Path(temp)
        cache: dict[str, Image.Image] = {}
        for spec in TEXTURES:
            source = args.source_dir / spec.source
            if not source.exists():
                raise FileNotFoundError(source)
            image = cache.setdefault(spec.source, decode_source(source, scratch))
            result = rectify(image, spec)
            result.save(args.output_dir / spec.output, quality=91, optimize=True, progressive=True)

    make_paper_roughness((1024, 1024), seed=1994481).save(
        args.output_dir / "paper-roughness-v1.png",
        optimize=True,
    )
    print(f"Built {len(TEXTURES) + 1} textures in {args.output_dir}")


if __name__ == "__main__":
    main()
