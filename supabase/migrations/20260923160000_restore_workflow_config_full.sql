-- ═══════════════════════════════════════════════════════════════════════
-- ПОЛНОЕ ВОССТАНОВЛЕНИЕ КОНФИГУРАЦИИ ДВИЖКА ПРОЦЕССОВ.
--
-- Сентябрьская очистка тестовых данных вычистила stage_transitions И
-- stage_finals — переходы между этапами и исходы, которыми этап закрывается.
-- Это конфигурация, а не операционные данные: без переходов start_process
-- падает (22023), без исходов ProcessInfoBlock не рисует ни одной кнопки, и
-- НИ ОДИН этап НИ В ОДНОМ из 4 процессов закрыть нельзя.
--
-- Почему эта миграция — конкатенация, а не выборка строк: конфигурацию
-- формируют ВОСЕМЬ миграций, а не четыре сида. Две предыдущие попытки
-- (20260923120000 — переходы; 20260923140000 — исходы, удалена как неполная)
-- собирались вручную по сидам и пропустили добавки из medical_split,
-- admission_benefits, admission_endings и repair_workflow_seeds — из-за чего
-- у acceptance/medical_psych не оказалось исходов и защита откатила всё.
--
-- Здесь исходные файлы склеены СКРИПТОМ, целиком и в хронологическом порядке.
-- Ни один из них не содержит своего BEGIN/COMMIT, поэтому склейка безопасна;
-- все вставки идемпотентны (ON CONFLICT / anti-join), а UPDATE и DELETE в них
-- точечные (переименование этапа врача; удаление устаревшего done_event_later).
--
-- Применять ВРУЧНУЮ в Supabase SQL Editor. Одна транзакция + проверка в конце.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════ источник: 20260703180000_admission_process_template.sql ══════════
-- Шаблон процесса «Приём» (admission): абитуриент → студент.
-- Запускается автоматически при переходе journey в статус 'applicant'
-- (хук в route-ах complete / close-early — см. код). Единоличное решение
-- (v1): один сотрудник рассматривает заявку и выбирает исход.
--
-- Этапы:
--   1. Приёмное решение (admission_decision) — задача сотруднику, финалы:
--        admitted             → студент (closes)
--        admitted_conditional → студент + флаг is_conditional_admission (closes)
--        rejected             → закрыть, остаётся applicant (closes)
--        waitlisted           → переход в «Список ожидания» (НЕ closes)
--   2. Список ожидания (waitlist) — процесс остаётся открытым; финалы:
--        admitted → студент (closes),  rejected → закрыть (closes)
--
-- Конверсию в 'student' по process_finish_reason 'admitted'/'admitted_conditional'
-- выполняет движок (complete_stage / close_process_early, см. 20260703170000).
-- Фиксированные UUID + ON CONFLICT DO NOTHING — идемпотентно.

-- 0. Колонки stage_finals.closes_process / process_finish_reason.
--    ЭТА миграция — первая, кто их использует (INSERT ниже). Формально их
--    «фиксирует» 20260724100000, но по дате она идёт ПОЗЖЕ, поэтому при чистом
--    прогоне по порядку колонок ещё нет и сиды падали. Заводим их здесь, до
--    первого использования (IF NOT EXISTS → на боевой/повторном прогоне no-op).
--    Держит порядок миграций корректным и для acceptance (20260713170000) и
--    medical (20260716140000), которые идут после этой.
ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS closes_process BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS process_finish_reason TEXT;

-- 1. Шаблон процесса
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ad000000-0000-4000-8000-000000000001', 'admission', 'Приём',
 'Процесс приёмной комиссии: абитуриент → студент', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order) VALUES
('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001',
 'admission_decision', 'Приёмное решение', true, 10),
('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001',
 'waitlist', 'Список ожидания', true, 20)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- Приёмное решение
('ad000000-0000-4000-8000-000000000101', 'ad000000-0000-4000-8000-000000000010',
 'admitted',             'Принят',            true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000102', 'ad000000-0000-4000-8000-000000000010',
 'admitted_conditional', 'Условно принят',    true,  true,  'admitted_conditional', 20),
('ad000000-0000-4000-8000-000000000103', 'ad000000-0000-4000-8000-000000000010',
 'waitlisted',           'В список ожидания', false, false, NULL,                   30),
('ad000000-0000-4000-8000-000000000104', 'ad000000-0000-4000-8000-000000000010',
 'rejected',             'Отклонён',          false, true,  'rejected',             40),
