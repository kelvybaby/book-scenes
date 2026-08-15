"""Deterministic connected canopy topology shared by Blender and diagnostics."""

from __future__ import annotations

import math

import numpy as np


TOPOLOGY_WIDTH = 384
TOPOLOGY_HEIGHT = 192


def _hash_noise(ix: np.ndarray, iy: np.ndarray, seed: float) -> np.ndarray:
    value = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123
    return value - np.floor(value)


def _value_noise(x: np.ndarray, y: np.ndarray, seed: float) -> np.ndarray:
    ix = np.floor(x)
    iy = np.floor(y)
    tx = x - ix
    ty = y - iy
    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)
    n00 = _hash_noise(ix, iy, seed)
    n10 = _hash_noise(ix + 1, iy, seed)
    n01 = _hash_noise(ix, iy + 1, seed)
    n11 = _hash_noise(ix + 1, iy + 1, seed)
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (
        n01 * (1 - sx) + n11 * sx
    ) * sy


def _ellipse(
    xx: np.ndarray,
    yy: np.ndarray,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    angle: float,
) -> np.ndarray:
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    dx = xx - cx
    dy = yy - cy
    qx = (dx * cos_a + dy * sin_a) / rx
    qy = (-dx * sin_a + dy * cos_a) / ry
    return np.exp(-(qx * qx + qy * qy) * 1.55)


def _tube(
    xx: np.ndarray,
    yy: np.ndarray,
    points: tuple[tuple[float, float], ...],
    radii: tuple[float, ...],
) -> np.ndarray:
    field = np.zeros_like(xx, dtype=np.float32)
    for index, ((x0, y0), (x1, y1)) in enumerate(zip(points[:-1], points[1:])):
        vx = x1 - x0
        vy = y1 - y0
        length_squared = vx * vx + vy * vy
        t = np.clip(((xx - x0) * vx + (yy - y0) * vy) / length_squared, 0, 1)
        px = x0 + t * vx
        py = y0 + t * vy
        radius = radii[index] * (1 - t) + radii[index + 1] * t
        distance = np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / radius
        field = np.maximum(field, np.exp(-(distance * distance) * 1.9))
    return field


