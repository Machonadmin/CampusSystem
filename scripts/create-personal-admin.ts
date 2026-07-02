import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const EMAIL = 'levineli770@gmail.com'
const FULL_NAME = 'Eli Levine'
const TEMP_PASSWORD = 'Levine2026!'

async function createPersonalAdmin() {
  const { data: existing } = await supabase
    .from('person_accounts')
    .select('id')
    .eq('login_email', EMAIL)
    .maybeSingle()
  if (existing) {
    console.log('Аккаунт уже существует, ничего не создано:', EMAIL)
    return
  }

  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 12)

  const { data: person, error: personError } = await supabase
    .from('persons')
    .insert({ first_name: FULL_NAME, email: EMAIL })
    .select('id')
    .single()
  if (personError) throw personError

  const { error: accountError } = await supabase
    .from('person_accounts')
    .insert({
      person_id: person.id,
      login_email: EMAIL,
      password_hash: passwordHash,
      is_active: true,
    })
  if (accountError) throw accountError

  const { data: role, error: roleErr } = await supabase
    .from('roles')
    .select('id')
    .eq('code', 'superadmin')
    .single()
  if (roleErr || !role) throw roleErr ?? new Error('Роль superadmin не найдена')

  const { error: prErr } = await supabase
    .from('person_roles')
    .insert({ person_id: person.id, role_id: role.id })
  if (prErr) throw prErr

  console.log('Готово. Email:', EMAIL, '| Временный пароль:', TEMP_PASSWORD)
}

createPersonalAdmin().catch(err => {
  console.error('Ошибка:', err)
  process.exit(1)
})
