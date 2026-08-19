import StudentViewClient from './StudentViewClient'

/**
 * Предпросмотр «глазами студентки»: staff открывает и видит ровно то, что видит
 * студентка (дашборд + календарь + встречи, только чтение). До появления входа
 * для студенток (след. фаза) — это способ «увидеть, что она видит».
 * name передаётся из карточки через ?name= (необязательно).
 */
export default function StudentViewPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { name?: string } }) {
  return <StudentViewClient journeyId={params.id} name={searchParams?.name ?? ''} />
}
