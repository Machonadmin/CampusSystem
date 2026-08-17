-- ═════════════════════════════════════════════════════════════════════
-- הערכת הוראה — סקר סוף-סמסטר על ההוראה.
--
-- Владелец: и ученицы, и менеджеры оценивают преподавание («גם וגם»),
-- НЕ анонимно («עם שם»). Менеджер задаёт вопросы, открывает/закрывает сбор,
-- видит результаты по каждому преподавателю с разбивкой источник (ученица/менеджер).
--
-- Модель:
--   teaching_surveys           — сам сбор (заголовок, открыт/закрыт).
--   teaching_survey_questions  — вопросы (рейтинг 1–5 или текст), порядок.
--   teaching_survey_responses  — один респондент оценивает одного преподавателя
--                                в рамках одного сбора (с именем респондента).
--   teaching_survey_answers    — ответы на вопросы внутри отклика.
-- Идемпотентно, deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS teaching_surveys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  is_open      boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teaching_survey_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid NOT NULL REFERENCES teaching_surveys(id) ON DELETE CASCADE,
  text         text NOT NULL,
  kind         text NOT NULL DEFAULT 'rating' CHECK (kind IN ('rating','text')),
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tsq_survey ON teaching_survey_questions(survey_id);

CREATE TABLE IF NOT EXISTS teaching_survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id             uuid NOT NULL REFERENCES teaching_surveys(id) ON DELETE CASCADE,
  teacher_person_id     uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  respondent_person_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  respondent_role       text NOT NULL CHECK (respondent_role IN ('student','manager')),
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, teacher_person_id, respondent_person_id)
);
CREATE INDEX IF NOT EXISTS idx_tsr_survey  ON teaching_survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_tsr_teacher ON teaching_survey_responses(teacher_person_id);

CREATE TABLE IF NOT EXISTS teaching_survey_answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id  uuid NOT NULL REFERENCES teaching_survey_responses(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES teaching_survey_questions(id) ON DELETE CASCADE,
  rating       integer CHECK (rating BETWEEN 1 AND 5),
  text_value   text
);
CREATE INDEX IF NOT EXISTS idx_tsa_response ON teaching_survey_answers(response_id);
