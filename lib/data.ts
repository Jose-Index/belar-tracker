export const W_BASE = [
  {d:'06/04/24',e:3240,x:2100,i:0,bu:0},
  {d:'14/12/24',e:6800,x:5200,i:0,bu:780},
  {d:'11/01/25',e:7200,x:5800,i:800,bu:820},
  {d:'08/03/25',e:8200,x:6500,i:1100,bu:950},
  {d:'05/04/25',e:8800,x:7000,i:1400,bu:980},
  {d:'20/09/25',e:9600,x:7700,i:1900,bu:1100},
  {d:'03/01/26',e:9800,x:7900,i:2100,bu:980},
  {d:'28/02/26',e:10400,x:8300,i:2300,bu:920},
  {d:'21/03/26',e:10500,x:8300,i:2380,bu:960},
  {d:'28/03/26',e:10133,x:8126,i:2320,bu:1020},
]

export const POSITIONS = [
  {ticker:'Thomaspj',broker:'eToro',entry:'18/03/25',inv:2675,val:3411,cl:'nucleo',notes:'NUCLEO intocable. +28% semana 28/03. Tesis intacta.',spark:[2675,2900,3200,3411]},
  {ticker:'AROC',broker:'eToro',entry:'26/03/26',inv:1010,val:994,cl:'tactica',notes:'Archrock gas compresion US. SL 33.15.',spark:[1010,1005,990,994]},
  {ticker:'FIX',broker:'eToro',entry:'26/03/26',inv:1364,val:1416,cl:'momentum',notes:'Comfort Systems HVAC. Earnings 29 abril. SL antes.',spark:[1364,1380,1416]},
  {ticker:'IAU',broker:'eToro',entry:'30/03/26',inv:2054,val:2110,cl:'nucleo',notes:'Oro ETF x1. SL 81.00. Posicion estructural.',spark:[2054,2080,2110]},
  {ticker:'NEM',broker:'eToro',entry:'02/04/26',inv:979,val:1018,cl:'tactica',notes:'Newmont Mining. SL 96.50. Amplifica oro.',spark:[979,995,1018]},
  {ticker:'SHEL.L',broker:'eToro',entry:'30/03/26',inv:1000,val:1003,cl:'tactica',notes:'Shell PLC. SL 3280p RESPIRO.',spark:[1000,1001,1003]},
  {ticker:'DVN',broker:'XTB',entry:'19/03/26',inv:890,val:937,cl:'momentum',notes:'Devon Energy. SL set. Catalizador fusion Coterra Q2.',spark:[890,910,937]},
  {ticker:'DIA',broker:'XTB',entry:'31/03/26',inv:910,val:931,cl:'tactica',notes:'Dow Jones ETF. SL set.',spark:[910,920,931]},
  {ticker:'EOG',broker:'XTB',entry:'19/03/26',inv:503,val:539,cl:'momentum',notes:'EOG Resources. SL set. Descorrelacion defensiva.',spark:[503,520,539]},
  {ticker:'ICE',broker:'XTB',entry:'02/04/26',inv:650,val:652,cl:'tactica',notes:'Intercontinental Exchange. SL 148.50. Earnings 7 may.',spark:[650,651,652]},
  {ticker:'CME',broker:'IBKR',entry:'06/03/26',inv:900,val:846,cl:'nucleo',notes:'NUCLEO descorrelacionador. Sin SL. Ex-div 8 jun 1.30.',spark:[900,920,895,846]},
  {ticker:'ROST',broker:'IBKR',entry:'06/03/26',inv:963,val:990,cl:'tactica',notes:'Ross Stores off-price retail. SL 213.65.',spark:[963,975,990]},
]

export const CALENDARIO = [
  {d:'22/04/26',tipo:'earnings',icono:'E',titulo:'FIX - Comfort Systems',prioridad:'alta',texto:'Earnings Q1. SL pegado 3-5 dias antes.'},
  {d:'23/04/26',tipo:'earnings',icono:'E',titulo:'NEM - Newmont Mining',prioridad:'alta',texto:'Earnings Q1. Posicion reciente. Vigilar gap risk.'},
  {d:'07/05/26',tipo:'earnings',icono:'E',titulo:'ICE - Intercontinental Exchange',prioridad:'media',texto:'Earnings Q1. Suficiente clearance para posicion actual.'},
  {d:'08/06/26',tipo:'dividendo',icono:'D',titulo:'CME - Ex-dividendo 1.30',prioridad:'baja',texto:'Ex-div 8 junio. Mantener posicion. NUCLEO IBKR.'},
  {d:'06/05/26',tipo:'macro',icono:'M',titulo:'FED - Reunion FOMC',prioridad:'alta',texto:'Precaucion general 2-3 dias antes.'},
]

export const FRASES = [
  {q:'El riesgo viene de no saber lo que estas haciendo.',a:'Warren Buffett'},
  {q:'En los mercados, la certeza es una ilusion cara.',a:'Michael Platt'},
  {q:'La paciencia es la virtud mas rentable del inversor.',a:'Charlie Munger'},
  {q:'Compra cuando haya sangre en las calles.',a:'Baron Rothschild'},
]
