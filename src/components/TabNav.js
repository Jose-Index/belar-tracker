'use client'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'historico', label: 'Histórico', icon: '📈' },
  { id: 'radar', label: 'Radar', icon: '🎯' },
  { id: 'tools', label: 'Herramientas', icon: '🔧' },
]

export default function TabNav({ active, onChange }) {
  return (
    <nav className="bg-white border-b border-slate-200 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold tracking-wide transition-all border-b-2 ${
              active === t.id
                ? 'border-green-500 text-green-700 bg-green-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
