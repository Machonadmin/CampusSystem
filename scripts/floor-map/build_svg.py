#!/usr/bin/env python3
"""
Рисует SVG этажа по data/floor-map/rooms-floor-<N>.json.

Каждое помещение — <path> с data-room-id, data-bti-number и классом статуса,
чтобы приложение могло подсветить или связать помещение по id. Координаты в
метрах, viewBox — реальные габариты этажа, поэтому SVG масштабируется без
пересчёта геометрии. Цвета берутся из CSS-переменных, так что светлая и тёмная
темы работают без второй версии файла.

Использование:
    python3 scripts/floor-map/build_svg.py --floor 1
"""

import argparse
import json
from pathlib import Path

STYLE = """
  .fm-room { fill: var(--fm-room, #e8eef6); stroke: var(--fm-stroke, #64748b);
             stroke-width: 0.06; cursor: pointer; transition: fill .12s; }
  .fm-room:hover { fill: var(--fm-room-hover, #cddcf0); }
  .fm-room.is-review { fill: var(--fm-room-review, #fdeaca); }
  .fm-room.is-unnamed { fill: var(--fm-room-unnamed, #f1f3f5); }
  .fm-label { font: 0.42px sans-serif; fill: var(--fm-text, #1f2937);
              text-anchor: middle; pointer-events: none; }
  .fm-area { font: 0.32px sans-serif; fill: var(--fm-text-dim, #6b7280);
             text-anchor: middle; pointer-events: none; }
  @media (prefers-color-scheme: dark) {
    .fm-room { fill: var(--fm-room, #263243); stroke: var(--fm-stroke, #7c8ba1); }
    .fm-room:hover { fill: var(--fm-room-hover, #33445c); }
    .fm-room.is-review { fill: var(--fm-room-review, #4a3a22); }
    .fm-room.is-unnamed { fill: var(--fm-room-unnamed, #1f2733); }
    .fm-label { fill: var(--fm-text, #e5e7eb); }
    .fm-area { fill: var(--fm-text-dim, #9ca3af); }
  }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", required=True)
    ap.add_argument("--dir", type=Path, default=Path("data/floor-map"))
    args = ap.parse_args()

    src = args.dir / f"rooms-floor-{args.floor}.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    w, h = data["extent_m"]

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
           f'role="img" aria-label="План {args.floor} этажа">',
           f"<style>{STYLE}</style>", f'<g data-floor="{args.floor}">']

    for r in data["rooms"]:
        cls = "fm-room"
        if "area_mismatch" in r["issues"]:
            cls += " is-review"
        if not r["bti_number"]:
            cls += " is-unnamed"
        d = "M " + " L ".join(f"{x} {y}" for x, y in r["polygon_m"]) + " Z"
        title = r["bti_number"] or "—"
        out.append(f'<path class="{cls}" d="{d}" data-room-id="{r["id"]}" '
                   f'data-bti-number="{title}" data-area="{r["area_computed_m2"]}">'
                   f'<title>№ {title} · {r["area_computed_m2"]} м²</title></path>')

    for r in data["rooms"]:
        if not r["bti_number"]:
            continue
        cx, cy = r["centroid_m"]
        out.append(f'<text class="fm-label" x="{cx}" y="{cy}">{r["bti_number"]}</text>')
        out.append(f'<text class="fm-area" x="{cx}" y="{cy + 0.45}">{r["area_computed_m2"]}</text>')

    out += ["</g>", "</svg>"]
    dst = args.dir / f"floor-{args.floor}.svg"
    dst.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{dst}: помещений {len(data['rooms'])}, габарит {w} x {h} м")


if __name__ == "__main__":
    main()
