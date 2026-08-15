#!/usr/bin/env python3
"""Build the revision-4 offline review composite for the Blender dapple-light proof.

This script does not modify or integrate with the web application. It uses the
existing receiver mask as-is, perspective-warps the rectangular Blender map over
the foreground, and writes temporary review-only stills and an MP4.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT = ROOT / "design/tooling/blender-dapple-poc-v4"
FRAMES = EXPERIMENT / "preview/frames"
OUTPUT = EXPERIMENT / "temporary-composite"

BASE_PATH = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png"
REPAIR_PATH = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-shadow-repair-v1.png"
MASK_PATH = EXPERIMENT / "receiver/foreground-shadow-receiver-v4.png"

WIDTH = 1672
HEIGHT = 941
FPS = 30
FRAME_COUNT = 240

    # Temporary ground-plane registration. The revision-4 receiver remains the final
# authority, so this quad changes only the pattern's local scale and perspective.
DESTINATION_QUAD = ((100, 650), (1050, 760), (1120, 950), (40, 950))
LIGHT_STRENGTH = 0.14
DARK_STRENGTH = 0.42
CORE_BIAS = 0.065
WARM_LIGHT = np.array((1.0, 0.79, 0.48), dtype=np.float32)


def perspective_coefficients(
    destination: tuple[tuple[float, float], ...],
    source: tuple[tuple[float, float], ...],
) -> tuple[float, ...]:
    """Return PIL output-to-input homography coefficients."""
    matrix: list[list[float]] = []
    values: list[float] = []
    for (x, y), (u, v) in zip(destination, source, strict=True):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return tuple(np.linalg.solve(np.asarray(matrix), np.asarray(values)).tolist())


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)


def load_static_master() -> np.ndarray:
    base = Image.open(BASE_PATH).convert("RGBA")
    repair = Image.open(REPAIR_PATH).convert("RGBA")
    if base.size != (WIDTH, HEIGHT) or repair.size != (WIDTH, HEIGHT):
        raise ValueError("Unexpected scene asset dimensions")
    return np.asarray(Image.alpha_composite(base, repair).convert("RGB"), dtype=np.float32) / 255


def composite_frame(
    illumination_path: Path,
    illumination_mean: Image.Image,
    core_map: Image.Image,
    base_linear: np.ndarray,
    receiver: np.ndarray,
    coefficients: tuple[float, ...],
) -> np.ndarray:
    illumination = Image.open(illumination_path).convert("L")
    warped = illumination.transform(
        (WIDTH, HEIGHT),
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
        fillcolor=0,
    )
    warped_mean = illumination_mean.transform(
        (WIDTH, HEIGHT),
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
        fillcolor=0,
    )
    warped_core = core_map.transform(
        (WIDTH, HEIGHT),
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
        fillcolor=0,
    )
    reveal = np.asarray(warped, dtype=np.float32) / 255
    baseline = np.asarray(warped_mean, dtype=np.float32) / 255
    delta = reveal - baseline
    positive = np.clip(delta, 0, 1) * receiver * LIGHT_STRENGTH
    negative = np.clip(-delta, 0, 1) * receiver * DARK_STRENGTH
    core_bias = np.asarray(warped_core, dtype=np.float32) / 255 * receiver * CORE_BIAS

    # The painting is the temporal middle state. Openings recover warm light;
    # denser overlap deepens the existing shade multiplicatively, retaining all
    # source texture instead of covering it with gray or black.
    output_linear = base_linear * (1 - negative[..., None]) * (1 - core_bias[..., None])
    output_linear += positive[..., None] * (1 - output_linear) * WARM_LIGHT
    output = np.clip(linear_to_srgb(output_linear), 0, 1)
    return np.round(output * 255).astype(np.uint8)


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("FFmpeg is required to assemble the review video")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    representatives = OUTPUT / "representative-frames"
    representatives.mkdir(parents=True, exist_ok=True)

    base_srgb = load_static_master()
    base_linear = srgb_to_linear(base_srgb)
    receiver_image = Image.open(MASK_PATH).convert("L")
    if receiver_image.size != (WIDTH, HEIGHT):
        raise ValueError("The existing receiver mask has unexpected dimensions")
    receiver = np.asarray(receiver_image, dtype=np.float32) / 255

    source_quad = ((0, 0), (767, 0), (767, 383), (0, 383))
    coefficients = perspective_coefficients(DESTINATION_QUAD, source_quad)

    # Build the loop's neutral state in source-map space. Because the warp is
    # fixed and linear, subtracting this temporal mean centers every painted
    # receiver pixel on the approved source over a complete loop.
    illumination_sum = np.zeros((384, 768), dtype=np.float64)
    for frame in range(1, FRAME_COUNT + 1):
        illumination_sum += np.asarray(
            Image.open(FRAMES / f"dapple_{frame:04d}.png").convert("L"), dtype=np.float64
        )
    illumination_mean = Image.fromarray(
        np.uint8(np.round(illumination_sum / FRAME_COUNT)), mode="L"
    )
    # The topology core is part of the same connected canopy generator. Its
    # static low-amplitude bias gives the trunk/main-canopy region more weight
    # without adding another animated texture field.
    from dapple_topology import generate_topology

    topology = generate_topology()
    core_map = Image.fromarray(np.uint8(topology["core"] * 255), mode="L")

    video_path = OUTPUT / "foreground-composite-preview.mp4"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-frames:v",
        str(FRAME_COUNT),
        "-vf",
        "scale=836:470",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(video_path),
    ]

    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    if process.stdin is None:
        raise RuntimeError("Unable to open FFmpeg input pipe")

    representative_frames = {1: "phase-00.png", 61: "phase-25.png", 121: "phase-50.png", 181: "phase-75.png"}
    for frame in range(1, FRAME_COUNT + 1):
        path = FRAMES / f"dapple_{frame:04d}.png"
        composite = composite_frame(
            path, illumination_mean, core_map, base_linear, receiver, coefficients
        )
        process.stdin.write(composite.tobytes())
        if frame in representative_frames:
            Image.fromarray(composite).save(representatives / representative_frames[frame], optimize=True)
    process.stdin.close()
    return_code = process.wait()
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)

    phase_paths = [representatives / name for name in representative_frames.values()]
    contact_sheet = OUTPUT / "foreground-composite-contact-sheet.png"
    filter_graph = (
        "[0:v]scale=836:471[a];[1:v]scale=836:471[b];"
        "[2:v]scale=836:471[c];[3:v]scale=836:471[d];"
        "[a][b]hstack[top];[c][d]hstack[bottom];[top][bottom]vstack"
    )
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            *sum((["-i", str(path)] for path in phase_paths), []),
            "-filter_complex",
            filter_graph,
            "-frames:v",
            "1",
            str(contact_sheet),
        ],
        check=True,
    )

    print(f"wrote {video_path.relative_to(ROOT)}")
    print(f"wrote {contact_sheet.relative_to(ROOT)}")
    print(f"receiver source: {MASK_PATH.relative_to(ROOT)}")
    print(f"light strength: {LIGHT_STRENGTH}")
    print(f"dark strength: {DARK_STRENGTH}")
    print(f"core bias: {CORE_BIAS}")


if __name__ == "__main__":
    main()
