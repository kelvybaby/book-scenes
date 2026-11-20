"""Build the OpenReading paperback from a spine-first physical construction.

The wrapper is one continuous mesh (back cover + spine + front cover).  A
flexible adhesive film sits on the inside of its finite-width spine segment.
Every representative page layer terminates on that adhesive film, so opening
the pages also deforms the spine instead of hiding or replacing it.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/textures"
OUTPUT_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/open-candidate-v2"
BLEND_PATH = OUTPUT_DIR / "love-cholera-open-physical-v2.blend"

# Measured closed-book envelope already used by the project.
COVER_FACE_WIDTH = 0.127
BOOK_HEIGHT = 0.19685
BOOK_THICKNESS = 0.022225
COVER_THICKNESS = 0.00046
PAGE_WIDTH = 0.1245
PAGE_HEIGHT = BOOK_HEIGHT - 0.003
GLUE_THICKNESS = 0.00062

# User-specified reading pose: included angle between the two cover runs at the
# bound edge.  The finite-width spine becomes an 80-degree circular bend, whose
# end tangents leave a 100-degree included opening above it.
OPEN_INCLUDED_ANGLE_DEG = 100.0
SPINE_TURN = math.radians(180.0 - OPEN_INCLUDED_ANGLE_DEG)
SPINE_RADIUS = BOOK_THICKNESS / SPINE_TURN
SPINE_HALF_ANGLE = SPINE_TURN * 0.5
SPINE_LOW_Z = 0.0024
SPINE_HALF_CHORD = SPINE_RADIUS * math.sin(SPINE_HALF_ANGLE)


def srgb(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 20
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("OpenReading world")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#171612")
    background.inputs["Strength"].default_value = 0.32


def image_material(name: str, filename: str, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(TEXTURE_DIR / filename), check_existing=True)
    texture.interpolation = "Linear"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.47
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def flat_material(name: str, color: str, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = srgb(color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.46
    return material


def mesh_object(
    collection: bpy.types.Collection,
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material_indices: list[int],
    face_uvs: list[tuple[tuple[float, float], ...]],
    materials: list[bpy.types.Material],
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, material_index, uvs in zip(
        mesh.polygons, material_indices, face_uvs, strict=True
    ):
        polygon.material_index = material_index
        for loop_index, uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for material in materials:
        obj.data.materials.append(material)
    return obj


def spine_point(t: float) -> tuple[float, float, float, float]:
    """Centerline point and upward normal on the bent finite-width spine."""
    phi = -SPINE_HALF_ANGLE + SPINE_TURN * t
    x = SPINE_RADIUS * math.sin(phi)
    z = SPINE_LOW_Z + SPINE_RADIUS * (1.0 - math.cos(phi))
    nx, nz = -math.sin(phi), math.cos(phi)
    return x, z, nx, nz


def cover_point(side: int, u: float) -> tuple[float, float]:
    """Cover centerline from a spine hinge (u=0) to a fore edge (u=1)."""
    _, hinge_z, _, _ = spine_point(1.0 if side > 0 else 0.0)
    projection = COVER_FACE_WIDTH - 0.0025
    x = side * (SPINE_HALF_CHORD + projection * u)
    broad_bow = (0.0054 if side > 0 else 0.0045) * math.sin(math.pi * u) ** 1.12
    outer_drop = (0.0027 if side > 0 else 0.0030) * u
    return x, hinge_z + broad_bow - outer_drop


def wrapper_cross_section() -> list[tuple[float, float, str, float]]:
    points: list[tuple[float, float, str, float]] = []
    cover_steps, spine_steps = 48, 20
    for i in range(cover_steps + 1):
        u = 1.0 - i / cover_steps
        x, z = cover_point(-1, u)
        points.append((x, z, "back", 1.0 - u))
    for i in range(1, spine_steps + 1):
        t = i / spine_steps
        x, z, _, _ = spine_point(t)
        points.append((x, z, "spine", t))
    for i in range(1, cover_steps + 1):
        u = i / cover_steps
        x, z = cover_point(1, u)
        points.append((x, z, "front", u))
    return points


def cross_normal(points: list[tuple[float, float, str, float]], i: int) -> tuple[float, float]:
    before = points[max(0, i - 1)]
    after = points[min(len(points) - 1, i + 1)]
    dx, dz = after[0] - before[0], after[1] - before[1]
    length = math.hypot(dx, dz)
    return -dz / length, dx / length


def add_continuous_wrapper(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    points = wrapper_cross_section()
    ny = 28
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    row = len(points)

    # Layer 0 is the photographed exterior; layer 1 is the inside cover.
    for layer in (0, 1):
        signed_offset = (-0.5 if layer == 0 else 0.5) * COVER_THICKNESS
        for j in range(ny + 1):
            v = j / ny
            longitudinal = 0.00065 * math.sin(math.pi * v)
            for i, (x, z, _, _) in enumerate(points):
                nx, nz = cross_normal(points, i)
                crown = longitudinal * math.sin(math.pi * i / (row - 1))
                vertices.append((x + nx * signed_offset, (v - 0.5) * BOOK_HEIGHT, z + nz * signed_offset + crown))

    layer_size = row * (ny + 1)

    def idx(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * row + i

    exterior_mats = {"front": 0, "back": 1, "spine": 2}
    for layer in (0, 1):
        for j in range(ny):
            for i in range(row - 1):
                face = (idx(layer, i, j), idx(layer, i + 1, j), idx(layer, i + 1, j + 1), idx(layer, i, j + 1))
                if layer == 0:
                    face = tuple(reversed(face))
                faces.append(face)
                region = points[i][2] if points[i][2] == points[i + 1][2] else "spine"
                mat_ids.append(exterior_mats[region] if layer == 0 else 3)
                u0, u1 = points[i][3], points[i + 1][3]
                uvs.append(((u0, j / ny), (u1, j / ny), (u1, (j + 1) / ny), (u0, (j + 1) / ny)))

    boundary: list[tuple[int, int]] = []
    boundary.extend((i, 0) for i in range(row))
    boundary.extend((row - 1, j) for j in range(1, ny + 1))
    boundary.extend((i, ny) for i in range(row - 2, -1, -1))
    boundary.extend((0, j) for j in range(ny - 1, 0, -1))
    for k, (i, j) in enumerate(boundary):
        ni, nj = boundary[(k + 1) % len(boundary)]
        faces.append((idx(0, i, j), idx(0, ni, nj), idx(1, ni, nj), idx(1, i, j)))
        mat_ids.append(4)
        a, b = k / len(boundary), (k + 1) / len(boundary)
        uvs.append(((a, 0), (b, 0), (b, 1), (a, 1)))

    obj = mesh_object(
        collection,
        "OpenReading_OnePieceWrapper_BackSpineFront",
        vertices,
        faces,
        mat_ids,
        uvs,
        [materials["front"], materials["back"], materials["spine"], materials["inside"], materials["cover_edge"]],
    )
    obj["construction"] = "single continuous wrapper mesh: back cover + finite spine + front cover"
    obj["spine_width_closed_mm"] = BOOK_THICKNESS * 1000
    obj["open_included_angle_deg"] = OPEN_INCLUDED_ANGLE_DEG
    return obj


def add_spine_adhesive(
    collection: bpy.types.Collection,
    adhesive: bpy.types.Material,
) -> bpy.types.Object:
    ns, ny = 32, 22
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    row = ns + 1
    for layer in (0, 1):
        offset = COVER_THICKNESS * 0.5 + GLUE_THICKNESS * layer
        for j in range(ny + 1):
            v = j / ny
            for i in range(row):
                t = i / ns
                x, z, nx, nz = spine_point(t)
                vertices.append((x + nx * offset, (v - 0.5) * PAGE_HEIGHT, z + nz * offset))
    layer_size = row * (ny + 1)

    def idx(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * row + i

    for layer in (0, 1):
        for j in range(ny):
            for i in range(ns):
                face = (idx(layer, i, j), idx(layer, i + 1, j), idx(layer, i + 1, j + 1), idx(layer, i, j + 1))
                if layer == 0:
                    face = tuple(reversed(face))
                faces.append(face)
                mat_ids.append(0)
                uvs.append(((i / ns, j / ny), ((i + 1) / ns, j / ny), ((i + 1) / ns, (j + 1) / ny), (i / ns, (j + 1) / ny)))
    for i in range(ns):
        for j in (0, ny):
            face = (idx(0, i, j), idx(0, i + 1, j), idx(1, i + 1, j), idx(1, i, j))
            faces.append(face if j == ny else tuple(reversed(face)))
            mat_ids.append(0)
            uvs.append(((i / ns, 0), ((i + 1) / ns, 0), ((i + 1) / ns, 1), (i / ns, 1)))
    for i in (0, ns):
        for j in range(ny):
            faces.append((idx(0, i, j), idx(1, i, j), idx(1, i, j + 1), idx(0, i, j + 1)))
            mat_ids.append(0)
            uvs.append(((0, j / ny), (1, j / ny), (1, (j + 1) / ny), (0, (j + 1) / ny)))

    obj = mesh_object(collection, "OpenReading_Adhesive_PageConnection", vertices, faces, mat_ids, uvs, [adhesive])
    obj["construction"] = "flexible glue film between page edges and inside of spine"
    return obj


def page_anchor(side: int, layer: float) -> tuple[float, float]:
    # Lower leaves terminate near the appropriate hinge; the open spread ends
    # near the middle of the adhesive film.  All anchors stay on that film.
    t = 0.035 + 0.455 * layer if side < 0 else 0.965 - 0.455 * layer
    x, z, nx, nz = spine_point(t)
    offset = COVER_THICKNESS * 0.5 + GLUE_THICKNESS + 0.00008
    return x + nx * offset, z + nz * offset


def page_point(side: int, layer: float, u: float, v: float) -> tuple[float, float, float]:
    anchor_x, anchor_z = page_anchor(side, layer)
    outer_x = side * (SPINE_HALF_CHORD + PAGE_WIDTH)
    outer_bottom = 0.0062 if side < 0 else 0.0065
    stack_height = 0.0125 if side < 0 else 0.0145
    outer_z = outer_bottom + stack_height * layer
    x = anchor_x + (outer_x - anchor_x) * u
    broad_arch = (0.0045 if side < 0 else 0.0057) + layer * (0.0018 if side < 0 else 0.0026)
    z = anchor_z + (outer_z - anchor_z) * u + broad_arch * math.sin(math.pi * u) ** 1.08
    z += 0.0009 * math.sin(math.pi * v) * math.sin(math.pi * u) ** 1.2
    y = (v - 0.5) * PAGE_HEIGHT
    return x, y, z


def add_page_block(
    collection: bpy.types.Collection,
    side: int,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    nx, ny = 52, 26
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    row = nx + 1
    layer_size = row * (ny + 1)
    for layer in (0.0, 1.0):
        for j in range(ny + 1):
            v = j / ny
            for i in range(row):
                vertices.append(page_point(side, layer, i / nx, v))

    def idx(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * row + i

    for layer in (0, 1):
        for j in range(ny):
            for i in range(nx):
                face = (idx(layer, i, j), idx(layer, i + 1, j), idx(layer, i + 1, j + 1), idx(layer, i, j + 1))
                if layer == 0:
                    face = tuple(reversed(face))
                faces.append(face)
                mat_ids.append(0)
                uvs.append(((i / nx, j / ny), ((i + 1) / nx, j / ny), ((i + 1) / nx, (j + 1) / ny), (i / nx, (j + 1) / ny)))
    # Only the fore edge is capped.  The bound edge is not a solid triangular
    # wall: it is the collection of individual leaf edges terminating in the
    # adhesive film, which remains visible between those leaves.
    for boundary_i, material_index in ((nx, 1),):
        for j in range(ny):
            faces.append((idx(0, boundary_i, j), idx(0, boundary_i, j + 1), idx(1, boundary_i, j + 1), idx(1, boundary_i, j)))
            mat_ids.append(material_index)
            uvs.append(((0, j / ny), (0, (j + 1) / ny), (1, (j + 1) / ny), (1, j / ny)))
    for boundary_j in (0, ny):
        for i in range(nx):
            face = (idx(0, i, boundary_j), idx(0, i + 1, boundary_j), idx(1, i + 1, boundary_j), idx(1, i, boundary_j))
            faces.append(face if boundary_j == ny else tuple(reversed(face)))
            mat_ids.append(1)
            uvs.append(((i / nx, 0), ((i + 1) / nx, 0), ((i + 1) / nx, 1), (i / nx, 1)))

    side_name = "Left" if side < 0 else "Right"
    obj = mesh_object(
        collection,
        f"OpenReading_{side_name}PageBlock_BoundToSpine",
        vertices,
        faces,
        mat_ids,
        uvs,
        [materials["paper"], materials["page_edge"], materials["adhesive"]],
    )
    obj["construction"] = "page block whose inner boundary follows the spine adhesive"
    return obj


def add_representative_pages(
    collection: bpy.types.Collection,
    side: int,
    paper: bpy.types.Material,
    edge_line: bpy.types.Material,
) -> None:
    nx, ny = 44, 14
    side_name = "Left" if side < 0 else "Right"
    for page_index in range(1, 14):
        layer = page_index / 14.0
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        uvs: list[tuple[tuple[float, float], ...]] = []
        for j in range(ny + 1):
            v = j / ny
            for i in range(nx + 1):
                vertices.append(page_point(side, layer, i / nx, v))
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i
                faces.append((a, a + 1, a + nx + 2, a + nx + 1))
                uvs.append(((i / nx, j / ny), ((i + 1) / nx, j / ny), ((i + 1) / nx, (j + 1) / ny), (i / nx, (j + 1) / ny)))
        obj = mesh_object(
            collection,
            f"OpenReading_{side_name}_PageLayer_{page_index:02d}",
            vertices,
            faces,
            [0] * len(faces),
            uvs,
            [paper],
        )
        obj["spine_anchor_layer"] = layer

        curve_data = bpy.data.curves.new(f"{obj.name}_FrontEdgeCurve", "CURVE")
        curve_data.dimensions = "3D"
        curve_data.bevel_depth = 0.000045
        curve_data.bevel_resolution = 1
        spline = curve_data.splines.new("POLY")
        spline.points.add(nx)
        for i in range(nx + 1):
            x, y, z = page_point(side, layer, i / nx, 0.0)
            spline.points[i].co = (x, y - 0.00006, z, 1.0)
        edge = bpy.data.objects.new(f"{obj.name}_FrontEdge", curve_data)
        collection.objects.link(edge)
        edge.data.materials.append(edge_line)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> bpy.types.Object:
    data = bpy.data.cameras.new(f"{name}Data")
    data.lens = lens
    data.sensor_width = 36
    data.sensor_fit = "HORIZONTAL"
    camera = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    look_at(camera, target)
    return camera


def render_view(camera: bpy.types.Object, path: Path, width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build() -> None:
    reset_scene()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    materials = {
        "front": image_material("Front cover", "front-cover-v1.jpg", 0.58),
        "back": image_material("Back cover", "back-cover-v1.jpg", 0.61),
        "spine": image_material("Visible flexible spine", "spine-v1.jpg", 0.60),
        "inside": flat_material("Inside cover stock", "#bda77d", 0.86),
        "cover_edge": flat_material("Cover cut edge", "#a9743d", 0.76),
        "paper": flat_material("Aged page paper", "#d5c49d", 0.91),
        "page_edge": image_material("Layered page edge", "page-edge-fore-v1.jpg", 0.90),
        "page_line": flat_material("Page stratum line", "#8d7654", 0.96),
        "adhesive": flat_material("Flexible spine adhesive", "#8f6635", 0.74),
    }

    collection = bpy.data.collections.new("OpenReading_PhysicalBinding_v2")
    bpy.context.scene.collection.children.link(collection)
    add_continuous_wrapper(collection, materials)
    add_spine_adhesive(collection, materials["adhesive"])
    add_page_block(collection, -1, materials)
    add_page_block(collection, 1, materials)
    add_representative_pages(collection, -1, materials["paper"], materials["page_line"])
    add_representative_pages(collection, 1, materials["paper"], materials["page_line"])
    collection["reference_pose"] = "IMG_2853 OpenReading"
    collection["binding_model"] = "perfect-bound pages terminate on adhesive at inside of flexed spine"

    bpy.ops.object.light_add(type="AREA", location=(-0.18, -0.24, 0.34))
    key = bpy.context.object
    key.name = "LargeSoftbox"
    key.data.energy = 3.6
    key.data.shape = "DISK"
    key.data.size = 0.36
    key.data.color = (1.0, 0.84, 0.68)
    look_at(key, (0, 0, 0.015))

    bpy.ops.object.light_add(type="AREA", location=(0.23, 0.08, 0.19))
    fill = bpy.context.object
    fill.name = "CoolFill"
    fill.data.energy = 1.4
    fill.data.size = 0.30
    fill.data.color = (0.72, 0.82, 1.0)
    look_at(fill, (0, 0, 0.018))

    camera_profile = add_camera("OpenReading_Profile_IMG_2853", (0.0, -0.405, 0.066), (0.0, 0.0, 0.015), 55)
    camera_three_quarter = add_camera("OpenReading_ThreeQuarter_IMG_2844", (-0.012, -0.345, 0.105), (0.0, 0.018, 0.012), 56)

    render_view(camera_profile, OUTPUT_DIR / "open-reading-profile-v2.png", 1600, 720)
    render_view(camera_three_quarter, OUTPUT_DIR / "open-reading-three-quarter-v2.png", 1500, 900)

    bpy.context.scene.camera = camera_profile
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.shading.type = "MATERIAL"
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.region_3d.view_perspective = "CAMERA"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved physical OpenReading model: {BLEND_PATH}")


if __name__ == "__main__":
    build()
