'use client'

const TABS = [
  { id: 'dashboard', label: 'DASHBOARD', icon: '\u25C9' },
  { id: 'historico', label: 'HIST\u00d3RICO', icon: '\u23F1' },
  { id: 'radar', label: 'RADAR', icon: '\u25CE' },
  { id: 'tools', label: 'HERRAMIENTAS', icon: '\u2699' },
]

export default function TabNav({ active, onChange }) {
  return (
    <nav className="bg-white border-b border-slate-200 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex">
        {TABS.map(t => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={`px-5 py-2.5 text-[11px] font-semibold tracking-wider transition-all border-b-2 ${
              active === t.id
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
            }`}>
            <span className="mr-1.5 text-[10px] opacity-60">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
