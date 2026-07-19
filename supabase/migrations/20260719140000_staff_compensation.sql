-- ═════════════════════════════════════════════════════════════════════
-- ЗАРПЛАТЫ / ОПЛАТА ТРУДА СОТРУДНИКОВ (שכר צוות = כספים).
--
-- Единая модель: всё, что «стоит денег» сотруднику, — это РАБОЧАЯ ЗАПИСЬ
-- (staff_work_entries) определённого типа; сумма всех записей за месяц =
-- расчётный лист (payslip), который менеджер утверждает.
--
-- Типы записей: teaching (авто из уроков: 2 урока по 1.5ч = 3ч), meeting
-- (собрание — ручная добавка), chavruta (по средам 1-на-1 с ученицей),
-- chavruta_plus (постоянное менторство), shabbat_host / shabbat_family
-- (шаббат с ученицами), other.
--
-- Тарифы — ПЕРСОНАЛЬНЫЕ (менеджер задаёт при приёме, редактируемы):
--   • hourly_rate       — ставка за час (обучение + почасовые записи);
--   • chavruta_rate     — за одну хавруту (по средам), сумма на человека;
--   • chavruta_plus_rate + _basis — менторство: за ученицу/месяц ИЛИ за час.
-- Шаббат — сумму задаёт менеджер по КАЖДОМУ событию (в самой записи).
--
-- Приватность: summary виден по правилам (напр. хаврута «что учили» — ученице),
-- private_notes — только менеджер + автор, ученице НИКОГДА.
--
-- Доступ: менеджер/финансы (как в финмодуле). Идемпотентно; применять вручную.
-- ═════════════════════════════════════════════════════════════════════

-- ── Персональные тарифы сотрудника ───────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_compensation (
  person_id            uuid PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  hourly_rate          numeric(12,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  chavruta_rate        numeric(12,2) NOT NULL DEFAULT 0 CHECK (chavruta_rate >= 0),
  chavruta_plus_rate   numeric(12,2) NOT NULL DEFAULT 0 CHECK (chavruta_plus_rate >= 0),
  chavruta_plus_basis  text NOT NULL DEFAULT 'per_student_month'
    CHECK (chavruta_plus_basis IN ('per_student_month','per_hour')),
  updated_by           uuid REFERENCES persons(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Рабочие записи (единый журнал → расчётный лист) ──────────────────
CREATE TABLE IF NOT EXISTS staff_work_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,       -- сотрудник
  entry_type         text NOT NULL CHECK (entry_type IN
                       ('teaching','meeting','chavruta','chavruta_plus','shabbat_host','shabbat_family','other')),
  entry_date         date NOT NULL,
  hours              numeric(6,2) CHECK (hours IS NULL OR hours >= 0),
  amount             numeric(12,2) CHECK (amount IS NULL OR amount >= 0),           -- посчитанная/ручная стоимость
  student_journey_id uuid REFERENCES education_journeys(id) ON DELETE SET NULL,     -- для хавруты/менторства/шаббата
  title              text,
  summary            text,   -- «что учили»/описание — видно по правилам (ученице — да)
  private_notes      text,   -- только менеджер + автор; ученице НИКОГДА
  source_lesson_id   uuid REFERENCES lessons(id) ON DELETE SET NULL,                -- для авто-записей обучения (дедуп)
  status             text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed')),
  created_by         uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_entries_person_date ON staff_work_entries (person_id, entry_date);
-- Дедуп авто-записей обучения: один урок → одна запись teaching на человека.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_teaching_lesson
  ON staff_work_entries (person_id, source_lesson_id) WHERE source_lesson_id IS NOT NULL;

-- ── Расчётные листы (месячное утверждение менеджером) ────────────────
CREATE TABLE IF NOT EXISTS staff_payslips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  year         int  NOT NULL,
  month        int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_amount numeric(12,2) NOT NULL DEFAULT 0,   -- снимок суммы на момент утверждения
  status       text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved')),
  approved_by  uuid REFERENCES persons(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, year, month)
);

-- ── Хеврута-плюс: постоянные пары мора↔ученица ───────────────────────
CREATE TABLE IF NOT EXISTS chavruta_plus_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_person_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  student_journey_id uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_person_id, student_journey_id)
);

-- ── Список «мор хавруты» (напоминание по средам): доп. к учителям кодеша ─
CREATE TABLE IF NOT EXISTS chavruta_teachers (
  person_id  uuid PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
