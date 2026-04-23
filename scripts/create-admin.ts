import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function createAdmin() {
  const email = 'oficepresident@gmail.com'
  const password = 'Campus2026!'

  const passwordHash = await bcrypt.hash(password, 12)

  // Создаём персону
  const { data: person, error: personError } = await supabase
    .from('persons')
    .insert({ full_name: 'Суперадминистратор', email })
    .select()
    .single()

  if (personError) throw personError
  console.log('✅ Персона создана:', person.id)

  // Создаём аккаунт
  const { error: accountError } = await supabase
    .from('person_accounts')
    .insert({
      person_id: person.id,
      login_email: email,
      password_hash: passwordHash,
      is_active: true
    })

  if (accountError) throw accountError
  console.log('✅ Аккаунт создан')

  // Назначаем роль суперадминистратора
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('code', 'superadmin')
    .single()

  const { error: roleError } = await supabase
    .from('person_roles')
    .insert({ person_id: person.id, role_id: role!.id })

  if (roleError) throw roleError
  console.log('✅ Роль назначена')
  console.log('✅ Готово! Email:', email, '| Пароль: Campus2026!')
}

createAdmin().catch(console.error)
