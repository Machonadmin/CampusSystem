-- ═════════════════════════════════════════════════════════════════════
-- מנהלי מסלול (2026-11-10): каждому учебному маршруту (study_tracks) можно
-- назначить одного или нескольких ответственных. Ответственный сам выбирает
-- студенток своего маршрута на экране «המסלול שלי» (/dashboard/my-track) —
-- без центрального распределения. Касается только светских маршрутов
-- (вторая половина дня); לימודי קודש обязательны всем и здесь не меняются.
--
-- Назначает ответственных тот, у кого есть manage_tracks (каталог маршрутов).
-- Доступ решает API, не RLS.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS study_track_managers (
  track_id    uuid NOT NULL REFERENCES study_tracks(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_study_track_managers_person ON study_track_managers(person_id);

-- Как и все таблицы схемы (миграция 20260908120000): доступ только с сервера.
ALTER TABLE study_track_managers ENABLE ROW LEVEL SECURITY;
