#!/usr/bin/env python3
"""
Извлекает контуры помещений из сканов поэтажных планов БТИ (PDF, 300 dpi).

Конвейер:
  1. бинаризация скана (Оцу);
  2. контур здания (footprint) — крупнейшая компонента после морфологического
     замыкания; всё, что вне контура, считается улицей;
  3. стены — связные компоненты длиннее 90 px (текст и подписи отсеиваются),
     дверные проёмы замыкаются вдоль направления линии, чтобы не утолщать стены;
  4. подписи помещений — короткая горизонтальная черта, над которой и под
     которой есть «цифровые» компоненты (в БТИ подпись = номер / площадь);
  5. водораздел (watershed) по свободному пространству, засеянный подписями
     и центрами крупных областей без подписи;
  6. контур каждой области → полигон → упрощение → метры.

Масштаб берётся из чертежа: 1:200 при 300 dpi → 59.055 px на метр.

Номера и площади с подписей НЕ распознаются автоматически: шрифт БТИ даёт
слишком много ошибок OCR. Скрипт печатает контактный лист с кропами подписей
(--sheet), номера вносятся в data/floor-map/labels-floor-<N>.json вручную и
сверяются с вычисленной площадью полигона.

Использование:
    python3 scripts/floor-map/scan_to_rooms.py --page 1 --floor 1 \
        --scan data/floor-map/scan/pg-001.png
"""

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from skimage.segmentation import watershed

DPI = 300
PLAN_SCALE = 200                       # чертёж 1:200
PPM = DPI / 0.0254 / PLAN_SCALE        # пикселей на метр = 59.055

MIN_WALL_LEN = 90       # px: короче — это текст, а не стена
WALL_FILL = 0           # px: заливка тела стены; 0 даёт лучшее совпадение с площадями БТИ
DOOR_GAP = 110          # px: проёмы такой ширины замыкаются (1.86 м)
LINE_OPEN = 30          # px: минимальная длина отрезка стены
SEED_MIN_AREA = 4.0     # м²: область без подписи меньше этой не получает сид
SIMPLIFY_M = 0.16       # м: допуск упрощения полигона
SMOOTH_PX = 11          # px: сглаживание маски помещения перед обводкой


def binarize(path: Path):
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SystemExit(f"не читается {path}")
    _, bw = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return img, bw


