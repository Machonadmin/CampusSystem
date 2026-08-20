#!/usr/bin/env python3
"""
Собирает PDF для проверки планов человеком, знающим здание.

Нумерация на планах БТИ не совпадает с нумерацией из официального списка
помещений, и сопоставить их программа не может. Этот документ показывают
человеку, который здание знает: планы с номерами, таблицы для заполнения и
объяснение задачи на русском и иврите.

HTML печатается в PDF через Chromium (--print-to-pdf), A3 landscape.
Шрифт DejaVu Sans перекрывает кириллицу и иврит.

Использование:
    python3 scripts/floor-map/build_review_pdf.py
"""

import argparse
import html
import json
import subprocess
from pathlib import Path

CHROMIUM = "/opt/pw-browsers/chromium"
FLOORS = [("0", "Подвал", "מרתף"), ("1", "1 этаж", "קומה 1"),
          ("2", "2 этаж", "קומה 2"), ("3", "3 этаж", "קומה 3")]
MIN_UNNAMED_M2 = 4.0        # безымянные меньше этого в таблицу не попадают
DISPUTE_PCT = 12.0          # расхождение площади, при котором просим проверить границы

CSS = """
@page { size: A3 landscape; margin: 10mm 12mm; }
* { box-sizing: border-box; }
body { font-family: 'DejaVu Sans', sans-serif; color: #1f2937; margin: 0; font-size: 11pt; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 22pt; margin: 0 0 4mm; }
h2 { font-size: 16pt; margin: 0 0 3mm; border-bottom: 2px solid #334155; padding-bottom: 2mm; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; }
.two { display: flex; gap: 10mm; }
.two > div { flex: 1; }
.he { direction: rtl; text-align: right; }
.lead { font-size: 12pt; line-height: 1.5; }
ol, ul { padding-inline-start: 6mm; line-height: 1.5; }
li { margin-bottom: 1.5mm; }
.box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 4mm; border-radius: 2mm; }
.warn { border-color: #f59e0b; background: #fffbeb; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { border: 1px solid #94a3b8; padding: 1.3mm 2mm; text-align: left; }
th { background: #e2e8f0; font-size: 8.5pt; }
td.fill { background: #fff; height: 7mm; min-width: 45mm; }
td.num { font-weight: 700; white-space: nowrap; }
.cols { column-count: 3; column-gap: 8mm; }
.legend { display: flex; gap: 6mm; font-size: 9.5pt; margin-bottom: 3mm; flex-wrap: wrap; }
.legend span { display: inline-flex; align-items: center; gap: 2mm; }
.sw { width: 5mm; height: 3.5mm; border: 1px solid #6b7787; display: inline-block; }
/* при печати svg без явной высоты схлопывается в ноль */
svg { width: 100%; height: 232mm; display: block; }
.foot { font-size: 8.5pt; color: #64748b; margin-top: 2mm; }
"""


def esc(s):
    return html.escape(str(s), quote=True)


def load(floor, base):
    return json.loads((base / f"rooms-floor-{floor}.json").read_text(encoding="utf-8"))


def assign_codes(plan):
    """Служебный код безымянному помещению, чтобы на него тоже можно было сослаться."""
    unnamed = [r for r in plan["rooms"]
               if not r["bti_number"] and r["area_computed_m2"] >= MIN_UNNAMED_M2]
    unnamed.sort(key=lambda r: (round(r["centroid_m"][1] / 5), r["centroid_m"][0]))
    return {r["id"]: f"A{i + 1}" for i, r in enumerate(unnamed)}


def path_of(points):
    return "M " + " L ".join(f"{x} {y}" for x, y in points) + " Z"


def floor_svg(plan, codes):
    w, h = plan["extent_m"]
    out = [f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" '
           f'xmlns="http://www.w3.org/2000/svg">',
           f'<path d="{path_of(plan["footprint_polygon_m"])}" fill="#9aa5b4"/>']
    for r in plan["rooms"]:
        if r["bti_number"]:
            fill = "#fdeaca" if "area_mismatch" in r["issues"] else "#f4f7fb"
        else:
            fill = "#e6eaef"
        out.append(f'<path d="{path_of(r["polygon_m"])}" fill="{fill}" '
                   f'stroke="#6b7787" stroke-width="0.04" stroke-linejoin="round"/>')
    for r in plan["rooms"]:
        cx, cy = r["centroid_m"]
        if r["bti_number"]:
            out.append(f'<text x="{cx}" y="{cy}" text-anchor="middle" '
                       f'style="font:700 0.55px sans-serif;fill:#111827">{esc(r["bti_number"])}</text>')
            out.append(f'<text x="{cx}" y="{cy + 0.5}" text-anchor="middle" '
                       f'style="font:0.38px sans-serif;fill:#6b7280">{r["area_computed_m2"]}</text>')
        elif r["id"] in codes:
            out.append(f'<text x="{cx}" y="{cy}" text-anchor="middle" '
                       f'style="font:0.45px sans-serif;fill:#9ca3af">{codes[r["id"]]}</text>')
    out.append("</svg>")
    return "\n".join(out)


