-- ─────────────────────────────────────────────────────────────────────────────
-- Quality Control module — templates + checks
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1. TEMPLATES (шаблоны проверок)
-- ─────────────────────────────────────────────

CREATE TABLE quality_check_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,

  -- JSON array of blocks, each containing an array of questions.
  -- Block example:
  --   { "id": "block_2", "title": "...", "order": 2,
  --     "questions": [
  --       { "id": "q1", "text": "...", "type": "scale_1_5",
  --         "required": true, "order": 1 }
  --     ]
  --   }
  --
  -- Supported question types:
  --   scale_1_5   — rating 1–5
  --   number      — integer/decimal input
  --   text_short  — single-line text
  --   text_long   — multi-line textarea
  --   yes_no_partial — Да / Нет / Частично
  --
  -- Block 1 (admin_info) and Block 9 (summary) are structural:
  -- their data is stored in dedicated columns on quality_checks,
  -- but they are included in the template so the UI can render them
  -- in correct order with the right labels.
  structure   JSONB NOT NULL,

  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES persons(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. CHECKS (проверки уроков)
-- ─────────────────────────────────────────────

CREATE TABLE quality_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES quality_check_templates(id),

  -- Lesson / session info (Block 1 — admin info)
  lesson_date          DATE NOT NULL,
  lesson_time          TIME NOT NULL,
  observer_person_id   UUID NOT NULL REFERENCES persons(id),
  teacher_person_id    UUID NOT NULL REFERENCES persons(id),
  group_name           TEXT,
  course_name          TEXT,

  -- Organisational details (optional)
  started_on_time  BOOLEAN,
  delay_minutes    INTEGER,
  delay_reason     TEXT,
  technical_issues TEXT,

  -- Question answers (Blocks 2–8).
  -- Keyed by question id from the template, e.g.:
  --   { "q1":  { "value": 4, "comment": "Чётко обозначила тему" },
  --     "q10": { "value": 12 },
  --     "q14": { "value": "Один студент разговаривал" } }
  answers JSONB,

  -- Summary (Block 9 — stored as dedicated columns for easy querying)
  strengths             TEXT,
  areas_for_improvement TEXT,
  action_item           TEXT,
  overall_rating        INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  teacher_feedback      TEXT,

  -- Lifecycle
  status       TEXT NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_by   UUID REFERENCES persons(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────

CREATE INDEX idx_quality_checks_teacher   ON quality_checks(teacher_person_id);
CREATE INDEX idx_quality_checks_observer  ON quality_checks(observer_person_id);
CREATE INDEX idx_quality_checks_date      ON quality_checks(lesson_date);
CREATE INDEX idx_quality_checks_status    ON quality_checks(status);
CREATE INDEX idx_quality_templates_active ON quality_check_templates(is_active);

-- ─────────────────────────────────────────────
-- 4. DEFAULT TEMPLATE — "Проверка урока (полная)"
-- ─────────────────────────────────────────────

INSERT INTO quality_check_templates (name, description, structure, is_active)
VALUES (
  'Проверка урока (полная)',
  'Подробная оценка качества преподавания по 9 критериям',
  $template$
  {
    "blocks": [
      {
        "id": "block_1",
        "title": "Административная информация",
        "order": 1,
        "type": "admin_info",
        "questions": []
      },
      {
        "id": "block_2",
        "title": "План и цель урока",
        "order": 2,
        "questions": [
          {
            "id": "q1",
            "text": "Преподаватель открыла урок с чётко сформулированной целью",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q2",
            "text": "Содержание урока соответствует заявленным целям",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q3",
            "text": "Цели урока были понятны ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q4",
            "text": "Материал урока соответствует уровню и потребностям группы",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          },
          {
            "id": "q5",
            "text": "Преподаватель придерживалась запланированной структуры урока",
            "type": "scale_1_5",
            "required": true,
            "order": 5
          }
        ]
      },
      {
        "id": "block_3",
        "title": "Качество объяснения",
        "order": 3,
        "questions": [
          {
            "id": "q6",
            "text": "Ясность и доступность объяснений",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q7",
            "text": "Использование примеров и аналогий для иллюстрации материала",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q8",
            "text": "Систематическая проверка понимания материала",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q9",
            "text": "Оптимальный темп подачи материала",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_4",
        "title": "Вовлечённость учениц",
        "order": 4,
        "questions": [
          {
            "id": "q10",
            "text": "Количество активно участвующих учениц",
            "type": "number",
            "required": false,
            "order": 1
          },
          {
            "id": "q11",
            "text": "Общий уровень активности учениц на уроке",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q12",
            "text": "Качество взаимодействия преподавателя с ученицами",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q13",
            "text": "Вовлечённость учениц в самостоятельную работу",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_5",
        "title": "Управление классом",
        "order": 5,
        "questions": [
          {
            "id": "q14",
            "text": "Описание дисциплинарных ситуаций (при наличии)",
            "type": "text_short",
            "required": false,
            "order": 1
          },
          {
            "id": "q15",
            "text": "Общий контроль над классом",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q16",
            "text": "Эффективная реакция на отвлечения и нарушения",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q17",
            "text": "Поддержание рабочей атмосферы в классе",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_6",
        "title": "Личностный аспект",
        "order": 6,
        "questions": [
          {
            "id": "q18",
            "text": "Профессиональный облик и уверенность преподавателя",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q19",
            "text": "Уважительное и внимательное отношение к ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q20",
            "text": "Эмоциональный климат на уроке",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q21",
            "text": "Способность мотивировать и воодушевлять учениц",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_7",
        "title": "Методика",
        "order": 7,
        "questions": [
          {
            "id": "q22",
            "text": "Разнообразие методов и приёмов обучения",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q23",
            "text": "Использование наглядных и дидактических материалов",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q24",
            "text": "Применение дифференцированного подхода к ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          }
        ]
      },
      {
        "id": "block_8",
        "title": "Завершение урока",
        "order": 8,
        "questions": [
          {
            "id": "q25",
            "text": "Качество подведения итогов урока",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q26",
            "text": "Соответствие завершения урока поставленным целям",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q27",
            "text": "Задание домашней работы и разъяснение требований",
            "type": "scale_1_5",
            "required": false,
            "order": 3
          },
          {
            "id": "q28",
            "text": "Завершение урока в установленное время",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_9",
        "title": "Оценка и обратная связь",
        "order": 9,
        "type": "summary",
        "questions": [
          {
            "id": "q29",
            "text": "Сильные стороны урока",
            "type": "text_long",
            "required": true,
            "order": 1,
            "maps_to": "strengths"
          },
          {
            "id": "q30",
            "text": "Зоны для роста и улучшения",
            "type": "text_long",
            "required": true,
            "order": 2,
            "maps_to": "areas_for_improvement"
          },
          {
            "id": "q31",
            "text": "Рекомендации и конкретные шаги для улучшения",
            "type": "text_long",
            "required": true,
            "order": 3,
            "maps_to": "action_item"
          },
          {
            "id": "q32",
            "text": "Общая оценка урока",
            "type": "scale_1_5",
            "required": true,
            "order": 4,
            "maps_to": "overall_rating"
          },
          {
            "id": "q33",
            "text": "Комментарий преподавателя к проверке",
            "type": "text_long",
            "required": false,
            "order": 5,
            "maps_to": "teacher_feedback"
          }
        ]
      }
    ]
  }
  $template$::jsonb,
  true
);
