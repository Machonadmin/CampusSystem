'use client'

import { UsersAccessPanel } from './UsersAccessPanel'

// «משתמשים וגישה» как самостоятельный маршрут (deep-link, напр. со строки
// сотрудника ?person=). Основной вход — вкладка «משתמשים וגישה» в объединённом
// хабе «צוות» (только superadmin). Логика — в UsersAccessPanel.
export default function UsersPage() {
  return <UsersAccessPanel />
}