def rows_for(plan, codes):
    rows = []
    for r in plan["rooms"]:
        if r["bti_number"]:
            rows.append((r["bti_number"], r["area_computed_m2"], r["area_printed_m2"], r))
        elif r["id"] in codes:
            rows.append((codes[r["id"]], r["area_computed_m2"], None, r))

    def key(t):
        label = t[0]
        if label.startswith("A"):
            return (2, int(label[1:]), "")
        digits = "".join(c for c in label if c.isdigit())
        return (1, int(digits) if digits else 0, label)

    return sorted(rows, key=key)


def cover(total_rooms, total_named):
    ru = f"""
<h1>Планы этажей — проверка помещений</h1>
<p class="lead">Мы делаем интерактивную карту здания для системы управления
кампусом: на карте можно будет выбрать помещение и увидеть, какие занятия в
нём идут. Геометрия помещений уже построена по поэтажным планам БТИ
(ул. Олений Вал, д. 3, корп. 1, план от 15 марта 2010 г., масштаб 1:200).</p>

<h3>В чём проблема</h3>
<p class="lead">На планах БТИ помещения пронумерованы по-своему: 1, 2, 3… на
каждом этаже, включая коридоры, санузлы и кладовые. В нашем официальном
списке помещений другая нумерация — 101…122, 201…235, 301…331 — и всего
95 названий. <b>Какой номер БТИ какому помещению соответствует, может сказать
только человек, знающий здание.</b> Программа этого не определит.</p>

<h3>Что нужно сделать</h3>
<ol>
<li>Открыть лист нужного этажа и найти помещение по номеру на плане.</li>
<li>В таблице этого этажа вписать <b>официальное название</b> помещения — или
номер названия из списка в конце документа.</li>
<li>Вписать <b>наш номер</b> помещения (101, 202 и т. д.), если он есть.</li>
<li>Если помещение — коридор, лестница, санузел или подсобка без отдельного
названия, так и написать: «коридор», «санузел», «лестница».</li>
<li>Серые помещения с кодами A1, A2… — те, у которых на плане БТИ не оказалось
читаемого номера. Их тоже желательно подписать.</li>
<li>Если границы помещения на нашем плане нарисованы неверно (стена не там,
два помещения объединены в одно) — отметить это в колонке «замечания».</li>
</ol>

<div class="box warn"><b>Особая просьба.</b> В конце документа есть лист
«Спорная геометрия» — это помещения, где наша вычисленная площадь заметно
расходится с площадью, напечатанной на плане БТИ. Скорее всего, там мы
неправильно провели стену. Их стоит проверить в первую очередь.</div>

<p class="foot">Всего помещений на четырёх этажах: {total_rooms}, из них с
номером БТИ: {total_named}. Заполнять всё подряд не обязательно — в первую
очередь важны учебные аудитории и кабинеты.</p>
"""
    he = f"""
<h1>תוכניות קומות — אימות חדרים</h1>
<p class="lead">אנחנו בונים מפה אינטראקטיבית של הבניין למערכת ניהול הקמפוס:
יהיה אפשר ללחוץ על חדר ולראות אילו שיעורים מתקיימים בו. הגיאומטריה של החדרים
כבר נבנתה מתוך תוכניות ה-БТИ הרשמיות (רחוב אולני ואל 3, מבנה 1, תוכנית מ-15
במרץ 2010, קנה מידה 1:200).</p>

<h3>מה הבעיה</h3>
<p class="lead">בתוכניות ה-БТИ החדרים ממוספרים בשיטה משלהם: 1, 2, 3… בכל קומה,
כולל מסדרונות, שירותים ומחסנים. ברשימה הרשמית שלנו יש מספור אחר —
101…122, 201…235, 301…331 — ובסך הכל 95 שמות. <b>רק מי שמכיר את הבניין יכול
לומר איזה מספר БТИ מתאים לאיזה חדר.</b> תוכנה לא יכולה לקבוע את זה.</p>

<h3>מה צריך לעשות</h3>
<ol>
<li>לפתוח את דף הקומה הרצויה ולמצוא את החדר לפי המספר שעל התוכנית.</li>
<li>בטבלה של אותה קומה לרשום את <b>השם הרשמי</b> של החדר — או את מספר השם
מהרשימה שבסוף המסמך.</li>
<li>לרשום את <b>המספר שלנו</b> (101, 202 וכדומה), אם קיים.</li>
<li>אם החדר הוא מסדרון, מדרגות, שירותים או מחסן ללא שם נפרד — פשוט לכתוב זאת.</li>
<li>חדרים אפורים עם קודים A1, A2… הם כאלה שלא נמצא להם מספר קריא בתוכנית.
רצוי לסמן גם אותם.</li>
<li>אם גבולות החדר שרטטנו לא נכון (קיר במקום הלא נכון, שני חדרים אוחדו לאחד)
— לציין זאת בעמודת ההערות.</li>
</ol>

<div class="box warn"><b>בקשה מיוחדת.</b> בסוף המסמך יש דף «גיאומטריה
מוטלת בספק» — חדרים שבהם השטח שחישבנו שונה משמעותית מהשטח המודפס בתוכנית
ה-БТИ. סביר שדווקא שם העברנו קיר לא נכון. כדאי לבדוק אותם ראשונים.</div>

<p class="foot">סך הכל חדרים בארבע הקומות: {total_rooms}, מהם עם מספר БТИ:
{total_named}. לא חובה למלא הכל — הכי חשובות כיתות הלימוד והמשרדים.</p>
"""
    return f'<div class="page"><div class="two"><div>{ru}</div><div class="he">{he}</div></div></div>'


