'use client'

const TABS = [
  { id: 'portfolio', label: 'Portfolio', icon: 'M3 13h2v8H3v-8zm4-4h2v12H7V9zm4-4h2v16h-2V5zm4 6h2v10h-2V11zm4-2h2v12h-2V9z' },
  { id: 'plan', label: 'Plan Rector', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'tools', label: 'Herramientas', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

export default function TabNav({ active, onChange }) {
  return (
    <nav className="border-b border-stone-200" style={{ background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)' }}>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="flex gap-2 py-3">
          {TABS.map(t => {
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`flex items-center gap-2.5 px-5 py-2.5 text-[13px] font-semibold tracking-[0.06em] rounded-lg transition-all ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                }`}
                style={isActive ? { background: 'var(--accent)' } : {}}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                </svg>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