def footprint(bw):
    """Контур здания: крупнейшая компонента после замыкания, залитая целиком."""
    blob = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, np.ones((50, 50), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(blob, 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    cnts, _ = cv2.findContours((lab == i).astype(np.uint8),
                               cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    foot = np.zeros(bw.shape, np.uint8)
    cv2.drawContours(foot, [max(cnts, key=cv2.contourArea)], -1, 1, -1)
    return cv2.erode(foot, np.ones((9, 9), np.uint8))


def wall_mask(bw, wall_fill=WALL_FILL):
    """Стены с замкнутыми дверными проёмами. Текст и подписи исключены."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(bw, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        _, _, w, h, _ = st[i]
        if max(w, h) >= MIN_WALL_LEN:
            keep[i] = True
    raw = keep[lab].astype(np.uint8) * 255
    if wall_fill:
        # стена нарисована двумя линиями; замыкание заполняет её тело, иначе
        # пустота внутри стены попадает в площадь помещения
        raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, np.ones((wall_fill, wall_fill), np.uint8))

    def along(mask, horizontal):
        ko = np.ones((1, LINE_OPEN), np.uint8) if horizontal else np.ones((LINE_OPEN, 1), np.uint8)
        kc = np.ones((1, DOOR_GAP), np.uint8) if horizontal else np.ones((DOOR_GAP, 1), np.uint8)
        return cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_OPEN, ko),
                                cv2.MORPH_CLOSE, kc)

    walls = cv2.bitwise_or(along(raw, True), along(raw, False))
    # косые стены замыканию вдоль осей не поддаются — добавляем их как есть
    walls = cv2.bitwise_or(walls, cv2.dilate(raw, np.ones((3, 3), np.uint8)))
    # walls — барьеры для водораздела (с замкнутыми проёмами);
    # raw — сами линии стен, по ним считается площадь по внутренним граням
    return walls, raw


def find_labels(bw, foot):
    """Подписи «номер / площадь»: черта, вокруг которой сверху и снизу цифры."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(bw, 8)
    digits = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 16 <= h <= 46 and 4 <= w <= 42 and a > 40:
            digits.append((x + w / 2, y + h / 2))
    digits = np.array(digits)

    hor = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((1, 28), np.uint8))
    longh = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((1, 190), np.uint8))
    bars = cv2.subtract(hor, cv2.dilate(longh, np.ones((5, 5), np.uint8)))
    nb, lb, sb, cb = cv2.connectedComponentsWithStats(bars, 8)

    found = []
    for j in range(1, nb):
        x, y, w, h, _ = sb[j]
        cx, cy = int(cb[j][0]), int(cb[j][1])
        if not (28 <= w <= 170 and h <= 8):
            continue
        if foot[cy, cx] == 0:
            continue
        dx = np.abs(digits[:, 0] - cx)
        dy = digits[:, 1] - cy
        up = int(((dx < w / 2 + 12) & (dy < -6) & (dy > -54)).sum())
        dn = int(((dx < w / 2 + 12) & (dy > 6) & (dy < 54)).sum())
        if up >= 1 and dn >= 2:
            found.append((cx, cy, w))

    found.sort(key=lambda t: (t[1] // 300, t[0]))
    deduped = []
    for f in found:
        if all((f[0] - g[0]) ** 2 + (f[1] - g[1]) ** 2 > 40 ** 2 for g in deduped):
            deduped.append(f)
    return deduped


def segment(bw, foot, walls, labels):
    """Водораздел: один сид на подпись плюс сиды для крупных областей без подписи."""
    free = ((walls == 0) & (foot > 0)).astype(np.uint8)
    nf, lf, sf, _ = cv2.connectedComponentsWithStats(free, 8)

    seeds = np.zeros(free.shape, np.int32)
    meta = []
    used = set()
    for idx, (x, y, _) in enumerate(labels):
        region = lf[y, x]
        if region == 0:
            meta.append(None)          # подпись легла на стену — сид не ставим
            continue
        sid = len(meta) + 1
        cv2.circle(seeds, (x, y), 9, sid, -1)
        meta.append({"source": "label", "label_index": idx, "seed": (x, y)})
        used.add(region)

    for i in range(1, nf):
        if i in used or sf[i, cv2.CC_STAT_AREA] < SEED_MIN_AREA * PPM ** 2:
            continue
        m = (lf == i).astype(np.uint8)
        d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        py, px = np.unravel_index(int(np.argmax(d)), d.shape)
        sid = len(meta) + 1
        cv2.circle(seeds, (int(px), int(py)), 9, sid, -1)
        meta.append({"source": "auto", "label_index": None, "seed": (int(px), int(py))})

    elevation = cv2.GaussianBlur((walls > 0).astype(np.float32), (0, 0), 3)
    return watershed(elevation, seeds, mask=foot > 0), meta


def polygon_of(mask):
    # растровые края дают «пилу»; открытие+замыкание убирают её, не сдвигая грани
    k = np.ones((SMOOTH_PX, SMOOTH_PX), np.uint8)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    approx = cv2.approxPolyDP(c, SIMPLIFY_M * PPM, True)
    return approx.reshape(-1, 2)


def polygon_area_m2(pts):
    x, y = pts[:, 0], pts[:, 1]
    return abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2 / PPM ** 2


def centroid(pts):
    x, y = pts[:, 0].astype(float), pts[:, 1].astype(float)
    cross = x * np.roll(y, -1) - np.roll(x, -1) * y
    a = cross.sum() / 2
    if abs(a) < 1e-9:
        return float(x.mean()), float(y.mean())
    cx = ((x + np.roll(x, -1)) * cross).sum() / (6 * a)
    cy = ((y + np.roll(y, -1)) * cross).sum() / (6 * a)
    return float(cx), float(cy)


def contact_sheet(img, labels, out_dir, floor):
    """Кропы подписей для ручной вычитки номеров — OCR по шрифту БТИ ненадёжен."""
    CW, CH, SC, cols = 150, 110, 3, 8
    rows = math.ceil(len(labels) / cols)
    sheet = np.full((rows * (CH * SC + 40), cols * (CW * SC + 10)), 255, np.uint8)
    for k, (x, y, _) in enumerate(labels):
        r, c = divmod(k, cols)
        crop = cv2.resize(img[max(0, y - 52):y + 52, max(0, x - 70):x + 70],
                          (CW * SC, CH * SC), interpolation=cv2.INTER_CUBIC)
        y0, x0 = r * (CH * SC + 40), c * (CW * SC + 10)
        sheet[y0 + 40:y0 + 40 + CH * SC, x0:x0 + CW * SC] = crop
        cv2.putText(sheet, f"#{k}", (x0 + 8, y0 + 30), cv2.FONT_HERSHEY_SIMPLEX, 1.1, 0, 3)
        cv2.rectangle(sheet, (x0, y0 + 38), (x0 + CW * SC, y0 + 40 + CH * SC), 0, 2)
    p = out_dir / f"label-sheet-floor-{floor}.png"
    cv2.imwrite(str(p), sheet)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", required=True, type=Path)
    ap.add_argument("--floor", required=True)
    ap.add_argument("--out", type=Path, default=Path("data/floor-map"))
    ap.add_argument("--labels", type=Path, help="JSON: {\"0\": {\"number\": \"11\", \"area\": 33.9}, ...}")
    ap.add_argument("--sheet", action="store_true", help="только контактный лист подписей")
    ap.add_argument("--wall-fill", type=int, default=WALL_FILL, help="px: заливка тела стены")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    img, bw = binarize(args.scan)
    foot = footprint(bw)
    labels = find_labels(bw, foot)
    print(f"подписей найдено: {len(labels)}")

    if args.sheet:
        print("контактный лист:", contact_sheet(img, labels, args.out, args.floor))
        return

    known = {}
    if args.labels and args.labels.exists():
        known = {int(k): v for k, v in json.loads(args.labels.read_text(encoding="utf-8")).items()}

    walls, wall_lines = wall_mask(bw, args.wall_fill)
    ws, meta = segment(bw, foot, walls, labels)

    ys, xs = np.where(foot > 0)
    ox, oy = int(xs.min()), int(ys.min())

    rooms, mismatch = [], []
    for sid in range(1, len(meta) + 1):
        # водораздел кладёт границу по осевой линии стены; площадь БТИ — по
        # внутренним граням, поэтому вычитаем тело стены
        m = (ws == sid) & (wall_lines == 0)
        if not m.any():
            continue
        nc, lc, sc, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
        if nc > 2:                       # после вычитания стен могли остаться огрызки
            m = lc == (1 + int(np.argmax(sc[1:, cv2.CC_STAT_AREA])))
        pts = polygon_of(m)
        if pts is None or len(pts) < 3:
            continue
        area = polygon_area_m2(pts)
        cx, cy = centroid(pts)
        info = meta[sid - 1] or {}
        li = info.get("label_index")
        printed = known.get(li, {}) if li is not None else {}
        number = printed.get("number")
        printed_area = printed.get("area")
        issues = []
        if number is None:
            issues.append("no_number")
        if printed_area:
            delta = abs(area - printed_area) / printed_area * 100
            if delta > 7:
                issues.append("area_mismatch")
                mismatch.append((number, round(area, 1), printed_area, round(delta, 1)))
        else:
            delta = None
        base = f"f{args.floor}-{number}" if number else f"f{args.floor}-auto{sid}"
        room_id = base
        if any(r["id"] == base for r in rooms):        # № 1 встречается у разных помещений БТИ
            room_id = f"{base}-{sid}"
        rooms.append({
            "id": room_id,
            "bti_number": number,
            "floor": args.floor,
            "polygon_m": [[round((px - ox) / PPM, 3), round((py - oy) / PPM, 3)] for px, py in pts],
            "centroid_m": [round((cx - ox) / PPM, 3), round((cy - oy) / PPM, 3)],
            "area_computed_m2": round(area, 1),
            "area_printed_m2": printed_area,
            "area_delta_pct": round(delta, 1) if delta is not None else None,
            "name": {"ru": None, "he": None, "en": None},
            "university_number": None,
            "issues": issues,
        })

    payload = {
        "floor": args.floor,
        "source": args.scan.name,
        "scale": f"1:{PLAN_SCALE}",
        "px_per_meter": round(PPM, 3),
        "extent_m": [round((int(xs.max()) - ox) / PPM, 2), round((int(ys.max()) - oy) / PPM, 2)],
        "footprint_m2": round(int(foot.sum()) / PPM ** 2, 1),
        "rooms": rooms,
    }
    out = args.out / f"rooms-floor-{args.floor}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    named = sum(1 for r in rooms if r["bti_number"])
    print(f"помещений: {len(rooms)} (с номером {named}, без номера {len(rooms)-named})")
    print(f"сумма площадей: {round(sum(r['area_computed_m2'] for r in rooms))} м² "
          f"при контуре здания {payload['footprint_m2']} м²")
    if mismatch:
        print("расхождение вычисленной и напечатанной площади > 7 %:")
        for nm, calc, pr, d in mismatch:
            print(f"   № {nm}: вычислено {calc}, на плане {pr} ({d} %)")
    print("записано:", out)


if __name__ == "__main__":
    main()