def legend():
    return ('<div class="legend">'
            '<span><i class="sw" style="background:#f4f7fb"></i> помещение с номером БТИ / חדר עם מספר</span>'
            '<span><i class="sw" style="background:#fdeaca"></i> площадь расходится с планом / פער בשטח</span>'
            '<span><i class="sw" style="background:#e6eaef"></i> без номера, код A… / ללא מספר</span>'
            '<span><i class="sw" style="background:#9aa5b4"></i> стены / קירות</span>'
            '</div>')


def floor_pages(plan, ru_name, he_name, codes):
    pages = [f'<div class="page"><h2>{ru_name} · {he_name}</h2>{legend()}'
             f'{floor_svg(plan, codes)}'
             f'<div class="foot">Цифра под номером помещения — площадь в м², '
             f'вычисленная по плану. גודל מתחת למספר החדר — שטח במ״ר.</div></div>']

    rows = rows_for(plan, codes)
    per_page = 34
    chunks = [rows[i:i + per_page] for i in range(0, len(rows), per_page)] or [[]]
    for n, chunk in enumerate(chunks, 1):
        part = f" — часть {n} из {len(chunks)}" if len(chunks) > 1 else ""
        body = []
        for label, area, printed, r in chunk:
            note = ""
            if printed and abs(area - printed) / printed * 100 > DISPUTE_PCT:
                note = "проверить границы / לבדוק גבולות"
            body.append(
                f'<tr><td class="num">{esc(label)}</td><td>{area}</td>'
                f'<td>{printed if printed else "—"}</td>'
                f'<td class="fill"></td><td class="fill"></td>'
                f'<td class="fill">{note}</td></tr>')
        pages.append(f"""<div class="page"><h2>{ru_name}{part} — таблица · טבלה</h2>
<table><thead><tr>
<th style="width:14mm">№ БТИ<br>מספר</th>
<th style="width:18mm">площадь,<br>м² (наша)</th>
<th style="width:18mm">площадь<br>на плане</th>
<th>официальное название / שם רשמי</th>
<th style="width:26mm">наш номер<br>המספר שלנו</th>
<th style="width:52mm">замечания / הערות</th>
</tr></thead><tbody>{''.join(body)}</tbody></table></div>""")
    return pages


