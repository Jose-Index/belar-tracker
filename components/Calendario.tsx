'use client'
import { diasHasta } from '@/lib/utils'

interface Evento {
  d: string; tipo: string; icono: string; titulo: string; prioridad: string; texto: string
}

const TIPO_COLOR: Record<string,string> = { earnings:'#4a8fd4', macro:'#e8a030', dividendo:'#2ecc8a', vigilar:'#F7931A' }
const TIPO_LABEL: Record<string,string> = { earnings:'EARN', macro:'MACRO', dividendo:'DIV', vigilar:'OJO' }
const PRIO_COLOR: Record<string,string> = { alta:'#e05555', media:'#e8a030', baja:'#727a87' }

export default function Calendario({ eventos }: { eventos: Evento[] }) {
  const sorted = [...eventos].sort((a, b) => {
    const pa = a.d.split('/'), pb = b.d.split('/')
    return new Date(+('20'+pa[2]),+pa[1]-1,+pa[0]).getTime() - new Date(+('20'+pb[2]),+pb[1]-1,+pb[0]).getTime()
  })

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:6, marginBottom:'1rem' }}>
      {sorted.map((ev, i) => {
        const dias = diasHasta(ev.d)
        const diasStr = dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : `${dias}d`
        const diasColor = dias <= 7 ? '#e05555' : dias <= 14 ? '#e8a030' : '#727a87'
        const tc = TIPO_COLOR[ev.tipo] ?? '#727a87'
        return (
          <div key={i} style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:6, padding:'.5rem .7rem', display:'flex', flexDirection:'column', gap:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:12, flexShrink:0 }}>{ev.icono}</span>
              <span style={{ fontSize:10, fontWeight:700, color:'#f0f2f5', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.titulo}</span>
              <span style={{ fontSize:8, padding:'1px 4px', borderRadius:3, background:tc+'22', color:tc, border:`1px solid ${tc}44`, flexShrink:0 }}>
                {TIPO_LABEL[ev.tipo]}
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, fontWeight:600, color:'#adb5c0' }}>{ev.d}</span>
              <span style={{ fontSize:9, fontWeight:600, color:diasColor }}>{diasStr}</span>
              <div style={{ width:3, height:3, borderRadius:'50%', background:PRIO_COLOR[ev.prioridad], flexShrink:0 }} />
            </div>
            <div style={{ fontSize:9, color:'#727a87', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {ev.texto}
            </div>
          </div>
        )
      })}
    </div>
  )
}
