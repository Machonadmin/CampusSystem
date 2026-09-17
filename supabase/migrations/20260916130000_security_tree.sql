-- ═════════════════════════════════════════════════════════════════════
-- Дерево отображения прав — структура, которую администратор перестраивает сам.
--
-- ЗАЧЕМ. Требование владельца дословно: «завтра я вижу, что учёба Торо внутри
-- университета, и хочу, чтобы это было отдельно — чтобы я мог перетащить это
-- сам или вынести в отдельный модуль, и тогда у сотрудника открыть доступ
-- только к этому». И главное обоснование: «в конце концов ни ты, ни я не
-- понимаем, что такое каждая подчасть, которой нужен доступ. Это понимает тот,
-- кто отвечает за неё в учреждении — значит, надо дать ЕМУ возможность
-- управлять этим легко».
--
-- КАК ЭТО БЕЗОПАСНО. Ключи, по которым работает АВТОРИЗАЦИЯ (module +
-- privilege_code), не двигаются никогда: их проверяет код, и переименование
-- или перенос сломали бы доступ молча. Перетаскивание меняет только дерево
-- ОТОБРАЖЕНИЯ:
--
--     ключи авторизации          дерево отображения          что делает админ
--     (module+privilege_code)    (security_tree_nodes)
--     никогда не двигаются  ←──  свободно перетаскивается ←── тащит, делит,
--     их проверяет код           только показ и группировка    группирует
--
-- Ни одна проверка доступа эти таблицы НЕ ЧИТАЕТ. Их читает только экран
-- «Безопасность данных». Поэтому любая перестройка дерева не может ничего
-- никому открыть или закрыть — это проверяется отдельным тестом-стражем.
--
-- «Вынести в отдельный модуль» = сделать узел корневым (parent_id = NULL).
-- department_id — необязательная привязка к подразделению: именно она
-- превращает узел в настоящую «учёбу Торо», потому что выдача прав из такого
-- узла идёт с scope='department' и этим подразделением.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. Узлы дерева ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_tree_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = корень («отдельный модуль» на экране).
  parent_id     UUID REFERENCES security_tree_nodes(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,

  -- Подпись и объяснение на трёх языках: на экране технический код не
  -- показывается нигде, поэтому имя обязательно.
  name_he        TEXT NOT NULL,
  name_ru        TEXT,
  name_en        TEXT,
  description_he TEXT,
  description_ru TEXT,
  description_en TEXT,

  -- Корневой узел, соответствующий модулю реестра (lib/modules/registry.ts):
  -- отсюда берутся цвет, иконка и ссылка на сам модуль. У узла, который админ
  -- создал сам, это NULL — он оформляется полями icon/color ниже.
  module_code   TEXT,
  icon          TEXT,
  color         TEXT,

  -- Привязка к подразделению: узел вида «лимудей кодеш» / «учёба Торо».
  -- Выдача такого узла сотруднику идёт с scope='department'.
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_tree_nodes_parent ON security_tree_nodes(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_security_tree_nodes_module ON security_tree_nodes(module_code);

DROP TRIGGER IF EXISTS set_updated_at_security_tree_nodes ON security_tree_nodes;
CREATE TRIGGER set_updated_at_security_tree_nodes
  BEFORE UPDATE ON security_tree_nodes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE security_tree_nodes IS
  'Дерево ОТОБРАЖЕНИЯ прав для экрана «Безопасность данных». Перестраивается администратором перетаскиванием. Проверки доступа эту таблицу не читают.';
COMMENT ON COLUMN security_tree_nodes.parent_id IS
  'NULL = корневой узел, на экране выглядит как отдельный модуль. «Вынести в отдельный модуль» = обнулить это поле.';
COMMENT ON COLUMN security_tree_nodes.module_code IS
  'Код модуля из lib/modules/registry.ts для корней, соответствующих модулям: даёт цвет, иконку и ссылку. У созданного вручную узла — NULL.';
COMMENT ON COLUMN security_tree_nodes.department_id IS
  'Необязательная привязка к подразделению. Выдача прав такого узла сотруднику идёт с scope=department и этим подразделением — так получается «доступ только к лимудей кодеш».';

-- ─── 2. Какие права лежат в узле ─────────────────────────────────────────────
-- Первичный ключ по (module, privilege_code): право лежит РОВНО В ОДНОМ узле,
-- иначе на экране оно двоилось бы и админ правил бы то одну копию, то другую.
CREATE TABLE IF NOT EXISTS security_tree_items (
  node_id        UUID NOT NULL REFERENCES security_tree_nodes(id) ON DELETE CASCADE,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (module, privilege_code)
);

CREATE INDEX IF NOT EXISTS idx_security_tree_items_node ON security_tree_items(node_id, sort_order);

COMMENT ON TABLE security_tree_items IS
  'Раскладка прав каталога по узлам дерева отображения. Право лежит ровно в одном узле; не разложенные права экран показывает в группе «не распределено», чтобы ничего не пропало.';

-- ─── 2a. RLS: как на всех остальных таблицах public ──────────────────────────
-- Миграция 20260908120000 включила RLS на каждой таблице public без единой
-- политики: приложение ходит в Supabase только с сервера под service_role,
-- который RLS полностью обходит, а для anon/authenticated доступ закрыт
-- ПОЛНОСТЬЮ. Там же прямо сказано: новые таблицы в будущих миграциях обязаны
-- включать RLS. Без этих двух строк дерево прав было бы единственным, что
-- читается публичным ключом в обход приложения — и Supabase справедливо
-- предупреждает об этом в редакторе.
--
-- Политик НЕ добавляем сознательно: любая политика открыла бы доступ anon,
-- а его здесь быть не должно. Повторный ENABLE — no-op.
ALTER TABLE security_tree_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_tree_items ENABLE ROW LEVEL SECURITY;

-- ─── 3. Защита от петли и слишком глубокого дерева ───────────────────────────
-- Перетаскивание узла в собственного потомка создало бы цикл: обход дерева
-- завис бы, а экран перестал бы открываться. CHECK такое выразить не может.
CREATE OR REPLACE FUNCTION security_tree_no_cycle() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  ancestor UUID := NEW.parent_id;
  depth    INT  := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Узел дерева прав не может быть родителем самому себе';
  END IF;

  WHILE ancestor IS NOT NULL LOOP
    depth := depth + 1;
    IF ancestor = NEW.id THEN
      RAISE EXCEPTION 'Перенос создал бы петлю в дереве прав: узел оказался бы внутри самого себя';
    END IF;
    IF depth > 10 THEN
      RAISE EXCEPTION 'Дерево прав глубже 10 уровней — скорее всего это петля';
    END IF;
    SELECT parent_id INTO ancestor FROM security_tree_nodes WHERE id = ancestor;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS security_tree_no_cycle_trg ON security_tree_nodes;
CREATE TRIGGER security_tree_no_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_id ON security_tree_nodes
  FOR EACH ROW EXECUTE FUNCTION security_tree_no_cycle();

-- ─── 4. Начальное дерево ─────────────────────────────────────────────────────
-- Засевается ПО ФАКТУ, без выдумок: один корень на модуль, а под ним — все его
-- права каталога в порядке sort_order. Это ровно та структура, что есть
-- сегодня. Подгруппы («тлмидот и регистрации», «оценки», «учёба Торо») НЕ
-- придумываются здесь: по словам владельца, что означает каждая подчасть,
-- знает ответственный за неё в учреждении, а не эта миграция. Он создаёт их
-- сам на экране — ради этого дерево и сделано редактируемым.
--
-- Идемпотентно: корень заводится только если его ещё нет, право раскладывается
-- только если оно ещё нигде не лежит (ON CONFLICT DO NOTHING). Перестроенное
-- админом дерево повторный прогон не тронет.
INSERT INTO security_tree_nodes (name_he, name_ru, name_en, module_code, sort_order)
SELECT DISTINCT ON (mp.module)
       mp.module, mp.module, mp.module, mp.module, 0
  FROM module_privileges mp
 WHERE NOT EXISTS (SELECT 1 FROM security_tree_nodes n WHERE n.module_code = mp.module)
 ORDER BY mp.module;

-- Подписи корней берутся не из кода модуля, а из строки 'access' того же
-- модуля: она уже переведена на три языка предыдущей миграцией, и на экране
-- технический код показываться не должен.
UPDATE security_tree_nodes n SET
  name_he = COALESCE(a.name_he, n.name_he),
  name_ru = COALESCE(a.name_ru, n.name_ru),
  name_en = COALESCE(a.name_en, n.name_en),
  description_he = COALESCE(n.description_he, a.description_he),
  description_ru = COALESCE(n.description_ru, a.description_ru),
  description_en = COALESCE(n.description_en, a.description_en)
FROM module_privileges a
WHERE a.module = n.module_code
  AND a.privilege_code = 'access'
  AND n.name_he = n.module_code;   -- только у только что засеянных

INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = mp.module
ON CONFLICT (module, privilege_code) DO NOTHING;

-- У четырёх модулей строки 'access' в каталоге нет (recruitment / admission /
-- studies появились при разделении матрицы учёбы и гейтятся зонтичным
-- education.access; applicants — устаревший код без своего экрана). Их корни
-- остались бы подписаны техническим кодом, а этого на экране быть не должно.
UPDATE security_tree_nodes n SET
  name_he = v.he, name_ru = v.ru, name_en = v.en,
  description_he = COALESCE(n.description_he, v.he_desc),
  description_ru = COALESCE(n.description_ru, v.ru_desc),
  description_en = COALESCE(n.description_en, v.en_desc)
FROM (VALUES
  ('recruitment', 'גיוס', 'Набор', 'Recruitment',
   'פניות ולידים עד להפיכתם למועמדות.',
   'Обращения и лиды до превращения в абитуриенток.',
   'Enquiries and leads up to becoming applicants.'),
  ('admission', 'קבלה', 'Приём', 'Admission',
   'מועמדות, ועדת קבלה ורישום לשנה.',
   'Абитуриентки, приёмная комиссия и зачисление на год.',
   'Applicants, the admission committee and enrolment for the year.'),
  ('studies', 'לימודים', 'Учёба', 'Studies',
   'תלמידות, קבוצות, נוכחות וציונים — המודול הגדול במערכת.',
   'Студентки, группы, посещаемость и оценки — крупнейший модуль системы.',
   'Students, groups, attendance and grades — the largest module in the system.'),
  ('applicants', 'בקשות (ותיק)', 'Заявки (устар.)', 'Applications (legacy)',
   'קודים מלפני מעבר לקבלה. נשמרים כדי לא לשבור הרשאות ותיקות.',
   'Коды до перехода на «Приём». Сохранены, чтобы не сломать старые выдачи.',
   'Codes from before the move to Admission. Kept so older grants do not break.')
) AS v(module_code, he, ru, en, he_desc, ru_desc, en_desc)
WHERE n.module_code = v.module_code AND n.name_he = n.module_code;

-- Самопроверка: корень, подписанный техническим кодом, — это баг отображения.
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM security_tree_nodes WHERE name_he = module_code;
  IF bad > 0 THEN
    RAISE WARNING 'Узлов дерева прав, подписанных техническим кодом: % — экран покажет код вместо имени', bad;
  END IF;
END $$;
