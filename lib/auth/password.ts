import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'

const SALT_ROUNDS = 12

// Наборы без похожих символов (0/O, 1/l/I) — чтобы пароль легко продиктовать.
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%*?'

/**
 * Генерирует надёжный, но диктуемый пароль: минимум по одному символу каждого
 * класса, длина 12. Для авто-создания учётной записи сотрудника, когда админ
 * не задаёт пароль вручную. Криптослучайный (crypto.randomInt).
 */
export function generatePassword(length = 12): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const pick = (set: string) => set[randomInt(set.length)]
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  for (let i = chars.length; i < length; i++) chars.push(pick(all))
  // Перемешиваем (Fisher–Yates), чтобы обязательные символы не стояли в начале.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
