"""Build exact-pixel assets for the scene's two living plant proofs.

Visible plant pixels always come from registered Study Q runtime sources. A
generated flower clean plate is used only beneath pixels removed from the
flattened master; it is never visible in the resting composite.

Requires Pillow.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public/assets/scenes/under-the-almond-trees"
DESIGN_LAYER_DIR = ROOT / "design/layers"
LOWER_SOURCE = ASSET_DIR / "under-the-almond-trees-right-foreground-v1.png"
SCENE_SOURCE = ASSET_DIR / "under-the-almond-trees-study-q.png"
FLOWER_CLEAN_PLATE = (
    DESIGN_LAYER_DIR / "under-the-almond-trees-flower-underpaint-source-v1.png"
)
PADDING = 6

# These narrow polygons follow individual top-silhouette blades rather than
# dividing the plant into broad hinged wedges. Parts are assigned exclusively
# in declaration order so the resting reconstruction remains pixel-exact.
LOWER_PARTS: dict[str, list[list[tuple[int, int]]]] = {
    "far-left": [[
        (1174, 902), (1153, 884), (1129, 865), (1102, 846), (1075, 829),
        (1051, 815), (1060, 813), (1083, 824), (1110, 839), (1137, 856),
        (1161, 876), (1183, 900),
    ]],
    "left": [[
        (1205, 904), (1197, 884), (1184, 864), (1168, 848), (1149, 836),
        (1129, 826), (1112, 822), (1122, 831), (1138, 841), (1155, 853),
        (1170, 868), (1185, 887), (1195, 905),
    ]],
    "left-upright": [[
        (1192, 902), (1186, 880), (1177, 858), (1166, 837), (1155, 817),
        (1163, 821), (1174, 839), (1185, 859), (1194, 881), (1201, 902),
    ]],
    "upright": [[
        (1210, 902), (1205, 878), (1197, 851), (1190, 829), (1186, 808),
        (1195, 814), (1202, 833), (1209, 854), (1216, 877), (1220, 902),
    ]],
    "center-tall": [[
        (1234, 902), (1230, 881), (1227, 858), (1226, 836), (1229, 813),
        (1234, 831), (1237, 855), (1240, 879), (1243, 902),
    ]],
    "right": [[
        (1221, 903), (1227, 879), (1241, 857), (1258, 838), (1279, 821),
        (1303, 805), (1323, 794), (1315, 808), (1295, 822), (1276, 838),
        (1260, 856), (1247, 877), (1237, 904),
    ]],
    "right-upright": [[
        (1271, 902), (1270, 883), (1270, 861), (1272, 842), (1277, 826),
        (1282, 842), (1281, 863), (1280, 883), (1281, 902),
    ]],
    "far-right": [[
        (1313, 903), (1321, 883), (1330, 865), (1342, 848), (1357, 834),
        (1372, 824), (1365, 838), (1352, 852), (1341, 870), (1332, 887),
        (1325, 904),
    ]],
    "outer-right": [[
        (1360, 903), (1368, 886), (1374, 868), (1380, 850), (1387, 837),
        (1391, 852), (1388, 871), (1380, 889), (1373, 903),
    ]],
}

# Each flower branch is a union of a tightly traced blossom, thin stem, and a
# few attached leaves. Dense plant mass and the terracotta pot remain static.
FLOWER_PARTS: dict[str, dict[str, object]] = {
    "upper": {
        "polygons": [
            [(1577, 543), (1583, 533), (1595, 530), (1606, 537), (1609, 548),
             (1602, 557), (1590, 558), (1580, 552)],
            [(1585, 572), (1597, 567), (1605, 572), (1598, 578)],
            [(1597, 580), (1608, 574), (1615, 578), (1607, 586)],
            [(1602, 600), (1614, 594), (1621, 598), (1613, 606)],
        ],
        "lines": [([(1625, 695), (1617, 650), (1605, 602), (1595, 550)], 3)],
    },
    "center": {
        "polygons": [
            [(1588, 602), (1593, 589), (1605, 582), (1618, 584), (1628, 594),
             (1631, 606), (1625, 617), (1612, 623), (1598, 618)],
            [(1595, 632), (1606, 625), (1616, 630), (1607, 638)],
            [(1614, 646), (1627, 640), (1635, 645), (1626, 653)],
            [(1605, 659), (1617, 652), (1625, 657), (1616, 665)],
            [(1620, 674), (1633, 668), (1641, 674), (1630, 681)],
        ],
        "lines": [([(1631, 700), (1625, 670), (1617, 638), (1610, 606)], 4)],
    },
    "right": {
        "polygons": [
            [(1634, 604), (1639, 594), (1650, 588), (1662, 591), (1671, 600),
             (1671, 613), (1665, 621), (1653, 625), (1641, 619)],
            [(1638, 635), (1649, 628), (1658, 633), (1648, 641)],
            [(1647, 651), (1659, 645), (1668, 651), (1658, 659)],
            [(1634, 665), (1645, 658), (1653, 663), (1644, 671)],
        ],
        "lines": [([(1640, 701), (1644, 665), (1650, 632), (1654, 608)], 4)],
    },
    "lower-left": {
        "polygons": [
            [(1571, 650), (1577, 641), (1588, 637), (1598, 643), (1602, 653),
             (1597, 662), (1587, 667), (1577, 662)],
            [(1563, 666), (1575, 659), (1583, 665), (1573, 673)],
            [(1582, 680), (1594, 674), (1602, 680), (1592, 688)],
        ],
        "lines": [([(1615, 703), (1598, 683), (1587, 657)], 3)],
    },
    "lower-right": {
        "polygons": [
            [(1641, 656), (1647, 646), (1659, 641), (1670, 648), (1671, 663),
             (1663, 671), (1652, 671), (1644, 665)],
            [(1638, 680), (1650, 673), (1659, 678), (1649, 686)],
            [(1655, 692), (1666, 686), (1671, 690), (1671, 700), (1663, 702)],
        ],
        "lines": [([(1648, 708), (1651, 683), (1658, 657)], 3)],
    },
}


def padded_bounds(mask: Image.Image) -> tuple[int, int, int, int]:
    bounds = mask.getbbox()
    if bounds is None:
        raise RuntimeError("An asset mask is empty")
    left, top, right, bottom = bounds
    return (
        max(0, left - PADDING),
        max(0, top - PADDING),
        min(mask.width, right + PADDING),
        min(mask.height, bottom + PADDING),
    )


def draw_mask(
    size: tuple[int, int],
    polygons: list[list[tuple[int, int]]],
    lines: list[tuple[list[tuple[int, int]], int]] | None = None,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    drawing = ImageDraw.Draw(mask)
    for polygon in polygons:
        drawing.polygon(polygon, fill=255)
    for points, width in lines or []:
        drawing.line(points, fill=255, width=width, joint="curve")
    return mask


def exclusive(mask: Image.Image, occupied: Image.Image) -> Image.Image:
    return ImageChops.subtract(mask, occupied)


def flower_colour_mask(scene: Image.Image) -> Image.Image:
    """Select the warm petal paint without carrying pale wall pixels."""
    mask = Image.new("L", scene.size, 0)
    selected = mask.load()
    pixels = scene.convert("RGB").load()
    for y in range(scene.height):
        for x in range(scene.width):
            red, green, blue = pixels[x, y]
            if red >= 75 and red - green >= 14 and red - blue >= 30:
                selected[x, y] = 255
    return mask.filter(ImageFilter.MaxFilter(5))


def build_lower_parts() -> None:
    source = Image.open(LOWER_SOURCE).convert("RGBA")
    source_alpha = source.getchannel("A")
    occupied = Image.new("L", source.size, 0)
    layers: list[Image.Image] = []

    for name, polygons in LOWER_PARTS.items():
        mask = exclusive(draw_mask(source.size, polygons), occupied)
        occupied = ImageChops.lighter(occupied, mask)
        alpha = ImageChops.multiply(source_alpha, mask)
        layer = source.copy()
        layer.putalpha(alpha)
        layers.append(layer)
        layer.crop(padded_bounds(mask)).save(
            ASSET_DIR / f"under-the-almond-trees-lower-leaf-{name}-v2.png",
            optimize=True,
        )

    remainder = source.copy()
    remainder.putalpha(ImageChops.subtract(source_alpha, occupied))
    remainder.save(
        ASSET_DIR / "under-the-almond-trees-right-foreground-static-v3.png",
        optimize=True,
    )

    reconstruction = Image.new("RGBA", source.size, (0, 0, 0, 0))
    reconstruction.alpha_composite(remainder)
    for layer in layers:
        reconstruction.alpha_composite(layer)
    if ImageChops.difference(reconstruction, source).getbbox() is not None:
        raise RuntimeError("Lower plant partition does not reconstruct its source")


def build_flower_parts() -> None:
    scene = Image.open(SCENE_SOURCE).convert("RGBA")
    clean_crop = Image.open(FLOWER_CLEAN_PLATE).convert("RGBA")
    if clean_crop.size != (400, 400):
        raise RuntimeError("The flower clean plate must be a registered 400px square")

    clean_plate = scene.copy()
    clean_plate.alpha_composite(clean_crop, (1272, 360))
    occupied = Image.new("L", scene.size, 0)
    layers: list[Image.Image] = []
    petal_colours = flower_colour_mask(scene)

    for name, definition in FLOWER_PARTS.items():
        polygons = definition["polygons"]
        lines = definition["lines"]
        blossom_region = draw_mask(scene.size, [polygons[0]])
        blossom = ImageChops.multiply(blossom_region, petal_colours)
        branch = draw_mask(scene.size, polygons[1:], lines)
        mask = exclusive(ImageChops.lighter(blossom, branch), occupied)
        occupied = ImageChops.lighter(occupied, mask)
        layer = scene.copy()
        layer.putalpha(mask)
        layers.append(layer)
        layer.crop(padded_bounds(mask)).save(
            ASSET_DIR / f"under-the-almond-trees-flower-branch-{name}-v1.png",
            optimize=True,
        )

    underpaint = Image.new("RGBA", scene.size, (0, 0, 0, 0))
    underpaint.paste(clean_plate, (0, 0), occupied)
    underpaint.save(
        ASSET_DIR / "under-the-almond-trees-flower-underpaint-v1.png",
        optimize=True,
    )

    reconstruction = scene.copy()
    reconstruction.alpha_composite(underpaint)
    for layer in layers:
        reconstruction.alpha_composite(layer)
    if ImageChops.difference(reconstruction, scene).getbbox() is not None:
        raise RuntimeError("Flower partition does not reconstruct Study Q")


def main() -> None:
    build_lower_parts()
    build_flower_parts()


if __name__ == "__main__":
    main()
