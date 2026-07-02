-- Таблица enrollments — остаток раннего варианта схемы (до появления
-- education_journeys + students + class_enrollments). Проверка показала:
-- ни одного упоминания 'enrollments' нигде в app/, lib/, components/, scripts/.
-- Полностью мёртвая таблица.

DROP TABLE IF EXISTS enrollments;
