"""Build the reader's worn Penguin paperback as an animation-ready GLB.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python \
    scripts/blender/build_love_cholera_book.py

The model uses the supplied external measurements. The front and back covers,
spine, page block, and title leaf remain separate objects so a later page-turn
prototype can animate them without replacing the approved static asset.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "public/assets/books/love-in-the-time-of-cholera"
TOOLING_DIR = ROOT / "design/tooling/love-in-the-time-of-cholera-book"
TEXTURE_DIR = TOOLING_DIR / "textures"
BLEND_PATH = TOOLING_DIR / "book-model-v1.blend"
GLB_PATH = ASSET_DIR / "love-in-the-time-of-cholera-book-v1.glb"
FALLBACK_PATH = ASSET_DIR / "love-in-the-time-of-cholera-book-fallback-v1.jpg"

# External measurements supplied by the reader.
BOOK_WIDTH = 0.127
BOOK_HEIGHT = 0.19685
BOOK_CLOSED_THICKNESS = 0.022225

COVER_THICKNESS = 0.00046
PAGE_SPINE_INSET = 0.00004
PAGE_FORE_INSET = 0.00085
PAGE_WIDTH = BOOK_WIDTH - PAGE_SPINE_INSET - PAGE_FORE_INSET
PAGE_HEIGHT = BOOK_HEIGHT - 0.0030
PAGE_THICKNESS = BOOK_CLOSED_THICKNESS - COVER_THICKNESS * 2.0
PAGE_ORIGIN_X = -BOOK_WIDTH * 0.5 + PAGE_SPINE_INSET
PAGE_TOP_Z = PAGE_THICKNESS * 0.5
PAGE_BOTTOM_Z = -PAGE_THICKNESS * 0.5
FRONT_COVER_LIFT = 0.0042
COVER_HINGE_GAP = 0.00125
COVER_PLANE_RISE = FRONT_COVER_LIFT - COVER_HINGE_GAP
COVER_CORNER_RADIUS = 0.0
LEAF_THICKNESS = 0.000035


def srgb(hex_color: str) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 92
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.color_depth = "8"
    scene.world = bpy.data.worlds.new("Book studio world")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#030302")
    background.inputs["Strength"].default_value = 0.04


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
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.035 if "cover" in name.lower() else 0.0
    if "Coat Roughness" in shader.inputs:
        shader.inputs["Coat Roughness"].default_value = 0.42
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def solid_material(
    name: str,
    color: str,
    roughness: float,
    roughness_texture: str | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = srgb(color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.46
    if roughness_texture:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(str(TEXTURE_DIR / roughness_texture), check_existing=True)
        texture.image.colorspace_settings.name = "Non-Color"
        links.new(texture.outputs["Color"], shader.inputs["Roughness"])
    return material


def set_smooth_by_angle(mesh: bpy.types.Mesh) -> None:
    for polygon in mesh.polygons:
        polygon.use_smooth = True


def rounded_inset(y: float, half_height: float, radius: float) -> float:
    distance_into_corner = abs(y) - (half_height - radius)
    if distance_into_corner <= 0:
        return 0.0
    return radius - math.sqrt(max(0.0, radius * radius - distance_into_corner * distance_into_corner))


def add_cover(
    root: bpy.types.Object,
    name: str,
    exterior: bpy.types.Material,
    interior: bpy.types.Material,
    edge: bpy.types.Material,
    base_z: float,
    lift: float,
    exterior_on_top: bool,
) -> bpy.types.Object:
    nx, ny = 32, 24
    columns = nx + 1
    layer_size = columns * (ny + 1)
    vertices: list[tuple[float, float, float]] = []
    vertex_uvs: list[tuple[float, float]] = []

    def mid_height(u: float, v: float) -> float:
        # The paperback cover behaves as one thin, nearly rigid sheet. A
        # linear hinge rotation keeps its head and tail silhouettes ruled
        # straight all the way through the fore-edge corners.
        rotated = u
        # A minute interior-only crown keeps the broad face from looking
        # synthetic without disturbing any of its four straight boundaries.
        crown = (
            0.00013
            * math.sin(math.pi * u)
            * math.sin(math.pi * v)
            * math.cos((v - 0.5) * math.pi)
        )
        direction = 1.0 if lift >= 0 else -1.0
        return base_z + lift * rotated + direction * crown

    for side in (-0.5, 0.5):
        for j in range(ny + 1):
            v = j / ny
            y = (v - 0.5) * BOOK_HEIGHT
            inset = rounded_inset(y, BOOK_HEIGHT * 0.5, COVER_CORNER_RADIUS)
            for i in range(nx + 1):
                u = i / nx
                x = inset + u * (BOOK_WIDTH - inset * 2.0)
                z = mid_height(u, v) + side * COVER_THICKNESS
                vertices.append((x, y, z))
                vertex_uvs.append((u, v))

    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []

    top_material = 0 if exterior_on_top else 1
    bottom_material = 1 if exterior_on_top else 0
    for j in range(ny):
        for i in range(nx):
            a = layer_size + j * columns + i
            b = a + 1
            d = layer_size + (j + 1) * columns + i
            c = d + 1
            faces.append((a, b, c, d))
            face_materials.append(top_material)
            face_uvs.append(tuple(vertex_uvs[index - layer_size] for index in (a, b, c, d)))

            a0 = j * columns + i
            b0 = a0 + 1
            d0 = (j + 1) * columns + i
            c0 = d0 + 1
            faces.append((a0, d0, c0, b0))
            face_materials.append(bottom_material)
            # Mirroring U keeps the photographed back readable when inspected
            # from the exterior side of the physical cover.
            bottom_uv = tuple(vertex_uvs[index] for index in (a0, d0, c0, b0))
            face_uvs.append(tuple((1.0 - u, v) if not exterior_on_top else (u, v) for u, v in bottom_uv))

    boundary: list[int] = []
    boundary.extend(range(columns))
    boundary.extend(j * columns + nx for j in range(1, ny + 1))
    boundary.extend(ny * columns + i for i in range(nx - 1, -1, -1))
    boundary.extend(j * columns for j in range(ny - 1, 0, -1))
    for index, lower_a in enumerate(boundary):
        lower_b = boundary[(index + 1) % len(boundary)]
        upper_a = lower_a + layer_size
        upper_b = lower_b + layer_size
        faces.append((upper_a, lower_a, lower_b, upper_b))
        face_materials.append(2)
        edge_u0 = index / len(boundary)
        edge_u1 = (index + 1) / len(boundary)
        face_uvs.append(((edge_u0, 1.0), (edge_u0, 0.0), (edge_u1, 0.0), (edge_u1, 1.0)))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # Smooth the long, subtly warped edge ribbons without rounding the visible
    # printed-face boundary into them.
    sharp_edges: set[tuple[int, int]] = set()
    for index, lower_a in enumerate(boundary):
        lower_b = boundary[(index + 1) % len(boundary)]
        sharp_edges.add(tuple(sorted((lower_a, lower_b))))
        sharp_edges.add(tuple(sorted((lower_a + layer_size, lower_b + layer_size))))
    for mesh_edge in mesh.edges:
        if tuple(sorted(mesh_edge.vertices)) in sharp_edges:
            mesh_edge.use_edge_sharp = True
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, material_index, uvs in zip(mesh.polygons, face_materials, face_uvs, strict=True):
        polygon.material_index = material_index
        for loop_index, uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = uv

    obj = bpy.data.objects.new(name, mesh)
    obj.location.x = -BOOK_WIDTH * 0.5
    obj.parent = root
    obj["future_hinge_axis"] = "local Y at x=0"
    obj["animation_ready"] = True
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(exterior)
    obj.data.materials.append(interior)
    obj.data.materials.append(edge)
    return obj


def add_page_block(
    root: bpy.types.Object,
    paper: bpy.types.Material,
    fore: bpy.types.Material,
    top: bpy.types.Material,
    bottom: bpy.types.Material,
) -> bpy.types.Object:
    """Create one closed page block so no viewing angle can reveal shell gaps."""

    nx, ny, nz = 36, 28, 10
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    face_materials: list[int] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []
    smooth_faces: list[bool] = []

    def fore_x(v: float, w: float) -> float:
        del v
        # Every stratum now occupies one straight line along the book's length.
        # A slight thickness-only crown keeps the loose edge from looking like
        # a box while preventing lines from diving diagonally into a cover.
        thickness_crown = 0.00024 + 0.00008 * math.sin(math.pi * w)
        return PAGE_ORIGIN_X + PAGE_WIDTH + thickness_crown

    def add_grid(
        cols: int,
        rows: int,
        point,
        uv,
        material_index: int,
        reverse: bool,
        smooth: bool = False,
    ) -> None:
        start = len(vertices)
        grid_uvs: list[tuple[float, float]] = []
        for row in range(rows + 1):
            b = row / rows
            for col in range(cols + 1):
                a = col / cols
                vertices.append(point(a, b))
                grid_uvs.append(uv(a, b))
        stride = cols + 1
        for row in range(rows):
            for col in range(cols):
                local_a = row * stride + col
                corners = (local_a, local_a + 1, local_a + 1 + stride, local_a + stride)
                if reverse:
                    corners = tuple(reversed(corners))
                faces.append(tuple(start + index for index in corners))
                face_materials.append(material_index)
                face_uvs.append(tuple(grid_uvs[index] for index in corners))
                smooth_faces.append(smooth)

    # Large paper faces. Their fore boundaries use the same function as the
    # fore edge, keeping the six surfaces watertight rather than layered.
    add_grid(
        nx,
        ny,
        lambda u, v: (
            PAGE_ORIGIN_X + u * (fore_x(v, 1.0) - PAGE_ORIGIN_X),
            (v - 0.5) * PAGE_HEIGHT,
            PAGE_TOP_Z,
        ),
        lambda u, v: (u, v),
        0,
        False,
    )
    add_grid(
        nx,
        ny,
        lambda u, v: (
            PAGE_ORIGIN_X + u * (fore_x(v, 0.0) - PAGE_ORIGIN_X),
            (v - 0.5) * PAGE_HEIGHT,
            PAGE_BOTTOM_Z,
        ),
        lambda u, v: (u, v),
        0,
        True,
    )
    add_grid(
        nx,
        nz,
        lambda u, w: (
            PAGE_ORIGIN_X + u * (fore_x(1.0, w) - PAGE_ORIGIN_X),
            PAGE_HEIGHT * 0.5,
            PAGE_BOTTOM_Z + w * PAGE_THICKNESS,
        ),
        lambda u, w: (u, w),
        2,
        True,
    )
    add_grid(
        nx,
        nz,
        lambda u, w: (
            PAGE_ORIGIN_X + u * (fore_x(0.0, w) - PAGE_ORIGIN_X),
            -PAGE_HEIGHT * 0.5,
            PAGE_BOTTOM_Z + w * PAGE_THICKNESS,
        ),
        lambda u, w: (1.0 - u, w),
        3,
        False,
    )
    add_grid(
        ny,
        nz,
        lambda v, w: (
            fore_x(v, w),
            (v - 0.5) * PAGE_HEIGHT,
            PAGE_BOTTOM_Z + w * PAGE_THICKNESS,
        ),
        lambda v, w: (w, v),
        1,
        False,
        True,
    )
    add_grid(
        ny,
        nz,
        lambda v, w: (
            PAGE_ORIGIN_X,
            (v - 0.5) * PAGE_HEIGHT,
            PAGE_BOTTOM_Z + w * PAGE_THICKNESS,
        ),
        lambda v, w: (w, v),
        0,
        True,
    )

    mesh = bpy.data.meshes.new("PageBlockMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, material_index, uvs, smooth in zip(
        mesh.polygons, face_materials, face_uvs, smooth_faces, strict=True
    ):
        polygon.material_index = material_index
        polygon.use_smooth = smooth
        for loop_index, texture_uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = texture_uv

    obj = bpy.data.objects.new("PageBlock_ClosedShell", mesh)
    obj.parent = root
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(paper)
    obj.data.materials.append(fore)
    obj.data.materials.append(top)
    obj.data.materials.append(bottom)
    return obj


def add_leaf(
    root: bpy.types.Object,
    name: str,
    top_material: bpy.types.Material,
    bottom_material: bpy.types.Material,
    edge_material: bpy.types.Material,
    base_z: float,
    plane_rise: float,
    height_inset: float,
) -> bpy.types.Object:
    """Add one thin, closed leaf with its own hinge-ready object boundary."""

    nx, ny = 30, 10
    columns = nx + 1
    layer_size = columns * (ny + 1)
    leaf_height = PAGE_HEIGHT - height_inset * 2.0
    vertices: list[tuple[float, float, float]] = []
    vertex_uvs: list[tuple[float, float]] = []

    def middle(u: float, v: float) -> float:
        direction = 1.0 if plane_rise >= 0 else -1.0
        # The crown vanishes on all boundaries, preserving the ruled profile.
        cross_crown = (
            0.000035
            * math.sin(math.pi * u)
            * math.sin(math.pi * v)
        )
        # Every loose sheet is a complete ruled plane. Sharing the cover's
        # exact rise keeps all visible head/tail lines parallel from the fore
        # edge through the spine instead of letting them terminate in a wedge.
        return base_z + plane_rise * u + direction * cross_crown

    for side in (-0.5, 0.5):
        for j in range(ny + 1):
            v = j / ny
            y = (v - 0.5) * leaf_height
            inset = rounded_inset(y, leaf_height * 0.5, 0.0)
            for i in range(nx + 1):
                u = i / nx
                x = PAGE_ORIGIN_X + inset + u * (PAGE_WIDTH - inset * 2.0)
                vertices.append((x, y, middle(u, v) + side * LEAF_THICKNESS))
                vertex_uvs.append((u, v))

    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []
    for j in range(ny):
        for i in range(nx):
            lower = j * columns + i
            upper = layer_size + lower
            top_face = (upper, upper + 1, upper + 1 + columns, upper + columns)
            bottom_face = (lower, lower + columns, lower + 1 + columns, lower + 1)
            faces.extend((top_face, bottom_face))
            face_materials.extend((0, 1))
            face_uvs.extend(
                (
                    tuple(vertex_uvs[index - layer_size] for index in top_face),
                    tuple(vertex_uvs[index] for index in bottom_face),
                )
            )

    boundary: list[int] = []
    boundary.extend(range(columns))
    boundary.extend(j * columns + nx for j in range(1, ny + 1))
    boundary.extend(ny * columns + i for i in range(nx - 1, -1, -1))
    boundary.extend(j * columns for j in range(ny - 1, 0, -1))
    for index, lower_a in enumerate(boundary):
        lower_b = boundary[(index + 1) % len(boundary)]
        upper_a = lower_a + layer_size
        upper_b = lower_b + layer_size
        faces.append((upper_a, lower_a, lower_b, upper_b))
        face_materials.append(2)
        face_uvs.append(((0.0, 1.0), (0.0, 0.0), (1.0, 0.0), (1.0, 1.0)))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    sharp_edges: set[tuple[int, int]] = set()
    for index, lower_a in enumerate(boundary):
        lower_b = boundary[(index + 1) % len(boundary)]
        sharp_edges.add(tuple(sorted((lower_a, lower_b))))
        sharp_edges.add(tuple(sorted((lower_a + layer_size, lower_b + layer_size))))
    for mesh_edge in mesh.edges:
        if tuple(sorted(mesh_edge.vertices)) in sharp_edges:
            mesh_edge.use_edge_sharp = True
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, material_index, uvs in zip(mesh.polygons, face_materials, face_uvs, strict=True):
        polygon.material_index = material_index
        for loop_index, texture_uv in zip(polygon.loop_indices, uvs, strict=True):
            uv_layer.data[loop_index].uv = texture_uv

    obj = bpy.data.objects.new(name, mesh)
    obj.parent = root
    obj["future_hinge_axis"] = "local Y at x=%f" % PAGE_ORIGIN_X
    obj["animation_ready"] = True
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(top_material)
    obj.data.materials.append(bottom_material)
    obj.data.materials.append(edge_material)
    return obj


def add_spine(root: bpy.types.Object, material: bpy.types.Material) -> bpy.types.Object:
    ny, nz = 32, 12
    vertices: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    for j in range(ny + 1):
        v = j / ny
        y = (v - 0.5) * BOOK_HEIGHT
        end_taper = 1.0 - 0.24 * ((abs(v - 0.5) * 2.0) ** 6)
        for k in range(nz + 1):
            w = k / nz
            hinge_half_height = BOOK_CLOSED_THICKNESS * 0.5 + COVER_HINGE_GAP
            z = -hinge_half_height + w * hinge_half_height * 2.0
            crown = 0.00105 * math.sin(math.pi * w) * end_taper
            # Meet the cover hinge exactly at both thickness extremes. The
            # earlier fixed offset exposed a dark slit at oblique angles.
            x = -BOOK_WIDTH * 0.5 - crown
            vertices.append((x, y, z))
            uvs.append((w, v))
    cols = nz + 1
    faces = []
    for j in range(ny):
        for k in range(nz):
            a = j * cols + k
            faces.append((a, a + cols, a + cols + 1, a + 1))
    obj = mesh_object(root, "Spine", vertices, faces, uvs, material)
    set_smooth_by_angle(obj.data)
    return obj


def mesh_object(
    root: bpy.types.Object,
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    uvs: list[tuple[float, float]],
    material: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index, vertex_index in zip(polygon.loop_indices, polygon.vertices, strict=True):
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    obj.parent = root
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def add_page_seams(root: bpy.types.Object, material: bpy.types.Material) -> None:
    # A small number of real relief seams breaks the silhouette without trying
    # to model hundreds of pages. Fine layering still comes from the photographs.
    seam_levels = (0.08, 0.16, 0.27, 0.41, 0.57, 0.69, 0.81, 0.91)
    x = PAGE_ORIGIN_X + PAGE_WIDTH + 0.00062
    for index, fraction in enumerate(seam_levels):
        z = PAGE_BOTTOM_Z + fraction * PAGE_THICKNESS
        offset = 0.00008 * math.sin(index * 1.71)
        vertices = [
            (x + offset, -PAGE_HEIGHT * 0.49, z),
            (x + offset, PAGE_HEIGHT * 0.49, z),
            (x + offset, PAGE_HEIGHT * 0.49, z + 0.000035),
            (x + offset, -PAGE_HEIGHT * 0.49, z + 0.000035),
        ]
        mesh_object(root, f"PageSeam_{index + 1:02d}", vertices, [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], material)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_studio(root: bpy.types.Object) -> None:
    floor_material = solid_material("Studio black", "#020202", 0.88)
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0.0, 0.0, -BOOK_CLOSED_THICKNESS * 0.5 - 0.00055))
    floor = bpy.context.object
    floor.name = "StudioFloor_NOT_EXPORTED"
    floor.data.materials.append(floor_material)

    bpy.ops.object.light_add(type="AREA", location=(0.24, -0.20, 0.38))
    key = bpy.context.object
    key.name = "WarmWindowKey_NOT_EXPORTED"
    key.data.energy = 3.2
    key.data.shape = "DISK"
    key.data.size = 0.28
    key.data.color = (1.0, 0.79, 0.58)
    look_at(key, (0.015, 0.0, 0.0))

    bpy.ops.object.light_add(type="AREA", location=(-0.28, 0.16, 0.22))
    fill = bpy.context.object
    fill.name = "SoftFill_NOT_EXPORTED"
    fill.data.energy = 0.8
    fill.data.size = 0.35
    fill.data.color = (0.72, 0.80, 1.0)
    look_at(fill, (-0.01, 0.01, 0.0))

    bpy.ops.object.light_add(type="AREA", location=(-0.03, 0.27, 0.28))
    rim = bpy.context.object
    rim.name = "PageEdgeRim_NOT_EXPORTED"
    rim.data.energy = 1.1
    rim.data.size = 0.18
    rim.data.color = (1.0, 0.70, 0.43)
    look_at(rim, (0.0, 0.04, 0.0))

    bpy.ops.object.camera_add(location=(0.235, -0.275, 0.225))
    camera = bpy.context.object
    camera.name = "ReviewCamera_NOT_EXPORTED"
    camera.data.lens = 55
    camera.data.sensor_width = 36
    look_at(camera, (0.0, 0.002, 0.003))
    bpy.context.scene.camera = camera


def build() -> None:
    reset_scene()
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    TOOLING_DIR.mkdir(parents=True, exist_ok=True)

    front = image_material("Front cover photograph", "front-cover-v1.jpg", 0.59)
    back = image_material("Back cover photograph", "back-cover-v1.jpg", 0.61)
    spine = image_material("Spine photograph", "spine-v1.jpg", 0.60)
    title = image_material("Title page photograph", "title-page-v1.jpg", 0.86)
    fore = image_material("Fore edge photograph", "page-edge-fore-v1.jpg", 0.88)
    top = image_material("Top edge photograph", "page-edge-top-v1.jpg", 0.88)
    bottom = image_material("Bottom edge photograph", "page-edge-bottom-v1.jpg", 0.88)
    paper = solid_material("Warm aged paper", "#d3c4a2", 0.87, "paper-roughness-v1.png")
    inside_cover = solid_material("Inside cover", "#d1c19f", 0.83, "paper-roughness-v1.png")
    cover_edge = solid_material("Worn cover edge", "#c8a45e", 0.76)

    root = bpy.data.objects.new("LoveInTheTimeOfCholera_BookRoot", None)
    bpy.context.collection.objects.link(root)
    root["edition_isbn"] = "978-0-241-99448-1"
    root["width_mm"] = BOOK_WIDTH * 1000
    root["height_mm"] = BOOK_HEIGHT * 1000
    root["closed_loose_edge_thickness_mm"] = BOOK_CLOSED_THICKNESS * 1000
    root["front_cover_lift_mm"] = FRONT_COVER_LIFT * 1000
    root["cover_hinge_gap_mm"] = COVER_HINGE_GAP * 1000
    root["page_splay_mm"] = 3.95
    root["mirrored_page_splay"] = True
    root["source"] = "Reader-supplied photographs IMG_2812 2, IMG_2813–IMG_2832"

    add_page_block(root, paper, fore, top, bottom)
    # Rear geometry is generated from the same values with inverted Z. This
    # deliberately mirrors the better-balanced front profile from IMG_2832.
    # The gaps form a complete stack rather than tapered wedges. Every sheet
    # spans the full page height and shares the cover's plane rise.
    leaf_profiles = (
        ("LoosePage_01", 0.00018),
        ("LoosePage_02", 0.00045),
        ("LoosePage_03", 0.00072),
        ("OuterLeaf", 0.00100),
    )
    for profile_name, sheet_gap in leaf_profiles:
        is_outer = profile_name == "OuterLeaf"
        add_leaf(
            root,
            "HeroPage_Title_AnimationReady" if is_outer else f"Front{profile_name}_AnimationReady",
            title if is_outer else paper,
            paper,
            paper,
            PAGE_TOP_Z + sheet_gap,
            COVER_PLANE_RISE,
            0.0,
        )
        add_leaf(
            root,
            "BackFlyleaf_Blank_AnimationReady" if is_outer else f"Back{profile_name}_AnimationReady",
            paper,
            paper,
            paper,
            PAGE_BOTTOM_Z - sheet_gap,
            -COVER_PLANE_RISE,
            0.0,
        )
    add_cover(
        root,
        "FrontCover_AnimationReady",
        front,
        inside_cover,
        cover_edge,
        PAGE_TOP_Z + COVER_HINGE_GAP + COVER_THICKNESS * 0.5,
        COVER_PLANE_RISE,
        True,
    )
    add_cover(
        root,
        "BackCover_AnimationReady",
        back,
        inside_cover,
        cover_edge,
        PAGE_BOTTOM_Z - COVER_HINGE_GAP - COVER_THICKNESS * 0.5,
        -COVER_PLANE_RISE,
        False,
    )
    add_spine(root, spine)
    add_studio(root)

    # Pack the editable source, then render a complete static fallback.
    bpy.ops.file.pack_all()
    bpy.context.scene.render.filepath = str(FALLBACK_PATH)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print(f"Saved {BLEND_PATH}")
    print(f"Exported {GLB_PATH}")
    print(f"Rendered {FALLBACK_PATH}")


if __name__ == "__main__":
    build()
