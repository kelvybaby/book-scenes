#!/usr/bin/env python3
"""Build the revision-4 four-panel topology diagnostic over the painting."""

from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT = ROOT / "design/tooling/blender-dapple-poc-v4"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dapple_topology import generate_topology


BASE = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png"
REPAIR = ROOT / "public/assets/scenes/under-the-almond-trees/under-the-almond-trees-shadow-repair-v1.png"
RECEIVER = EXPERIMENT / "receiver/foreground-shadow-receiver-v4.png"
COMPOSITE = EXPERIMENT / "temporary-composite/representative-frames/phase-50.png"
OUTPUT = EXPERIMENT / "diagnostics/topology-diagnostic.png"

WIDTH = 1672
HEIGHT = 941
QUAD = ((100, 650), (1050, 760), (1120, 950), (40, 950))


def perspective_coefficients(destination, source):
    matrix = []
    values = []
    for (x, y), (u, v) in zip(destination, source, strict=True):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return tuple(np.linalg.solve(np.asarray(matrix), np.asarray(values)).tolist())


def overlay(base: np.ndarray, mask: np.ndarray, color: tuple[int, int, int], opacity: float) -> np.ndarray:
    alpha = np.clip(mask * opacity, 0, 1)[..., None]
    tint = np.asarray(color, dtype=np.float32)
    return np.uint8(np.round(np.clip(base * (1 - alpha) + tint * alpha, 0, 255)))


def label(image: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((20, 18, 330, 60), radius=12, fill=(8, 8, 8, 218))
    draw.text((36, 30), text, fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0, 0, 0))


def main() -> None:
    painting = Image.alpha_composite(Image.open(BASE).convert("RGBA"), Image.open(REPAIR).convert("RGBA")).convert("RGB")
    base = np.asarray(painting, dtype=np.float32)
    receiver = np.asarray(Image.open(RECEIVER).convert("L"), dtype=np.float32) / 255

    # Panel 1: red permissive receiver, as requested.
    receiver_panel = Image.fromarray(overlay(base, receiver, (255, 34, 18), .66)).convert("RGBA")
    label(receiver_panel, "1  FULL POTENTIAL RECEIVER")

    topology = generate_topology()
    coefficients = perspective_coefficients(QUAD, ((0, 0), (383, 0), (383, 191), (0, 191)))

    def warp(values: np.ndarray) -> np.ndarray:
        image = Image.fromarray(np.uint8(values * 255), mode="L")
        return np.asarray(
            image.transform(
                (WIDTH, HEIGHT),
                Image.Transform.PERSPECTIVE,
                coefficients,
                resample=Image.Resampling.BICUBIC,
                fillcolor=0,
            ),
            dtype=np.float32,
        ) / 255

    core = warp(topology["core"].astype(np.float32)) * receiver
    core_panel = Image.fromarray(overlay(base, core, (82, 20, 128), .78)).convert("RGBA")
    label(core_panel, "2  DENSE CORE / TRUNK MASS")

    branch_panel_array = base.copy()
    branch_colors = ((255, 82, 38), (38, 150, 255), (55, 224, 104))
    for group, color in zip(topology["groups"], branch_colors, strict=True):
        branch_panel_array = overlay(branch_panel_array, warp(group.astype(np.float32)) * receiver, color, .72).astype(np.float32)
    branch_panel = Image.fromarray(np.uint8(branch_panel_array)).convert("RGBA")
    label(branch_panel, "3  BRANCH WEBS + CLUSTERS")

    composite_panel = Image.open(COMPOSITE).convert("RGBA")
    label(composite_panel, "4  FINAL COMPOSITE / PHASE 50%")

    panels = [receiver_panel, core_panel, branch_panel, composite_panel]
    sheet = Image.new("RGB", (WIDTH * 2, HEIGHT * 2), (0, 0, 0))
    for index, panel in enumerate(panels):
        sheet.paste(panel.convert("RGB"), ((index % 2) * WIDTH, (index // 2) * HEIGHT))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
