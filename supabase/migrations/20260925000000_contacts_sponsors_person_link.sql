-- ═════════════════════════════════════════════════════════════════════
-- Решение №11: связь контактов и доноров с центральной записью человека
-- (persons / מאגר אנשים).
--
-- contacts и sponsors хранят СВОИ name/email/phone. Эта миграция добавляет
-- к обеим таблицам ссылку на центральную персону:
--   • person_id           — подтверждённая связь (ON DELETE SET NULL);
--   • person_link_status  — 'linked' | 'suggested' | 'rejected' | NULL;
--   • suggested_person_id — кандидат «возможное совпадение», ждёт решения
--                           ответственного (contacts.manage / sponsors.manage).
-- И к sponsors — contact_id: связь донора с его карточкой в контактах
-- (lib/contacts/sync-sponsor.ts предпочитает её, откат — по точному имени).
--
-- Связь только для ОТОБРАЖЕНИЯ: правка телефона/почты контакта/донора НЕ
-- копируется в persons. Организации (contacts.contact_type='organization',
-- sponsors.sponsor_type<>'individual') никогда не связываются.
--
-- Бэкфилла существующих строк здесь НЕТ (сознательно): связь создаётся при
-- создании/правке записи через API.
--
-- Код деплой-безопасен: до применения миграции (42703 / PGRST204) связывание
-- молча пропускается.
--
-- Идемпотентно: ADD COLUMN IF NOT EXISTS (CHECK/REFERENCES объявлены внутри
-- определения колонки и пропускаются вместе с ней, если колонка уже есть),
-- CREATE INDEX IF NOT EXISTS.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. CONTACTS
-- ─────────────────────────────────────────────

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS person_id           UUID NULL REFERENCES persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_link_status  TEXT NULL CHECK (person_link_status IN ('linked', 'suggested', 'rejected')),
  ADD COLUMN IF NOT EXISTS suggested_person_id UUID NULL REFERENCES persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_person_id           ON contacts(person_id);
CREATE INDEX IF NOT EXISTS idx_contacts_person_link_status  ON contacts(person_link_status);
CREATE INDEX IF NOT EXISTS idx_contacts_suggested_person_id ON contacts(suggested_person_id);


-- ─────────────────────────────────────────────
-- 2. SPONSORS
-- ─────────────────────────────────────────────

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS person_id           UUID NULL REFERENCES persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_link_status  TEXT NULL CHECK (person_link_status IN ('linked', 'suggested', 'rejected')),
  ADD COLUMN IF NOT EXISTS suggested_person_id UUID NULL REFERENCES persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id          UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sponsors_person_id           ON sponsors(person_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_person_link_status  ON sponsors(person_link_status);
CREATE INDEX IF NOT EXISTS idx_sponsors_suggested_person_id ON sponsors(suggested_person_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_contact_id          ON sponsors(contact_id);
