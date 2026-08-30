import sys
from svgelements import SVG, Path, Group

SVG_PATH = sys.argv[1]

svg = SVG.parse(SVG_PATH)

rows = []
for i, el in enumerate(svg.elements()):
    if isinstance(el, Path) and len(el) > 0:
        try:
            bb = el.bbox()
        except Exception:
            continue
        if bb is None:
            continue
        xmin, ymin, xmax, ymax = bb
        w = xmax - xmin
        h = ymax - ymin
        if w <= 0 or h <= 0:
            continue
        area_bbox = w * h
        fill = el.fill.hex if el.fill is not None else None
        rows.append((i, xmin, ymin, xmax, ymax, w, h, area_bbox, fill))

print(f"total paths with geometry: {len(rows)}")
rows.sort(key=lambda r: -r[7])
for r in rows[:40]:
    i, xmin, ymin, xmax, ymax, w, h, area, fill = r
    print(f"idx={i:6d} bbox=({xmin:7.1f},{ymin:7.1f})-({xmax:7.1f},{ymax:7.1f}) w={w:6.1f} h={h:6.1f} area={area:9.1f} fill={fill}")
