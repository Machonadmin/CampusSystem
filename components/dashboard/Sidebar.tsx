'use client'

import { InstitutionLogo } from '@/components/ui/InstitutionLogo'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { MODULE_ICON_PATHS } from '@/lib/nav/module-icons'
import { isModuleImplemented } from '@/lib/module-colors'
import { KODESH_COVERED_MODULES, kodeshMoreModuleItems, kodeshMoreEduSections } from '@/lib/education/kodesh-nav'
import { useUiPrefs } from '@/lib/prefs/UiPrefsContext'
import { useMe } from '@/lib/hooks/useMe'
import { applyNavPrefs } from '@/lib/prefs/ui-prefs'
import { fetchMyActiveTasks } from '@/lib/tasks/my-active-tasks-client'

// Три раздела «Образования» как ОТДЕЛЬНЫЕ модули-маршруты (запрос владельца:
// גיוс / קבלה / לимудим — раздельные, без «התנגשויות»). У каждого свой маршрут,
// поэтому переход между ними МОНТИРУЕТ раздел заново — состояние/фильтры не
// протекают между разделами.
const EDU_SECTIONS = [
  { key: 'recruitment', labelKey: 'tabs.leads',      href: '/dashboard/education/recruitment' },
  { key: 'committee',   labelKey: 'tabs.applicants', href: '/dashboard/education/admission' },
  { key: 'study',       labelKey: 'tabs.students',   href: '/dashboard/education/studies' },
] as const

// §10: сфокусированный сайдбар управляющей кафедрой иудаики. Каждый пункт ведёт
// на УЖЕ существующий маршрут (перекладка, не новые экраны). «Дом» (בית) — это
// верхний пункт home, переведённый на дом иудаики. Видимость каждого пункта
// приходит с сервера (/api/education/workspace-nav, fail-closed по правам).
const KODESH_NAV = [
  { key: 'prep',       gate: 'prep',       href: '/dashboard/education/kodesh',               iconKey: 'education' as const },
  { key: 'alerts',     gate: 'alerts',     href: '/dashboard/education/alerts',               iconKey: 'tasks' as const },
  { key: 'calendar',   gate: 'calendar',   href: '/dashboard/education/timetable',            iconKey: 'calendar' as const },
  { key: 'courses',    gate: 'courses',    href: '/dashboard/education/kodesh-courses',       iconKey: 'education' as const },
  { key: 'teachers',   gate: 'teachers',   href: '/dashboard/education/teachers',             iconKey: 'persons' as const },
  { key: 'students',   gate: 'students',   href: '/dashboard/education/studies?sec=students', iconKey: 'persons' as const },
  { key: 'jewishness', gate: 'jewishness', href: '/dashboard/jewishness',                     iconKey: 'jewishness' as const },
  { key: 'contacts',   gate: 'contacts',   href: '/dashboard/contacts',                       iconKey: 'contacts' as const },
] as const

// Пути иконок модулей вынесены в lib/nav/module-icons.ts (общие с EmptyState).
const I = MODULE_ICON_PATHS

const TOP_ITEMS = [
  { key: 'home' as const, href: '/dashboard', icon: I.home },
  { key: 'calendar' as const, href: '/dashboard/calendar', icon: I.calendar },
  { key: 'tasks' as const, href: '/dashboard/tasks', icon: I.tasks },
]

// Группа «ניהול שלי» (решение владельца 11.11.2026): личные рабочие экраны
// под одним заголовком сразу после верхних пунктов. Состав и доступ прежние:
// пункты не гейтятся модульным правом, своё отдаёт API.
const MY_WORK_ITEMS = [
  { key: 'management' as const, href: '/dashboard/management', icon: I.management },
  // «המסלול שלי» — только у тех, кому /api/education/my-track вернул маршруты.
  { key: 'my_track' as const, href: '/dashboard/my-track', icon: I.my_track },
]

