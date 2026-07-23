-- Разовое включение студента в ростер конкретного урока («гость»).
-- Кейс (owner): девочка один раз приходит на урок ЧУЖОЙ группы — учитель должен
-- отметить ей посещаемость на этот урок, не записывая её в группу совсем.
--
-- Строка здесь = journey добавлен в ростер именно этого урока сверх обычных
-- записанных (class_enrollments). На агрегированную посещаемость её группы это
-- НЕ влияет (отчёт считает только уроки её собственных групп).
--
-- RLS: проект работает через service key без RLS — запускать без RLS.

create table if not exists lesson_roster_overrides (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references lessons(id) on delete cascade,
  journey_id  uuid not null references education_journeys(id) on delete cascade,
  created_by  uuid references persons(id),
  created_at  timestamptz not null default now(),
  unique (lesson_id, journey_id)
);

create index if not exists idx_lesson_roster_overrides_lesson
  on lesson_roster_overrides (lesson_id);
