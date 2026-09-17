-- ═════════════════════════════════════════════════════════════════════
-- Права уходят с ДОЛЖНОСТЕЙ на ЛЮДЕЙ.
--
-- ─── Решение владельца ──────────────────────────────────────────────────────
--
-- «למה שישארו הרשאות, תבטל את הכל חוץ מההרשאות של המנהל על.»
--
-- Это та модель, которую он описал с самого начала: сотрудник получает лишь
-- НАЗВАНИЕ должности, а что ему открыто — утверждается лично, в «אבטחת מידע».
-- Пока права сидели на должностях, экран показывал их, но не управлял ими.
--
-- ─── Насколько это большое действие (по фактическим данным) ─────────────────
--
-- Из 41 должности людьми заняты ВОСЕМЬ. У остальных 33 — ноль носителей, и
-- снятие их прав не касается никого.
--
--   campus_president  194 права  2 человека
--   superadmin        174 права  3 человека   ← остаётся
--   jewish_studies_manager 23    1
--   unit_manager       12        1
--   security_head      10        1
--   maintenance_head    5        1
--   maintenance_staff   5        1
--   facilities_head     4        1
--
-- superadmin не теряет ничего в принципе: этот код — сквозной обход всех
-- проверок в коде (~140 мест), его строки в role_privileges ни на что не
-- влияют. Он сохранён потому, что так попросил владелец.
--
-- ─── Почему шаг 1 обязателен ────────────────────────────────────────────────
--
-- campus_president — ПОДПИСЬ и ничего больше: в коде этот код не проверяется
-- нигде, его сила — ровно те 194 строки. Бекерман Авраам держит только его,
-- и снятие прав заперло бы его снаружи, включая сам экран «אבטחת מידע».
-- По решению владельца он получает superadmin ДО удаления.
--
-- ─── Возврат ────────────────────────────────────────────────────────────────
--
-- Всё удаляемое сначала копируется в role_privileges_archive_20260917.
-- Вернуть как было — один запрос:
--
--   INSERT INTO role_privileges (role_id, module, privilege_code, scope)
--   SELECT role_id, module, privilege_code, scope
--     FROM role_privileges_archive_20260917
--   ON CONFLICT (role_id, module, privilege_code) DO NOTHING;
--
-- Архив хранит ещё code и name должности — чтобы через полгода было понятно,
-- что это за строки, даже если должность переименуют.
--
-- ⚠ SQL Editor спросит про RLS: таблица архива НАСТОЯЩАЯ и постоянная, и RLS
-- на ней включается ЗДЕСЬ же. Отвечать «Run without RLS» безопасно — миграция
-- включает её сама; политик нет, значит доступ только через service_role.
--
-- Идемпотентно: повторный запуск не находит строк для удаления.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Президент кампуса получает superadmin ────────────────────────────────
-- Data-driven: каждому, кто держит campus_president, добавляется superadmin.
-- Для того, у кого он уже есть, это ничего не меняет.
INSERT INTO person_roles (person_id, role_id)
SELECT DISTINCT pr.person_id, sa.id
  FROM person_roles pr
  JOIN roles r  ON r.id = pr.role_id AND r.code = 'campus_president'
  CROSS JOIN LATERAL (SELECT id FROM roles WHERE code = 'superadmin') sa
 WHERE NOT EXISTS (
   SELECT 1 FROM person_roles x WHERE x.person_id = pr.person_id AND x.role_id = sa.id
 );

-- Проверка ДО удаления: ни один держатель campus_president не должен остаться
-- без superadmin. Иначе мы бы заперли живого человека снаружи.
DO $$
DECLARE stranded INT; who TEXT;
BEGIN
  SELECT count(*), string_agg(p.full_name, ', ')
    INTO stranded, who
    FROM person_roles pr
    JOIN roles r  ON r.id = pr.role_id AND r.code = 'campus_president'
    JOIN persons p ON p.id = pr.person_id
   WHERE NOT EXISTS (
     SELECT 1 FROM person_roles x JOIN roles sr ON sr.id = x.role_id
      WHERE x.person_id = pr.person_id AND sr.code = 'superadmin'
   );
  IF stranded > 0 THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: % держателей campus_president остались бы без доступа: %', stranded, who;
  END IF;
END $$;

-- ── 2. Архив ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_privileges_archive_20260917 (
  role_id        UUID NOT NULL,
  role_code      TEXT,
  role_name      TEXT,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  scope          TEXT,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module, privilege_code)
);

-- Архив прав — не менее чувствителен, чем сами права: он полностью описывает,
-- кто что мог. Публичным ключом читаться не должен.
ALTER TABLE role_privileges_archive_20260917 ENABLE ROW LEVEL SECURITY;

INSERT INTO role_privileges_archive_20260917 (role_id, role_code, role_name, module, privilege_code, scope)
SELECT rp.role_id, r.code, r.name, rp.module, rp.privilege_code, rp.scope
  FROM role_privileges rp
  JOIN roles r ON r.id = rp.role_id
 WHERE r.code <> 'superadmin'
ON CONFLICT (role_id, module, privilege_code) DO NOTHING;

-- Архив обязан покрыть всё, что сейчас будет удалено.
DO $$
DECLARE to_delete INT; archived INT;
BEGIN
  SELECT count(*) INTO to_delete
    FROM role_privileges rp JOIN roles r ON r.id = rp.role_id
   WHERE r.code <> 'superadmin';
  SELECT count(*) INTO archived FROM role_privileges_archive_20260917;

  IF archived < to_delete THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: в архиве % строк, а удалить нужно % — возврата не будет', archived, to_delete;
  END IF;
  RAISE NOTICE 'В архиве строк: %. К удалению: %', archived, to_delete;
END $$;

-- ── 3. Удаление ─────────────────────────────────────────────────────────────
DELETE FROM role_privileges rp
 USING roles r
 WHERE r.id = rp.role_id
   AND r.code <> 'superadmin';

-- ── 4. Итог ─────────────────────────────────────────────────────────────────
DO $$
DECLARE left_rows INT; sa_rows INT;
BEGIN
  SELECT count(*) INTO left_rows
    FROM role_privileges rp JOIN roles r ON r.id = rp.role_id
   WHERE r.code <> 'superadmin';
  SELECT count(*) INTO sa_rows
    FROM role_privileges rp JOIN roles r ON r.id = rp.role_id
   WHERE r.code = 'superadmin';

  IF left_rows > 0 THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: осталось % строк не у superadmin', left_rows;
  END IF;
  RAISE NOTICE 'Готово. У должностей прав больше нет; у superadmin осталось строк: %. Личные права (person_privileges) не тронуты.', sa_rows;
END $$;
