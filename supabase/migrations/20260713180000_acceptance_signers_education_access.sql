-- Приёмная комиссия: подписантам этапов нужен доступ к модулю education, иначе
-- middleware не пустит их на страницу абитуриента, где они подписывают свой этап.
-- head_of_studies education уже имеет (20260713120000); здесь — dorm_director и
-- jewishness_officer. scope='all' в MVP. Идемпотентно.
DO $$
DECLARE rid uuid;
BEGIN
  FOR rid IN SELECT id FROM roles WHERE code IN ('dorm_director', 'jewishness_officer') LOOP
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO NOTHING;
  END LOOP;
END $$;
