-- ═════════════════════════════════════════════════════════════════════
-- ШКОЛЬНАЯ ПЛАТА / ОБУЧЕНИЕ (שכר לימוד) — семестры, счета за обучение,
-- скидки (с подписью), реквизиты платежа (с подписью) и ОТДЕЛЬНЫЙ доступ
-- к финансам студентки.
--
-- Модель (по спецификации владельца):
--   • Учебный год = 2 семестра (можно добавить ещё). У семестра есть ЦЕНА
--     (по умолчанию 210000, заполняется как placeholder, переопределяется).
--   • Студентка «привязана к семестру» → ей начисляется счёт за обучение
--     на сумму цены семестра (категория 'tuition').
--   • Скидка (%) уменьшает долг по счёту; требует причину + ЭЛЕКТРОННУЮ ПОДПИСЬ.
--     Разрешён любой процент (быстрые: 10/25/50/100).
--   • Платёж: способ (наличные/перевод/…), КУДА зачислено, для перевода —
--     с какого на какой счёт, + подпись (кто/когда).
--   • Доступ к финансам ОТДЕЛЬНЫЙ от доступа к делу студентки: менеджер
--     выдаёт сотруднику доступ к финансам ВСЕХ студенток или ОДНОЙ конкретной.
--     Студентка в портале НЕ видит финансы, пока менеджер не разрешит ей лично.
--
-- Подписи хранятся по образцу stage_signatures (typed/drawn). Идемпотентно.
-- Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── Семестры (общешкольные учебные периоды) ──────────────────────────
CREATE TABLE IF NOT EXISTS semesters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label  text NOT NULL,                       -- напр. '2026'
  term_number int  NOT NULL,                        -- 1, 2, (3…)
  name        text,                                 -- необязательное отображаемое имя
  price       numeric(12,2) NOT NULL DEFAULT 210000 CHECK (price >= 0),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by  uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year_label, term_number)
);

-- ── Привязка студентки к семестру (что порождает счёт за обучение) ────
CREATE TABLE IF NOT EXISTS semester_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  journey_id  uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  charge_id   uuid REFERENCES finance_charges(id) ON DELETE SET NULL, -- порождённый счёт
  created_by  uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (semester_id, journey_id)
);

-- ── Классификация счёта: 'tuition' (обучение, привязан к семестру) / 'other' ──
ALTER TABLE finance_charges
  ADD COLUMN IF NOT EXISTS semester_id uuid REFERENCES semesters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('tuition','other'));

-- ── Скидки на счёт (уменьшают долг). С причиной и подписью. ───────────
CREATE TABLE IF NOT EXISTS finance_discounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id      uuid NOT NULL REFERENCES finance_charges(id) ON DELETE CASCADE,
  percent        numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),  -- вычисленная сумма скидки
  reason         text,
  -- Электронная подпись (образец stage_signatures).
  signed_by      uuid REFERENCES persons(id) ON DELETE SET NULL,
  signer_name    text,
  signature_kind text CHECK (signature_kind IN ('typed','drawn')),
  typed_name     text,
  drawing_path   text,
  signed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_discounts_charge ON finance_discounts(charge_id);

-- ── Реквизиты платежа + подпись ──────────────────────────────────────
ALTER TABLE finance_payments
  ADD COLUMN IF NOT EXISTS deposited_to   text,  -- куда зачислено (счёт/касса)
  ADD COLUMN IF NOT EXISTS from_account   text,  -- перевод: с какого счёта
  ADD COLUMN IF NOT EXISTS to_account     text,  -- перевод: на какой счёт
  ADD COLUMN IF NOT EXISTS signed_by      uuid REFERENCES persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signer_name    text,
  ADD COLUMN IF NOT EXISTS signature_kind text,
  ADD COLUMN IF NOT EXISTS typed_name     text,
  ADD COLUMN IF NOT EXISTS drawing_path   text,
  ADD COLUMN IF NOT EXISTS signed_at      timestamptz;

-- ── Отдельный доступ к финансам: сотрудник → все студентки ИЛИ одна ───
CREATE TABLE IF NOT EXISTS finance_access_grants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  scope      text NOT NULL CHECK (scope IN ('all','journey')),
  journey_id uuid REFERENCES education_journeys(id) ON DELETE CASCADE, -- обязателен при scope='journey'
  granted_by uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'all' AND journey_id IS NULL) OR (scope = 'journey' AND journey_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_grant_all
  ON finance_access_grants(person_id) WHERE scope = 'all';
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_grant_journey
  ON finance_access_grants(person_id, journey_id) WHERE scope = 'journey';

-- ── Видимость финансов студентке в портале (менеджер разрешает лично) ─
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS student_finance_visible boolean NOT NULL DEFAULT false;
