'use client'

const POSICIONES = [
  {ticker:'Thomaspj',broker:'eToro',cl:'nucleo',estado:'✓',texto:'NÚCLEO intocable. +28% semana 28/03. Tesis intacta.'},
  {ticker:'AROC',broker:'eToro',cl:'tactica',estado:'~',texto:'Nueva entrada 26/03. Archrock gas compresión US.'},
  {ticker:'FIX',broker:'eToro',cl:'momentum',estado:'~',texto:'Comfort Systems HVAC. Earnings 29 abril — SL antes.'},
  {ticker:'LDO.MI',broker:'eToro',cl:'tactica',estado:'⚠',texto:'Leonardo defensa IT. -5,29% primera semana. Earnings 7 mayo.'},
  {ticker:'DVN',broker:'XTB',cl:'momentum',estado:'✓',texto:'+5,32% esta semana. Devon Energy. Catalizador fusión Coterra Q2.'},
  {ticker:'EOG',broker:'XTB',cl:'momentum',estado:'✓',texto:'+7,10% esta semana. EOG Resources. Descorrelación defensiva.'},
  {ticker:'CME',broker:'IBKR',cl:'nucleo',estado:'~',texto:'NÚCLEO descorrelacionador. Ex-div 8 jun $1,30.'},
  {ticker:'ROST',broker:'IBKR',cl:'tactica',estado:'~',texto:'Ross Stores off-price retail. -1,12% semana.'},
  {ticker:'SXI',broker:'IBKR',cl:'tactica',estado:'⚠',texto:'-3,14% esta semana. Standex smallcap. Vigilar.'},
]

const RADAR = [
  {ticker:'IAU',nombre:'Oro ETF',cl:'nucleo',conv:5,texto:'Zona entrada $3.050–$3.150. IAU x1 en eToro. Precio spot >$3.300 — esperar pullback.'},
  {ticker:'V',nombre:'Visa',cl:'nucleo',conv:4,texto:'Alta convicción. Soporte $310–$320. Earnings 22 abril — no entrar sin SL.'},
  {ticker:'MU',nombre:'Micron',cl:'tactica',conv:3,texto:'Pendiente confirmación suelo técnico. Riesgo sector memoria. Condicional.'},
  {ticker:'SAP',nombre:'SAP SE',cl:'tactica',conv:3,texto:'Contrarian EU. Pendiente análisis earnings Q1 (21 abril).'},
]

const EST_COLOR: Record<string,string> = {'✓':'#2ecc8a','~':'#e8a030','⚠':'#e05555'}
const CL_COLOR: Record<string,string> = {nucleo:'#2ecc8a',tactica:'#e8a030',momentum:'#4a8fd4'}
const CL_LABEL: Record<string,string> = {nucleo:'NÚCLEO',tactica:'TÁCTICA',momentum:'MO MEN TUM'}

const Dot = ({c,n}: {c:number,n:number}) => (
  <span>{'●'.repeat(n).split('').map((_, i) => (
    <span key={i} style={{ color: i < c ? '#e8a030' : '#2f3540', fontSize: 11 }}>●</span>
  ))}</span>
)

export default function Intel() {
  const card: React.CSSProperties = {
    background:'#13161a', border:'1px solid #2f3540', borderRadius:8, padding:'.8rem 1rem'
  }
  const titleSt: React.CSSProperties = {
    fontSize:10, color:'#727a87', fontFamily:'monospace', textTransform:'uppercase',
    letterSpacing:'.08em', marginBottom:'.6rem', paddingBottom:'.4rem', borderBottom:'1px solid #2f3540'
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:'1rem' }}>
      {/* Seguimiento */}
      <div style={card}>
        <div style={titleSt}>Seguimiento · posiciones abiertas</div>
        {POSICIONES.map(p => (
          <div key={p.ticker} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'.3rem 0', borderBottom:'1px solid #2f3540' }}>
            <span style={{ fontSize:13, color:EST_COLOR[p.estado], flexShrink:0, marginTop:1 }}>{p.estado}</span>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ fontSize:11, fontWeight:600, color:'#f0f2f5' }}>{p.ticker}</span>
                <span style={{ fontSize:8, color:'#727a87' }}>{p.broker}</span>
                <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:CL_COLOR[p.cl]+'22', color:CL_COLOR[p.cl], border:`1px solid ${CL_COLOR[p.cl]}44` }}>
                  {CL_LABEL[p.cl]}
                </span>
              </div>
              <div style={{ fontSize:10, color:'#adb5c0', lineHeight:1.5 }}>{p.texto}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Radar */}
      <div style={card}>
        <div style={titleSt}>Radar · oportunidades</div>
        {RADAR.map(r => (
          <div key={r.ticker} style={{ padding:'.35rem 0', borderBottom:'1px solid #2f3540' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'#f0f2f5' }}>{r.ticker}</span>
              <span style={{ fontSize:10, color:'#adb5c0' }}>{r.nombre}</span>
              <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:CL_COLOR[r.cl]+'22', color:CL_COLOR[r.cl], border:`1px solid ${CL_COLOR[r.cl]}44` }}>
                {CL_LABEL[r.cl]}
              </span>
              <span style={{ marginLeft:'auto' }}><Dot c={r.conv} n={5} /></span>
            </div>
            <div style={{ fontSize:10, color:'#adb5c0', lineHeight:1.5 }}>{r.texto}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
