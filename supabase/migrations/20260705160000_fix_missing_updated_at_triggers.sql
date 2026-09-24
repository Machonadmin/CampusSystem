-- ═════════════════════════════════════════════════════════════════════════════
-- משלום טריגרים חסרים של set_updated_at ל-20260608190000_add_updated_at_remaining
--
-- רקע: מיגרציה 20260608190000 הוסיפה עמודת updated_at ל-9 טבלאות, אך הטריגרים
-- לא נוצרו כי הפונקציה set_updated_at() לא הייתה קיימת בזמן ריצת המיגרציה.
-- עכשיו הפונקציה קיימת (הוגדרה במיגרציות מאוחרות יותר), ולכן משלימים את הטריגרים.
--
-- אידמפוטנטי: DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── הפונקציה (הגנה מפני עוד הגדרה חוזרת)
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─── 9 הטריגרים החסרים

-- alumni_profiles
DROP TRIGGER IF EXISTS set_updated_at_alumni_profiles ON alumni_profiles;
CREATE TRIGGER set_updated_at_alumni_profiles
  BEFORE UPDATE ON alumni_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- module_privileges
DROP TRIGGER IF EXISTS set_updated_at_module_privileges ON module_privileges;
CREATE TRIGGER set_updated_at_module_privileges
  BEFORE UPDATE ON module_privileges FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- quality_checks
DROP TRIGGER IF EXISTS set_updated_at_quality_checks ON quality_checks;
CREATE TRIGGER set_updated_at_quality_checks
  BEFORE UPDATE ON quality_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- reference_cities
DROP TRIGGER IF EXISTS set_updated_at_reference_cities ON reference_cities;
CREATE TRIGGER set_updated_at_reference_cities
  BEFORE UPDATE ON reference_cities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- sponsor_profiles
DROP TRIGGER IF EXISTS set_updated_at_sponsor_profiles ON sponsor_profiles;
CREATE TRIGGER set_updated_at_sponsor_profiles
  BEFORE UPDATE ON sponsor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_positions
DROP TRIGGER IF EXISTS set_updated_at_staff_positions ON staff_positions;
CREATE TRIGGER set_updated_at_staff_positions
  BEFORE UPDATE ON staff_positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_profiles
DROP TRIGGER IF EXISTS set_updated_at_staff_profiles ON staff_profiles;
CREATE TRIGGER set_updated_at_staff_profiles
  BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- stage_actions
DROP TRIGGER IF EXISTS set_updated_at_stage_actions ON stage_actions;
CREATE TRIGGER set_updated_at_stage_actions
  BEFORE UPDATE ON stage_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- task_comments
DROP TRIGGER IF EXISTS set_updated_at_task_comments ON task_comments;
CREATE TRIGGER set_updated_at_task_comments
  BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
