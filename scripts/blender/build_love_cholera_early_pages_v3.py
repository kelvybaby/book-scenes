"""Build the early-page OpenReading state shown in IMG_2862.

This model keeps the almost-complete text block on the right.  The wrapper is
one continuous cross-section (back cover -> spine -> front cover), the glue
film follows the inside of the spine, and each opened page has a distinct,
successive root on that film.  The default is page 5 of 350.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/textures"
OUTPUT_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/open-early-pages-v3"
BLEND_PATH = OUTPUT_DIR / "love-cholera-open-page-005-v3.blend"

BOOK_WIDTH = 0.127
BOOK_HEIGHT = 0.19685
BOOK_THICKNESS = 0.022225
COVER_THICKNESS = 0.00046
PAGE_THICKNESS = BOOK_THICKNESS - 2.0 * COVER_THICKNESS
PAGE_WIDTH = BOOK_WIDTH - 0.00089
PAGE_HEIGHT = BOOK_HEIGHT - 0.003
GLUE_THICKNESS = 0.00034
TOTAL_PAGES = 350
OPEN_PAGE = 5
PAGE_FRACTION = OPEN_PAGE / TOTAL_PAGES
SINGLE_PAGE_THICKNESS = PAGE_THICKNESS / TOTAL_PAGES


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def smoothstep(value: float) -> float:
    value = clamp(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def srgb(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
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
    scene.world = bpy.data.worlds.new("Early page world")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#161713")
    background.inputs["Strength"].default_value = 0.30


def flat_material(name: str, color: str, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = srgb(color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.46
    return material


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


def mesh_object(
    collection: bpy.types.Collection,
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    face_materials: list[int],
    face_uvs: list[tuple[tuple[float, float], ...]],
    materials: list[bpy.types.Material],
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, material_index, uvs in zip(mesh.polygons, face_materials, face_uvs, strict=True):
        polygon.material_index = material_index
        for loop_index, uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for material in materials:
        obj.data.materials.append(material)
    return obj


def spine_bend_amount(q: float) -> float:
    phase = math.sin(math.pi * clamp(q, 0.0, 1.0))
    return 0.0070 * phase ** 0.72


def spine_point(t: float, q: float) -> tuple[float, float]:
    """Ordered page-root path from back-cover side (0) to front-cover side (1)."""
    z = COVER_THICKNESS + PAGE_THICKNESS * t
    direction = -1.0 if q <= 0.5 else 1.0
    x = direction * spine_bend_amount(q) * math.sin(math.pi * t) ** 1.35
    return x, z


def wrapper_cross_section(q: float) -> list[tuple[float, float, str, float]]:
    """One continuous path: back cover, finite spine, then opened front cover."""
    points: list[tuple[float, float, str, float]] = []
    n_cover, n_spine, n_fillet = 52, 32, 8
    fillet = 0.00145

    # Back cover remains under the nearly complete right text block.
    for i in range(n_cover + 1):
        u = 1.0 - i / n_cover
        x = fillet + u * (BOOK_WIDTH - fillet)
        z = COVER_THICKNESS * 0.5 + 0.00018 * math.sin(math.pi * u)
        points.append((x, z, "back", 1.0 - u))

    # A real paperback wrapper has rounded shoulders where the covers become the
    # spine.  These quarter-circle transitions keep the wrapper one continuous
    # bent object instead of three intersecting sheets.
    for i in range(1, n_fillet + 1):
        s = i / n_fillet
        theta = -math.pi * 0.5 - math.pi * 0.5 * s
        x = fillet + fillet * math.cos(theta)
        z = COVER_THICKNESS * 0.5 + fillet + fillet * math.sin(theta)
        points.append((x, z, "spine", s * fillet / BOOK_THICKNESS))

    # The spine remains almost closed at page 5, with only a slight elastic bow.
    t0 = fillet / PAGE_THICKNESS
    t1 = 1.0 - t0
    for i in range(1, n_spine + 1):
        t = t0 + (t1 - t0) * i / n_spine
        x, page_z = spine_point(t, q)
        z = page_z - COVER_THICKNESS * 0.5
        points.append((x, z, "spine", t))

    upper_x, upper_z = points[-1][0], points[-1][1]
    for i in range(1, n_fillet + 1):
        s = i / n_fillet
        theta = math.pi * 0.5 * s
        x = upper_x - fillet + fillet * math.cos(theta)
        z = upper_z + fillet * math.sin(theta)
        points.append((x, z, "spine", t1 + s * fillet / BOOK_THICKNESS))

    # By the first content pages the front cover is already open.  It leaves the
    # rounded top spine shoulder and forms the broad lower arc visible in both
    # supplied photographs.  Its free edge remains slightly above the table,
    # as IMG_2866 makes clear.
    root_x, root_z = points[-1][0], points[-1][1]
    for i in range(1, n_cover + 1):
        u = i / n_cover
        eased = smoothstep(u)
        x = root_x - BOOK_WIDTH * u
        outer_z = 0.0076
        z = root_z * (1.0 - eased) + outer_z * eased
        z += 0.0084 * math.sin(math.pi * u) ** 1.05
        points.append((x, z, "front", u))
    return points


def cross_normal(points: list[tuple[float, float, str, float]], index: int) -> tuple[float, float]:
    before = points[max(0, index - 1)]
    after = points[min(len(points) - 1, index + 1)]
    dx, dz = after[0] - before[0], after[1] - before[1]
    length = max(1e-8, math.hypot(dx, dz))
    return -dz / length, dx / length


def add_wrapper(
    collection: bpy.types.Collection,
    q: float,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    points = wrapper_cross_section(q)
    ny = 24
    row = len(points)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []

    # The left normal follows the physical exterior around the U-shaped wrapper.
    for layer in (0, 1):
        offset = (0.5 if layer == 0 else -0.5) * COVER_THICKNESS
        for j in range(ny + 1):
            v = j / ny
            for i, (x, z, _, _) in enumerate(points):
                nx, nz = cross_normal(points, i)
                crown = 0.00035 * math.sin(math.pi * v) * math.sin(math.pi * i / (row - 1))
                vertices.append((x + nx * offset, (v - 0.5) * BOOK_HEIGHT, z + nz * offset + crown))

    layer_size = row * (ny + 1)

    def idx(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * row + i

    exterior_indices = {"front": 0, "back": 1, "spine": 2}
    for layer in (0, 1):
        for j in range(ny):
            for i in range(row - 1):
                face = (idx(layer, i, j), idx(layer, i + 1, j), idx(layer, i + 1, j + 1), idx(layer, i, j + 1))
                if layer == 1:
                    face = tuple(reversed(face))
                faces.append(face)
                region = points[i][2] if points[i][2] == points[i + 1][2] else points[i + 1][2]
                mat_ids.append(exterior_indices[region] if layer == 0 else 3)
                u0, u1 = points[i][3], points[i + 1][3]
                uvs.append(((u0, j / ny), (u1, j / ny), (u1, (j + 1) / ny), (u0, (j + 1) / ny)))

    boundary: list[tuple[int, int]] = []
    boundary.extend((i, 0) for i in range(row))
    boundary.extend((row - 1, j) for j in range(1, ny + 1))
    boundary.extend((i, ny) for i in range(row - 2, -1, -1))
    boundary.extend((0, j) for j in range(ny - 1, 0, -1))
    for k, (i, j) in enumerate(boundary):
        ni, nj = boundary[(k + 1) % len(boundary)]
        faces.append((idx(0, i, j), idx(1, i, j), idx(1, ni, nj), idx(0, ni, nj)))
        mat_ids.append(4)
        a, b = k / len(boundary), (k + 1) / len(boundary)
        uvs.append(((a, 0), (a, 1), (b, 1), (b, 0)))

    obj = mesh_object(
        collection,
        "OpenPage005_ContinuousWrapper_BackSpineFront",
        vertices,
        faces,
        mat_ids,
        uvs,
        [materials["front"], materials["back"], materials["spine"], materials["inside"], materials["cover_edge"]],
    )
    obj["continuous_wrapper"] = True
    obj["page_fraction"] = q
    return obj


def add_adhesive(
    collection: bpy.types.Collection,
    q: float,
    adhesive: bpy.types.Material,
) -> bpy.types.Object:
    nz, ny = 34, 20
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nz + 1):
            t = i / nz
            x, z = spine_point(t, q)
            vertices.append((x + COVER_THICKNESS * 0.5 + GLUE_THICKNESS * 0.5, (v - 0.5) * PAGE_HEIGHT, z))
    for j in range(ny):
        for i in range(nz):
            a = j * (nz + 1) + i
            faces.append((a, a + 1, a + nz + 2, a + nz + 1))
            uvs.append(((i / nz, j / ny), ((i + 1) / nz, j / ny), ((i + 1) / nz, (j + 1) / ny), (i / nz, (j + 1) / ny)))
    obj = mesh_object(collection, "OpenPage005_InsideSpineAdhesive_PageRoots", vertices, faces, [0] * len(faces), uvs, [adhesive])
    obj["page_root_interval"] = "ordered from 0/350 to 350/350"
    return obj


def remaining_block_point(q: float, layer: float, u: float, v: float) -> tuple[float, float, float]:
    t = (1.0 - q) * layer
    root_x, root_z = spine_point(t, q)
    root_x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
    outer_x = PAGE_WIDTH
    x = root_x + (outer_x - root_x) * u
    outer_z = COVER_THICKNESS + PAGE_THICKNESS * (1.0 - q) * layer
    z = root_z + (outer_z - root_z) * u
    if layer > 0.999:
        # The closed-side block is almost rectangular.  Its only lift is the
        # localized gutter crown seen in IMG_2866, not a fore-edge wedge.
        z += 0.00105 * (1.0 - math.exp(-u * 9.0)) * (1.0 - u) ** 1.7
        z += 0.00024 * math.sin(math.pi * u)
        z += 0.00045 * math.sin(math.pi * v) * math.sin(math.pi * u)
    y = (v - 0.5) * PAGE_HEIGHT
    return x, y, z


def add_remaining_block(
    collection: bpy.types.Collection,
    q: float,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    nx, ny = 42, 24
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    row = nx + 1
    layer_size = row * (ny + 1)
    for layer in (0.0, 1.0):
        for j in range(ny + 1):
            for i in range(row):
                vertices.append(remaining_block_point(q, layer, i / nx, j / ny))

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
    # The inner/gutter side stays open so the successive leaf roots and the
    # continuous wrapper remain visible.  Capping it created a false dark plate.
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

    obj = mesh_object(
        collection,
        "OpenPage005_Remaining345of350_PageBlock",
        vertices,
        faces,
        mat_ids,
        uvs,
        [materials["paper"], materials["page_edge"], materials["adhesive"]],
    )
    obj["page_count_equivalent"] = TOTAL_PAGES - OPEN_PAGE
    obj["thickness_fraction"] = 1.0 - q
    return obj


def opened_page_point(q: float, page_number: int, u: float, v: float) -> tuple[float, float, float]:
    # All five leaves share one non-crossing guide but start at their own
    # successive adhesive positions.  Earlier pages remain consistently above
    # later pages from root to free edge; their ordering can no longer invert.
    t = 1.0 - (page_number - 0.5) / TOTAL_PAGES
    root_x, root_z = spine_point(t, q)
    root_x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
    base_t = 1.0 - (OPEN_PAGE - 0.5) / TOTAL_PAGES
    base_root_x, base_root_z = spine_point(base_t, q)
    base_root_x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
    rank = OPEN_PAGE - page_number

    outer_x = base_root_x - PAGE_WIDTH
    x = root_x + (outer_x - root_x) * u
    eased = smoothstep(u)
    outer_z = 0.0100
    z = base_root_z * (1.0 - eased) + outer_z * eased
    z += 0.0119 * math.sin(math.pi * u) ** 1.02
    z += (root_z - base_root_z) * (1.0 - eased)
    z += rank * (
        0.00009 * eased
        + 0.00018 * math.sin(math.pi * u) ** 1.12
    )
    z += 0.00075 * math.sin(math.pi * v) * math.sin(math.pi * u) ** 1.2
    y = (v - 0.5) * PAGE_HEIGHT
    return x, y, z


def add_opened_page(
    collection: bpy.types.Collection,
    q: float,
    page_number: int,
    paper: bpy.types.Material,
    edge: bpy.types.Material,
) -> bpy.types.Object:
    nx, ny = 42, 14
    half = SINGLE_PAGE_THICKNESS * 0.5
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    mat_ids: list[int] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    row = nx + 1
    layer_size = row * (ny + 1)
    for layer in (-half, half):
        for j in range(ny + 1):
            for i in range(row):
                x, y, z = opened_page_point(q, page_number, i / nx, j / ny)
                vertices.append((x, y, z + layer))

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
    boundary: list[tuple[int, int]] = []
    boundary.extend((i, 0) for i in range(row))
    boundary.extend((nx, j) for j in range(1, ny + 1))
    boundary.extend((i, ny) for i in range(nx - 1, -1, -1))
    boundary.extend((0, j) for j in range(ny - 1, 0, -1))
    for k, (i, j) in enumerate(boundary):
        ni, nj = boundary[(k + 1) % len(boundary)]
        faces.append((idx(0, i, j), idx(1, i, j), idx(1, ni, nj), idx(0, ni, nj)))
        mat_ids.append(1)
        a, b = k / len(boundary), (k + 1) / len(boundary)
        uvs.append(((a, 0), (a, 1), (b, 1), (b, 0)))

    obj = mesh_object(collection, f"OpenPage005_OpenedLeaf_{page_number:03d}_DistinctRoot", vertices, faces, mat_ids, uvs, [paper, edge])
    obj["page_number"] = page_number
    obj["root_fraction"] = 1.0 - (page_number - 0.5) / TOTAL_PAGES
    obj["physical_thickness_mm"] = SINGLE_PAGE_THICKNESS * 1000
    return obj


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
        "front": image_material("Front cover photograph", "front-cover-v1.jpg", 0.59),
        "back": image_material("Back cover photograph", "back-cover-v1.jpg", 0.61),
        "spine": image_material("Spine photograph", "spine-v1.jpg", 0.60),
        "inside": flat_material("Inside cover", "#d2c39e", 0.86),
        "cover_edge": flat_material("Worn cover edge", "#bb9254", 0.78),
        "paper": flat_material("Warm thin paper", "#d8c9a8", 0.91),
        "page_edge": image_material("Layered page edge", "page-edge-fore-v1.jpg", 0.90),
        "leaf_edge": flat_material("Individual thin leaf edge", "#9f8965", 0.95),
        "adhesive": flat_material("Inside-spine adhesive", "#725132", 0.76),
    }

    collection = bpy.data.collections.new("OpenReading_Page005_of_350")
    bpy.context.scene.collection.children.link(collection)
    q = PAGE_FRACTION
    add_wrapper(collection, q, materials)
    adhesive_object = add_adhesive(collection, q, materials["adhesive"])
    adhesive_object.hide_render = True
    adhesive_object.hide_set(True)
    add_remaining_block(collection, q, materials)
    for page_number in range(1, OPEN_PAGE + 1):
        add_opened_page(collection, q, page_number, materials["paper"], materials["leaf_edge"])

    collection["total_pages"] = TOTAL_PAGES
    collection["open_page"] = OPEN_PAGE
    collection["open_fraction"] = q
    collection["opened_source_thickness_mm"] = PAGE_THICKNESS * q * 1000
    collection["reference"] = "IMG_2862.HEIC + IMG_2866.heic"

    bpy.ops.object.light_add(type="AREA", location=(-0.19, -0.22, 0.34))
    key = bpy.context.object
    key.name = "WarmSoftbox"
    key.data.energy = 3.5
    key.data.shape = "DISK"
    key.data.size = 0.34
    key.data.color = (1.0, 0.83, 0.66)
    look_at(key, (0.0, 0.0, 0.014))

    bpy.ops.object.light_add(type="AREA", location=(0.22, 0.10, 0.20))
    fill = bpy.context.object
    fill.name = "CoolFill"
    fill.data.energy = 1.4
    fill.data.size = 0.30
    fill.data.color = (0.72, 0.82, 1.0)
    look_at(fill, (0.015, 0.0, 0.012))

    reference_camera = add_camera(
        "Reference_IMG_2862_Page005_FullBook",
        (0.040, -0.520, 0.285),
        (0.000, 0.005, 0.013),
        55,
    )
    low_camera = add_camera(
        "Reference_IMG_2866_LowBottomEdge_FullBook",
        (0.010, -0.530, 0.067),
        (0.000, 0.006, 0.012),
        58,
    )

    render_view(reference_camera, OUTPUT_DIR / "checkpoint-2-img2862-full.png", 1800, 1100)
    render_view(low_camera, OUTPUT_DIR / "checkpoint-2-img2866-low-full.png", 1800, 1000)

    bpy.context.scene.camera = reference_camera
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.shading.type = "MATERIAL"
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.region_3d.view_perspective = "CAMERA"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved early-page model: {BLEND_PATH}")
    print(f"Opened source thickness: {PAGE_THICKNESS * q * 1000:.3f} mm")


if __name__ == "__main__":
    build()
