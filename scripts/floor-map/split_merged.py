#!/usr/bin/env python3
"""
Проводит недостающую стену между слипшимися помещениями.

Водораздел объединяет два помещения, если разделяющая их линия на скане
прервана проёмом шире порога замыкания. Но сама стена почти всегда есть —
от неё остаются выступы у краёв проёма. Здесь ищется рассекающая линия,
**оба конца которой упираются в реальные чернила стены**; линия, висящая в
воздухе, отбрасывается. Это защита от выдумывания геометрии: программа только
продлевает то, что на чертеже уже нарисовано.

Из допустимых кандидатов берётся тот, после которого площадь части с подписью
ближе всего к площади, напечатанной на плане БТИ, и только если расхождение
уменьшилось.
"""

import numpy as np
import cv2

OVER_TOL = 1.15        # площадь больше напечатанной во столько раз — кандидат на разделение
STUB_M = 0.25          # конец стены должен быть не дальше этого от чернил
MIN_SIDE_M = 1.0       # обе части после разделения не меньше этого по ширине
STEP_PX = 3            # шаг перебора линий разреза


def _cut_candidates(sub, seed_rc, dist_wall, bbox, ppm, printed, vertical):
    """Перебор линий разреза одного направления. Возвращает (ошибка, ось, позиция)."""
    by, bx = bbox[1], bbox[0]
    work = sub if vertical else sub.T
    # work[:, j] — колонка вдоль линии разреза
    counts = work.sum(axis=0)
    cum = np.cumsum(counts)
    total = cum[-1]
    min_side = MIN_SIDE_M * ppm
    stub = STUB_M * ppm
    seed_pos = (seed_rc[1] if vertical else seed_rc[0])

    best = None
    for j in range(int(min_side), work.shape[1] - int(min_side), STEP_PX):
        col = np.flatnonzero(work[:, j])
        if col.size == 0:
            continue
        a, b = int(col[0]), int(col[-1])
        if col.size != b - a + 1:          # линия рассекает область в нескольких местах
            continue
        # концы разреза должны упираться в чернила стены
        if vertical:
            p1 = (by + a - 1, bx + j)
            p2 = (by + b + 1, bx + j)
        else:
            p1 = (by + j, bx + a - 1)
            p2 = (by + j, bx + b + 1)
        h, w = dist_wall.shape
        if not (0 <= p1[0] < h and 0 <= p1[1] < w and 0 <= p2[0] < h and 0 <= p2[1] < w):
            continue
        if dist_wall[p1] > stub or dist_wall[p2] > stub:
            continue

        left = cum[j - 1] if j > 0 else 0
        keep = left if seed_pos < j else total - left
        if keep < min_side * min_side:
            continue
        err = abs(keep / ppm ** 2 - printed)
        if best is None or err < best[0]:
            best = (err, "v" if vertical else "h", j)
    return best


def split_merged(ws, wall_lines, meta, printed, ppm, log=print):
    """Разделяет слипшиеся помещения. ws правится на месте, meta дополняется."""
    dist_wall = cv2.distanceTransform((wall_lines == 0).astype(np.uint8), cv2.DIST_L2, 5)
    done = []

    for sid in sorted(printed):
        target = printed[sid]
        mask = (ws == sid) & (wall_lines == 0)
        area = float(mask.sum()) / ppm ** 2
        if area <= target * OVER_TOL:
            continue

        xs = np.flatnonzero(mask.any(axis=0))
        ys = np.flatnonzero(mask.any(axis=1))
        if xs.size == 0 or ys.size == 0:
            continue
        bbox = (int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1]))
        sub = mask[bbox[1]:bbox[3] + 1, bbox[0]:bbox[2] + 1]

        info = meta[sid - 1] or {}
        sx, sy = info.get("seed", (int(np.mean(xs)), int(np.mean(ys))))
        seed_rc = (sy - bbox[1], sx - bbox[0])
        if not (0 <= seed_rc[0] < sub.shape[0] and 0 <= seed_rc[1] < sub.shape[1]):
            continue

        cands = [c for c in (
            _cut_candidates(sub, seed_rc, dist_wall, bbox, ppm, target, True),
            _cut_candidates(sub, seed_rc, dist_wall, bbox, ppm, target, False),
        ) if c is not None]
        if not cands:
            continue
        err, axis, j = min(cands)
        if err >= abs(area - target):          # разрез не улучшил — не режем
            continue

        # часть без подписи уходит в новую безымянную область
        new_sid = len(meta) + 1
        cols = np.arange(mask.shape[1])[None, :]
        rows = np.arange(mask.shape[0])[:, None]
        if axis == "v":
            cut = bbox[0] + j
            before_cut = cols < cut
            seed_side = sx < cut
            wall_at = ("x", round(cut / ppm, 2))
        else:
            cut = bbox[1] + j
            before_cut = rows < cut
            seed_side = sy < cut
            wall_at = ("y", round(cut / ppm, 2))
        other = mask & (~before_cut if seed_side else before_cut)

        if other.sum() == 0:
            continue
        ws[other] = new_sid
        meta.append({"source": "split", "label_index": None,
                     "seed": (int(np.mean(np.flatnonzero(other.any(axis=0)))),
                              int(np.mean(np.flatnonzero(other.any(axis=1)))))})
        kept = float(((ws == sid) & (wall_lines == 0)).sum()) / ppm ** 2
        done.append((sid, round(area, 1), round(kept, 1), target, wall_at))

    if done:
        log(f"проведено недостающих стен: {len(done)}")
        for sid, before, after, target, at in done:
            log(f"   область {sid}: было {before} м², стало {after} при {target} на плане "
                f"(стена {at[0]} = {at[1]} м)")
    return ws, meta, done
