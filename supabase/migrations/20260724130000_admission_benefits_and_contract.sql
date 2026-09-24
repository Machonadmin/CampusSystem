-- ═════════════════════════════════════════════════════════════════════
-- Льготы приёма: уровень поддержки (תמיכה) + скидка (הנחה) + договор (חוזה).
-- Stage 2 ремонта бизнес-процесса «קבלה».
--
-- По бизнес-процессу (v2): проверка еврейства определяет ГОБА ТМИХА (сумма
-- поддержки/стипендии, которую МОСД ДАЁТ студентке) и ГОБА ХАНАХА (скидка % на
-- שכר לימוד). Оба сохраняются в профиле абитуриентки и переносятся в договор.
-- Решение владельца: תמיכה = денежная сумма (support_amount); скидка = процент;
-- договор ИНТЕГРИРУЕТСЯ с существующим финансовым модулем (не дублирует его).
--
-- Здесь только СХЕМА (deploy-safe, аддитивно). Логика (простановка при
-- завершении этапа 'jewishness', авто-создание договора при 'admitted',
-- подсказка скидки в финансах) — в коде, отдельными шагами.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Поля льгот на профиле (education_journeys). Все nullable. ──────
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS tuition_discount_percent numeric(5,2)
    CHECK (tuition_discount_percent >= 0 AND tuition_discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS support_amount numeric(12,2)
    CHECK (support_amount >= 0),
  ADD COLUMN IF NOT EXISTS benefits_notes  text,
  ADD COLUMN IF NOT EXISTS benefits_set_by uuid REFERENCES persons(id),
  ADD COLUMN IF NOT EXISTS benefits_set_at timestamptz;

COMMENT ON COLUMN education_journeys.tuition_discount_percent IS
  'Скидка на שכר לимуд (%), по итогам проверки еврейства. Переносится в договор и подсказывается в финансах';
COMMENT ON COLUMN education_journeys.support_amount IS
  'Сумма поддержки/стипендии (תמיכה), которую мосд даёт студентке';

-- ── 2. Статус еврейства: добавляем 'partial' (אישור חלקי). ───────────
--    Частичное подтверждение ≠ отказ: приём продолжается, но льготы урезаны.
ALTER TABLE education_journeys
  DROP CONSTRAINT IF EXISTS education_journeys_jewishness_status_check;
ALTER TABLE education_journeys
  ADD CONSTRAINT education_journeys_jewishness_status_check
  CHECK (jewishness_status IN ('pending','verified','rejected','needs_review','partial'));

ALTER TABLE jewishness_status_history
  DROP CONSTRAINT IF EXISTS jewishness_status_history_status_check;
ALTER TABLE jewishness_status_history
  ADD CONSTRAINT jewishness_status_history_status_check
  CHECK (status IN ('pending','verified','rejected','needs_review','partial'));

-- ── 3. Финал 'partial' на этапе 'jewishness' процесса 'acceptance'. ───
--    Резолвим id по кодам (не по фикс-UUID) — устойчиво к любой БД.
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT st.id, 'partial', 'Подтверждено частично', true, false, NULL, 15
FROM stage_templates st
JOIN process_templates p ON p.id = st.process_template_id AND p.code = 'acceptance'
WHERE st.code = 'jewishness'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive, sort_order = EXCLUDED.sort_order;

-- Переход jewishness --partial--> final_approval (after_all), как approved/rejected.
INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
SELECT js.id, fa.id, 'partial', 'after_all', 38
FROM stage_templates js
JOIN process_templates p  ON p.id = js.process_template_id AND p.code = 'acceptance'
JOIN stage_templates fa   ON fa.process_template_id = p.id AND fa.code = 'final_approval'
WHERE js.code = 'jewishness'
  AND NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id = js.id
      AND st.to_stage_template_id = fa.id
      AND st.trigger_final_code = 'partial'
  );

-- ── 4. Договор (חוזה) — лёгкая запись, интегрируется с финансами. ─────
--    Копирует скидку/поддержку/льготы из профиля при приёме; связывает
--    с финансовым модулем через journey_id (счета/скидки уже висят на journey).
CREATE TABLE IF NOT EXISTS admission_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  tuition_discount_percent numeric(5,2)
    CHECK (tuition_discount_percent >= 0 AND tuition_discount_percent <= 100),
  support_amount numeric(12,2) CHECK (support_amount >= 0),
  benefits_notes text,
  status        text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','void')),
  created_by    uuid REFERENCES persons(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Не более одного действующего договора на journey.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_contracts_active_journey
  ON admission_contracts (journey_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_admission_contracts_journey
  ON admission_contracts (journey_id);

COMMENT ON TABLE admission_contracts IS
  'Договор с абитуриенткой (חוזה): скидка/поддержка/льготы, создаётся при приёме, связан с финансами через journey_id';
