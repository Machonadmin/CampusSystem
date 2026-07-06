-- ═════════════════════════════════════════════════════════════════════
-- Расписание учебной группы: повторяющиеся недельные слоты
-- (class_schedule_slots).
--
-- СЛОТ — это ПОВТОРЯЮЩЕЕСЯ ПРАВИЛО ("каждый понедельник 10:00–11:30,
-- ауд. A"): день недели + время начала/конца + (опционально) аудитория.
-- У слота НЕТ даты. Это НЕ урок.
--
-- УРОК (lessons) — это ДАТИРОВАННЫЙ ЭКЗЕМПЛЯР ("понедельник 2026-03-02,
-- 10:00"). Уроки НЕ хранятся здесь и НЕ ссылаются на слоты: слот — лишь
-- шаблон. Конкретные строки lessons ПОРОЖДАЮТСЯ из слотов отдельным
-- действием API ("сгенерировать уроки за период"):
--   • строго ДОБАВЛЯЮЩЕЕ — только INSERT, никогда не UPDATE/DELETE уроков;
--   • ИДЕМПОТЕНТНОЕ — опирается на существующий UNIQUE
--     (class_group_id, scheduled_date, scheduled_time) таблицы lessons:
--     повтор за тот же период не создаёт дублей;
--   • не воскрешает и не трогает вручную созданные / отменённые уроки.
-- Поэтому FK lessons → slots сознательно НЕ вводится (уроки автономны,
-- слот можно удалить, не затрагивая прошлые уроки).
--
-- ПРАВА: новой привилегии НЕ вводим. Управление слотами и генерация
-- уроков переиспользуют education.set_lesson_topics (тот же код, что уже
-- гейтит создание/правку уроков) — он уже выдан системным ролям
-- (scope='all') и роли teacher (scope='own'), см. блок ниже.
--
-- Сознательно отложено (не входит в эту миграцию):
--   • общая (по всему кампусу) сетка расписания;
--   • детект конфликтов двойного бронирования (аудитория / преподаватель);
--   • праздники и исключения учебного календаря;
--   • переопределения на отдельную неделю / разовые сдвиги.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта, как в lessons/grades миграциях)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. CLASS_SCHEDULE_SLOTS (недельные слоты расписания группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_schedule_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- ISO: 1=Пн .. 7=Вс
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL CHECK (end_time > start_time),
  room            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES persons(id) ON DELETE SET NULL,

  CONSTRAINT class_schedule_slots_group_day_start_unique
    UNIQUE (class_group_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_class_schedule_slots_class_group
  ON class_schedule_slots(class_group_id);

DROP TRIGGER IF EXISTS set_updated_at_class_schedule_slots ON class_schedule_slots;
CREATE TRIGGER set_updated_at_class_schedule_slots
  BEFORE UPDATE ON class_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. ПРАВА — блока role_privileges нет намеренно.
--    Расписание переиспользует education.set_lesson_topics, который уже
--    выдан (системным ролям scope='all' — 20260511175354 и 20260705150000;
--    роли teacher scope='own' — 20260511175354, блок 4.8). Новых кодов и
--    грантов не требуется.
-- ─────────────────────────────────────────────
