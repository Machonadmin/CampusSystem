-- ═════════════════════════════════════════════════════════════════════
-- ИСКЛЮЧЕНИЯ КОДЕША (חריגות קודש) — одобренные менеджером освобождения.
--
-- Обязательные утренние слоты кодеша — «всегда кодеш, ЕСЛИ нет особого
-- одобрения менеджера». Здесь фиксируется одобренное ИСКЛЮЧЕНИЕ (освобождение)
-- конкретной студентки от кодеша: кто одобрил (approved_by), причина (reason)
-- и диапазон дат действия (effective_from … effective_to).
--
-- MVP = сама запись-исключение + UI менеджера + отображение. Пока НЕ влияет
-- автоматически на посещаемость/отчёты (отмеченный follow-up).
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kodesh_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES persons(id),
  reason text,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kodesh_exceptions_journey_id
  ON kodesh_exceptions (journey_id);
