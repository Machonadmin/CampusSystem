import StudentViewClient from './StudentViewClient'

/**
 * Предпросмотр «глазами студентки»: staff открывает и видит ровно то, что видит
 * студентка (дашборд + календарь + встречи, только чтение). До появления входа
 * для студенток (след. фаза) — это способ «увидеть, что она видит».
 * name передаётся из карточки через ?name= (необязательно).
 */
export default async function StudentViewPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string }> }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  return <StudentViewClient journeyId={params.id} name={searchParams?.name ?? ''} />
}
