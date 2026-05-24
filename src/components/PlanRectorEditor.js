'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export default function PlanRectorEditor({ planRector, onRefresh }) {
  const editorRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [dirty, setDirty] = useState(false)
  const saveTimerRef = useRef(null)
  const isFirstLoad = useRef(true)

  // ── Cargar contenido inicial UNA SOLA VEZ ──
  useEffect(() => {
    if (!editorRef.current) return
    if (isFirstLoad.current && planRector?.content != null) {
      editorRef.current.innerHTML = planRector.content || ''
      isFirstLoad.current = false
      if (planRector.updated_at) setLastSavedAt(new Date(planRector.updated_at))
    }
  }, [planRector])

  // ── Guardar en Supabase ──
  const persist = useCallback(async () => {
    if (!editorRef.current) return
    const content = editorRef.current.innerHTML
    setSaving(true)
    try {
      if (planRector?.id) {
        await supabase.from('plan_rector')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', planRector.id)
      } else {
        await supabase.from('plan_rector').insert({ content })
      }
      setLastSavedAt(new Date())
      setDirty(false)
    } catch (e) {
      console.error('Plan Rector save error', e)
    } finally {
      setSaving(false)
    }
  }, [planRector])

  // ── Autosave debounced 1.5s tras última edición ──
  const handleInput = () => {
    setDirty(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(persist, 1500)
  }

  // ── Salvar al desmontar / cerrar pestaña ──
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        persist()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [dirty, persist])

  // ── execCommand wrapper (deprecated pero funciona universalmente) ──
  const exec = (command, value = null) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  const fmtTime = (d) => {
    if (!d) return '—'
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'ahora'
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* TOOLBAR */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex-wrap">
        <ToolBtn label="B" tooltip="Negrita (Cmd+B)" bold onClick={() => exec('bold')} />
        <ToolBtn label="I" tooltip="Cursiva (Cmd+I)" italic onClick={() => exec('italic')} />
        <ToolBtn label="U" tooltip="Subrayado (Cmd+U)" underline onClick={() => exec('underline')} />
        <Sep />
        <ToolBtn label="H1" tooltip="Título 1" onClick={() => exec('formatBlock', '<h1>')} />
        <ToolBtn label="H2" tooltip="Título 2" onClick={() => exec('formatBlock', '<h2>')} />
        <ToolBtn label="¶" tooltip="Párrafo" onClick={() => exec('formatBlock', '<p>')} />
        <Sep />
        <ToolBtn icon="bullet" tooltip="Lista" onClick={() => exec('insertUnorderedList')} />
        <ToolBtn icon="number" tooltip="Lista numerada" onClick={() => exec('insertOrderedList')} />
        <Sep />
        <ToolBtn icon="hl-y" tooltip="Resaltado amarillo" onClick={() => exec('hiliteColor', '#fef08a')} />
        <ToolBtn icon="hl-g" tooltip="Resaltado verde" onClick={() => exec('hiliteColor', '#bbf7d0')} />
        <ToolBtn icon="hl-r" tooltip="Resaltado rojo" onClick={() => exec('hiliteColor', '#fecaca')} />
        <ToolBtn icon="hl-clear" tooltip="Quitar resaltado" onClick={() => exec('hiliteColor', 'transparent')} />
        <Sep />
        <ToolBtn icon="clear" tooltip="Quitar formato" onClick={() => exec('removeFormat')} />
        <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-400 font-mono">
          {saving ? <span className="text-amber-500">guardando…</span>
            : dirty  ? <span className="text-slate-400">sin guardar</span>
            :          <span className="text-green-600">✓ {fmtTime(lastSavedAt)}</span>}
          <button onClick={persist} className="text-[10px] font-bold text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-0.5 rounded transition">
            Guardar
          </button>
        </div>
      </div>

      {/* EDITOR */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={persist}
        className="plan-rector-editor px-6 py-5 min-h-[480px] outline-none text-[14px] leading-[1.65] text-slate-700"
        style={{ caretColor: '#2EA543' }}
      />

      {/* Estilos contextuales del contenido */}
      <style jsx>{`
        .plan-rector-editor :global(h1) { font-size: 22px; font-weight: 700; margin: 18px 0 10px; color: #0f172a; }
        .plan-rector-editor :global(h2) { font-size: 17px; font-weight: 700; margin: 14px 0 8px; color: #334155; letter-spacing: 0.01em; }
        .plan-rector-editor :global(p) { margin: 6px 0; }
        .plan-rector-editor :global(b), .plan-rector-editor :global(strong) { font-weight: 700; color: #0f172a; }
        .plan-rector-editor :global(ul) { padding-left: 20px; margin: 6px 0; list-style-type: disc; }
        .plan-rector-editor :global(ol) { padding-left: 22px; margin: 6px 0; list-style-type: decimal; }
        .plan-rector-editor :global(li) { margin: 2px 0; }
        .plan-rector-editor :global(a) { color: #2EA543; text-decoration: underline; }
        .plan-rector-editor:empty::before {
          content: 'Plan rector — escribe libremente. Cmd+B para negrita, H1/H2 para títulos, listas y resaltados disponibles en la barra superior.';
          color: #cbd5e1;
          font-style: italic;
        }
      `}</style>
    </div>
  )
}

// ─── Subcomponentes UI ──────────────────────────
function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />
}

function ToolBtn({ label, icon, tooltip, onClick, bold, italic, underline }) {
  const style = {
    fontWeight: bold ? 700 : 600,
    fontStyle: italic ? 'italic' : 'normal',
    textDecoration: underline ? 'underline' : 'none',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className="min-w-[28px] h-7 px-1.5 text-[11px] text-slate-600 hover:bg-white hover:text-slate-900 rounded border border-transparent hover:border-slate-200 transition flex items-center justify-center"
      style={style}
    >
      {icon ? <Icon name={icon} /> : label}
    </button>
  )
}

function Icon({ name }) {
  const s = 'w-3.5 h-3.5'
  switch (name) {
    case 'bullet':
      return <svg className={s} viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="4" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="3" cy="12" r="1.2"/><rect x="6" y="3.4" width="9" height="1.2" rx="0.6"/><rect x="6" y="7.4" width="9" height="1.2" rx="0.6"/><rect x="6" y="11.4" width="9" height="1.2" rx="0.6"/></svg>
    case 'number':
      return <svg className={s} viewBox="0 0 16 16" fill="currentColor"><text x="0" y="6" fontSize="5" fontFamily="monospace" fontWeight="bold">1</text><text x="0" y="11" fontSize="5" fontFamily="monospace" fontWeight="bold">2</text><text x="0" y="15.5" fontSize="5" fontFamily="monospace" fontWeight="bold">3</text><rect x="6" y="3" width="9" height="1.1" rx="0.5"/><rect x="6" y="7.4" width="9" height="1.1" rx="0.5"/><rect x="6" y="11.8" width="9" height="1.1" rx="0.5"/></svg>
    case 'hl-y':
      return <span className="block w-3.5 h-3.5 rounded-sm" style={{ background: '#fef08a' }} />
    case 'hl-g':
      return <span className="block w-3.5 h-3.5 rounded-sm" style={{ background: '#bbf7d0' }} />
    case 'hl-r':
      return <span className="block w-3.5 h-3.5 rounded-sm" style={{ background: '#fecaca' }} />
    case 'hl-clear':
      return <svg className={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 3l10 10M3 13l10-10"/></svg>
    case 'clear':
      return <svg className={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 4h8M4 8h5M4 12h8"/><path d="M11 11l3 3M14 11l-3 3" stroke="#ef4444"/></svg>
    default: return null
  }
}
