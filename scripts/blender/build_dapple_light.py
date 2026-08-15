#!/usr/bin/env python3
"""Build and optionally render the Blender dappled-sunlight proof of concept.

The render is a neutral illumination map only. It contains no scene painting and
does not apply the website receiver mask. The intended later composite is:

    Blender illumination × existing receiver mask × intensity

Run with Blender, not the system Python. See the experiment README for commands.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import shutil
import subprocess
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dapple_topology import generate_topology


WIDTH = 768
HEIGHT = 384
FPS = 30
LOOP_SECONDS = 8
FRAME_COUNT = FPS * LOOP_SECONDS
FRAME_START = 1
FRAME_END = FRAME_START + FRAME_COUNT - 1
TAU = math.tau

FIELD_WIDTH = 18.0
FIELD_HEIGHT = 9.0
RECEIVER_WIDTH = 12.0
RECEIVER_HEIGHT = 6.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Experiment directory. Defaults to design/tooling/blender-dapple-poc-v4.",
    )
    parser.add_argument(
        "--render-preview",
        action="store_true",
        help="Render all loop frames and assemble review artifacts.",
    )
    parser.add_argument(
        "--render-frame",
        type=int,
        default=None,
        help="Render one frame for setup inspection.",
    )
    parser.add_argument(
        "--light",
        choices=("sun", "area"),
        default="sun",
        help="Projection light. Sun is the selected default; Area is retained for comparison.",
    )
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(script_args)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def reset_scene() -> bpy.types.Scene:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "BW"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END

    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world_nodes = world.node_tree.nodes
    background = world_nodes.get("Background")
    background.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    background.inputs["Strength"].default_value = 0.0

    scene["poc_purpose"] = "Standalone grayscale animated sunlight-reveal map"
    scene["loop_seconds"] = LOOP_SECONDS
    scene["loop_frames"] = FRAME_COUNT
    scene["loop_contract"] = "Frames 1..240 sample a periodic field; frame 241 equals frame 1"
    scene["integration_status"] = "Not integrated into website"
    return scene


def make_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Specular IOR Level"].default_value = 0.0
    return material


def make_camera(scene: bpy.types.Scene) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("Dapple_Ortho_Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = RECEIVER_HEIGHT
    camera_data.lens = 50
    camera = bpy.data.objects.new("Dapple_Ortho_Camera", camera_data)
    camera.location = (0.0, 0.0, 11.0)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def make_receiver(material: bpy.types.Material) -> bpy.types.Object:
    width = RECEIVER_WIDTH + 0.3
    height = RECEIVER_HEIGHT + 0.3
    vertices = [
        (-width / 2, -height / 2, 0.0),
        (width / 2, -height / 2, 0.0),
        (width / 2, height / 2, 0.0),
        (-width / 2, height / 2, 0.0),
    ]
    mesh = bpy.data.meshes.new("Neutral_Receiver_Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    receiver = bpy.data.objects.new("Neutral_Receiver", mesh)
    bpy.context.scene.collection.objects.link(receiver)
    receiver["role"] = "Blank grayscale illumination receiver"
    return receiver


def make_light(scene: bpy.types.Scene, light_kind: str) -> bpy.types.Object:
    if light_kind == "sun":
        light_data = bpy.data.lights.new("Directional_Projection_Sun", type="SUN")
        light_data.energy = 4.0
        light_data.angle = math.radians(0.95)
        light = bpy.data.objects.new("Directional_Projection_Sun", light_data)
        light.location = (0.0, 0.0, 8.0)
    else:
        light_data = bpy.data.lights.new("Comparison_Area_Light", type="AREA")
        light_data.energy = 850.0
        light_data.shape = "DISK"
        light_data.size = 0.42
        light = bpy.data.objects.new("Comparison_Area_Light", light_data)
        light.location = (0.0, 0.0, 8.0)
    light.rotation_euler = (0.0, 0.0, 0.0)
    scene.collection.objects.link(light)
    scene["projection_light"] = light_kind
    scene["light_reason"] = (
        "Sun selected for a uniform directional field; its angular diameter gives controlled penumbra "
        "without the Area light's center-to-edge falloff."
        if light_kind == "sun"
        else "Area-light comparison mode; retained only to evaluate softness and falloff."
    )
    return light


def hash_noise(ix: np.ndarray, iy: np.ndarray, seed: float) -> np.ndarray:
    value = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123
    return value - np.floor(value)


def value_noise(x: np.ndarray, y: np.ndarray, seed: float) -> np.ndarray:
    ix = np.floor(x)
    iy = np.floor(y)
    tx = x - ix
    ty = y - iy
    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)

    n00 = hash_noise(ix, iy, seed)
    n10 = hash_noise(ix + 1.0, iy, seed)
    n01 = hash_noise(ix, iy + 1.0, seed)
    n11 = hash_noise(ix + 1.0, iy + 1.0, seed)
    nx0 = n00 * (1.0 - sx) + n10 * sx
    nx1 = n01 * (1.0 - sx) + n11 * sx
    return nx0 * (1.0 - sy) + nx1 * sy


def organic_field(
    x: np.ndarray,
    y: np.ndarray,
    seed: float,
    feature_frequency: float,
) -> np.ndarray:
    # A stable multiscale domain warp breaks up simple noise contours without
    # changing the field randomly from frame to frame.
    warp_x = value_noise(x * 0.24, y * 0.22, seed + 11.0) - 0.5
    warp_y = value_noise(x * 0.21 + 17.0, y * 0.24 - 9.0, seed + 23.0) - 0.5
    fine_warp_x = value_noise(x * 0.72 - 5.0, y * 0.68 + 13.0, seed + 31.0) - 0.5
    fine_warp_y = value_noise(x * 0.66 + 21.0, y * 0.75 - 4.0, seed + 43.0) - 0.5
    warped_x = x + warp_x * 0.82 + fine_warp_x * 0.19
    warped_y = y + warp_y * 0.74 + fine_warp_y * 0.17

    angle = seed * 0.41
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    rx = warped_x * cos_a - warped_y * sin_a
    ry = warped_x * sin_a + warped_y * cos_a

    low = value_noise(rx * feature_frequency, ry * feature_frequency * 0.86, seed + 1.0)
    medium = value_noise(
        rx * feature_frequency * 2.11 + 19.0,
        ry * feature_frequency * 1.91 - 13.0,
        seed + 5.0,
    )
    detail = value_noise(
        rx * feature_frequency * 4.65 - 7.0,
        ry * feature_frequency * 4.15 + 31.0,
        seed + 9.0,
    )
    micro = value_noise(
        rx * feature_frequency * 8.20 + 43.0,
        ry * feature_frequency * 7.30 - 27.0,
        seed + 15.0,
    )
    ridge = 1.0 - np.abs(2.0 * medium - 1.0)
    return low * 0.47 + medium * 0.27 + detail * 0.16 + micro * 0.05 + ridge * 0.05


def build_field_mesh(
    name: str,
    seed: float,
    feature_frequency: float,
    coverage: float,
    z: float,
    material: bpy.types.Material,
    resolution_x: int = 384,
    resolution_y: int = 192,
) -> bpy.types.Object:
    x_edges = np.linspace(-FIELD_WIDTH / 2, FIELD_WIDTH / 2, resolution_x + 1)
    y_edges = np.linspace(-FIELD_HEIGHT / 2, FIELD_HEIGHT / 2, resolution_y + 1)
    x_centers = (x_edges[:-1] + x_edges[1:]) * 0.5
    y_centers = (y_edges[:-1] + y_edges[1:]) * 0.5
    xx, yy = np.meshgrid(x_centers, y_centers)
    field = organic_field(xx, yy, seed, feature_frequency)
    threshold = float(np.quantile(field, 1.0 - coverage))
    occupied = field >= threshold

    vertices = [(float(x), float(y), z) for y in y_edges for x in x_edges]
    row_width = resolution_x + 1
    faces: list[tuple[int, int, int, int]] = []
    for row, col in np.argwhere(occupied):
        lower_left = int(row * row_width + col)
        faces.append(
            (
                lower_left,
                lower_left + 1,
                lower_left + row_width + 1,
                lower_left + row_width,
            )
        )

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.visible_camera = False
    obj["role"] = "Stable thresholded multiscale canopy-occlusion field"
    obj["coverage"] = coverage
    obj["feature_frequency"] = feature_frequency
    obj["seed"] = seed
    return obj


def make_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.35
    bpy.context.scene.collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty


def add_driver(
    obj: bpy.types.Object,
    data_path: str,
    index: int,
    expression: str,
) -> None:
    fcurve = obj.driver_add(data_path, index)
    driver = fcurve.driver
    driver.type = "SCRIPTED"
    driver.expression = expression


def add_scalar_driver(target: bpy.types.bpy_struct, data_path: str, expression: str) -> None:
    fcurve = target.driver_add(data_path)
    driver = fcurve.driver
    driver.type = "SCRIPTED"
    driver.expression = expression


def periodic(harmonic: int = 1, phase: float = 0.0) -> str:
    return f"sin(2*pi*{harmonic}*(frame-1)/{FRAME_COUNT}+{phase:.8f})"


def animate_shared_canopy(obj: bpy.types.Object, phase: float) -> None:
    """One irregular, asymmetric gust envelope inherited by every field."""
    # Unequal loopable harmonics create complete sways, early reversals,
    # hesitation, one-sided holds, and faster gust reactions without a visible
    # single-sine cadence. Every layer inherits this exact dominant motion.
    gust_x = (
        f"0.145*{periodic(1, phase)}"
        f"+0.066*{periodic(2, phase + 1.37)}"
        f"+0.044*{periodic(3, phase + 4.12)}"
        f"+0.024*{periodic(5, phase + 2.46)}"
        f"+0.013*{periodic(7, phase + 5.31)}"
    )
    gust_y = (
        f"0.046*{periodic(1, phase + 1.18)}"
        f"+0.031*{periodic(3, phase + 3.74)}"
        f"+0.014*{periodic(4, phase + 0.82)}"
        f"+0.009*{periodic(7, phase + 4.57)}"
    )
    add_driver(
        obj,
        "location",
        0,
        gust_x,
    )
    add_driver(
        obj,
        "location",
        1,
        gust_y,
    )
    # Shared anisotropic scale reads as gentle canopy shear/stretch. Rotation is
    # intentionally tiny so the viewer perceives sway, not a turning stencil.
    add_driver(
        obj,
        "rotation_euler",
        2,
        f"0.0021*{periodic(1, phase + 0.61)}+0.0012*{periodic(3, phase + 4.03)}",
    )
    add_driver(
        obj,
        "scale",
        0,
        f"1+0.019*{periodic(1, phase + 2.31)}+0.010*{periodic(4, phase + 0.43)}",
    )
    add_driver(
        obj,
        "scale",
        1,
        f"1-0.013*{periodic(1, phase + 2.31)}+0.007*{periodic(3, phase + 3.27)}",
    )


def animate_relative_layer(
    obj: bpy.types.Object,
    phase: float,
    harmonic: int,
    travel: float,
    stretch: float,
) -> None:
    add_driver(
        obj,
        "location",
        0,
        f"{travel:.6f}*{periodic(harmonic, phase)}+{travel * 0.18:.6f}*{periodic(harmonic + 1, phase + 1.37)}",
    )
    add_driver(
        obj,
        "location",
        1,
        f"{travel * 0.54:.6f}*{periodic(harmonic, phase + 1.89)}",
    )
    add_driver(
        obj,
        "rotation_euler",
        2,
        f"0.0024*{periodic(harmonic, phase + 0.71)}",
    )
    add_driver(obj, "scale", 0, f"1+{stretch:.6f}*{periodic(harmonic, phase + 2.17)}")
    add_driver(obj, "scale", 1, f"1-{stretch * 0.72:.6f}*{periodic(harmonic, phase + 2.17)}")


def add_periodic_deformation(
    obj: bpy.types.Object,
    seed: float,
    amplitude: float,
    harmonic: int,
    phase: float,
) -> None:
    """Add two stable, smoothly varying mesh warps driven around a closed loop."""
    if amplitude <= 0:
        return

    basis = obj.shape_key_add(name="Basis")
    basis.interpolation = "KEY_LINEAR"
    mesh_vertices = np.asarray([vertex.co[:] for vertex in obj.data.vertices], dtype=np.float32)
    x = mesh_vertices[:, 0]
    y = mesh_vertices[:, 1]

    for key_index, (name, seed_offset, phase_offset) in enumerate(
        (("Warp_A", 101.0, 0.0), ("Warp_B", 211.0, math.pi / 2))
    ):
        key = obj.shape_key_add(name=name)
        key.slider_min = -1.0
        key.slider_max = 1.0
        dx = value_noise(x * 0.31 + key_index * 13.0, y * 0.28, seed + seed_offset) - 0.5
        dy = value_noise(x * 0.27, y * 0.34 - key_index * 9.0, seed + seed_offset + 17.0) - 0.5
        fine_dx = value_noise(x * 0.83, y * 0.77 + 19.0, seed + seed_offset + 29.0) - 0.5
        fine_dy = value_noise(x * 0.74 - 7.0, y * 0.89, seed + seed_offset + 41.0) - 0.5
        displacement_x = (dx * 0.76 + fine_dx * 0.24) * amplitude
        displacement_y = (dy * 0.76 + fine_dy * 0.24) * amplitude
        for index, point in enumerate(key.data):
            point.co.x += float(displacement_x[index])
            point.co.y += float(displacement_y[index])
        add_scalar_driver(
            key,
            "value",
            periodic(harmonic + key_index, phase + phase_offset),
        )


def build_topology_mesh(
    name: str,
    occupancy: np.ndarray,
    z: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    resolution_y, resolution_x = occupancy.shape
    x_edges = np.linspace(-FIELD_WIDTH / 2, FIELD_WIDTH / 2, resolution_x + 1)
    y_edges = np.linspace(-FIELD_HEIGHT / 2, FIELD_HEIGHT / 2, resolution_y + 1)
    vertices = [(float(x), float(y), z) for y in y_edges for x in x_edges]
    row_width = resolution_x + 1
    faces: list[tuple[int, int, int, int]] = []
    for row, col in np.argwhere(occupancy):
        lower_left = int(row * row_width + col)
        faces.append(
            (
                lower_left,
                lower_left + 1,
                lower_left + row_width + 1,
                lower_left + row_width,
            )
        )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.visible_camera = False
    obj["role"] = "One connected hierarchical tree-shadow topology"
    return obj


def add_hierarchical_topology_deformation(
    obj: bpy.types.Object,
    core: np.ndarray,
    influences: list[np.ndarray],
) -> None:
    """Deform one mesh through a core plus three spatially related branch zones."""
    resolution_y, resolution_x = core.shape
    vertex_x = np.asarray([vertex.co.x for vertex in obj.data.vertices], dtype=np.float32)
    vertex_y = np.asarray([vertex.co.y for vertex in obj.data.vertices], dtype=np.float32)
    columns = np.clip(
        np.round((vertex_x / FIELD_WIDTH + .5) * resolution_x).astype(int), 0, resolution_x - 1
    )
    rows = np.clip(
        np.round((vertex_y / FIELD_HEIGHT + .5) * resolution_y).astype(int), 0, resolution_y - 1
    )

    core_weight = core[rows, columns].astype(np.float32)
    basis = obj.shape_key_add(name="Basis")
    basis.interpolation = "KEY_LINEAR"

    # A tiny shared deformation gives the dense core weight and continuity
    # without making it inert or allowing it to drift as a separate plate.
    for index, phase in enumerate((0.0, math.pi / 2)):
        key = obj.shape_key_add(name=f"Core_Breath_{index + 1}")
        key.slider_min = -1.0
        key.slider_max = 1.0
        dx = (value_noise(vertex_x * .26 + index * 7, vertex_y * .24, 411 + index) - .5)
        dy = (value_noise(vertex_x * .22, vertex_y * .29 - index * 5, 433 + index) - .5)
        for point_index, point in enumerate(key.data):
            weight = float(core_weight[point_index])
            point.co.x += float(dx[point_index] * .038 * weight)
            point.co.y += float(dy[point_index] * .030 * weight)
        add_scalar_driver(key, "value", periodic(2 + index, .61 + phase))

    for group_index, influence_map in enumerate(influences):
        weights = influence_map[rows, columns].astype(np.float32)
        # Each implied branch owns a small number of related warp modes. All its
        # bridges and clusters therefore bend together; only outer weights flutter.
        for mode in range(3):
            key = obj.shape_key_add(name=f"Branch_{group_index + 1}_Warp_{mode + 1}")
            key.slider_min = -1.0
            key.slider_max = 1.0
            seed = 700 + group_index * 101 + mode * 37
            dx = value_noise(vertex_x * (.18 + mode * .05), vertex_y * .22, seed) - .5
            dy = value_noise(vertex_x * .20, vertex_y * (.19 + mode * .06), seed + 19) - .5
            flutter_x = value_noise(vertex_x * .74, vertex_y * .69, seed + 43) - .5
            flutter_y = value_noise(vertex_x * .66, vertex_y * .81, seed + 61) - .5
            amplitude = .095 + mode * .036
            for point_index, point in enumerate(key.data):
                weight = float(weights[point_index])
                point.co.x += float((dx[point_index] * .72 + flutter_x[point_index] * .28) * amplitude * weight)
                point.co.y += float((dy[point_index] * .72 + flutter_y[point_index] * .28) * amplitude * .82 * weight)
            harmonic = 2 + group_index + mode * 2
            phase = .83 + group_index * 1.71 + mode * 1.19
            add_scalar_driver(key, "value", periodic(harmonic, phase))


def build_canopy(occluder_material: bpy.types.Material) -> None:
    canopy_root = make_empty("Hierarchical_Canopy_Topology")
    canopy_root["motion_design"] = (
        "One connected core; three attached branch webs; peripheral clusters deform with their branch"
    )

    animate_shared_canopy(canopy_root, phase=0.25)
    topology = generate_topology(width=256, height=128)
    # Topology authoring uses image coordinates (y grows downward); Blender's
    # receiver plane uses y upward. Flip every semantic map together so the dense
    # core projects into the lower-left of the illumination asset.
    topology_occupancy = np.flipud(topology["occupancy"])
    topology_core = np.flipud(topology["core"])
    topology_influences = [np.flipud(influence) for influence in topology["influences"]]
    occluder = build_topology_mesh(
        "Connected_Canopy_Projection",
        topology_occupancy,
        z=2.55,
        material=occluder_material,
    )
    occluder.parent = canopy_root
    occluder["core_design"] = "Dense lower-left and central mass; slow deformation"
    occluder["branch_groups"] = 3
    occluder["peripheral_design"] = "Attached fine clusters and breakable narrow bridges"
    add_hierarchical_topology_deformation(occluder, topology_core, topology_influences)


def configure_output(scene: bpy.types.Scene, output_dir: Path) -> Path:
    frames_dir = output_dir / "preview" / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(frames_dir / "dapple_")
    return frames_dir


def run_checked(command: list[str]) -> None:
    print("Running:", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def assemble_review_artifacts(output_dir: Path, frames_dir: Path) -> None:
    preview_dir = output_dir / "preview"
    representative_dir = preview_dir / "representative-frames"
    representative_dir.mkdir(parents=True, exist_ok=True)

    phase_frames = {
        "phase-00.png": FRAME_START,
        "phase-25.png": FRAME_START + FRAME_COUNT // 4,
        "phase-50.png": FRAME_START + FRAME_COUNT // 2,
        "phase-75.png": FRAME_START + 3 * FRAME_COUNT // 4,
    }
    for filename, frame in phase_frames.items():
        source = frames_dir / f"dapple_{frame:04d}.png"
        shutil.copy2(source, representative_dir / filename)

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        print("FFmpeg not found; frames rendered but review video/contact sheets were not assembled.")
        return

    phase_paths = [representative_dir / name for name in phase_frames]
    contact_sheet = preview_dir / "contact-sheet.png"
    comparison_filter = (
        "[0:v]scale=384:192[a];[1:v]scale=384:192[b];"
        "[2:v]scale=384:192[c];[3:v]scale=384:192[d];"
        "[a][b]hstack[top];[c][d]hstack[bottom];[top][bottom]vstack"
    )
    run_checked(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            *sum((["-i", str(path)] for path in phase_paths), []),
            "-filter_complex",
            comparison_filter,
            "-frames:v",
            "1",
            str(contact_sheet),
        ]
    )

    difference = preview_dir / "difference-amplified.png"
    run_checked(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(phase_paths[0]),
            "-i",
            str(phase_paths[1]),
            "-filter_complex",
            "blend=all_mode=difference,eq=contrast=5.0:brightness=0.035",
            "-frames:v",
            "1",
            str(difference),
        ]
    )

    preview_video = preview_dir / "dapple-light-preview.mp4"
    run_checked(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-framerate",
            str(FPS),
            "-start_number",
            str(FRAME_START),
            "-i",
            str(frames_dir / "dapple_%04d.png"),
            "-frames:v",
            str(FRAME_COUNT),
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
            str(preview_video),
        ]
    )


def main() -> None:
    args = parse_args()
    output_dir = (args.output_dir or repo_root() / "design" / "tooling" / "blender-dapple-poc-v4").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    scene = reset_scene()
    receiver_material = make_material("Receiver_White_Matte", (1.0, 1.0, 1.0, 1.0))
    occluder_material = make_material("Canopy_Occluder_Matte", (0.01, 0.01, 0.01, 1.0))

    make_camera(scene)
    make_receiver(receiver_material)
    make_light(scene, args.light)
    build_canopy(occluder_material)
    frames_dir = configure_output(scene, output_dir)

    scene.frame_set(FRAME_START)
    bpy.context.view_layer.update()
    blend_path = output_dir / "dapple-light-poc.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"Saved reproducible Blender setup: {blend_path}", flush=True)

    if args.render_frame is not None:
        if not FRAME_START <= args.render_frame <= FRAME_END:
            raise ValueError(f"Frame must be between {FRAME_START} and {FRAME_END}")
        scene.frame_set(args.render_frame)
        scene.render.filepath = str(output_dir / "preview" / f"setup-test-{args.render_frame:04d}.png")
        bpy.ops.render.render(write_still=True)

    if args.render_preview:
        scene.render.filepath = str(frames_dir / "dapple_")
        bpy.ops.render.render(animation=True)
        assemble_review_artifacts(output_dir, frames_dir)


if __name__ == "__main__":
    main()
