// Кастомная страница 404 (App Router): аккуратный вид вместо стандартного
// Next-экрана. Рендерится внутри корневого layout. Стили — токены темы.
import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        maxWidth: 420, textAlign: 'center', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 14, padding: '40px 32px',
        boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(20,24,33,.08))',
      }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--text-faint)', marginBottom: 6 }}>404</div>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>הדף לא נמצא</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
          הכתובת שביקשת אינה קיימת או הועברה.
        </p>
        <Link
          href="/dashboard"
          style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', borderRadius: 9, background: 'var(--accent)', color: '#fff', textDecoration: 'none', display: 'inline-block' }}
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  )
}
