-- Модель прав «Гиюс (набор) + Приёмная комиссия» — по структуре, заданной владельцем:
--   • recruiter (צוות גיוס): ПОЛНЫЙ контроль лидов (view/manage/convert) + просмотр
--     абитуриентов и студентов.
--   • подписанты приёма (head_of_studies, dorm_director, jewishness_officer):
--     ВИДЯТ всех лидов/абитуриентов/студентов (чтобы дойти до карточки), а
--     ПОДПИСЫВАЮТ только свой этап — через ролевой гейт этапа (не через права модуля).
-- Все гранты scope='all'. Идемпотентно (можно перезапускать). Это единая,
-- «финальная» миграция прав для приёма — заменяет ранее выданные точечные гранты.

-- Роль «אחראית גיוס»
INSERT INTO roles (name, code, category, is_system, description) VALUES
  ('אחראית גיוס', 'recruiter', 'education', FALSE, 'צוות גיוס — ניהול לידים והמרה למועמדת')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE rid uuid; pcode text;
BEGIN
  -- recruiter: полный контроль лидов + просмотр абитуриентов/студентов
  SELECT id INTO rid FROM roles WHERE code = 'recruiter';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES
      ('access'), ('view_leads'), ('manage_leads'), ('convert_lead'),
      ('view_applicants'), ('view_students')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'education', pcode, 'all')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;

  -- подписанты приёма: видят всё (подпись — через ролевой гейт этапа)
  FOR rid IN SELECT id FROM roles WHERE code IN ('head_of_studies', 'dorm_director', 'jewishness_officer') LOOP
    FOR pcode IN VALUES ('access'), ('view_leads'), ('view_applicants'), ('view_students') LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'education', pcode, 'all')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
