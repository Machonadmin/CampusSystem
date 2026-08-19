-- Аккаунт набора (recruiter) заполняет ВСЕ данные лида, включая семью —
-- для этого нужно право создавать/просматривать персон (модуль persons).
-- Без него добавление члена семьи падало «недостаточно прав». Идемпотентно.
DO $$
DECLARE rid uuid; pcode text;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'recruiter';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES ('access'), ('view'), ('create') LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'persons', pcode, 'all')
        ON CONFLICT (role_id, module, privilege_code) DO NOTHING;
    END LOOP;
  END IF;
END $$;
