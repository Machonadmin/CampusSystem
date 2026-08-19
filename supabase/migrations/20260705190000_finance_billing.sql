-- ═════════════════════════════════════════════════════════════════════
-- Финансы: биллинг обучения студентов (MVP).
--
-- Две таблицы:
--   • finance_charges  — начисления (что студент ДОЛЖЕН): сумма, описание,
--     период, срок, статус (active/cancelled).
--   • finance_payments — платежи (что ПОЛУЧЕНО): сумма, дата, способ,
--     статус (pending/approved/cancelled) + кто внёс/подтвердил.
--
-- Модель — РАСЧЁТНЫЙ ПНК (running ledger): платежи НЕ привязаны к
-- конкретному начислению. Обе таблицы висят на education_journeys(id)
-- (journey студента). Баланс НЕ хранится — считается при чтении:
--     balance = Σ(charges.amount WHERE status='active')
--             − Σ(payments.amount WHERE status='approved')
--
-- Деньги — NUMERIC(12,2), одна подразумеваемая валюта (базовая валюта
-- учреждения); мультивалютность не вводится.
--
-- Права: новых привилегий НЕ создаём — переиспользуем каталог модуля
-- 'finance' (view / create_invoice / approve_payment / manage_budget /
-- export_reports), объявленный в 002_roles_and_privileges.sql. Он ниже
-- добавляется идемпотентно (на случай дрейфа сида 002 на боевой БД) и
-- выдаётся системным ролям со scope='all' — тот же паттерн, что в
-- 20260705130000_alumni_graduation.sql (иначе НИ ОДИН пользователь,
-- включая superadmin, не проходит requireFinancePrivilege).
--
-- Сознательно отложено (не входит в этот MVP):
--   • бюджеты (manage_budget), пожертвования/спонсоры, зарплаты (payroll);
--   • генерация PDF счёта/квитанции; возвраты/зачёты (refunds);
--   • мультивалютность; экспорт отчётов (export_reports);
--   • привязка платежа к конкретному начислению (per-charge allocation).
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. FINANCE_CHARGES (начисления студенту)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description   TEXT NOT NULL,
  period_label  TEXT,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by    UUID REFERENCES persons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_charges_journey ON finance_charges(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_finance_charges ON finance_charges;
CREATE TRIGGER set_updated_at_finance_charges
  BEFORE UPDATE ON finance_charges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. FINANCE_PAYMENTS (платежи студента)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_at       DATE NOT NULL,
  method        TEXT,
  reference     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled')),
  recorded_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  approved_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_journey ON finance_payments(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_finance_payments ON finance_payments;
CREATE TRIGGER set_updated_at_finance_payments
  BEFORE UPDATE ON finance_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Каталог привилегий модуля 'finance' — идемпотентно.
--    Точные строки из 002_roles_and_privileges.sql (блок «Финансы»),
--    на случай, если сид 002 не был применён к боевой БД.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('finance', 'view',            'Просмотр',                1),
  ('finance', 'create_invoice',  'Создание счетов',         2),
  ('finance', 'approve_payment', 'Подтверждение платежей',  3),
  ('finance', 'manage_budget',   'Управление бюджетом',     4),
  ('finance', 'export_reports',  'Экспорт отчётов',         5)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 4. Выдача привилегий 'finance' системным ролям (scope='all').
--    Паттерн идентичен 20260705130000_alumni_graduation.sql.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'finance'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'finance', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