const MODULES = [
  { key: 'persons' as const, href: '/dashboard/persons', icon: I.persons },
  { key: 'staff' as const, href: '/dashboard/staff', icon: I.staff },
  { key: 'quality_control' as const, href: '/dashboard/quality-control', icon: I.quality_control },
  { key: 'education' as const, href: '/dashboard/education', icon: I.education },
  { key: 'chavruta' as const, href: '/dashboard/chavruta', icon: I.chavruta },
  { key: 'jewishness' as const, href: '/dashboard/jewishness', icon: I.jewishness },
  { key: 'finance' as const, href: '/dashboard/finance', icon: I.finance },
  { key: 'dormitory' as const, href: '/dashboard/dormitory', icon: I.dormitory },
  { key: 'food' as const, href: '/dashboard/food', icon: I.food },
  { key: 'maintenance' as const, href: '/dashboard/maintenance', icon: I.maintenance },
  { key: 'security' as const, href: '/dashboard/security', icon: I.security },
  { key: 'alumni' as const, href: '/dashboard/alumni', icon: I.alumni },
  { key: 'sponsors' as const, href: '/dashboard/sponsors', icon: I.sponsors },
  { key: 'doctor' as const, href: '/dashboard/doctor', icon: I.doctor },
  { key: 'psychologist' as const, href: '/dashboard/psychologist', icon: I.psychologist },
  { key: 'documents' as const, href: '/dashboard/documents', icon: I.documents },
  { key: 'reports' as const, href: '/dashboard/reports', icon: I.reports },
  { key: 'contacts' as const, href: '/dashboard/contacts', icon: I.contacts },
  { key: 'data_security' as const, href: '/dashboard/data-security', icon: I.data_security },
  { key: 'settings' as const, href: '/dashboard/settings', icon: I.settings },
]

// ── Section grouping (DISPLAY-ONLY: module codes / routes / icons unchanged) ─
// Each section lists module codes in the exact display order requested. The
// section header label is looked up from t.nav_groups; module labels stay in
// t.nav. Nothing here touches HREF_OVERRIDES, permissions, or DB codes.
const MODULE_GROUPS = [
  { key: 'studies' as const,       modules: ['education', 'chavruta', 'jewishness', 'quality_control', 'alumni'] },
  { key: 'wellbeing' as const,     modules: ['dormitory', 'food', 'doctor', 'psychologist'] },
  { key: 'admin_finance' as const, modules: ['finance', 'sponsors', 'documents', 'reports'] },
  { key: 'operations' as const,    modules: ['maintenance', 'security'] },
  { key: 'people_staff' as const,  modules: ['persons', 'staff', 'contacts'] },
  { key: 'system' as const,        modules: ['data_security', 'settings'] },
]

type ModuleItem = (typeof MODULES)[number]
const MODULE_BY_KEY: Record<string, ModuleItem> = Object.fromEntries(
  MODULES.map(m => [m.key, m]),
)

// Safety net: any module not placed in a group above lands in an "other"
// section at the bottom, so a newly-added module never silently disappears.
const GROUPED_KEYS = new Set(MODULE_GROUPS.flatMap(g => g.modules))
const FALLBACK_KEYS = MODULES.filter(m => !GROUPED_KEYS.has(m.key)).map(m => m.key)

