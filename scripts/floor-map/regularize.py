#!/usr/bin/env python3
"""
Спрямляет полигоны помещений и стыкует их между собой.

Растровая сегментация даёт слегка кривые грани: каждая комната выглядит
отдельной фигурой, соседние не стыкуются, длинная стена коридора идёт не одной
линией. Здесь это чинится в три приёма:

  1. ортогонализация — грань, отклоняющаяся от оси меньше ORTHO_DEG, становится
     строго горизонтальной или вертикальной; настоящие косые стены сохраняются;
  2. общая сетка — координаты вертикальных граней всего этажа кластеризуются с
     допуском SNAP_M и заменяются на среднее по кластеру (то же для горизонтальных),
     поэтому соседние помещения получают одинаковую координату и стыкуются
     без щелей, а стены идут сквозной прямой;
  3. чистка — склейка коллинеарных граней и удаление отрезков короче MIN_EDGE_M.

Площадь каждого помещения после спрямления сверяется с площадью до него;
изменения больше AREA_TOL_PCT печатаются в отчёт.

Использование:
    python3 scripts/floor-map/regularize.py --floor 1
"""

import argparse
import json
import math
from pathlib import Path

ORTHO_DEG = 12.0      # грань ближе этого к оси — выпрямляется
SNAP_M = 0.12         # допуск склейки координат соседних помещений
MIN_EDGE_M = 0.15     # грани короче — удаляются
AREA_TOL_PCT = 3.0    # допустимое изменение площади от спрямления


def area(pts):
    n = len(pts)
    return abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
                   for i in range(n))) / 2


def orthogonalize(pts):
    """Каждой почти-осевой грани назначает общую координату для обоих концов."""
    n = len(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for i in range(n):
        j = (i + 1) % n
        dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        if dx == 0 and dy == 0:
            continue
        ang = math.degrees(math.atan2(dy, dx)) % 180
        dev_h = min(ang, 180 - ang)              # отклонение от горизонтали
        dev_v = abs(ang - 90)                    # отклонение от вертикали
        if dev_h <= ORTHO_DEG and dev_h <= dev_v:
            y = (pts[i][1] + pts[j][1]) / 2
            ys[i] = ys[j] = y
        elif dev_v <= ORTHO_DEG:
            x = (pts[i][0] + pts[j][0]) / 2
            xs[i] = xs[j] = x
    return [[xs[i], ys[i]] for i in range(n)]


def axis_coords(rooms):
    """Собирает координаты осевых граней с весом по длине — для кластеризации."""
    vx, hy = [], []
    for r in rooms:
        pts = r["polygon_m"]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            if abs(dx) < 1e-9 and abs(dy) >= MIN_EDGE_M:
                vx.append((pts[i][0], abs(dy)))
            elif abs(dy) < 1e-9 and abs(dx) >= MIN_EDGE_M:
                hy.append((pts[i][1], abs(dx)))
    return vx, hy


def cluster(values, tol):
    """1-D кластеризация по разрыву; представитель — среднее, взвешенное длиной."""
    if not values:
        return []
    values = sorted(values)
    groups, cur = [], [values[0]]
    for v in values[1:]:
        if v[0] - cur[-1][0] <= tol:
            cur.append(v)
        else:
            groups.append(cur)
            cur = [v]
    groups.append(cur)
    out = []
    for g in groups:
        wsum = sum(w for _, w in g) or len(g)
        out.append(sum(v * w for v, w in g) / wsum)
    return out


def snap(value, centers, tol):
    if not centers:
        return value
    best = min(centers, key=lambda c: abs(c - value))
    return best if abs(best - value) <= tol else value


def cleanup(pts):
    """Удаляет совпадающие точки, короткие грани и лишние вершины на прямой."""
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > 1e-9 or abs(p[1] - out[-1][1]) > 1e-9:
            out.append(list(p))
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-9 and abs(out[0][1] - out[-1][1]) < 1e-9:
        out.pop()

    changed = True
    while changed and len(out) > 4:
        changed = False
        n = len(out)
        for i in range(n):
            j = (i + 1) % n
            dx, dy = out[j][0] - out[i][0], out[j][1] - out[i][1]
            if math.hypot(dx, dy) < MIN_EDGE_M:
                # короткая грань: тянем её конец к началу, вершина исчезает
                out[i] = [(out[i][0] + out[j][0]) / 2, (out[i][1] + out[j][1]) / 2]
                out.pop(j)
                changed = True
                break

    res = []
    n = len(out)
    for i in range(n):
        a, b, c = out[(i - 1) % n], out[i], out[(i + 1) % n]
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(cross) > 1e-4:          # вершина не лежит на прямой между соседями
            res.append(b)
    return res if len(res) >= 3 else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", required=True)
    ap.add_argument("--dir", type=Path, default=Path("data/floor-map"))
    args = ap.parse_args()

    src = args.dir / f"rooms-floor-{args.floor}.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    rooms = data["rooms"]

    before = {r["id"]: area([tuple(p) for p in r["polygon_m"]]) for r in rooms}

    for r in rooms:
        r["polygon_m"] = orthogonalize([list(p) for p in r["polygon_m"]])

    vx, hy = axis_coords(rooms)
    cx = cluster(vx, SNAP_M)
    cy = cluster(hy, SNAP_M)
    print(f"общих вертикальных линий {len(cx)}, горизонтальных {len(cy)}")

    for r in rooms:
        pts = r["polygon_m"]
        n = len(pts)
        sx = [False] * n
        sy = [False] * n
        for i in range(n):
            j = (i + 1) % n
            dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            if abs(dx) < 1e-9:          # вертикальная грань — снапим x обоих концов
                sx[i] = sx[j] = True
            elif abs(dy) < 1e-9:
                sy[i] = sy[j] = True
        for i in range(n):
            if sx[i]:
                pts[i][0] = snap(pts[i][0], cx, SNAP_M)
            if sy[i]:
                pts[i][1] = snap(pts[i][1], cy, SNAP_M)
        r["polygon_m"] = [[round(x, 3), round(y, 3)] for x, y in cleanup(pts)]

    drift = []
    for r in rooms:
        a = area([tuple(p) for p in r["polygon_m"]])
        b = before[r["id"]]
        r["area_computed_m2"] = round(a, 1)
        if r.get("area_printed_m2"):
            d = abs(a - r["area_printed_m2"]) / r["area_printed_m2"] * 100
            r["area_delta_pct"] = round(d, 1)
            r["issues"] = [i for i in r["issues"] if i != "area_mismatch"]
            if d > 7:
                r["issues"].append("area_mismatch")
        if b > 0 and abs(a - b) / b * 100 > AREA_TOL_PCT:
            drift.append((r["id"], round(b, 1), round(a, 1), round((a - b) / b * 100, 1)))

    pts_total = sum(len(r["polygon_m"]) for r in rooms)
    data["regularized"] = {"ortho_deg": ORTHO_DEG, "snap_m": SNAP_M, "min_edge_m": MIN_EDGE_M}
    src.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    named = [r for r in rooms if r.get("bti_number")]
    ok = [r for r in named if "area_mismatch" not in r["issues"]]
    print(f"вершин в полигонах: {pts_total}")
    print(f"площадь сошлась с планом: {len(ok)} из {len(named)}")
    if drift:
        print(f"площадь изменилась больше {AREA_TOL_PCT} % у {len(drift)} помещений:")
        for i, b, a, d in sorted(drift, key=lambda t: -abs(t[3]))[:12]:
            print(f"   {i}: было {b}, стало {a} ({d:+} %)")


if __name__ == "__main__":
    main()
