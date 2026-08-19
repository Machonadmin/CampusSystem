// ─── Пагинация чтения для модуля «Отчёты» ────────────────────────────────────
//
// PostgREST по умолчанию отдаёт не более db-max-rows (обычно 1000) строк за
// запрос и МОЛЧА обрезает остальное. Для АГРЕГАЦИИ (суммы, разбивки, счёт по
// строкам) это дало бы НЕВЕРНЫЕ итоги. Поэтому любое чтение «всех строк» здесь
// идёт постранично, ровно как sumCentsByJourney в app/api/finance/students.
//
// Для чистых COUNT (одно число) НЕ используем этот хелпер — там нужен HEAD-запрос
// `Prefer: count=exact` через .select(col, { count: 'exact', head: true }).

export const PAGE = 1000

/**
 * Считывает ВСЕ строки запроса постранично (по PAGE) и возвращает их одним
 * массивом. `makeQuery(from, to)` должен вернуть тот же запрос PostgREST с
 * применённым .range(from, to) (Supabase query builder — thenable). Прекращает
 * чтение, когда очередная страница вернула меньше PAGE строк. Ошибку пробрасывает
 * (её ловит catch роута и маппит через mapDbError).
 */
export async function pageAll<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: readonly unknown[] | null
    error: { message?: string; code?: string } | null
  }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await makeQuery(from, from + PAGE - 1)
    if (error) throw error
    // Строки типизированы генерик-параметром T на стороне вызова (форма select
    // задаёт колонки). Supabase-типы столбцов (enum|null) шире наших сужений,
    // поэтому приводим здесь, а не завязываемся на точный сгенерированный тип.
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}
