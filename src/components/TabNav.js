'use client'

const TABS = [
  { id: 'portfolio', label: 'Portfolio', icon: 'M3 13h2v8H3v-8zm4-4h2v12H7V9zm4-4h2v16h-2V5zm4 6h2v10h-2V11zm4-2h2v12h-2V9z' },
  { id: 'plan', label: 'Plan Rector', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'tools', label: 'Herramientas', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

export default function TabNav({ active, onChange }) {
  return (
    <nav className="bg-white/85 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="flex gap-1 py-2">
          {TABS.map(t => {
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] rounded-lg transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-stone-100 hover:text-slate-700'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