-- Список ожидания
('ad000000-0000-4000-8000-000000000201', 'ad000000-0000-4000-8000-000000000020',
 'admitted',             'Принят из списка',  true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000202', 'ad000000-0000-4000-8000-000000000020',
 'rejected',             'Отклонён из списка',false, true,  'rejected',             20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы: начальный → decision; decision --waitlisted--> waitlist
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- 5. Задачи этапов (default_assignee_type='creator' → назначается на того, кто
--    запустил процесс: сотрудник, конвертировавший лида в абитуриента). Нет
--    task_transitions → движок создаёт все задачи этапа (по одной на этап).
INSERT INTO stage_task_templates (id, stage_template_id, code, title, description, default_assignee_type, default_priority, sort_order) VALUES
('ad000000-0000-4000-8000-000000000401', 'ad000000-0000-4000-8000-000000000010',
 'make_decision', 'Рассмотреть заявку и принять решение',
 'Рассмотреть абитуриента и вынести приёмное решение.', 'creator', 'high', 10),
('ad000000-0000-4000-8000-000000000402', 'ad000000-0000-4000-8000-000000000020',
 'waitlist_review', 'Решение по списку ожидания',
 'Пересмотреть заявку из списка ожидания.', 'creator', 'normal', 10)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- ══════════ источник: 20260713170000_acceptance_process.sql ══════════
-- Процесс «Приёмная комиссия» (acceptance): многоэтапный приём абитуриент → студент.
-- Заменяет одноэтапный admission-v1 как авто-стартуемый процесс (см. смену
-- p_process_code в route-ах complete/close-early). Идемпотентно (фикс. UUID + ON CONFLICT).
--
-- Зависит от 20260713150000 (stage_templates.required_role_code / requires_signature).
--
-- Этапы (3 обязательных параллельных + условный врач + финал директора):
--   academic       (head_of_studies)      подпись — approved / rejected / refer_to_doctor
--   dormitory      (dorm_director)         подпись — approved / rejected / refer_to_doctor
--   jewishness     (jewishness_officer)    подпись — approved / rejected
--   medical        (doctor,psychologist)   подпись — approved / rejected   [активируется только refer_to_doctor]
--   final_approval (school_director)       подпись — admitted / admitted_conditional / rejected  (closes → student)
--
-- Все 3 обязательных стартуют сразу; final_approval активируется, когда ВСЕ ТРИ
-- достигли терминального статуса (after_all). medical — параллельный
-- информационный этап (директор видит его перед решением); он НЕ предок
-- final_approval, поэтому не влияет на join.

-- 1. Процесс
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ac000000-0000-4000-8000-000000000001', 'acceptance', 'Приёмная комиссия',
 'Многоэтапный приём: учёба, общежитие, еврейство, (врач), финальное утверждение', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы (с ролью-подписантом и требованием подписи)
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001', 'academic',       'Учебная проверка',     false, 10, 'head_of_studies',    true),
('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000001', 'dormitory',      'Общежитие',            false, 20, 'dorm_director',      true),
('ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000001', 'jewishness',     'Проверка еврейства',   false, 30, 'jewishness_officer', true),
('ac000000-0000-4000-8000-000000000040', 'ac000000-0000-4000-8000-000000000001', 'medical',        'Мед. заключение',      false, 40, 'doctor,psychologist', true),
('ac000000-0000-4000-8000-000000000050', 'ac000000-0000-4000-8000-000000000001', 'final_approval', 'Финальное утверждение',false, 50, 'school_director',    true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- academic
('ac000000-0000-4000-8000-000000000101', 'ac000000-0000-4000-8000-000000000010', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000102', 'ac000000-0000-4000-8000-000000000010', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000103', 'ac000000-0000-4000-8000-000000000010', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- dormitory
('ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000020', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000020', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000020', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- jewishness
('ac000000-0000-4000-8000-000000000301', 'ac000000-0000-4000-8000-000000000030', 'approved', 'Подтверждено', true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000302', 'ac000000-0000-4000-8000-000000000030', 'rejected', 'Отклонено',    false, false, NULL, 20),
-- medical (информационный)
('ac000000-0000-4000-8000-000000000401', 'ac000000-0000-4000-8000-000000000040', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000402', 'ac000000-0000-4000-8000-000000000040', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- final_approval (closes → student)
('ac000000-0000-4000-8000-000000000501', 'ac000000-0000-4000-8000-000000000050', 'admitted',             'Принята',         true,  true, 'admitted',             10),
('ac000000-0000-4000-8000-000000000502', 'ac000000-0000-4000-8000-000000000050', 'admitted_conditional', 'Условно принята', true,  true, 'admitted_conditional', 20),
('ac000000-0000-4000-8000-000000000503', 'ac000000-0000-4000-8000-000000000050', 'rejected',             'Отклонена',       false, true, 'rejected',             30)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- старт → 3 обязательных параллельных
('ac000000-0000-4000-8000-000000000601', NULL, 'ac000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ac000000-0000-4000-8000-000000000602', NULL, 'ac000000-0000-4000-8000-000000000020', NULL, 'after_one', 20),
('ac000000-0000-4000-8000-000000000603', NULL, 'ac000000-0000-4000-8000-000000000030', NULL, 'after_one', 30),
-- refer_to_doctor → medical (условная активация)
('ac000000-0000-4000-8000-000000000610', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 10),
('ac000000-0000-4000-8000-000000000611', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 20),
-- каждый обязательный финал → final_approval (after_all: активируется, когда ВСЕ 3 терминальны)
('ac000000-0000-4000-8000-000000000620', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 30),
('ac000000-0000-4000-8000-000000000621', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 31),
('ac000000-0000-4000-8000-000000000622', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 32),
('ac000000-0000-4000-8000-000000000630', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 33),
('ac000000-0000-4000-8000-000000000631', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 34),
('ac000000-0000-4000-8000-000000000632', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 35),
('ac000000-0000-4000-8000-000000000640', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 36),
('ac000000-0000-4000-8000-000000000641', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 37)
ON CONFLICT (id) DO NOTHING;

-- 5. Автозапуск переключается на 'acceptance' в коде route-ов; admission-v1
--    остаётся в БД для уже запущенных инстансов, но новым абитуриентам не стартует.

-- ══════════ источник: 20260716140000_medical_split_doctor_psych.sql ══════════
-- Разделение мед. этапа приёма на ВРАЧА и ПСИХОЛОГА (по просьбе владельца):
-- раньше был один этап `medical` (роль 'doctor,psychologist'), на который
-- направляли одним финалом `refer_to_doctor`. Теперь у учебной проверки и
-- общежития ДВЕ опции направления — к врачу ИЛИ к психологу — и каждый
-- профессионал получает свой этап и подписывает только его.
--
-- • `medical`  → только ВРАЧ  (required_role_code='doctor').
-- • `medical_psych` (новый, sort 45) → ПСИХОЛОГ (required_role_code='psychologist').
-- • academic/dormitory получают финал `refer_to_psychologist` + переходы к
--   medical_psych (after_one) и к final_approval (after_all) — зеркально
--   существующему refer_to_doctor, чтобы финальное утверждение не зависало.
--
-- medical/medical_psych остаются параллельными информационными этапами (как и
-- раньше, не предки final_approval): директор видит их статус в сводке подписей.
-- Уже запущенные инстансы не получают medical_psych (start_process уже отработал)
-- — согласовано с владельцем: старые абитуриентки идут по-старому, новые — с
-- двумя опциями. Идемпотентно (фикс. UUID + ON CONFLICT).

-- 1. medical → только врач
UPDATE stage_templates
  SET required_role_code = 'doctor', name_ru = 'Заключение врача'
  WHERE id = 'ac000000-0000-4000-8000-000000000040';

-- 2. Новый этап — психолог
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000045', 'ac000000-0000-4000-8000-000000000001', 'medical_psych', 'Заключение психолога', false, 45, 'psychologist', true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы этапа психолога
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000451', 'ac000000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000452', 'ac000000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Новый финал «направить к психологу» на учебной проверке и общежитии
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000104', 'ac000000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25),
('ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 5. Переходы для refer_to_psychologist (зеркало refer_to_doctor)
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- условная активация этапа психолога
('ac000000-0000-4000-8000-000000000612', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 12),
('ac000000-0000-4000-8000-000000000613', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 22),
-- after_all join к финалу (чтобы final_approval активировался и при этом финале)
('ac000000-0000-4000-8000-000000000650', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 38),
('ac000000-0000-4000-8000-000000000651', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 39)
ON CONFLICT (id) DO NOTHING;

-- ══════════ источник: 20260724110000_recruitment_process_seed.sql ══════════
-- ═════════════════════════════════════════════════════════════════════
-- Сид процесса «Набор» (recruitment) — версионируемый, в миграции.
--
-- ПРОБЛЕМА, которую чиним: рантайм уже запускает этот процесс автоматически
-- при создании лида (app/api/education/leads/route.ts, applications/route.ts,
-- public/applications/route.ts вызывают start_process('recruitment', …)), а
-- также handoff-кнопка и уведомления опираются на него. НО шаблон никогда не
-- заводился миграцией — только вручную через scripts/seed-workflow-recruitment.ts
-- (требует поднятый сервер + cookie суперадмина) и в docs/recruitment-template.md.
-- На БД, собранной из миграций, каждый автозапуск «Набора» тихо падает
-- (best-effort) и лид создаётся без процесса.
--
-- Эта миграция заводит шаблон согласно docs/recruitment-template.md (он же
-- бизнес-процесс «גיוס»): 4 подэтапа, задачи, финалы, переходы.
--
-- Структура:
--   contact   (has_action_log) — задача first_contact; финалы:
--       done_event_yes / done_event_skip / rejected(closes) / postponed(closes)
--   documents — ДВЕ ПАРАЛЛЕЛЬНЫЕ задачи collect_docs + verify_docs; финалы:
--       all_collected / partial / not_provided
--   event (optional) — ТРИ ПОСЛЕДОВАТЕЛЬНЫЕ задачи invite→arrange→feedback
--       (через task_transitions); финалы: feedback_received / no_show / refused
--   decision — задача make_decision; финалы:
--       convert_to_applicant(closes→converted) / rejected(closes) / postponed(closes)
--
-- Переходы: start→contact; contact→documents (yes|skip); contact→event (yes);
--           documents→decision (after_all); event→decision (after_all).
--
-- ИДЕМПОТЕНТНОСТЬ И БЕЗОПАСНОСТЬ: миграция написана как UPSERT (ON CONFLICT DO
-- UPDATE) и разрешает id по коду, поэтому корректно отрабатывает В ЛЮБОМ из
-- состояний — чистая БД, БД с частичным сидом от старого скрипта (там подэтапы
-- contact/event были has_tasks=false, была лишняя задача request_docs и финал
-- done_event_later — они здесь исправляются/удаляются). Не трогает уже
-- запущенные экземпляры процесса.
--
-- Зависит от 20260724100000 (stage_finals.closes_process / process_finish_reason).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_proc      UUID;
  v_contact   UUID;
  v_documents UUID;
  v_event     UUID;
  v_decision  UUID;
BEGIN
  -- 1. Процесс
  INSERT INTO process_templates (code, name_ru, description, is_active)
  VALUES ('recruitment', 'Набор',
          'Процесс работы с лидом до перевода в абитуриенты', true)
  ON CONFLICT (code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru,
        description = EXCLUDED.description,
        is_active = true
  RETURNING id INTO v_proc;

  -- 2. Подэтапы (UPSERT — исправляет has_tasks/optional при частичном старом сиде)
  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'contact', 'Контакт', true, true, false, false, 10)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_contact;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'documents', 'Документы', true, true, false, false, 20)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_documents;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'event', 'Мероприятие', true, true, true, false, 30)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_event;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'decision', 'Решение', true, true, false, false, 40)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_decision;

  -- 2b. Чистка артефактов старого скрипта (только если остались)
  DELETE FROM stage_task_templates
    WHERE stage_template_id = v_documents AND code = 'request_docs';
  DELETE FROM stage_transitions
    WHERE from_stage_template_id = v_contact AND trigger_final_code = 'done_event_later';
  DELETE FROM stage_finals
    WHERE stage_template_id = v_contact AND code = 'done_event_later';

  -- 3. Финалы (UPSERT — проставляет closes_process/reason и добавляет rejected/postponed)
  INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
  VALUES
    -- contact
    (v_contact,   'done_event_yes',       'Записан на мероприятие', true,  false, NULL,        10),
    (v_contact,   'done_event_skip',      'Без мероприятия',        true,  false, NULL,        20),
    (v_contact,   'rejected',             'Отказ',                  false, true,  'rejected',  30),
    (v_contact,   'postponed',            'Поступление отложено',   false, true,  'postponed', 40),
    -- documents
    (v_documents, 'all_collected',        'Все собраны',            true,  false, NULL,        10),
    (v_documents, 'partial',              'Частично собраны',       true,  false, NULL,        20),
    (v_documents, 'not_provided',         'Не предоставил',         false, false, NULL,        30),
    -- event
    (v_event,     'feedback_received',    'Обратная связь получена',true,  false, NULL,        10),
    (v_event,     'no_show',              'Не приехал',             false, false, NULL,        20),
    (v_event,     'refused',              'Отказ от приезда',       false, false, NULL,        30),
    -- decision
    (v_decision,  'convert_to_applicant', 'Перевести в абитуриенты',true,  true,  'converted', 10),
    (v_decision,  'rejected',             'Отказ',                  false, true,  'rejected',  20),
    (v_decision,  'postponed',            'Отложено',               false, true,  'postponed', 30)
  ON CONFLICT (stage_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru,
        is_positive = EXCLUDED.is_positive,
        closes_process = EXCLUDED.closes_process,
        process_finish_reason = EXCLUDED.process_finish_reason,
        sort_order = EXCLUDED.sort_order;

  -- 4. Задачи (UPSERT — добавляет first_contact / collect_docs+verify_docs /
  --    invite_event+arrange_trip+get_feedback / make_decision)
  INSERT INTO stage_task_templates (stage_template_id, code, title, default_assignee_type, default_priority, default_due_days, sort_order)
  VALUES
    (v_contact,   'first_contact', 'Связаться с новым лидом',    'creator', 'high',   2, 10),
    (v_documents, 'collect_docs',  'Собрать документы',          'creator', 'normal', 7, 10),
    (v_documents, 'verify_docs',   'Проверить документы',        'creator', 'normal', 7, 20),
    (v_event,     'invite_event',  'Пригласить на мероприятие',  'creator', 'normal', 5, 10),
    (v_event,     'arrange_trip',  'Организовать приезд',        'creator', 'normal', 7, 20),
    (v_event,     'get_feedback',  'Получить обратную связь',    'creator', 'normal', 7, 30),
    (v_decision,  'make_decision', 'Принять решение по лиду',    'creator', 'high',   3, 10)
  ON CONFLICT (stage_template_id, code) DO UPDATE
    SET title = EXCLUDED.title,
        default_assignee_type = EXCLUDED.default_assignee_type,
        default_priority = EXCLUDED.default_priority,
        default_due_days = EXCLUDED.default_due_days,
        sort_order = EXCLUDED.sort_order;

  -- 5. Переходы между подэтапами (anti-join: без natural unique key)
  INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
  SELECT x.f, x.t, x.trig, x.mode, x.so
  FROM (VALUES
    (NULL::uuid, v_contact,   NULL::text,          'after_one', 10),
    (v_contact,  v_documents, 'done_event_yes',    'after_one', 20),
    (v_contact,  v_documents, 'done_event_skip',   'after_one', 30),
    (v_contact,  v_event,     'done_event_yes',    'after_one', 40),
    (v_documents,v_decision,  'all_collected',     'after_all', 50),
    (v_documents,v_decision,  'partial',           'after_all', 51),
    (v_documents,v_decision,  'not_provided',      'after_all', 52),
    (v_event,    v_decision,  'feedback_received', 'after_all', 60),
    (v_event,    v_decision,  'no_show',           'after_all', 61),
    (v_event,    v_decision,  'refused',           'after_all', 62)
  ) AS x(f, t, trig, mode, so)
  WHERE NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id IS NOT DISTINCT FROM x.f
      AND st.to_stage_template_id = x.t
      AND st.trigger_final_code IS NOT DISTINCT FROM x.trig
  );

  -- 6. Переходы между задачами внутри «Мероприятия» (3 последовательные задачи)
  INSERT INTO task_transitions (stage_template_id, from_task_code, to_task_code, activation_mode, sort_order)
  SELECT v_event, x.frm, x.toc, 'after_one', x.so
  FROM (VALUES
    (NULL::text,      'invite_event', 10),
    ('invite_event',  'arrange_trip', 20),
    ('arrange_trip',  'get_feedback', 30)
  ) AS x(frm, toc, so)
  WHERE NOT EXISTS (
    SELECT 1 FROM task_transitions tt
    WHERE tt.stage_template_id = v_event
      AND tt.from_task_code IS NOT DISTINCT FROM x.frm
      AND tt.to_task_code = x.toc
  );
END $$;

-- ══════════ источник: 20260724130000_admission_benefits_and_contract.sql ══════════
-- ═════════════════════════════════════════════════════════════════════
-- Льготы приёма: уровень поддержки (תמיכה) + скидка (הנחה) + договор (חוזה).
-- Stage 2 ремонта бизнес-процесса «קבלה».
--
-- По бизнес-процессу (v2): проверка еврейства определяет ГОБА ТМИХА (сумма
-- поддержки/стипендии, которую МОСД ДАЁТ студентке) и ГОБА ХАНАХА (скидка % на
-- שכר לימוד). Оба сохраняются в профиле абитуриентки и переносятся в договор.
-- Решение владельца: תמיכה = денежная сумма (support_amount); скидка = процент;
-- договор ИНТЕГРИРУЕТСЯ с существующим финансовым модулем (не дублирует его).
--
-- Здесь только СХЕМА (deploy-safe, аддитивно). Логика (простановка при
-- завершении этапа 'jewishness', авто-создание договора при 'admitted',
-- подсказка скидки в финансах) — в коде, отдельными шагами.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Поля льгот на профиле (education_journeys). Все nullable. ──────
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS tuition_discount_percent numeric(5,2)
    CHECK (tuition_discount_percent >= 0 AND tuition_discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS support_amount numeric(12,2)
    CHECK (support_amount >= 0),
  ADD COLUMN IF NOT EXISTS benefits_notes  text,
  ADD COLUMN IF NOT EXISTS benefits_set_by uuid REFERENCES persons(id),
  ADD COLUMN IF NOT EXISTS benefits_set_at timestamptz;

COMMENT ON COLUMN education_journeys.tuition_discount_percent IS
  'Скидка на שכר לимуд (%), по итогам проверки еврейства. Переносится в договор и подсказывается в финансах';
COMMENT ON COLUMN education_journeys.support_amount IS
  'Сумма поддержки/стипендии (תמיכה), которую мосд даёт студентке';

-- ── 2. Статус еврейства: добавляем 'partial' (אישור חלקי). ───────────
--    Частичное подтверждение ≠ отказ: приём продолжается, но льготы урезаны.
ALTER TABLE education_journeys
  DROP CONSTRAINT IF EXISTS education_journeys_jewishness_status_check;
ALTER TABLE education_journeys
  ADD CONSTRAINT education_journeys_jewishness_status_check
  CHECK (jewishness_status IN ('pending','verified','rejected','needs_review','partial'));

ALTER TABLE jewishness_status_history
  DROP CONSTRAINT IF EXISTS jewishness_status_history_status_check;
ALTER TABLE jewishness_status_history
  ADD CONSTRAINT jewishness_status_history_status_check
  CHECK (status IN ('pending','verified','rejected','needs_review','partial'));

-- ── 3. Финал 'partial' на этапе 'jewishness' процесса 'acceptance'. ───
--    Резолвим id по кодам (не по фикс-UUID) — устойчиво к любой БД.
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT st.id, 'partial', 'Подтверждено частично', true, false, NULL, 15
FROM stage_templates st
JOIN process_templates p ON p.id = st.process_template_id AND p.code = 'acceptance'
WHERE st.code = 'jewishness'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive, sort_order = EXCLUDED.sort_order;

-- Переход jewishness --partial--> final_approval (after_all), как approved/rejected.
INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
SELECT js.id, fa.id, 'partial', 'after_all', 38
FROM stage_templates js
JOIN process_templates p  ON p.id = js.process_template_id AND p.code = 'acceptance'
JOIN stage_templates fa   ON fa.process_template_id = p.id AND fa.code = 'final_approval'
WHERE js.code = 'jewishness'
  AND NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id = js.id
      AND st.to_stage_template_id = fa.id
      AND st.trigger_final_code = 'partial'
  );

-- ── 4. Договор (חוזה) — лёгкая запись, интегрируется с финансами. ─────
--    Копирует скидку/поддержку/льготы из профиля при приёме; связывает
--    с финансовым модулем через journey_id (счета/скидки уже висят на journey).
CREATE TABLE IF NOT EXISTS admission_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  tuition_discount_percent numeric(5,2)
    CHECK (tuition_discount_percent >= 0 AND tuition_discount_percent <= 100),
  support_amount numeric(12,2) CHECK (support_amount >= 0),
  benefits_notes text,
  status        text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','void')),
  created_by    uuid REFERENCES persons(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Не более одного действующего договора на journey.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_contracts_active_journey
  ON admission_contracts (journey_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_admission_contracts_journey
  ON admission_contracts (journey_id);

-- Политика проекта (20260908120000): КАЖДАЯ таблица public включает RLS без
-- политик — deny-all для anon/authenticated, а приложение ходит service_role'ом
-- и RLS обходит. Исходная миграция создавала admission_contracts ДО введения
-- правила, поэтому здесь его нужно применить явно: иначе склейка воссоздала бы
-- таблицу, открытую публичным ключом в обход приложения.
ALTER TABLE admission_contracts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admission_contracts IS
  'Договор с абитуриенткой (חוזה): скидка/поддержка/льготы, создаётся при приёме, связан с финансами через journey_id';

-- ══════════ источник: 20260724140000_admission_endings.sql ══════════
-- ═════════════════════════════════════════════════════════════════════
-- Дополнительные финалы процесса приёма (acceptance) — Stage 3.
-- Аддитивно и безопасно: НЕ меняет структуру этапов (по решению владельца
-- общежитие оставляем как есть — один этап, без 3 последовательных интервью).
-- Только добавляем исходы, которых требует бизнес-процесс v2:
--
--   • academic       + 'exam_required'    (נדרשים מבחני קבלה) — не закрывает,
--       ведёт в final_approval (after_all), как и остальные академ-финалы.
--   • final_approval + 'external_studies' (לימודים חיצוניים) — закрывает процесс,
--       reason='external_studies'. НЕ конвертирует в студентку автоматически
--       (форма обучения требует ручного оформления — «דורש הבהרה» в документе).
--   • final_approval + 'postponed'        (קבלה נדחית — абитуриентка отложила) —
--       закрывает процесс, reason='postponed'. Без конвертации.
--
-- id этапов резолвим по кодам (не по фикс-UUID) — устойчиво к любой БД.
-- Идемпотентно. Зависит от 20260724100000 (closes_process/process_finish_reason).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- 1. academic → 'exam_required'
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT st.id, 'exam_required', 'Нужны вступительные экзамены', false, false, NULL, 15
FROM stage_templates st
JOIN process_templates p ON p.id = st.process_template_id AND p.code = 'acceptance'
WHERE st.code = 'academic'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive,
      closes_process = EXCLUDED.closes_process, sort_order = EXCLUDED.sort_order;

-- academic --exam_required--> final_approval (after_all), как approved/rejected.
INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
SELECT ac.id, fa.id, 'exam_required', 'after_all', 39
FROM stage_templates ac
JOIN process_templates p ON p.id = ac.process_template_id AND p.code = 'acceptance'
JOIN stage_templates fa ON fa.process_template_id = p.id AND fa.code = 'final_approval'
WHERE ac.code = 'academic'
  AND NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id = ac.id
      AND st.to_stage_template_id = fa.id
      AND st.trigger_final_code = 'exam_required'
  );

-- 2. final_approval → 'external_studies' + 'postponed' (оба закрывают процесс)
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT fa.id, v.code, v.name_ru, v.is_positive, true, v.reason, v.sort_order
FROM stage_templates fa
JOIN process_templates p ON p.id = fa.process_template_id AND p.code = 'acceptance'
CROSS JOIN (VALUES
  ('external_studies', 'Внешнее обучение', true,  'external_studies', 40),
  ('postponed',        'Приём отложен',    false, 'postponed',        50)
) AS v(code, name_ru, is_positive, reason, sort_order)
WHERE fa.code = 'final_approval'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive,
      closes_process = EXCLUDED.closes_process,
      process_finish_reason = EXCLUDED.process_finish_reason,
      sort_order = EXCLUDED.sort_order;

-- ══════════ источник: 20260724160000_repair_workflow_seeds.sql ══════════
-- ═════════════════════════════════════════════════════════════════════
-- РЕМОНТ сидов процессов, пострадавших от порядка миграций.
--
-- КОРЕНЬ: колонки stage_finals.closes_process / process_finish_reason
-- создавались миграцией с датой 20260724100000, а ИСПОЛЬЗОВАЛИСЬ тремя более
-- ранними миграциями (в INSERT ... stage_finals):
--   • 20260703180000_admission_process_template.sql   (процесс 'admission' v1)
--   • 20260713170000_acceptance_process.sql           (процесс 'acceptance')
--   • 20260716140000_medical_split_doctor_psych.sql   (этап психолога + направления)
-- При применении по порядку на чистой/staging БД эти три падали на
-- «column closes_process does not exist», их INSERT'ы финалов/переходов НЕ
-- применялись, и процесс 'acceptance' оставался БЕЗ финалов и БЕЗ стартовых
-- переходов → start_process('acceptance') падал («У процесса нет начальных
-- этапов»), перевод в приёмную комиссию был невозможен.
--
-- Порядок исправлен: 20260703180000 теперь сам заводит колонки в самом начале
-- (до первого использования). На СВЕЖЕЙ БД этот ремонт — чистый no-op.
-- На уже накатанной (боевой/staging) БД он ИДЕМПОТЕНТНО до-заводит недостающие
-- строки. Блоки НИЖЕ — ДОСЛОВНЫЕ копии канонических INSERT'ов из исходных
-- миграций (те же фикс. UUID + ON CONFLICT), поэтому граф совпадает с сидом
-- байт-в-байт. Ничего не удаляет и не трогает запущенные экземпляры.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- Страховка: гарантируем колонки (на случай применения в отрыве).
ALTER TABLE stage_finals ADD COLUMN IF NOT EXISTS closes_process boolean NOT NULL DEFAULT false;
ALTER TABLE stage_finals ADD COLUMN IF NOT EXISTS process_finish_reason text;

-- ─────────────────────────────────────────────────────────────────────
-- A. Процесс 'acceptance' (дословно из 20260713170000).
-- ─────────────────────────────────────────────────────────────────────
-- A.1 Шаблон процесса
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ac000000-0000-4000-8000-000000000001', 'acceptance', 'Приёмная комиссия',
 'Многоэтапный приём: учёба, общежитие, еврейство, (врач), финальное утверждение', true)
ON CONFLICT (code) DO NOTHING;

-- A.2 Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001', 'academic',       'Учебная проверка',     false, 10, 'head_of_studies',    true),
('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000001', 'dormitory',      'Общежитие',            false, 20, 'dorm_director',      true),
('ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000001', 'jewishness',     'Проверка еврейства',   false, 30, 'jewishness_officer', true),
('ac000000-0000-4000-8000-000000000040', 'ac000000-0000-4000-8000-000000000001', 'medical',        'Мед. заключение',      false, 40, 'doctor,psychologist', true),
('ac000000-0000-4000-8000-000000000050', 'ac000000-0000-4000-8000-000000000001', 'final_approval', 'Финальное утверждение',false, 50, 'school_director',    true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- A.3 Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- academic
('ac000000-0000-4000-8000-000000000101', 'ac000000-0000-4000-8000-000000000010', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000102', 'ac000000-0000-4000-8000-000000000010', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000103', 'ac000000-0000-4000-8000-000000000010', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- dormitory
('ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000020', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000020', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000020', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- jewishness
('ac000000-0000-4000-8000-000000000301', 'ac000000-0000-4000-8000-000000000030', 'approved', 'Подтверждено', true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000302', 'ac000000-0000-4000-8000-000000000030', 'rejected', 'Отклонено',    false, false, NULL, 20),
-- medical (информационный)
('ac000000-0000-4000-8000-000000000401', 'ac000000-0000-4000-8000-000000000040', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000402', 'ac000000-0000-4000-8000-000000000040', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- final_approval (closes → student)
('ac000000-0000-4000-8000-000000000501', 'ac000000-0000-4000-8000-000000000050', 'admitted',             'Принята',         true,  true, 'admitted',             10),
('ac000000-0000-4000-8000-000000000502', 'ac000000-0000-4000-8000-000000000050', 'admitted_conditional', 'Условно принята', true,  true, 'admitted_conditional', 20),
('ac000000-0000-4000-8000-000000000503', 'ac000000-0000-4000-8000-000000000050', 'rejected',             'Отклонена',       false, true, 'rejected',             30)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- A.4 Переходы
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- старт → 3 обязательных параллельных
('ac000000-0000-4000-8000-000000000601', NULL, 'ac000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ac000000-0000-4000-8000-000000000602', NULL, 'ac000000-0000-4000-8000-000000000020', NULL, 'after_one', 20),
('ac000000-0000-4000-8000-000000000603', NULL, 'ac000000-0000-4000-8000-000000000030', NULL, 'after_one', 30),
-- refer_to_doctor → medical (условная активация)
('ac000000-0000-4000-8000-000000000610', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 10),
('ac000000-0000-4000-8000-000000000611', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 20),
-- каждый обязательный финал → final_approval (after_all: активируется, когда ВСЕ 3 терминальны)
('ac000000-0000-4000-8000-000000000620', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 30),
('ac000000-0000-4000-8000-000000000621', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 31),
('ac000000-0000-4000-8000-000000000622', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 32),
('ac000000-0000-4000-8000-000000000630', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 33),
('ac000000-0000-4000-8000-000000000631', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 34),
('ac000000-0000-4000-8000-000000000632', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 35),
('ac000000-0000-4000-8000-000000000640', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 36),
('ac000000-0000-4000-8000-000000000641', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 37)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- B. Разделение мед. этапа (дословно из 20260716140000).
-- ─────────────────────────────────────────────────────────────────────
-- B.1 medical → врач
UPDATE stage_templates
  SET required_role_code = 'doctor', name_ru = 'Заключение врача'
  WHERE id = 'ac000000-0000-4000-8000-000000000040';

-- B.2 Этап психолога
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000045', 'ac000000-0000-4000-8000-000000000001', 'medical_psych', 'Заключение психолога', false, 45, 'psychologist', true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- B.3 Финалы психолога
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000451', 'ac000000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000452', 'ac000000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- B.4 Финал «к психологу»
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000104', 'ac000000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25),
('ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- B.5 Переходы к психологу
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- условная активация этапа психолога
('ac000000-0000-4000-8000-000000000612', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 12),
('ac000000-0000-4000-8000-000000000613', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 22),
-- after_all join к финалу (чтобы final_approval активировался и при этом финале)
('ac000000-0000-4000-8000-000000000650', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 38),
('ac000000-0000-4000-8000-000000000651', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 39)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- C. Процесс 'admission' v1 (дословно из 20260703180000). Деактивирован
--    миграцией 20260724120000, но восстанавливаем для целостности истории.
-- ─────────────────────────────────────────────────────────────────────
-- C.1 Шаблон
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ad000000-0000-4000-8000-000000000001', 'admission', 'Приём',
 'Процесс приёмной комиссии: абитуриент → студент', true)
ON CONFLICT (code) DO NOTHING;

-- C.2 Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order) VALUES
('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001',
 'admission_decision', 'Приёмное решение', true, 10),
('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001',
 'waitlist', 'Список ожидания', true, 20)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- C.3 Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- Приёмное решение
('ad000000-0000-4000-8000-000000000101', 'ad000000-0000-4000-8000-000000000010',
 'admitted',             'Принят',            true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000102', 'ad000000-0000-4000-8000-000000000010',
 'admitted_conditional', 'Условно принят',    true,  true,  'admitted_conditional', 20),
('ad000000-0000-4000-8000-000000000103', 'ad000000-0000-4000-8000-000000000010',
 'waitlisted',           'В список ожидания', false, false, NULL,                   30),
('ad000000-0000-4000-8000-000000000104', 'ad000000-0000-4000-8000-000000000010',
 'rejected',             'Отклонён',          false, true,  'rejected',             40),
-- Список ожидания
('ad000000-0000-4000-8000-000000000201', 'ad000000-0000-4000-8000-000000000020',
 'admitted',             'Принят из списка',  true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000202', 'ad000000-0000-4000-8000-000000000020',
 'rejected',             'Отклонён из списка',false, true,  'rejected',             20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- C.4 Переходы
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- C.5 Задачи
INSERT INTO stage_task_templates (id, stage_template_id, code, title, description, default_assignee_type, default_priority, sort_order) VALUES
('ad000000-0000-4000-8000-000000000401', 'ad000000-0000-4000-8000-000000000010',
 'make_decision', 'Рассмотреть заявку и принять решение',
 'Рассмотреть абитуриента и вынести приёмное решение.', 'creator', 'high', 10),
('ad000000-0000-4000-8000-000000000402', 'ad000000-0000-4000-8000-000000000020',
 'waitlist_review', 'Решение по списку ожидания',
 'Пересмотреть заявку из списка ожидания.', 'creator', 'normal', 10)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- ══════════ источник: 20260813120000_acceptance_v2_sequential.sql ══════════
-- ═════════════════════════════════════════════════════════════════════
-- Приём v2 — ПОСЛЕДОВАТЕЛЬНАЯ версия процесса «Приёмная комиссия».
--
-- По бизнес-процессу v2 (החלטת בעל המוצר: A+): приём идёт ЦЕПОЧКОЙ
--   בדיקת יהדות → בדיקת לימודים → פנימייה (מותנה) → אישור סופי (רישום),
-- а не параллельным комитетом, как в исходном процессе `acceptance`.
--
-- ВАЖНО — изоляция от уже запущенных приёмов:
--   Это ОТДЕЛЬНЫЙ шаблон с новым кодом `acceptance_v2`. Существующий процесс
--   `acceptance` (параллельный комитет) НЕ трогается — все абитуриентки,
--   которые уже В процессе, продолжают по-старому. Последовательный порядок
--   применяется ТОЛЬКО к тем, кто входит С ЭТОГО МОМЕНТА (авто-старт в коде
--   route переключается на `acceptance_v2` отдельным шагом ПОСЛЕ этой миграции).
--
-- Коды этапов / ролей / финалов — ИДЕНТИЧНЫ исходному `acceptance`, поэтому вся
-- существующая логика (подпись по роли, льготы на этапе jewishness, гейтинг
-- needs_dormitory, ссылки врача/психолога) работает без изменений — отличается
-- ТОЛЬКО граф переходов (последовательный) и код процесса.
--
-- Граф:
--   (start) → jewishness
--   jewishness  --approved/partial-->        academic          ; --rejected--> ЗАКРЫВАЕТ
--   academic    --approved/exam_required-->  dormitory         ; --rejected--> ЗАКРЫВАЕТ
--   academic    --refer_to_doctor-->         dormitory + medical
--   academic    --refer_to_psychologist-->   dormitory + medical_psych
--   dormitory   --approved-->                final_approval    ; --rejected--> ЗАКРЫВАЕТ
--   dormitory   --refer_to_doctor-->         final_approval + medical
--   dormitory   --refer_to_psychologist-->   final_approval + medical_psych
--   medical / medical_psych — параллельные ИНФОРМАЦИОННЫЕ (не ведут дальше).
--   final_approval — admitted/admitted_conditional/rejected/external_studies/postponed (все закрывают).
--
-- Условная פנימייה: если needs_dormitory=false, функция
-- acceptance_apply_dormitory_gating пропускает dormitory и активирует
-- final_approval (предшественник final_approval здесь = только dormitory).
-- Гейтинг обновляется отдельной миграцией, чтобы охватывать и этот шаблон.
--
-- Отличие от исходного `acceptance`: финалы `rejected` на jewishness/academic/
-- dormitory теперь ЗАКРЫВАЮТ процесс (closes_process=true, reason='rejected'),
-- по решению владельца — с возможностью позже открыть приём заново (reopen —
-- отдельный шаг). В старом `acceptance` rejected вёл к final_approval.
--
-- Аддитивно, идемпотентно (фикс. UUID + ON CONFLICT). Применять ВРУЧНУЮ в
-- Supabase SQL Editor. Ничего не удаляет и не трогает запущенные экземпляры.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Процесс
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ac200000-0000-4000-8000-000000000001', 'acceptance_v2', 'Приёмная комиссия (последовательная)',
 'Последовательный приём: еврейство → учёба → пансион (условно) → финальное утверждение', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы (те же коды/роли/подпись, что и в acceptance; отличается только граф)
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac200000-0000-4000-8000-000000000030', 'ac200000-0000-4000-8000-000000000001', 'jewishness',     'Проверка еврейства',    false, 10, 'jewishness_officer', true),
('ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000001', 'academic',       'Учебная проверка',      false, 20, 'head_of_studies',    true),
('ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000001', 'dormitory',      'Общежитие',             false, 30, 'dorm_director',      true),
('ac200000-0000-4000-8000-000000000040', 'ac200000-0000-4000-8000-000000000001', 'medical',        'Заключение врача',      false, 40, 'doctor',             true),
('ac200000-0000-4000-8000-000000000045', 'ac200000-0000-4000-8000-000000000001', 'medical_psych',  'Заключение психолога',  false, 45, 'psychologist',       true),
('ac200000-0000-4000-8000-000000000050', 'ac200000-0000-4000-8000-000000000001', 'final_approval', 'Финальное утверждение', false, 50, 'school_director',    true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- jewishness
('ac200000-0000-4000-8000-000000000301', 'ac200000-0000-4000-8000-000000000030', 'approved', 'Подтверждено',         true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000302', 'ac200000-0000-4000-8000-000000000030', 'partial',  'Подтверждено частично',true,  false, NULL,       15),
('ac200000-0000-4000-8000-000000000303', 'ac200000-0000-4000-8000-000000000030', 'rejected', 'Отклонено',            false, true,  'rejected', 20),
-- academic
('ac200000-0000-4000-8000-000000000101', 'ac200000-0000-4000-8000-000000000010', 'approved',              'Одобрено',              true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000105', 'ac200000-0000-4000-8000-000000000010', 'exam_required',         'Нужны вступит. экзамены',false, false, NULL,       15),
('ac200000-0000-4000-8000-000000000102', 'ac200000-0000-4000-8000-000000000010', 'refer_to_doctor',       'Направить к врачу',     false, false, NULL,       20),
('ac200000-0000-4000-8000-000000000104', 'ac200000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL,       25),
('ac200000-0000-4000-8000-000000000103', 'ac200000-0000-4000-8000-000000000010', 'rejected',              'Отклонено',             false, true,  'rejected', 30),
-- dormitory
('ac200000-0000-4000-8000-000000000201', 'ac200000-0000-4000-8000-000000000020', 'approved',              'Одобрено',              true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000202', 'ac200000-0000-4000-8000-000000000020', 'refer_to_doctor',       'Направить к врачу',     false, false, NULL,       20),
('ac200000-0000-4000-8000-000000000204', 'ac200000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL,       25),
('ac200000-0000-4000-8000-000000000203', 'ac200000-0000-4000-8000-000000000020', 'rejected',              'Отклонено',             false, true,  'rejected', 30),
-- medical (информационный)
('ac200000-0000-4000-8000-000000000401', 'ac200000-0000-4000-8000-000000000040', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac200000-0000-4000-8000-000000000402', 'ac200000-0000-4000-8000-000000000040', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- medical_psych (информационный)
('ac200000-0000-4000-8000-000000000451', 'ac200000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac200000-0000-4000-8000-000000000452', 'ac200000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- final_approval (все закрывают процесс)
('ac200000-0000-4000-8000-000000000501', 'ac200000-0000-4000-8000-000000000050', 'admitted',             'Принята',         true,  true, 'admitted',             10),
('ac200000-0000-4000-8000-000000000502', 'ac200000-0000-4000-8000-000000000050', 'admitted_conditional', 'Условно принята', true,  true, 'admitted_conditional', 20),
('ac200000-0000-4000-8000-000000000504', 'ac200000-0000-4000-8000-000000000050', 'external_studies',     'Внешнее обучение',true,  true, 'external_studies',     30),
('ac200000-0000-4000-8000-000000000505', 'ac200000-0000-4000-8000-000000000050', 'postponed',            'Отложено',        false, true, 'postponed',            40),
('ac200000-0000-4000-8000-000000000503', 'ac200000-0000-4000-8000-000000000050', 'rejected',             'Отклонена',       false, true, 'rejected',             50)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы (последовательные)
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- старт → еврейство (единственный начальный этап)
('ac200000-0000-4000-8000-000000000600', NULL, 'ac200000-0000-4000-8000-000000000030', NULL, 'after_one', 10),
-- еврейство → учёба
('ac200000-0000-4000-8000-000000000610', 'ac200000-0000-4000-8000-000000000030', 'ac200000-0000-4000-8000-000000000010', 'approved', 'after_one', 10),
('ac200000-0000-4000-8000-000000000611', 'ac200000-0000-4000-8000-000000000030', 'ac200000-0000-4000-8000-000000000010', 'partial',  'after_one', 11),
-- учёба → пансион (любой не-отклоняющий финал ведёт дальше по цепочке)
('ac200000-0000-4000-8000-000000000620', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'approved',              'after_one', 10),
('ac200000-0000-4000-8000-000000000621', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'exam_required',         'after_one', 11),
('ac200000-0000-4000-8000-000000000622', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'refer_to_doctor',       'after_one', 12),
('ac200000-0000-4000-8000-000000000623', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'after_one', 13),
-- учёба → консультации (параллельно, информационно)
('ac200000-0000-4000-8000-000000000630', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000040', 'refer_to_doctor',       'after_one', 20),
('ac200000-0000-4000-8000-000000000631', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 21),
-- пансион → финал
('ac200000-0000-4000-8000-000000000640', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'approved',              'after_one', 10),
('ac200000-0000-4000-8000-000000000641', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'refer_to_doctor',       'after_one', 11),
('ac200000-0000-4000-8000-000000000642', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_one', 12),
-- пансион → консультации (параллельно, информационно)
('ac200000-0000-4000-8000-000000000650', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000040', 'refer_to_doctor',       'after_one', 20),
('ac200000-0000-4000-8000-000000000651', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 21)
ON CONFLICT (id) DO NOTHING;

-- ─── ПРОВЕРКА ─────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT pt.code AS proc, st.code AS stage
      FROM stage_templates st
      JOIN process_templates pt ON pt.id = st.process_template_id
     WHERE NOT EXISTS (SELECT 1 FROM stage_finals sf WHERE sf.stage_template_id = st.id)
  LOOP
    RAISE EXCEPTION 'У этапа «%» процесса «%» нет исходов — откат', r.stage, r.proc;
  END LOOP;

  FOR r IN
    SELECT pt.code AS proc, pt.code AS stage
      FROM process_templates pt
     WHERE NOT EXISTS (
       SELECT 1 FROM stage_transitions tr
         JOIN stage_templates st ON st.id = tr.to_stage_template_id
        WHERE st.process_template_id = pt.id AND tr.from_stage_template_id IS NULL)
  LOOP
    RAISE EXCEPTION 'У процесса «%» нет начальных этапов — откат', r.proc;
  END LOOP;
END $$;

COMMIT;