def _cluster_field(
    xx: np.ndarray,
    yy: np.ndarray,
    anchors: tuple[tuple[float, float, float], ...],
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    field = np.zeros_like(xx, dtype=np.float32)
    progress = np.zeros_like(xx, dtype=np.float32)
    for anchor_index, (cx, cy, t) in enumerate(anchors):
        lobe_count = 6 if t < 0.66 else 5
        base_radius = (19.0 * (1 - t) + 8.2 * t) * rng.uniform(0.86, 1.22)
        anchor_field = np.zeros_like(xx, dtype=np.float32)
        for _ in range(lobe_count):
            angle = rng.uniform(0, math.tau)
            distance = rng.uniform(base_radius * 0.18, base_radius * 0.95)
            lobe = _ellipse(
                xx,
                yy,
                cx + math.cos(angle) * distance,
                cy + math.sin(angle) * distance,
                base_radius * rng.uniform(0.56, 1.12),
                base_radius * rng.uniform(0.32, 0.76),
                rng.uniform(-1.2, 1.2),
            )
            anchor_field = np.maximum(anchor_field, lobe)
        field = np.maximum(field, anchor_field)
        progress = np.maximum(progress, anchor_field * t)

        # Some outer satellites sit close enough to be consumed by a bent web,
        # yet can separate again when the branch deformation reverses.
        if t > 0.50 and anchor_index % 2 == 0:
            satellite_angle = rng.uniform(0, math.tau)
            satellite_distance = base_radius * rng.uniform(1.25, 1.75)
            satellite = _ellipse(
                xx,
                yy,
                cx + math.cos(satellite_angle) * satellite_distance,
                cy + math.sin(satellite_angle) * satellite_distance,
                base_radius * rng.uniform(0.35, 0.58),
                base_radius * rng.uniform(0.24, 0.46),
                rng.uniform(-1.4, 1.4),
            )
            field = np.maximum(field, satellite)
            progress = np.maximum(progress, satellite * min(1, t + 0.12))
    return field, progress


def generate_topology(
    width: int = TOPOLOGY_WIDTH,
    height: int = TOPOLOGY_HEIGHT,
) -> dict[str, np.ndarray | list[np.ndarray]]:
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    sx = width / TOPOLOGY_WIDTH
    sy = height / TOPOLOGY_HEIGHT

    def scaled_points(points: tuple[tuple[float, float], ...]):
        return tuple((x * sx, y * sy) for x, y in points)

    core = np.zeros((height, width), dtype=np.float32)
    for spec in (
        (56, 148, 58, 42, -0.20),
        (105, 137, 62, 44, 0.13),
        (153, 149, 58, 40, -0.12),
        (194, 138, 48, 34, 0.22),
        (111, 177, 79, 25, 0.02),
    ):
        cx, cy, rx, ry, angle = spec
        core = np.maximum(core, _ellipse(xx, yy, cx * sx, cy * sy, rx * sx, ry * sy, angle))

    branch_specs = (
        {
            "points": ((170, 136), (219, 108), (267, 72), (327, 42), (382, 30)),
            "radii": (14, 12, 9, 6, 3.8),
            "anchors": (
                (208, 116, .18), (240, 93, .34), (272, 72, .50),
                (304, 54, .64), (334, 42, .78), (365, 32, .94),
            ),
            "seed": 481,
        },
        {
            "points": ((176, 143), (235, 137), (287, 121), (335, 101), (384, 94)),
            "radii": (15, 13, 9, 6, 3.5),
            "anchors": (
                (219, 137, .18), (252, 132, .32), (282, 123, .46),
                (315, 113, .62), (347, 103, .78), (376, 99, .94),
            ),
            "seed": 907,
        },
        {
            "points": ((160, 151), (224, 166), (280, 178), (334, 185), (384, 190)),
            "radii": (16, 13, 9, 5.5, 3.2),
            "anchors": (
                (211, 162, .18), (246, 170, .34), (279, 178, .50),
                (313, 183, .65), (347, 187, .81), (376, 190, .95),
            ),
            "seed": 1321,
        },
    )

    coarse = _value_noise(xx / (31 * sx), yy / (27 * sy), 311.0)
    medium = _value_noise(xx / (12 * sx), yy / (10 * sy), 733.0)
    fine = _value_noise(xx / (4.5 * sx), yy / (4.2 * sy), 1229.0)

    core_occupancy = core + (coarse - .5) * .42 + (medium - .5) * .22 > .43
    group_occupancies: list[np.ndarray] = []
    group_influences: list[np.ndarray] = []

    for group_index, spec in enumerate(branch_specs):
        points = scaled_points(spec["points"])
        radii = tuple(radius * (sx + sy) * .5 for radius in spec["radii"])
        web = _tube(xx, yy, points, radii)
        anchors = tuple((x * sx, y * sy, t) for x, y, t in spec["anchors"])
        clusters, cluster_progress = _cluster_field(xx, yy, anchors, spec["seed"])
        branch_strength = np.maximum(web * 1.08, clusters)

        # The same coherent noise perturbs every branch, with only a seed offset
        # in fine articulation. This creates ragged webs without separate fields.
        branch_detail = _value_noise(
            xx / (5.7 * sx) + group_index * 19,
            yy / (5.2 * sy) - group_index * 13,
            1801 + group_index * 97,
        )
        occupancy = branch_strength + (coarse - .5) * .18 + (branch_detail - .5) * .31 > .43

        # Keep the main attachment web connected near the core, while allowing
        # outer bridges and satellites to form/break under deformation.
        occupancy |= web > np.where(xx < 225 * sx, .42, .72)

        # Narrow projected bridge gaps are owned by their branch group. Their
        # displacement modes can bring the two sides together, consume an outer
        # cluster, and later reopen the channel without any separate mask layer.
        for gap_index, progress_value in enumerate((.52, .72, .88)):
            center = points[0][0] * (1 - progress_value) + points[-1][0] * progress_value
            center_y = points[0][1] * (1 - progress_value) + points[-1][1] * progress_value
            gap = _ellipse(
                xx,
                yy,
                center + (gap_index - 1) * 2.3 * sx,
                center_y + (1 - gap_index) * 1.8 * sy,
                (3.8 - gap_index * .6) * sx,
                (5.4 - gap_index * .7) * sy,
                (group_index - 1) * .42,
            )
            occupancy &= gap < .62
        influence = np.clip(np.maximum(cluster_progress, web * np.clip((xx / width - .35) * 1.7, 0, 1)), 0, 1)
        group_occupancies.append(occupancy)
        group_influences.append(influence.astype(np.float32))

    combined = core_occupancy.copy()
    for occupancy in group_occupancies:
        combined |= occupancy

    # Small internal light holes keep the core from becoming a dead silhouette,
    # but its occupancy remains substantially denser than the periphery.
    opening_field = medium * .58 + fine * .42
    core_holes = (opening_field > .73) & (core > .30) & (core < .86)
    middle_holes = (opening_field > .78) & (core > .16) & (core <= .42)
    core_holes |= middle_holes
    combined &= ~core_holes
    core_occupancy &= ~core_holes

    density = np.clip(core * 1.15, 0, 1)
    for occupancy, influence in zip(group_occupancies, group_influences):
        density = np.maximum(density, occupancy.astype(np.float32) * (1 - influence * .43))

    return {
        "occupancy": combined,
        "core": core_occupancy,
        "groups": group_occupancies,
        "influences": group_influences,
        "density": density,
    }
