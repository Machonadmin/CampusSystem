'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n/LanguageContext'
import { toastSuccess, toastError } from '@/components/ui/toast'

type T = (key: string, fallback?: string) => string

type Override = 'inherit' | 'grant' | 'deny'

interface ModulePrivilege {
  id: string
  module: string
  privilege_code: string
  privilege_name: string
  sort_order: number
}

interface PersonPrivilege {
  module: string
  privilege_code: string
  is_granted: boolean
}

interface PersonPrivilegesModalProps {
  user: { person_id: string; full_name: string }
  t: T
  tCommon: T
  onClose: () => void
}

export default function PersonPrivilegesModal({ user, t, tCommon, onClose }: PersonPrivilegesModalProps) {
  const { t: tModules } = useLang()
  const [modulePrivs, setModulePrivs] = useState<ModulePrivilege[]>([])
  const [states, setStates] = useState<Map<string, Override>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/settings/person-privileges?person_id=${user.person_id}`)
      if (!alive) return
      if (res.ok) {
        const data = await res.json()
        const catalogue: ModulePrivilege[] = data.modulePrivileges ?? []
        const overrides: PersonPrivilege[] = data.personPrivileges ?? []
        const map = new Map<string, Override>()
        for (const mp of catalogue) map.set(`${mp.module}:${mp.privilege_code}`, 'inherit')
        for (const pp of overrides) {
          map.set(`${pp.module}:${pp.privilege_code}`, pp.is_granted ? 'grant' : 'deny')
        }
        setModulePrivs(catalogue)
        setStates(map)
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [user.person_id])

  function setState(key: string, value: Override) {
    setStates(prev => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const privileges: PersonPrivilege[] = []
    for (const mp of modulePrivs) {
      const key = `${mp.module}:${mp.privilege_code}`
      const state = states.get(key) ?? 'inherit'
      if (state === 'inherit') continue
      privileges.push({ module: mp.module, privilege_code: mp.privilege_code, is_granted: state === 'grant' })
    }
    const res = await fetch('/api/settings/person-privileges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: user.person_id, privileges }),
    })
    setSaving(false)
    if (res.ok) {
      toastSuccess(t('saved'))
      onClose()
    } else {
      const data = await res.json().catch(() => ({}))
      toastError(data.error ?? t('error'))
    }
  }

  // Group catalogue by module
  const grouped: Record<string, ModulePrivilege[]> = {}
  for (const mp of modulePrivs) {
    if (!grouped[mp.module]) grouped[mp.module] = []
    grouped[mp.module].push(mp)
  }

  const OPTIONS: { value: Override; label: string; on: string; onBg: string }[] = [
    { value: 'inherit', label: t('inherit'), on: 'var(--text)', onBg: 'var(--surface-2)' },
    { value: 'grant', label: t('grant'), on: '#fff', onBg: 'var(--success)' },
    { value: 'deny', label: t('deny'), on: '#fff', onBg: 'var(--danger)' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('title')}: {user.full_name}</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Hint */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('hint')}</p>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '14px 20px', flex: 1 }}>
          {loading ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>{t('loading')}</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>{t('empty')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([module, privs]) => (
                <div key={module}>
                  {/* Module header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', backgroundColor: 'var(--surface-2)',
                    borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10,
                  }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {(tModules.nav as Record<string, string>)[module] ?? module}
                    </span>
                  </div>

                  {/* Privilege rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {privs.map(p => {
                      const key = `${module}:${p.privilege_code}`
                      const current = states.get(key) ?? 'inherit'
                      return (
                        <div key={p.privilege_code} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                          backgroundColor: 'var(--surface)',
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{p.privilege_name}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: 0, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.privilege_code}</p>
                          </div>
                          {/* 3-way segmented control */}
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {OPTIONS.map(opt => {
                              const active = current === opt.value
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setState(key, opt.value)}
                                  style={{
                                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    border: `1px solid ${active ? (opt.value === 'grant' ? 'var(--success)' : opt.value === 'deny' ? 'var(--danger)' : 'var(--border-strong)') : 'var(--border)'}`,
                                    backgroundColor: active ? opt.onBg : 'var(--surface)',
                                    color: active ? opt.on : 'var(--text-muted)',
                                    transition: 'background-color 0.1s, color 0.1s, border-color 0.1s',
                                  }}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{tCommon('cancel')}</button>
          <button onClick={save} disabled={saving || loading} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || loading) ? 'not-allowed' : 'pointer', opacity: (saving || loading) ? 0.6 : 1 }}>{t('save')}</button>
        </div>
      </div>
    </div>
  )
}