// ── Nav link — defined outside Sidebar to avoid reconciliation issues ────────
function SidebarNavLink({
  href, iconPath, label, active, isOpen, isRTL, moduleKey, soonLabel, dot,
}: {
  href: string
  iconPath: string
  label: string
  active: boolean
  isOpen: boolean
  isRTL: boolean
  moduleKey: string
  soonLabel: string
  /** Небольшая точка на иконке — сигнал «есть что-то моё» (напр. открытые задачи). */
  dot?: boolean
}) {
  // 'home', 'calendar' и 'management' (פאנל ניהול) — личные страницы: всегда
  // доступны, свои данные отдаёт API.
  const isPersonalPage = moduleKey === 'home' || moduleKey === 'calendar' || moduleKey === 'management' || moduleKey === 'my_track'
  const implemented = isPersonalPage || isModuleImplemented(moduleKey)
  return (
    <div className="relative">
      {active && (
        <span
          className="absolute top-0 bottom-0 w-[3px] rounded-e"
          style={{ [isRTL ? 'right' : 'left']: 0, backgroundColor: 'var(--accent)' }}
        />
      )}
      <Link
        href={implemented ? href : '#'}
        title={!isOpen ? label : undefined}
        onClick={implemented ? undefined : (e) => e.preventDefault()}
        prefetch={false}
        className={`nav-link flex items-center transition-colors mx-2 rounded-lg ${isOpen ? 'gap-3' : 'justify-center'} ${active ? 'nav-link-active' : ''}`}
        style={
          active
            ? { backgroundColor: 'var(--accent-tint)', color: 'var(--accent-strong)', padding: isOpen ? '8px 10px' : '10px 11px' }
            : {
                color: implemented ? 'var(--text-muted)' : 'var(--text-faint)',
                cursor: implemented ? 'pointer' : 'not-allowed',
                padding: isOpen ? '8px 10px' : '10px 11px',
              }
        }
      >
        <span style={{ position: 'relative', flexShrink: 0, width: 18, height: 18, display: 'inline-flex' }}>
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={iconPath} />
          </svg>
          {dot && (
            <span
              aria-hidden
              style={{
                position: 'absolute', top: -3, [isRTL ? 'left' : 'right']: -3,
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--warn)', border: '1.5px solid var(--surface)',
              }}
            />
          )}
        </span>
        <span
          style={{
            maxWidth: isOpen ? 180 : 0,
            opacity: isOpen ? 1 : 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 0.2s ease, opacity 0.15s ease',
            fontSize: 14,
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {label}
        </span>
        {isOpen && !implemented && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'var(--warn)',
            letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {soonLabel}
          </span>
        )}
      </Link>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { t, isRTL } = useLang()
  const tEdu = useTranslations('education')
  const tFin = useTranslations('finance')
  const tPrefs = useTranslations('prefs')
  const { prefs: uiPrefs } = useUiPrefs()
  const { isOpen, isPinned, isMobile, toggle, close, setPin } = useSidebar()
  const sidebarRef = useRef<HTMLElement>(null)
  const [accessibleModules, setAccessibleModules] = useState<string[] | null>(null)
  const [isChavrutaTeacher, setIsChavrutaTeacher] = useState(false)
  // Менеджер, которому доступен управляющий хаб «מרכז חברותא» (не журнал).
  const [canViewChavrutaHub, setCanViewChavrutaHub] = useState(false)
  // «שכר צוות»: экраны /dashboard/finance/staff есть, но в меню их не было.
  const [canViewStaffComp, setCanViewStaffComp] = useState(false)
  // Есть ли у меня открытые задачи (для точки на пункте «Задачи»).
  const [hasOpenTasks, setHasOpenTasks] = useState(false)
  // Доступ к вкладкам «Образования» (набор/приём/учёба) — гейтит три пункта.
  const [eduTabAccess, setEduTabAccess] = useState<Record<string, boolean> | null>(null)
  // §10: сфокусированное пространство кафедры иудаики. null = ещё грузим (пока
  // показываем обычный сайдбар — fail-safe, ничего не сужаем).
  const [kodeshNav, setKodeshNav] = useState<{ workspace: boolean; items: Record<string, boolean> } | null>(null)
  // Свёрнутые группы: открыта только та, где активный маршрут; остальные скрыты
  // (по клику разворачиваются). Меньше видимых пунктов — легче глазу.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [hasMyTrack, setHasMyTrack] = useState(false)

  // /api/auth/me — через общий кэш useMe (один запрос на всё приложение,
  // а не отдельный в меню и на главной).
  const me = useMe()
  useEffect(() => {
    if (!me) return
    if (me.accessible_modules) setAccessibleModules(me.accessible_modules)
    if (me.is_chavruta_teacher) setIsChavrutaTeacher(true)
    if (me.can_view_chavruta) setCanViewChavrutaHub(true)
    if (me.can_view_staff_comp) setCanViewStaffComp(true)
  }, [me])

  // Точка на «Задачах»: есть ли открытые задачи, назначенные на меня. Обновляем
  // при смене маршрута — вернувшись со страницы задач, точка отражает актуальное.
  useEffect(() => {
    let alive = true
    fetchMyActiveTasks()
      .then(tasks => { if (alive) setHasOpenTasks((tasks ?? []).length > 0) })
    return () => { alive = false }
  }, [pathname])

  // «המסלול שלי»: пункт виден только ответственному маршрута (или каталогу маршрутов).
  useEffect(() => {
    let alive = true
    fetch('/api/education/my-track')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) setHasMyTrack(Array.isArray(d?.tracks) && d.tracks.length > 0) })
      .catch(() => { /* пункт просто не показываем */ })
    return () => { alive = false }
  }, [])

  // Доступ к трём разделам «Образования» — грузим один раз (для гейтинга пунктов).
  useEffect(() => {
    let alive = true
    // null = ещё грузим (fail-closed), {} = ошибка (fail-open, чтобы не запереть
    // навигацию), объект с ключами = реальный доступ.
    fetch('/api/education/tab-access')
      .then(r => r.ok ? r.json() : {})
      .then(a => { if (alive) setEduTabAccess((a && typeof a === 'object' ? a : {}) as Record<string, boolean>) })
      .catch(() => { if (alive) setEduTabAccess({} as Record<string, boolean>) })
    return () => { alive = false }
  }, [])

  // §10: рабочее пространство кафедры иудаики + видимость её пунктов (fail-safe:
  // ошибка → обычный сайдбар).
  useEffect(() => {
    let alive = true
    fetch('/api/education/workspace-nav')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive) return
        setKodeshNav({
          workspace: d?.kodesh_workspace === true,
          items: (d?.items && typeof d.items === 'object' ? d.items : {}) as Record<string, boolean>,
        })
      })
      .catch(() => { if (alive) setKodeshNav({ workspace: false, items: {} }) })
    return () => { alive = false }
  }, [])

  // Какой из трёх разделов сейчас активен (для подсветки пункта).
  function activeEduSection(): string | null {
    // Старый хаб /dashboard/education теперь редиректит на recruitment.
    if (pathname === '/dashboard/education') return 'recruitment'
    if (pathname.startsWith('/dashboard/education/leads') || pathname.startsWith('/dashboard/education/recruitment')) return 'recruitment'
    if (pathname.startsWith('/dashboard/education/admission')) return 'committee'
    // «קהילות» живёт в разделе «גיוס» (перенесено из настроек учёбы).
    if (pathname.startsWith('/dashboard/education/communities')) return 'recruitment'
    if (pathname.startsWith('/dashboard/education/studies')) return 'study'
    if (pathname.startsWith('/dashboard/education/')) return 'study'
    return null
  }

  // Click-outside to close when unpinned on desktop
  useEffect(() => {
    if (isPinned || isMobile || !isOpen) return
    function onOutside(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [isPinned, isMobile, isOpen, close])

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href)
  }

  // Активность для §10-пунктов: по СЕГМЕНТУ, чтобы соседние маршруты с общим
  // префиксом не подсвечивались вместе (kodesh / kodesh-home / kodesh-courses).
  function focusedActive(href: string) {
    const base = href.split('?')[0]
    return pathname === base || pathname.startsWith(base + '/')
  }

  const isKodeshWorkspace = kodeshNav?.workspace === true

  // While access is still loading (null) show NOTHING (only the top personal items),
  // so a user never briefly sees modules they can't access. Once loaded, a module the
  // user's roles can't reach is dropped, and any section left with zero visible
  // modules is omitted entirely (its header does not render).
  // Хеврута — динамический доступ (мора хавруты), не обычная привилегия модуля.
  const canAccess = (key: string) => {
    if (accessibleModules === null) return false
    if (key === 'chavruta') return isChavrutaTeacher || canViewChavrutaHub || accessibleModules.includes('chavruta')
    return accessibleModules.includes(key)
  }
  const sections = [
    ...MODULE_GROUPS,
    ...(FALLBACK_KEYS.length ? [{ key: 'other' as const, modules: FALLBACK_KEYS }] : []),
  ]
    .map(group => ({
      key: group.key,
      items: group.modules
        .map(k => MODULE_BY_KEY[k])
        .filter((m): m is ModuleItem => !!m)
        .filter(m => canAccess(m.key)),
    }))
    // «Здоровье»: рофэ + психолог схлопываются в ОДИН пункт (owner-декластеризация).
    // Пункт виден, если доступен хотя бы один из двух модулей; страница
    // /dashboard/health сама разрулит (оба → вкладки, один → редирект в него).
    .map(group => {
      const firstIdx = group.items.findIndex(m => m.key === 'doctor' || m.key === 'psychologist')
      if (firstIdx === -1) return group
      const health = { key: 'health', href: '/dashboard/health', icon: group.items[firstIdx].icon } as unknown as ModuleItem
      const rebuilt: ModuleItem[] = group.items.filter(m => m.key !== 'doctor' && m.key !== 'psychologist')
      rebuilt.splice(Math.min(firstIdx, rebuilt.length), 0, health)
      return { ...group, items: rebuilt }
    })
    .filter(section => section.items.length > 0)

  // §10 «ещё»: всё, что пользователь может открыть, но что НЕ покрыто пунктами
  // сфокусированного пространства иудаики — чтобы у неё НИЧЕГО не пропало из
  // доступного (перекладка навигации, не удаление доступа).
  // Чистые помощники (lib/education/kodesh-nav), покрыты тестами.
  const kodeshMoreItems = kodeshMoreModuleItems(sections.flatMap(s => s.items), KODESH_COVERED_MODULES)
  const kodeshMoreEdu = kodeshMoreEduSections(EDU_SECTIONS, eduTabAccess)

  // Группа активного маршрута — открывается по умолчанию; при смене маршрута
  // раскрываем её (и сворачиваем прочие). Ручной клик по заголовку это не трогает.
  const activeGroupKey = sections.find(s => s.items.some(it => isActive(it.href)))?.key ?? null
  useEffect(() => {
    if (activeGroupKey) setOpenGroups(new Set([activeGroupKey]))
  }, [activeGroupKey])

  const toggleGroup = (key: string) => setOpenGroups(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // ── Пункты групп как плоский список {id, ссылка} ───────────────────────────
  // id — стабильный код пункта для личной раскладки (избранное / скрытое):
  // код модуля, либо код раздела для пунктов, на которые модуль разворачивается
  // (образование → recruitment/admission/studies, финансы → finance_staff).
  // Совпадает с id плиток на главной — одно избранное на меню и на главную.
  type NavEntry = { id: string; el: React.ReactElement }
  const EDU_NAV_ID: Record<string, string> = { recruitment: 'recruitment', committee: 'admission', study: 'studies' }
  function buildLinks(item: ModuleItem): NavEntry[] {
    // «Образование» разворачивается в три пункта: набор / приём / учёба.
    if (item.key === 'education') {
      const activeSec = activeEduSection()
      const secIcon: Record<string, string> = {
        recruitment: I.persons, committee: I.quality_control, study: I.education,
      }
      return EDU_SECTIONS
        // fail-closed: показываем раздел ТОЛЬКО при явном доступе
        // (=== true). Пока грузится (null) или при ошибке ({}) — не
        // показываем; иначе секретарь кодеша на миг видит גיוס.
        .filter(s => eduTabAccess?.[s.key] === true)
        .map(s => ({
          id: EDU_NAV_ID[s.key] ?? s.key,
          el: (
            <SidebarNavLink
              key={`education-${s.key}`}
              href={s.href}
              iconPath={secIcon[s.key] ?? item.icon}
              label={tEdu(s.labelKey)}
              active={activeSec === s.key}
              isOpen={isOpen}
              isRTL={isRTL}
              moduleKey="education"
              soonLabel={t.soon}
            />
          ),
        }))
    }
    // «Финансы» разворачиваются в два пункта: сам модуль и «שכר צוות»
    // (расчётные листы). Экраны существовали, но были навигационно
    // недостижимы (аудит §22.2). fail-closed: пункт только при === true.
    if (item.key === 'finance') {
      const links: NavEntry[] = [{
        id: 'finance',
        el: (
          <SidebarNavLink
            key="finance"
            href={item.href}
            iconPath={item.icon}
            label={t.nav.finance}
            active={pathname === '/dashboard/finance' || (pathname.startsWith('/dashboard/finance/') && !pathname.startsWith('/dashboard/finance/staff'))}
            isOpen={isOpen}
            isRTL={isRTL}
            moduleKey="finance"
            soonLabel={t.soon}
          />
        ),
      }]
      if (canViewStaffComp) {
        links.push({
          id: 'finance_staff',
          el: (
            <SidebarNavLink
              key="finance-staff"
              href="/dashboard/finance/staff"
              iconPath={I.staff}
              label={tFin('staff.link_label')}
              active={pathname.startsWith('/dashboard/finance/staff')}
              isOpen={isOpen}
              isRTL={isRTL}
              moduleKey="finance"
              soonLabel={t.soon}
            />
          ),
        })
      }
      return links
    }
    // «Хеврута»: преподаватель хавруты → его журнал; менеджер (не
    // преподаватель) → управляющий хаб (иначе он попадал на страницу
    // «для преподавателей» и «не мог ничего сделать»).
    const href = item.key === 'chavruta' && !isChavrutaTeacher
      ? '/dashboard/education/chavruta'
      : item.href
    // «Здоровье» подсвечивается и на старых адресах рофэ/психолога.
    const active = (item.key as string) === 'health'
      ? ['/dashboard/health', '/dashboard/doctor', '/dashboard/psychologist'].some(p => pathname.startsWith(p))
      : isActive(href)
    return [{
      id: item.key,
      el: (
        <SidebarNavLink
          key={item.key}
          href={href}
          iconPath={item.icon}
          label={t.nav[item.key]}
          active={active}
          isOpen={isOpen}
          isRTL={isRTL}
          moduleKey={item.key}
          soonLabel={t.soon}
        />
      ),
    }]
  }

  // Личная раскладка поверх уже отфильтрованного по правам списка: избранные
  // пункты — отдельной группой наверху, скрытые — пропадают из меню. Показать
  // недоступное раскладка не может (applyNavPrefs видит только доступное).
  const sectionEntries = sections.map(s => ({ key: s.key, entries: s.items.flatMap(buildLinks) }))
  const { favorites: favoriteEntries } = applyNavPrefs(sectionEntries.flatMap(s => s.entries), uiPrefs)
  const favoriteIds = new Set(favoriteEntries.map(e => e.id))
  const hiddenIds = new Set(uiPrefs.hidden)
  const visibleSections = sectionEntries
    .map(s => ({ ...s, entries: s.entries.filter(e => !favoriteIds.has(e.id) && !hiddenIds.has(e.id)) }))
    .filter(s => s.entries.length > 0)
  const totalLinks = favoriteEntries.length + visibleSections.reduce((n, s) => n + s.entries.length, 0)

  return (
    <aside
      ref={sidebarRef}
      data-open={isOpen}
      data-rtl={isRTL}
      className="app-sidebar fixed top-16 bottom-0 z-40 flex flex-col overflow-hidden"
      style={{
        width: isOpen ? 240 : 56,
        transition: 'width 0.2s ease, transform 0.2s ease',
        [isRTL ? 'right' : 'left']: 0,
        transform: isMobile && !isOpen ? `translateX(${isRTL ? '100%' : '-100%'})` : 'translateX(0)',
        borderInlineEnd: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
      }}
    >
      {/* ── Sidebar header: logo + pin + toggle ── */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          justifyContent: isOpen ? 'space-between' : 'center',
          padding: isOpen ? '8px 12px' : '10px 0',
          minHeight: 52,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {isOpen && (
          <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
            <InstitutionLogo height={26} priority />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.campusNameShort}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Pin button — desktop only, visible when expanded */}
          {isOpen && !isMobile && (
            <button
              onClick={() => setPin(!isPinned)}
              title={isPinned ? t.unpin : t.pin}
              className="icon-ghost p-1.5 rounded transition-colors"
              style={isPinned
                ? { color: 'var(--accent-strong)', background: 'var(--accent-tint)' }
                : { color: 'var(--text-faint)' }}
            >
              <svg style={{ width: 13, height: 13 }} fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}

          {/* Toggle button */}
          <button
            onClick={toggle}
            title={isOpen ? t.collapse : t.expand}
            className="icon-ghost p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-faint)' }}
          >
            {isOpen ? (
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={isRTL ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
              </svg>
            ) : (
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {TOP_ITEMS.map(item => {
          // §10: «בית» (home) ведёт на дом иудаики, а не на общий /dashboard.
          const kodeshHome = isKodeshWorkspace && item.key === 'home'
          const href = kodeshHome ? '/dashboard/education/kodesh-home' : item.href
          return (
            <SidebarNavLink
              key={item.key}
              href={href}
              iconPath={item.icon}
              label={t.nav[item.key]}
              active={kodeshHome ? focusedActive(href) : isActive(item.href)}
              isOpen={isOpen}
              isRTL={isRTL}
              moduleKey={item.key}
              soonLabel={t.soon}
              dot={item.key === 'tasks' && hasOpenTasks}
            />
          )
        })}

        {/* «ניהול שלי» — פאנל ניהול + המסלול שלי под общим заголовком. */}
        <div>
          {isOpen ? (
            <div style={{ padding: '14px 16px 5px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {t.nav_groups.my_work}
              </span>
            </div>
          ) : (
            <div style={{ padding: '12px 6px 4px' }}>
              <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
            </div>
          )}
          {MY_WORK_ITEMS.filter(item => item.key !== 'my_track' || hasMyTrack).map(item => (
            <SidebarNavLink
              key={item.key}
              href={item.href}
              iconPath={item.icon}
              label={t.nav[item.key]}
              active={isActive(item.href)}
              isOpen={isOpen}
              isRTL={isRTL}
              moduleKey={item.key}
              soonLabel={t.soon}
            />
          ))}
        </div>

        {/* §10: сфокусированный сайдбар кафедры иудаики (перекладка ссылок на уже
            существующие экраны; каждый пункт скрыт при отсутствии права). */}
        {isKodeshWorkspace && (
          <>
            <div>
              {isOpen && (
                <div style={{ padding: '14px 16px 5px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {tEdu('kodesh_nav.section')}
                  </span>
                </div>
              )}
              {!isOpen && <div style={{ padding: '12px 6px 4px' }}><div style={{ height: 1, backgroundColor: 'var(--border)' }} /></div>}
              <div className="anim-expand">
                {KODESH_NAV.filter(it => kodeshNav?.items?.[it.gate] === true).map(it => (
                  <SidebarNavLink
                    key={`kodesh-${it.key}`}
                    href={it.href}
                    iconPath={I[it.iconKey]}
                    label={tEdu(`kodesh_nav.${it.key}`)}
                    active={focusedActive(it.href)}
                    isOpen={isOpen}
                    isRTL={isRTL}
                    moduleKey="education"
                    soonLabel={t.soon}
                  />
                ))}
              </div>
            </div>

            {/* «Ещё» — прочие доступные модули и разделы, не покрытые §10 (ничего не теряется). */}
            {(kodeshMoreItems.length > 0 || kodeshMoreEdu.length > 0) && (
              <div>
                {isOpen && (
                  <div style={{ padding: '14px 16px 5px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {tEdu('kodesh_nav.more')}
                    </span>
                  </div>
                )}
                {!isOpen && <div style={{ padding: '12px 6px 4px' }}><div style={{ height: 1, backgroundColor: 'var(--border)' }} /></div>}
                <div className="anim-expand">
                  {kodeshMoreEdu.map(s => (
                    <SidebarNavLink
                      key={`more-edu-${s.key}`}
                      href={s.href}
                      iconPath={s.key === 'recruitment' ? I.persons : I.quality_control}
                      label={tEdu(s.labelKey)}
                      active={isActive(s.href)}
                      isOpen={isOpen}
                      isRTL={isRTL}
                      moduleKey="education"
                      soonLabel={t.soon}
                    />
                  ))}
                  {kodeshMoreItems.map(item => {
                    const isFinance = item.key === 'finance'
                    const active = (item.key as string) === 'health'
                      ? ['/dashboard/health', '/dashboard/doctor', '/dashboard/psychologist'].some(p => pathname.startsWith(p))
                      : isFinance
                        ? pathname === '/dashboard/finance' || (pathname.startsWith('/dashboard/finance/') && !pathname.startsWith('/dashboard/finance/staff'))
                        : isActive(item.href)
                    const link = (
                      <SidebarNavLink
                        key={`more-${item.key}`}
                        href={item.href}
                        iconPath={item.icon}
                        label={t.nav[item.key]}
                        active={active}
                        isOpen={isOpen}
                        isRTL={isRTL}
                        moduleKey={item.key}
                        soonLabel={t.soon}
                      />
                    )
                    // «שכר צוות» (תלושי שכר) — как в обычном меню: подпункт
                    // «Финансов», только при canViewStaffComp === true.
                    if (!isFinance || !canViewStaffComp) return link
                    return [link, (
                      <SidebarNavLink
                        key="more-finance-staff"
                        href="/dashboard/finance/staff"
                        iconPath={I.staff}
                        label={tFin('staff.link_label')}
                        active={pathname.startsWith('/dashboard/finance/staff')}
                        isOpen={isOpen}
                        isRTL={isRTL}
                        moduleKey="finance"
                        soonLabel={t.soon}
                      />
                    )]
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Избранное — личная группа наверху (всегда раскрыта). */}
        {!isKodeshWorkspace && favoriteEntries.length > 0 && (
          <div>
            {isOpen ? (
              <div style={{ padding: '14px 16px 5px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {tPrefs('favorites_group')}
                </span>
              </div>
            ) : (
              <div style={{ padding: '12px 6px 4px' }}>
                <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
              </div>
            )}
            <div className="anim-expand">{favoriteEntries.map(e => e.el)}</div>
          </div>
        )}

        {/* Module sections — сворачиваемые группы (в развёрнутом сайдбаре).
            В icon-режиме (!isOpen) заголовков нет — показываем все пункты. */}
        {!isKodeshWorkspace && visibleSections.map(section => {
          // У пользователя с 1-4 ссылками (например, только гиюс) группы всегда
          // раскрыты: на телефоне ящик открывается с закрытыми группами, и его
          // единственный раздел был спрятан за заголовком — «пустое» приложение.
          const expanded = !isOpen || openGroups.has(section.key) || totalLinks <= 4
          return (
            <div key={section.key}>
              {isOpen ? (
                <button
                  onClick={() => toggleGroup(section.key)}
                  aria-expanded={expanded}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '14px 16px 5px', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {t.nav_groups[section.key]}
                  </span>
                  <svg
                    style={{ width: 12, height: 12, color: 'var(--text-faint)', flexShrink: 0, transition: 'transform 0.15s', transform: `rotate(${expanded ? 0 : (isRTL ? 90 : -90)}deg)` }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <div style={{ padding: '12px 6px 4px' }}>
                  <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
                </div>
              )}

              {expanded && <div className="anim-expand">{section.entries.map(e => e.el)}</div>}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      {isOpen && (
        <div className="flex-shrink-0 px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Вход в личную раскладку меню («הפרופיל שלי» → סידור). */}
          <Link
            href="/dashboard/profile#layout"
            prefetch={false}
            className="nav-link flex items-center justify-center gap-2 rounded-lg"
            style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px', marginBottom: 6 }}
          >
            <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            {tPrefs('arrange_menu')}
          </Link>
          <p className="text-[10px] text-center" style={{ color: 'var(--text-faint)' }}>© 2025 {t.campusNameShort}</p>
        </div>
      )}
    </aside>
  )
}
