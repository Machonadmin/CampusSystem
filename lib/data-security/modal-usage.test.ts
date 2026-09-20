import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─── Страж: окно без внутреннего отступа ─────────────────────────────────────
//
// components/ui/Modal.tsx СВОЕГО padding не задаёт — его передаёт каждый
// вызывающий через panelStyle (ClassGroupModal: 24, AcceptanceOverviewTab: 20).
// Забыть его нечем не наказывается на сборке: TypeScript доволен, тесты
// зелёные, а на телефоне подписи полей упираются в край панели и форма
// читается как обрезанная.
//
// Это уже случалось ДВАЖДЫ в одном модуле: сначала NodeEditor (починено в
// 4c47e69), потом UnitEditor — владелец оба раза присылал снимок и спрашивал,
// почему «всё новое выглядит плохо». Третьего раза быть не должно.
//
// Проверка ограничена этим модулем намеренно: менять умолчание в общем Modal
// значило бы трогать вид десятков экранов, которые здесь никто не смотрел.

const DIR = join(process.cwd(), 'app', 'dashboard', 'data-security')

function tsxFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out = out.concat(tsxFiles(p))
    else if (entry.endsWith('.tsx')) out.push(p)
  }
  return out
}

/**
 * Вырезает текст каждого открывающего тега <Modal ...>. Разбор скобок, а не
 * регулярка «до >»: внутри пропсов встречаются и > (в стрелочных функциях),
 * и вложенные объекты, на которых наивный поиск обрывается раньше времени.
 */
function modalTags(src: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = src.indexOf('<Modal', from)
    if (start === -1) break
    // Не считаем </Modal> и <ModalSomething>
    const after = src[start + 6]
    if (after && /[A-Za-z0-9_]/.test(after)) { from = start + 6; continue }

    let depth = 0
    let i = start
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    out.push(src.slice(start, i + 1))
    from = i + 1
  }
  return out
}

describe('окна модуля «Безопасность данных» имеют внутренний отступ', () => {
  const files = tsxFiles(DIR)

  it('файлы модуля найдены (иначе страж молча ничего не проверяет)', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('окна вообще найдены (иначе разбор тега сломан)', () => {
    const total = files.reduce((n, f) => n + modalTags(readFileSync(f, 'utf8')).length, 0)
    expect(total, 'ни одного <Modal> не найдено — проверь разбор').toBeGreaterThan(0)
  })

  it('каждый <Modal> передаёт panelStyle с padding', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const tag of modalTags(readFileSync(file, 'utf8'))) {
        const hasPanelStyle = /panelStyle\s*=/.test(tag)
        const hasPadding = /padding\s*:/.test(tag)
        if (!hasPanelStyle || !hasPadding) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}: ${tag.slice(0, 60)}…`)
        }
      }
    }
    expect(
      offenders,
      'Окно открывается без внутреннего отступа: Modal своего padding не задаёт, ' +
      'и подписи полей упрутся в край панели. Добавь panelStyle={{ padding: 20 }}:\n' +
      offenders.join('\n'),
    ).toEqual([])
  })
})
