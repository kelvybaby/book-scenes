"""Build a photo-calibrated first-pass open paperback candidate.

This is deliberately an approval asset, not the runtime page-turn rig.  It
authors the wrapper, glued text blocks, and visible leaf strata as coupled 3D
surfaces in Blender so their silhouettes can be judged before integration.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python \
    scripts/blender/build_love_cholera_open_candidate.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/textures"
OUTPUT_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book/open-candidate-v1"
BLEND_PATH = OUTPUT_DIR / "love-cholera-open-candidate-v1.blend"

BOOK_WIDTH = 0.127
BOOK_HEIGHT = 0.19685
BOOK_THICKNESS = 0.022225
COVER_THICKNESS = 0.00046
PAGE_HEIGHT = BOOK_HEIGHT - 0.003
HALF_STACK = (BOOK_THICKNESS - 2 * COVER_THICKNESS) * 0.5
HINGE_HALF_WIDTH = 0.0085


def srgb(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 20
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("Candidate world")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#050504")
    background.inputs["Strength"].default_value = 0.24


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


def paper_material(name: str, color: str, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = srgb(color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.46
    roughness_node = material.node_tree.nodes.new("ShaderNodeTexImage")
    roughness_node.image = bpy.data.images.load(
        str(TEXTURE_DIR / "paper-roughness-v1.png"), check_existing=True
    )
    roughness_node.image.colorspace_settings.name = "Non-Color"
    material.node_tree.links.new(roughness_node.outputs["Color"], shader.inputs["Roughness"])
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
        polygon.use_smooth = material_index not in (0, 1)
        for loop_index, uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for material in materials:
        obj.data.materials.append(material)
    return obj


def reading_page_point(side: int, u: float, v: float, w: float) -> tuple[float, float, float]:
    """Map one text-block stratum into the photographed reading cross-section."""
    asymmetry = 1.04 if side > 0 else 0.96
    # The reading surface closes to a hairline gutter while the deeper strata
    # spread outward along the bent glue line.
    inner_x = 0.00035 + (1.0 - w) * 0.0032
    x = side * (inner_x + u * (BOOK_WIDTH - inner_x))
    arch = math.sin(math.pi * u) ** 1.18
    # The lower strata follow the reader's red trace: a restrained rise away
    # from the gutter, then an almost level run into the fore edge.  The right
    # block is fractionally fuller in IMG_2853.
    lower_arch = 0.00355 if side > 0 else 0.00315
    lower = 0.0047 + 0.0032 * u + lower_arch * arch
    thickness = HALF_STACK * asymmetry * (0.74 + 0.26 * u) + 0.0010 * arch
    # The opening surface carries most of the bow.  It is intentionally
    # asymmetric: the right page rises more strongly than the left tracing.
    upper_arch = 0.0065 if side > 0 else 0.0048
    z = lower + w * thickness + w * upper_arch * arch
    length_crown = 0.00115 * math.sin(math.pi * v) * arch
    z += length_crown * (0.25 + 0.75 * w)
    y = (v - 0.5) * PAGE_HEIGHT
    return (x, y, z)


def cover_up_page_point(side: int, u: float, v: float, w: float) -> tuple[float, float, float]:
    """Map a text block beneath the wrapper for the exterior-cover reference."""
    inner_x = 0.004 + (1.0 - w) * 0.004
    x = side * (inner_x + u * (BOOK_WIDTH - inner_x))
    arch = math.sin(math.pi * u) ** 1.22
    upper = 0.057 - 0.044 * u + 0.0065 * arch
    thickness = HALF_STACK * (0.72 + 0.28 * u)
    z = upper - (1.0 - w) * thickness - 0.0035 * arch * (1.0 - w)
    z += 0.0008 * math.sin(math.pi * v) * arch
    y = (v - 0.5) * PAGE_HEIGHT
    return (x, y, z)


def add_page_block(
    collection: bpy.types.Collection,
    name: str,
    side: int,
    pose: str,
    paper: bpy.types.Material,
    fore: bpy.types.Material,
    tail: bpy.types.Material,
) -> bpy.types.Object:
    nx, ny = 42, 24
    mapper = reading_page_point if pose == "reading" else cover_up_page_point
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []
    layer_size = (nx + 1) * (ny + 1)

    for w in (0.0, 1.0):
        for j in range(ny + 1):
            v = j / ny
            for i in range(nx + 1):
                u = i / nx
                vertices.append(mapper(side, u, v, w))

    def index(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * (nx + 1) + i

    for layer in (0, 1):
        for j in range(ny):
            for i in range(nx):
                corners = (
                    index(layer, i, j), index(layer, i + 1, j),
                    index(layer, i + 1, j + 1), index(layer, i, j + 1),
                )
                if layer == 0:
                    corners = tuple(reversed(corners))
                faces.append(corners)
                face_materials.append(0)
                face_uvs.append(((i / nx, j / ny), ((i + 1) / nx, j / ny),
                                 ((i + 1) / nx, (j + 1) / ny), (i / nx, (j + 1) / ny)))

    for j in range(ny):
        for i, material_index in ((0, 0), (nx, 1)):
            next_i = i + 1 if i == 0 else i
            prev_i = i if i == 0 else i - 1
            a = index(0, i, j)
            b = index(0, i, j + 1)
            c = index(1, i, j + 1)
            d = index(1, i, j)
            if side < 0 and i == nx:
                material_index = 1
            faces.append((a, b, c, d))
            face_materials.append(material_index)
            face_uvs.append(((0, j / ny), (0, (j + 1) / ny),
                             (1, (j + 1) / ny), (1, j / ny)))
            del next_i, prev_i

    for j, material_index in ((0, 2), (ny, 2)):
        for i in range(nx):
            corners = (
                index(0, i, j), index(0, i + 1, j),
                index(1, i + 1, j), index(1, i, j),
            )
            faces.append(corners if j == ny else tuple(reversed(corners)))
            face_materials.append(material_index)
            face_uvs.append(((i / nx, 0), ((i + 1) / nx, 0),
                             ((i + 1) / nx, 1), (i / nx, 1)))

    obj = mesh_object(collection, name, vertices, faces, face_materials, face_uvs,
                      [paper, fore, tail])
    obj["binding_role"] = "left_text_block" if side < 0 else "right_text_block"
    obj["pose"] = pose
    return obj


def wrapper_height(x: float, pose: str) -> float:
    ax = abs(x)
    outer = BOOK_WIDTH + 0.0017
    if pose == "reading":
        if ax <= HINGE_HALF_WIDTH:
            # A shallow concave bridge, not the previous pointed V.  The
            # centre remains visibly below the hinge scores but only slightly.
            return 0.00265 + 0.00115 * (ax / HINGE_HALF_WIDTH) ** 1.7
        r = (ax - HINGE_HALF_WIDTH) / (outer - HINGE_HALF_WIDTH)
        # Continue the wrapper under the text-block curve so the front and
        # back covers participate in the same physical bend as the pages.
        cover_arch = 0.0047 if x > 0 else 0.00425
        return 0.0038 + 0.00255 * r + cover_arch * math.sin(math.pi * r) ** 1.18
    if ax <= HINGE_HALF_WIDTH:
        return 0.062 + 0.0045 * (1.0 - (ax / HINGE_HALF_WIDTH) ** 1.5)
    r = (ax - HINGE_HALF_WIDTH) / (outer - HINGE_HALF_WIDTH)
    return 0.062 - 0.050 * r + 0.008 * math.sin(math.pi * r)


def add_wrapper(
    collection: bpy.types.Collection,
    name: str,
    pose: str,
    front: bpy.types.Material,
    back: bpy.types.Material,
    spine: bpy.types.Material,
    inside: bpy.types.Material,
    edge: bpy.types.Material,
) -> bpy.types.Object:
    nx, ny = 72, 24
    outer = BOOK_WIDTH + 0.0017
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []
    layer_size = (nx + 1) * (ny + 1)

    def x_at(i: int) -> float:
        return -outer + i / nx * outer * 2.0

    for layer in (0, 1):
        offset = (layer - 0.5) * COVER_THICKNESS
        for j in range(ny + 1):
            v = j / ny
            for i in range(nx + 1):
                x = x_at(i)
                r = min(1.0, abs(x) / outer)
                longitudinal = 0.00075 * math.sin(math.pi * v) * math.sin(math.pi * r)
                z = wrapper_height(x, pose) + longitudinal + offset
                vertices.append((x, (v - 0.5) * BOOK_HEIGHT, z))

    def index(layer: int, i: int, j: int) -> int:
        return layer * layer_size + j * (nx + 1) + i

    def exterior_material(x: float) -> int:
        if x < -HINGE_HALF_WIDTH:
            return 1
        if x > HINGE_HALF_WIDTH:
            return 0
        return 2

    def region_uv(x: float, v: float) -> tuple[float, float]:
        if x < -HINGE_HALF_WIDTH:
            return ((x + outer) / (outer - HINGE_HALF_WIDTH), v)
        if x > HINGE_HALF_WIDTH:
            return ((x - HINGE_HALF_WIDTH) / (outer - HINGE_HALF_WIDTH), v)
        return ((x + HINGE_HALF_WIDTH) / (HINGE_HALF_WIDTH * 2), v)

    for layer in (0, 1):
        exterior_is_top = pose == "cover_up"
        is_exterior = (layer == 1) == exterior_is_top
        for j in range(ny):
            for i in range(nx):
                corners = (
                    index(layer, i, j), index(layer, i + 1, j),
                    index(layer, i + 1, j + 1), index(layer, i, j + 1),
                )
                if layer == 0:
                    corners = tuple(reversed(corners))
                x0, x1 = x_at(i), x_at(i + 1)
                faces.append(corners)
                face_materials.append(exterior_material((x0 + x1) * 0.5) if is_exterior else 3)
                face_uvs.append((region_uv(x0, j / ny), region_uv(x1, j / ny),
                                 region_uv(x1, (j + 1) / ny), region_uv(x0, (j + 1) / ny)))

    boundary: list[tuple[int, int]] = []
    boundary.extend((i, 0) for i in range(nx + 1))
    boundary.extend((nx, j) for j in range(1, ny + 1))
    boundary.extend((i, ny) for i in range(nx - 1, -1, -1))
    boundary.extend((0, j) for j in range(ny - 1, 0, -1))
    for index_in_boundary, (i, j) in enumerate(boundary):
        next_i, next_j = boundary[(index_in_boundary + 1) % len(boundary)]
        faces.append((index(0, i, j), index(0, next_i, next_j),
                      index(1, next_i, next_j), index(1, i, j)))
        face_materials.append(4)
        u0 = index_in_boundary / len(boundary)
        u1 = (index_in_boundary + 1) / len(boundary)
        face_uvs.append(((u0, 0), (u1, 0), (u1, 1), (u0, 1)))

    obj = mesh_object(collection, name, vertices, faces, face_materials, face_uvs,
                      [front, back, spine, inside, edge])
    obj["binding_role"] = "continuous_scored_wrapper"
    obj["hinge_half_width_mm"] = HINGE_HALF_WIDTH * 1000
    obj["pose"] = pose
    return obj


def add_visible_leaves(
    collection: bpy.types.Collection,
    side: int,
    pose: str,
    paper: bpy.types.Material,
) -> None:
    mapper = reading_page_point if pose == "reading" else cover_up_page_point
    nx, ny = 32, 12
    for leaf_index, offset in enumerate((0.00028, 0.00062, 0.00102)):
        vertices = []
        faces = []
        uvs = []
        for j in range(ny + 1):
            v = j / ny
            for i in range(nx + 1):
                u = i / nx
                x, y, z = mapper(side, u, v, 1.0)
                separation = offset * (0.2 + 0.8 * math.sin(math.pi * u) ** 0.9)
                vertices.append((x, y, z + separation if pose == "reading" else z - separation))
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i
                faces.append((a, a + 1, a + nx + 2, a + nx + 1))
                uvs.append(((i / nx, j / ny), ((i + 1) / nx, j / ny),
                            ((i + 1) / nx, (j + 1) / ny), (i / nx, (j + 1) / ny)))
        obj = mesh_object(collection, f"{pose}_{'L' if side < 0 else 'R'}_Leaf_{leaf_index + 1}",
                          vertices, faces, [0] * len(faces), uvs, [paper])
        obj["binding_role"] = "visible_leaf_stratum"


def add_pose(
    name: str,
    pose: str,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    add_wrapper(collection, f"{name}_ContinuousWrapper", pose, materials["front"],
                materials["back"], materials["spine"], materials["inside"], materials["edge"])
    add_page_block(collection, f"{name}_LeftTextBlock", -1, pose, materials["paper"],
                   materials["fore"], materials["tail"])
    add_page_block(collection, f"{name}_RightTextBlock", 1, pose, materials["paper"],
                   materials["fore"], materials["tail"])
    add_visible_leaves(collection, -1, pose, materials["paper"])
    add_visible_leaves(collection, 1, pose, materials["paper"])
    collection["approval_pose"] = True
    return collection


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new(f"{name}Data")
    camera_data.lens = lens
    camera_data.sensor_width = 36
    camera_data.sensor_fit = "HORIZONTAL"
    camera = bpy.data.objects.new(name, camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    look_at(camera, target)
    return camera


def set_collection_visibility(active: bpy.types.Collection, collections: list[bpy.types.Collection]) -> None:
    for collection in collections:
        collection.hide_render = collection != active
        collection.hide_viewport = collection != active


def render_view(camera: bpy.types.Object, path: Path, width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build() -> None:
    reset_scene()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    materials = {
        "front": image_material("Front cover photograph", "front-cover-v1.jpg", 0.58),
        "back": image_material("Back cover photograph", "back-cover-v1.jpg", 0.61),
        "spine": image_material("Spine photograph", "spine-v1.jpg", 0.60),
        "fore": image_material("Fore edge photograph", "page-edge-fore-v1.jpg", 0.88),
        # The supplied low references expose the leaf strata more clearly than
        # the darker closed-book tail capture, so reuse the fore-edge grain for
        # this approval view.
        "tail": image_material("Tail edge leaf strata", "page-edge-fore-v1.jpg", 0.88),
        "paper": paper_material("Warm aged paper", "#c1ad84", 0.88),
        "inside": paper_material("Inside cover", "#bca377", 0.82),
        "edge": paper_material("Worn cover edge", "#b88e4b", 0.76),
    }
    reading = add_pose("OpenReading", "reading", materials)
    cover_up = add_pose("OpenCoverUp", "cover_up", materials)
    collections = [reading, cover_up]

    bpy.ops.object.light_add(type="AREA", location=(-0.16, -0.23, 0.34))
    key = bpy.context.object
    key.name = "LargeSoftbox"
    key.data.energy = 3.4
    key.data.shape = "DISK"
    key.data.size = 0.34
    key.data.color = (1.0, 0.82, 0.64)
    look_at(key, (0, 0, 0.02))
    bpy.ops.object.light_add(type="AREA", location=(0.24, 0.10, 0.18))
    fill = bpy.context.object
    fill.name = "CoolFill"
    fill.data.energy = 1.25
    fill.data.size = 0.28
    fill.data.color = (0.72, 0.82, 1.0)
    look_at(fill, (0, 0, 0.02))

    camera_2853 = add_camera("Ref_IMG_2853", (0.010, -0.505, 0.142),
                             (0.004, 0.012, 0.031), 54)
    camera_2844 = add_camera("Ref_IMG_2844", (0.006, -0.350, 0.051),
                             (0.002, 0.018, -0.009), 57)
    camera_2847 = add_camera("Ref_IMG_2847", (0.008, -0.420, 0.172),
                             (0.000, 0.005, -0.043), 52)

    set_collection_visibility(reading, collections)
    render_view(camera_2853, OUTPUT_DIR / "open-reading-ref-2853-v1.png", 1200, 1600)
    render_view(camera_2844, OUTPUT_DIR / "open-reading-ref-2844-v1.png", 1600, 610)
    set_collection_visibility(cover_up, collections)
    render_view(camera_2847, OUTPUT_DIR / "open-cover-up-ref-2847-v1.png", 1200, 1600)

    set_collection_visibility(reading, collections)
    bpy.context.scene.camera = camera_2853
    # Make the saved approval file approachable for a non-Blender user: it
    # opens on the relevant reading pose, through the matched reference camera,
    # with rig/light overlays out of the way.
    for area in bpy.context.screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces.active
        space.shading.type = "MATERIAL"
        space.overlay.show_overlays = False
        space.region_3d.view_perspective = "CAMERA"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved approval model: {BLEND_PATH}")


if __name__ == "__main__":
    build()
