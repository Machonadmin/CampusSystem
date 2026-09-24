-- ═════════════════════════════════════════════════════════════════════
-- Предмет и преподаватель НА УРОВНЕ СЛОТА расписания.
--
-- ЗАЧЕМ. Сегодня предмет берётся из class_groups.subject_id (один на всю
-- группу), а преподаватели — из class_teachers (тоже на группу). Поэтому в
-- сетке расписания НА КАЖДОМ слоте группы печатаются ВСЕ её преподаватели, и
-- нельзя сказать «этот урок ведёт Хана, а следующий — Двора». Ровно на это
-- жалуется заказчик.
--
-- Обе колонки NULLABLE, и NULL значит «наследовать от группы»: предмет группы
-- и полный список class_teachers — то есть сегодняшнее поведение. Бэкфилла НЕТ
-- намеренно: существующие слоты обязаны продолжать работать как раньше.
--
-- Новых привилегий не вводим: слотами по-прежнему управляет
-- education.set_lesson_topics.
--
-- Идемпотентно (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- Весь серверный код читает слоты через select('*') и терпит отсутствие этих
-- колонок, поэтому приложение работает и ДО применения миграции.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES persons(id) ON DELETE SET NULL;

-- Индекс под вопрос «где занят этот преподаватель» (пикер «תפוס» и проверка
-- двойного бронирования). Частичный: слотов без teacher_id большинство.
CREATE INDEX IF NOT EXISTS idx_class_schedule_slots_teacher
  ON class_schedule_slots(teacher_id) WHERE teacher_id IS NOT NULL;
