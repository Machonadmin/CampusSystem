-- Ограничение доступа к модулю «Учёба» по ролям — матрица, согласованная
-- владельцем (каждый видит только своё):
--   • recruiter (אחראי גיוס): только НАБОР. Убираем просмотр абитуриентов и
--     студентов (остаётся access, view_leads, manage_leads, convert_lead).
--   • head_of_studies (אחראי לימודים): ПРИЁМ (академ. этап + выбор трека) +
--     УЧЁБА с полным управлением. Убираем просмотр лидов; добавляем управление
--     учёбой.
--   • dorm_director / jewishness_officer (אחראי פנימייה / יהדות): только ПРИЁМ
--     (подпись своего этапа). Убираем просмотр лидов и студентов.
--   • Управление/директор и superadmin — НЕ трогаем (видят всё).
-- Видимость вкладок в UI считается по этим правам (view_leads / view_applicants /
-- view_students). Права грузятся из БД (кэш 30с) — перелогин не нужен.
--
-- ПРИМЕЧАНИЕ по scope: head_of_studies получает управление учёбой со scope='all'
-- (в учреждении сейчас один «אחראי לימודים»). Если появятся отдельные
-- заведующие учёбой по подразделениям — сузим до 'department'.
-- Идемпотентно (можно перезапускать).

DO $$
DECLARE rid uuid; pcode text;
BEGIN
  -- recruiter: только набор
  SELECT id INTO rid FROM roles WHERE code = 'recruiter';
  IF rid IS NOT NULL THEN
    DELETE FROM role_privileges
      WHERE role_id = rid AND module = 'education'
        AND privilege_code IN ('view_applicants', 'view_students');
  END IF;

  -- head_of_studies: приём + учёба (полное управление), без лидов
  SELECT id INTO rid FROM roles WHERE code = 'head_of_studies';
  IF rid IS NOT NULL THEN
    DELETE FROM role_privileges
      WHERE role_id = rid AND module = 'education'
        AND privilege_code = 'view_leads';
    FOR pcode IN VALUES
      ('view_applicants'), ('view_students'),
      ('manage_students'), ('manage_enrollments'),
      ('manage_class_groups'), ('manage_class_teachers'),
      ('mark_attendance'), ('set_grades'), ('set_lesson_topics'),
      ('manage_subjects'), ('manage_specialties'), ('manage_study_groups')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'education', pcode, 'all')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;

  -- dorm_director / jewishness_officer: только приём (свой этап подписи)
  FOR rid IN SELECT id FROM roles WHERE code IN ('dorm_director', 'jewishness_officer') LOOP
    DELETE FROM role_privileges
      WHERE role_id = rid AND module = 'education'
        AND privilege_code IN ('view_leads', 'view_students');
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'view_applicants', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