def names_page(base):
    data = json.loads((base / "room-names.json").read_text(encoding="utf-8"))
    items = []
    for i, r in enumerate(data["rooms"], 1):
        num = r["number"] or "—"
        name = r["name"] or "(название отсутствует)"
        items.append(f"<li><b>{i}.</b> {esc(num)} — {esc(name)}</li>")
    return f"""<div class="page"><h2>Официальный список помещений · הרשימה הרשמית</h2>
<p class="foot">Из Word-файла заказчика, {len(items)} позиций. В таблицах можно
писать номер из этого списка вместо названия целиком.<br>
<span class="he">מתוך קובץ ה-Word, {len(items)} רשומות. בטבלאות אפשר לרשום את
המספר מהרשימה במקום השם המלא.</span></p>
<ul class="cols" style="list-style:none;padding:0">{''.join(items)}</ul></div>"""


def disputes_page(plans, all_codes):
    rows = []
    for floor, ru_name, _ in FLOORS:
        plan = plans[floor]
        for r in plan["rooms"]:
            p = r["area_printed_m2"]
            if not p:
                continue
            d = abs(r["area_computed_m2"] - p) / p * 100
            if d > DISPUTE_PCT:
                kind = "объединено с соседним" if r["area_computed_m2"] > p else "отрезана часть"
                rows.append((d, ru_name, r["bti_number"], r["area_computed_m2"], p, kind))
    rows.sort(reverse=True)
    body = "".join(
        f'<tr><td>{esc(f)}</td><td class="num">{esc(n)}</td><td>{a}</td><td>{p}</td>'
        f'<td>{round(d)} %</td><td>{esc(k)}</td><td class="fill"></td></tr>'
        for d, f, n, a, p, k in rows)
    return f"""<div class="page"><h2>Спорная геометрия · גיאומטריה מוטלת בספק</h2>
<div class="two"><div><p class="lead">Здесь наша вычисленная площадь расходится
с площадью, напечатанной на плане БТИ, больше чем на {DISPUTE_PCT:.0f} %. Скорее
всего, стена проведена неверно: помещение либо слилось с соседним, либо от него
отрезали часть. Просьба посмотреть эти помещения на плане и написать, где
проходит настоящая граница.</p></div>
<div class="he"><p class="lead">כאן השטח שחישבנו שונה מהשטח המודפס בתוכנית
ה-БТИ ביותר מ-{DISPUTE_PCT:.0f}%. סביר שהקיר הועבר לא נכון: החדר או התאחד עם
שכנו, או שנחתך ממנו חלק. נבקש להסתכל על החדרים האלה בתוכנית ולציין היכן עובר
הגבול האמיתי.</p></div></div>
<table><thead><tr><th>этаж / קומה</th><th>№ БТИ</th><th>наша площадь</th>
<th>на плане</th><th>расхождение</th><th>вероятная причина</th>
<th style="width:70mm">как правильно / התיקון</th></tr></thead>
<tbody>{body}</tbody></table>
<p class="foot">Всего таких помещений: {len(rows)}.</p></div>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, default=Path("data/floor-map"))
    ap.add_argument("--out", type=Path, default=Path("data/floor-map/review/plans-review.pdf"))
    args = ap.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    plans = {f: load(f, args.dir) for f, _, _ in FLOORS}
    all_codes = {f: assign_codes(plans[f]) for f, _, _ in FLOORS}
    total_rooms = sum(len(p["rooms"]) for p in plans.values())
    total_named = sum(1 for p in plans.values() for r in p["rooms"] if r["bti_number"])

    pages = [cover(total_rooms, total_named)]
    for floor, ru_name, he_name in FLOORS:
        pages += floor_pages(plans[floor], ru_name, he_name, all_codes[floor])
    pages.append(names_page(args.dir))
    pages.append(disputes_page(plans, all_codes))

    doc = (f'<!doctype html><html><head><meta charset="utf-8">'
           f'<title>Планы этажей — проверка</title><style>{CSS}</style></head>'
           f'<body>{"".join(pages)}</body></html>')
    html_path = args.out.with_suffix(".html")
    html_path.write_text(doc, encoding="utf-8")

    subprocess.run([CHROMIUM, "--headless", "--disable-gpu", "--no-sandbox",
                    "--no-pdf-header-footer", f"--print-to-pdf={args.out}",
                    f"file://{html_path.resolve()}"],
                   check=True, capture_output=True)
    html_path.unlink()           # промежуточный HTML в репозитории не нужен
    size = args.out.stat().st_size
    rows_total = sum(len(rows_for(plans[f], all_codes[f])) for f, _, _ in FLOORS)
    print(f"{args.out}: {size // 1024} КБ, строк для заполнения {rows_total}, "
          f"помещений всего {total_rooms}")


if __name__ == "__main__":
    main()
