import { NextRequest, NextResponse } from 'next/server'

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Israel: [
    'Иерусалим', 'Тель-Авив', 'Хайфа', 'Ришон-ле-Цион', 'Петах-Тиква',
    'Ашдод', 'Нетания', 'Беэр-Шева', 'Бней-Брак', 'Холон',
    'Рамат-Ган', 'Ашкелон', 'Бат-Ям', 'Реховот', 'Герцлия',
    'Кфар-Саба', 'Хадера', 'Модиин', 'Назарет', 'Рамла',
    'Лод', 'Нагария', 'Тверия', 'Кармиэль', 'Эйлат',
    'Акко', 'Умм-эль-Фахм', 'Тайбе', 'Сахнин', 'Арад',
    'Димона', 'Офаким', 'Кирьят-Ям', 'Кирьят-Моцкин', 'Кирьят-Шмона',
    'Йокнеам', 'Маале-Адумим', 'Бейт-Шемеш', 'Ор-Иехуда',
  ],
  Russia: [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
  ],
  USA: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
    'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
    'Miami', 'Seattle', 'Boston', 'Atlanta', 'Las Vegas',
  ],
  Ukraine: [
    'Киев', 'Харьков', 'Одесса', 'Днепр', 'Донецк',
    'Запорожье', 'Львов', 'Кривой Рог',
  ],
}

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country')
  if (!country) {
    return NextResponse.json({ error: 'Country required' }, { status: 400 })
  }
  const cities = CITIES_BY_COUNTRY[country] ?? []
  return NextResponse.json({ cities })
}
