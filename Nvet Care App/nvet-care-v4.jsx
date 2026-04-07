import { useState, useRef, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
   ANÁLISIS DE DEBILIDADES v3 → CORRECCIONES v4
   ─────────────────────────────────────────────────────────────
   1. VISUAL: Neon verde #4AFF8C → demasiado agresivo, sin elegancia.
      FIX: Paleta monocromática sage+ivory con un único acento dorado cálido.
   
   2. TIPOGRAFÍA: Bebas Neue + Rajdhani + JetBrains Mono = 4 fuentes = ruido.
      FIX: 2 fuentes. Cormorant Garamond (elegancia display) + DM Sans (legibilidad UI).
   
   3. DENSIDAD: Demasiados elementos, badges, gradientes y glows simultáneos.
      FIX: Grid system 8pt. Un solo elemento destacado por card. Respiro generoso.
   
   4. CHAT: Funcional pero UI genérica y sin jerarquía clara de roles.
      FIX: Diseño editorial con separación clara sistema/vet/usuario. Precios como tarjetas.
   
   5. AGENDAMIENTO: Stepper correcto pero sin feedback de estado real por paso.
      FIX: Estado validado por paso con micro-confirmación visual.
   
   6. TIERS: Cards de suscripción visualmente similares entre sí.
      FIX: Tamaño y peso tipográfico diferencial. VetElite = card destacada.
   
   7. PAGOS: PaymentMethodSelector repetitivo en 3 vistas (mobile, booking, wallet).
      FIX: Componente único reutilizable con contexto (compact/full/inline).
   
   8. CONTABILIDAD: Tabla demasiado ancha (14 columnas), ilegible en pantalla.
      FIX: Vista de lista tipo ledger con acordeón para detalles.
   
   9. MOBILE: Header repetido en cada screen consume espacio vital.
      FIX: Header dinámico contextual, mínimo 40px, max 80px.
   
   10. LOGO: SVG correcto pero paths del gato/perro imprecisos.
       FIX: SVG simplificado pero más fiel a siluetas reales de la imagen.
   ──────────────────────────────────────────────────────────── */

/* ═════════════════════════════════════════════════════════════
   TOKENS — MINIMAL LUXURY
   Inspiración: Hermès digital, Montblanc, Aesop
═════════════════════════════════════════════════════════════ */
const T = {
  // Neutrals — warm ivory / charcoal
  canvas:   "#F8F6F2",   // fondo principal (papel premium)
  surface:  "#FFFFFF",   // cards y paneles
  surfaceAlt:"#F2F0EB",  // inputs, fondo alternativo
  line:     "#E4E0D8",   // divisores
  lineHi:   "#CCC8BF",   // divisores importantes

  // Text hierarchy
  ink:      "#1A1915",   // texto primario
  inkSec:   "#6B6560",   // texto secundario
  inkMuted: "#A8A49E",   // texto muted
  inkInv:   "#F8F6F2",   // texto sobre oscuro

  // Brand green — sage, no neon
  sage:     "#4A6741",   // verde principal (oliva profundo)
  sageLt:   "#6B8E62",   // verde secundario
  sageFade: "#4A674112", // verde ultralight

  // Gold — CTG token accent (el ÚNICO acento vivo)
  gold:     "#B8962E",   // oro principal
  goldLt:   "#D4AF50",   // oro claro
  goldFade: "#B8962E0F", // oro ultralight

  // Payments
  payPSE:   "#1A56DB",   // azul PSE
  payTRF:   "#0F766E",   // teal transferencia
  payCTG:   "#B8962E",   // oro CTG

  // Status
  ok:       "#2D7D46",
  warn:     "#92640A",
  err:      "#9B2323",
  pending:  "#6B5B00",

  // Dark panel (sidebar)
  dark:     "#1A1915",
  darkAlt:  "#252320",
  darkLine: "#2E2B27",
};

const F = {
  serif: "'Cormorant Garamond', 'Garamond', serif",
  sans:  "'DM Sans', 'Nunito Sans', sans-serif",
  mono:  "'DM Mono', 'Courier New', monospace",
};

const TIERS = {
  free: {
    id:"free", name:"Free Vet", badge:"GRATIS",
    price:0, priceCOP:0, commission:10, limit:5,
    color:T.inkMuted,
    perks:["5 servicios/mes","Perfil básico verificado","CTG · PSE · Transferencia"],
  },
  pro: {
    id:"pro", name:"VetPro", badge:"PRO",
    price:10, priceCOP:42000, commission:8, limit:null,
    color:T.sage,
    perks:["Servicios ilimitados","8% comisión por servicio","Perfil destacado","Chat prioritario","Reportes mensuales"],
  },
  elite: {
    id:"elite", name:"VetElite", badge:"ELITE",
    price:20, priceCOP:84000, commission:3, limit:null,
    color:T.gold,
    perks:["Servicios ilimitados","3% comisión — la más baja","Top de listado garantizado","Insignia Elite verificada","Analytics avanzado","Chat VIP + soporte dedicado","Acceso anticipado a features"],
  },
};

/* ═════════════════════════════════════════════════════════════
   GLOBAL CSS
═════════════════════════════════════════════════════════════ */
const CSS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; }
    body { background: ${T.canvas}; color: ${T.ink}; font-family: ${F.sans}; }
    input, select, textarea, button { font-family: ${F.sans}; outline: none; }
    ::-webkit-scrollbar { width: 3px; height: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${T.lineHi}; border-radius: 2px; }
    @keyframes fadeUp   { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes shimmer  { 0%,100% { opacity:.5; } 50% { opacity:1; } }
    @keyframes spin     { to { transform:rotate(360deg); } }
    @keyframes pulse    { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }
    .fade-up  { animation: fadeUp  .25s ease forwards; }
    .fade-in  { animation: fadeIn  .2s ease forwards; }
    .shimmer  { animation: shimmer 1.8s ease-in-out infinite; }
    .spin     { animation: spin    1s linear infinite; display:inline-block; }
    select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B6560' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px!important; }
    button:hover { opacity:.88; transition:opacity .12s; }
    .hover-lift:hover { transform:translateY(-1px); box-shadow:0 4px 20px rgba(0,0,0,.08); transition:all .2s; }
    table { border-collapse: collapse; }
  `}</style>
);

/* ═════════════════════════════════════════════════════════════
   DESIGN SYSTEM
═════════════════════════════════════════════════════════════ */
const S = {
  // Cards
  card: { background:T.surface, borderRadius:12, border:`1px solid ${T.line}` },
  cardPad: { padding:"24px 28px" },

  // Typography
  h1:   { fontFamily:F.serif, fontSize:32, fontWeight:400, color:T.ink, letterSpacing:"-.3px", lineHeight:1.2 },
  h2:   { fontFamily:F.serif, fontSize:24, fontWeight:400, color:T.ink, letterSpacing:"-.2px" },
  h3:   { fontFamily:F.sans,  fontSize:15, fontWeight:600, color:T.ink },
  label:{ fontFamily:F.sans,  fontSize:11, fontWeight:600, color:T.inkMuted, letterSpacing:"1.2px", textTransform:"uppercase" },
  mono: { fontFamily:F.mono,  fontSize:12, color:T.inkSec },
  caption:{ fontFamily:F.sans, fontSize:12, color:T.inkMuted },

  // Inputs
  input: {
    width:"100%", padding:"10px 14px",
    background:T.surfaceAlt, border:`1px solid ${T.line}`,
    borderRadius:8, color:T.ink, fontSize:14,
    fontFamily:F.sans, transition:"border .15s",
  },

  // Grids
  g2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 },
  g3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 },
  g4: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 },

  // Divider
  hr: { height:1, background:T.line, border:"none" },
};

// Buttons
const Btn = ({ children, variant="primary", size="md", onClick, disabled, full, style:sx }) => {
  const base = {
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
    border:"none", cursor:disabled?"not-allowed":"pointer", fontFamily:F.sans,
    fontWeight:600, letterSpacing:".1px", borderRadius:8, transition:"all .15s",
    opacity:disabled?.45:1, width:full?"100%":"auto",
    padding: size==="sm"?"6px 14px":size==="lg"?"14px 28px":"10px 20px",
    fontSize: size==="sm"?12:14,
    ...(sx||{}),
  };
  const v = {
    primary:  { background:T.sage,   color:T.inkInv, boxShadow:"0 1px 3px rgba(74,103,65,.25)" },
    gold:     { background:T.gold,   color:T.surface, boxShadow:"0 1px 3px rgba(184,150,46,.25)" },
    ghost:    { background:"transparent", color:T.inkSec, border:`1px solid ${T.line}` },
    danger:   { background:"transparent", color:T.err, border:`1px solid ${T.err}33` },
    pse:      { background:"transparent", color:T.payPSE, border:`1px solid ${T.payPSE}44` },
    transfer: { background:"transparent", color:T.payTRF, border:`1px solid ${T.payTRF}44` },
    dark:     { background:T.dark, color:T.inkInv },
  };
  return <button style={{ ...base, ...v[variant] }} onClick={!disabled?onClick:undefined}>{children}</button>;
};

// Badge
const Badge = ({ children, variant="default" }) => {
  const v = {
    default:  { background:T.surfaceAlt, color:T.inkSec },
    sage:     { background:`${T.sage}12`, color:T.sage, border:`1px solid ${T.sage}30` },
    gold:     { background:`${T.gold}12`, color:T.gold, border:`1px solid ${T.gold}30` },
    ok:       { background:`${T.ok}10`,   color:T.ok,   border:`1px solid ${T.ok}30` },
    warn:     { background:`${T.warn}10`, color:T.warn, border:`1px solid ${T.warn}30` },
    err:      { background:`${T.err}10`,  color:T.err,  border:`1px solid ${T.err}30` },
    pse:      { background:`${T.payPSE}10`, color:T.payPSE, border:`1px solid ${T.payPSE}30` },
    trf:      { background:`${T.payTRF}10`, color:T.payTRF, border:`1px solid ${T.payTRF}30` },
    free:     { background:T.surfaceAlt, color:T.inkMuted, border:`1px solid ${T.line}` },
    pro:      { background:`${T.sage}10`, color:T.sage, border:`1px solid ${T.sage}30` },
    elite:    { background:`${T.gold}10`, color:T.gold, border:`1px solid ${T.gold}30` },
    dark:     { background:T.dark, color:T.inkInv },
  };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, letterSpacing:".3px", ...v[variant] }}>
      {children}
    </span>
  );
};

// Stat metric
const Metric = ({ label, value, sub, accent=T.sage }) => (
  <div style={{ ...S.card, padding:"20px 22px", borderLeft:`2px solid ${accent}` }}>
    <div style={{ ...S.label, marginBottom:10 }}>{label}</div>
    <div style={{ fontFamily:F.serif, fontSize:28, fontWeight:400, color:T.ink, letterSpacing:"-.5px" }}>{value}</div>
    {sub && <div style={{ ...S.caption, marginTop:6 }}>{sub}</div>}
  </div>
);

// Field wrapper
const Field = ({ label, children }) => (
  <div>
    <div style={{ ...S.label, marginBottom:8 }}>{label}</div>
    {children}
  </div>
);

// Progress bar
const Bar = ({ pct, color=T.sage, thin }) => (
  <div style={{ height:thin?2:4, borderRadius:2, background:T.surfaceAlt, overflow:"hidden" }}>
    <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background:color, borderRadius:2, transition:"width .5s ease" }}/>
  </div>
);

// Divider
const Hr = ({ my=20 }) => <div style={{ height:1, background:T.line, margin:`${my}px 0` }}/>;

// Pay badge
const PayBadge = ({ m }) => {
  if (m==="CTG")      return <Badge variant="gold">◈ CTG Token</Badge>;
  if (m==="PSE")      return <Badge variant="pse">⬡ PSE</Badge>;
  if (m==="TRANSFER") return <Badge variant="trf">→ Transferencia</Badge>;
  return <Badge>{m}</Badge>;
};

// Tier badge
const TierBadge = ({ t }) => {
  const map = { free:"free", pro:"pro", elite:"elite" };
  const names = { free:"Free Vet", pro:"VetPro", elite:"VetElite" };
  const icons = { free:"·", pro:"◆", elite:"◈" };
  return <Badge variant={map[t]}>{icons[t]} {names[t]}</Badge>;
};

/* ═════════════════════════════════════════════════════════════
   NVET CARE LOGO
═════════════════════════════════════════════════════════════ */
const Logo = ({ size=36, text=true, inverted=false }) => {
  const tc = inverted ? T.inkInv : T.ink;
  const gc = inverted ? "#E8D890" : T.gold;
  const sc = inverted ? "#88BB80" : T.sage;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:size*.28, userSelect:"none" }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Outer ring — thin gold */}
        <circle cx="50" cy="50" r="48" stroke={gc} strokeWidth="1.5" fill="none" opacity=".6"/>
        {/* Background fill */}
        <circle cx="50" cy="50" r="45" fill={inverted?"#1A2A18":"#F5F3EF"}/>
        {/* Dog silhouette (right, sage) */}
        <path d="M58 34 C64 28 74 30 76 36 C77.5 41 74.5 45 72 46.5
                 L75 59 C75.8 63 73 66 70 64 L67.5 54
                 C65.5 56.5 63 57.5 60.5 56.5 L57.5 63
                 C56 65.5 53.5 64 54 59.5 L56 50.5
                 C53 48 51.5 44 53.5 39 C55 35.5 58 35 58 34Z"
          fill={sc} opacity=".85"/>
        <path d="M59 33 C60.5 26 71 25.5 73 32 C70.5 32.5 65 33 59 33Z" fill={sc} opacity=".85"/>
        <ellipse cx="68.5" cy="40.5" rx="2" ry="2.5" fill={inverted?"#1A2A18":"#F5F3EF"} opacity=".7"/>
        {/* Cat silhouette (left, gold) */}
        <path d="M42 37 C36 31 26 33 24 39 C22 44.5 25.5 48.5 28.5 49.5
                 L25.5 62 C24.5 66 27.5 68 30.5 66 L33.5 55.5
                 C35.5 58 39 58.5 42 57.5 L45 65
                 C46.5 67.5 49.5 65 48.5 61 L46.5 51.5
                 C49.5 48 50 43.5 48 38.5 C46 34 42 38 42 37Z"
          fill={gc} opacity=".85"/>
        <path d="M31 33 L27 23.5 L36 31Z" fill={gc} opacity=".85"/>
        <path d="M41.5 33 L40.5 23.5 L47.5 31Z" fill={gc} opacity=".85"/>
        <ellipse cx="31.5" cy="44" rx="1.8" ry="2.2" fill={inverted?"#1A2A18":"#F5F3EF"} opacity=".7"/>
      </svg>
      {text && (
        <div style={{ lineHeight:1.1 }}>
          <div style={{ fontFamily:F.serif, fontSize:size*.6, fontWeight:500, letterSpacing:"-.5px", color:tc }}>
            Nvet<span style={{ color:gc, fontStyle:"italic" }}> Care</span>
          </div>
          {size > 26 && (
            <div style={{ fontFamily:F.mono, fontSize:size*.19, color:inverted?"rgba(255,255,255,.4)":T.inkMuted, letterSpacing:"2px", marginTop:1 }}>
              VETERINARY PLATFORM
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// CTG logo
const CTGMark = ({ size=24 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill={T.gold}/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5"/>
    <path d="M66 30C55 20 25 24 23 50c-2 26 28 32 45 22" stroke="rgba(255,255,255,.9)" strokeWidth="9.5" strokeLinecap="round" fill="none"/>
    <text x="50" y="59" textAnchor="middle" fill="rgba(255,255,255,.9)" fontSize="11.5" fontWeight="700" fontFamily={F.mono} letterSpacing="2">CTG</text>
  </svg>
);

/* ═════════════════════════════════════════════════════════════
   PAYMENT METHOD SELECTOR — single reusable component
═════════════════════════════════════════════════════════════ */
const PaySelector = ({ value, onChange, amount=0, mode="full" }) => {
  const CTG = 420;
  const opts = [
    { id:"CTG",      icon:<CTGMark size={26}/>,  label:"CTG One Token",     detail:`${(amount/CTG).toFixed(2)} CTG`,     sub:"Descuento 5.5% · Polygon", accent:T.gold, v:"gold" },
    { id:"PSE",      icon:<span style={{fontSize:18}}>⬡</span>,             label:"PSE",                                detail:`$${amount.toLocaleString("es-CO")} COP`, sub:"ACH Colombia",            accent:T.payPSE, v:"pse" },
    { id:"TRANSFER", icon:<span style={{fontSize:18}}>→</span>,             label:"Transferencia",                      detail:`$${amount.toLocaleString("es-CO")} COP`, sub:"Nequi · Daviplata · Bancol.", accent:T.payTRF, v:"trf" },
  ];
  if (mode==="compact") return (
    <div style={{ display:"flex", gap:8 }}>
      {opts.map(o => (
        <div key={o.id} onClick={()=>onChange(o.id)} style={{ flex:1, padding:"10px 12px", borderRadius:8, border:`1.5px solid ${value===o.id?o.accent:T.line}`, background:value===o.id?`${o.accent}08`:T.surface, cursor:"pointer", transition:"all .15s", textAlign:"center" }}>
          <div style={{ marginBottom:4 }}>{o.icon}</div>
          <div style={{ fontSize:12, fontWeight:600, color:value===o.id?o.accent:T.inkSec }}>{o.id}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {opts.map((o, i) => (
        <div key={o.id} onClick={()=>onChange(o.id)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:10, border:`1.5px solid ${value===o.id?o.accent:T.line}`, background:value===o.id?`${o.accent}07`:T.surface, cursor:"pointer", transition:"all .15s", position:"relative" }}>
          {i===0 && <span style={{ position:"absolute", top:-9, right:14, background:T.gold, color:T.surface, fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:10, letterSpacing:1 }}>RECOMENDADO</span>}
          <div style={{ width:38, height:38, borderRadius:8, background:`${o.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{o.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>{o.label}</div>
            <div style={{ fontSize:12, color:o.accent, fontWeight:500, marginTop:1 }}>{o.detail} · {o.sub}</div>
          </div>
          <div style={{ width:18, height:18, borderRadius:"50%", border:`1.5px solid ${value===o.id?o.accent:T.lineHi}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {value===o.id && <div style={{ width:8, height:8, borderRadius:"50%", background:o.accent }}/>}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   ARBITRATED CHAT
═════════════════════════════════════════════════════════════ */
const Chat = ({ vetName, onClose }) => {
  const [msgs, setMsgs] = useState([
    { from:"sys", text:`Chat protegido con ${vetName}. Todas las interacciones son monitoreadas por Nvet Care. Los precios compartidos aquí son oficiales y vinculantes.`, ts:"14:22" },
    { from:"vet", text:"Hola, bienvenido. ¿En qué puedo ayudarte?", ts:"14:23" },
    { from:"user", text:"Quiero saber el precio de una consulta domiciliaria para mi golden retriever.", ts:"14:23" },
  ]);
  const [input, setInput]   = useState("");
  const [showPL, setShowPL] = useState(false);
  const bottom = useRef();

  const PRICES = [
    { svc:"Consulta domiciliaria", cop:85000, ctg:202 },
    { svc:"Vacunación completa",   cop:65000, ctg:155 },
    { svc:"Desparasitación",       cop:45000, ctg:107 },
    { svc:"Revisión preventiva",   cop:75000, ctg:179 },
    { svc:"Urgencia domiciliaria", cop:150000, ctg:357 },
  ];

  const send = (text, from="user", price=null) => {
    setMsgs(m => [...m, { from, text, ts: new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}), price }]);
    setInput("");
    setTimeout(() => bottom.current?.scrollIntoView({ behavior:"smooth" }), 60);
  };

  const sharePrice = p => {
    setShowPL(false);
    send(`${p.svc}\n$${p.cop.toLocaleString("es-CO")} COP  ·  ${p.ctg} CTG\n✓ Precio oficial verificado por Nvet Care`, "vet", p);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,25,21,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:900, backdropFilter:"blur(6px)" }} className="fade-in">
      <div style={{ width:480, height:"82vh", display:"flex", flexDirection:"column", ...S.card, boxShadow:"0 24px 60px rgba(0,0,0,.18)" }}>

        {/* Header */}
        <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.line}`, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:T.surfaceAlt, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👩‍⚕️</div>
          <div style={{ flex:1 }}>
            <div style={{ ...S.h3 }}>{vetName}</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:T.ok }} className="shimmer"/>
              <span style={{ fontSize:12, color:T.ok }}>En línea</span>
              <span style={{ ...S.caption }}>· Chat arbitrado por Nvet Care</span>
            </div>
          </div>
          <Badge variant="warn">🛡 Monitoreado</Badge>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.inkMuted, fontSize:18, cursor:"pointer", padding:"4px 8px" }}>×</button>
        </div>

        {/* Notice */}
        <div style={{ padding:"8px 22px", background:`${T.warn}08`, borderBottom:`1px solid ${T.warn}20`, fontSize:12, color:T.warn, flexShrink:0 }}>
          Los precios compartidos aquí son registrados como oferta oficial. Nvet Care arbitra disputas de cobros abusivos.
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 22px 12px" }}>
          {msgs.map((m, i) => {
            if (m.from === "sys") return (
              <div key={i} style={{ textAlign:"center", marginBottom:16 }}>
                <span style={{ background:T.surfaceAlt, padding:"6px 14px", borderRadius:20, fontSize:11.5, color:T.inkMuted }}>{m.text}</span>
              </div>
            );
            const isUser = m.from === "user";
            return (
              <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:isUser?"flex-end":"flex-start", marginBottom:14 }}>
                {!isUser && <div style={{ ...S.caption, marginBottom:4, marginLeft:2 }}>{vetName}</div>}
                <div style={{
                  maxWidth:"76%",
                  padding: m.price ? "12px 16px" : "10px 14px",
                  borderRadius: isUser?"14px 14px 4px 14px":"14px 14px 14px 4px",
                  background: isUser ? T.sage : m.price ? `${T.gold}10` : T.surfaceAlt,
                  color: isUser ? T.inkInv : T.ink,
                  fontSize:14, lineHeight:1.55, whiteSpace:"pre-line",
                  border: m.price ? `1px solid ${T.gold}40` : "none",
                }}>
                  {m.price && <div style={{ ...S.caption, marginBottom:6, color:T.gold, fontWeight:600 }}>◈ PRECIO OFICIAL</div>}
                  {m.text}
                  {m.price && <div style={{ marginTop:10 }}><Btn size="sm" variant="gold" onClick={()=>{}}>Agendar ahora</Btn></div>}
                </div>
                <div style={{ ...S.caption, marginTop:4, marginRight:isUser?2:0, marginLeft:isUser?0:2 }}>{m.ts}</div>
              </div>
            );
          })}
          {showPL && (
            <div style={{ ...S.card, padding:"14px 16px", marginBottom:12 }} className="fade-up">
              <div style={{ ...S.label, marginBottom:12 }}>Lista de precios — selecciona para compartir</div>
              {PRICES.map((p, i) => (
                <div key={i} onClick={()=>sharePrice(p)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:i<PRICES.length-1?`1px solid ${T.line}`:"none", cursor:"pointer" }}>
                  <span style={{ fontSize:13.5, color:T.ink }}>{p.svc}</span>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ fontFamily:F.mono, fontSize:13, color:T.sage, fontWeight:500 }}>${p.cop.toLocaleString("es-CO")}</span>
                    <span style={{ ...S.caption, color:T.gold }}>≈ {p.ctg} CTG</span>
                    <span style={{ color:T.inkMuted, fontSize:13 }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={bottom}/>
        </div>

        {/* Input */}
        <div style={{ padding:"12px 22px 18px", borderTop:`1px solid ${T.line}`, display:"flex", gap:10, alignItems:"flex-end", flexShrink:0 }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); if(input.trim()) send(input); }}}
            style={{ ...S.input, resize:"none", minHeight:42, maxHeight:96, lineHeight:1.5, flex:1 }}
            placeholder="Mensaje… (Enter para enviar)"/>
          <Btn variant="ghost" onClick={()=>setShowPL(p=>!p)} style={{ padding:"10px 12px", flexShrink:0 }}>💰</Btn>
          <Btn variant="primary" onClick={()=>input.trim()&&send(input)} style={{ padding:"10px 14px", flexShrink:0 }}>↑</Btn>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   TRANSFER TRACKING
═════════════════════════════════════════════════════════════ */
const TransferModal = ({ apt, onClose }) => {
  const [confirmed, setConfirmed] = useState(null);
  const [step, setStep] = useState("input"); // input | verifying | done
  const tier = TIERS[apt.tier] || TIERS.free;
  const comm = Math.round(apt.amount * tier.commission / 100);
  const net  = apt.amount - comm;
  const ctg  = (comm / 420).toFixed(2);

  const verify = () => {
    setStep("verifying");
    setTimeout(() => setStep("done"), 2200);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,25,21,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:900, backdropFilter:"blur(6px)" }} className="fade-in">
      <div style={{ width:460, ...S.card, boxShadow:"0 24px 60px rgba(0,0,0,.15)" }}>

        {/* Header */}
        <div style={{ padding:"22px 28px 18px", borderBottom:`1px solid ${T.line}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ ...S.label, marginBottom:6 }}>Trazabilidad de transferencia</div>
            <div style={{ ...S.h2, fontSize:20 }}>{apt.service}</div>
            <div style={{ ...S.caption, marginTop:4 }}>{apt.pet} · {apt.vet}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.inkMuted, fontSize:18, cursor:"pointer" }}>×</button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {/* Commission breakdown */}
          <div style={{ background:T.surfaceAlt, borderRadius:10, padding:"16px 18px", marginBottom:20 }}>
            <div style={{ ...S.label, marginBottom:12 }}>Cálculo automático de comisión</div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.line}`, fontSize:14 }}>
              <span style={{ color:T.inkSec }}>Valor total del servicio</span>
              <span style={{ fontFamily:F.mono, fontWeight:500 }}>${apt.amount.toLocaleString("es-CO")}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.line}`, fontSize:14 }}>
              <span style={{ color:T.err }}>Comisión Nvet Care ({tier.commission}% · {tier.name})</span>
              <span style={{ fontFamily:F.mono, fontWeight:500, color:T.err }}>–${comm.toLocaleString("es-CO")}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"9px 0 0", fontSize:15 }}>
              <span style={{ fontWeight:600 }}>Neto veterinario</span>
              <span style={{ fontFamily:F.mono, fontWeight:600, color:T.sage }}>${net.toLocaleString("es-CO")}</span>
            </div>
            <Hr my={12}/>
            <div style={{ background:`${T.gold}10`, borderRadius:8, padding:"10px 12px", border:`1px solid ${T.gold}30` }}>
              <div style={{ ...S.label, marginBottom:4, color:T.gold }}>◈ Comisión en CTG Token a descontar</div>
              <div style={{ fontFamily:F.serif, fontSize:24, fontWeight:400, color:T.gold }}>{ctg} CTG</div>
              <div style={{ ...S.caption, marginTop:3 }}>Descuento automático del saldo CTG del veterinario</div>
            </div>
          </div>

          {step === "input" && (
            <>
              <Field label="Número de confirmación / comprobante">
                <input style={{ ...S.input, marginTop:6 }} placeholder="Ej. TRF20240223-01234"/>
              </Field>
              <Hr my={16}/>
              <div style={{ ...S.label, marginBottom:10 }}>¿El veterinario confirma recepción?</div>
              <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                <div onClick={()=>setConfirmed(true)} style={{ flex:1, padding:"12px", borderRadius:8, border:`1.5px solid ${confirmed===true?T.ok:T.line}`, background:confirmed===true?`${T.ok}08`:T.surface, cursor:"pointer", textAlign:"center", transition:"all .15s" }}>
                  <div style={{ fontSize:20 }}>✓</div>
                  <div style={{ fontSize:13, fontWeight:600, color:confirmed===true?T.ok:T.inkSec, marginTop:4 }}>Recibido</div>
                </div>
                <div onClick={()=>setConfirmed(false)} style={{ flex:1, padding:"12px", borderRadius:8, border:`1.5px solid ${confirmed===false?T.err:T.line}`, background:confirmed===false?`${T.err}08`:T.surface, cursor:"pointer", textAlign:"center", transition:"all .15s" }}>
                  <div style={{ fontSize:20 }}>✗</div>
                  <div style={{ fontSize:13, fontWeight:600, color:confirmed===false?T.err:T.inkSec, marginTop:4 }}>No recibido</div>
                </div>
              </div>
              <Btn full onClick={verify} disabled={confirmed===null}>Verificar y liquidar comisión</Btn>
            </>
          )}

          {step === "verifying" && (
            <div style={{ textAlign:"center", padding:"24px 0" }}>
              <div style={{ fontSize:32, marginBottom:12 }} className="spin">⊙</div>
              <div style={{ ...S.h3 }}>Verificando transferencia…</div>
              <div style={{ ...S.caption, marginTop:6 }}>Confirmando con la entidad bancaria</div>
              <Bar pct={65} color={T.payTRF} thin={false}/>
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign:"center", padding:"16px 0" }} className="fade-up">
              <div style={{ width:60, height:60, borderRadius:"50%", background:`${confirmed?T.ok:T.warn}10`, border:`1px solid ${confirmed?T.ok:T.warn}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 14px" }}>
                {confirmed ? "✓" : "!"}
              </div>
              <div style={{ ...S.h3, marginBottom:6 }}>{confirmed ? "Transferencia confirmada" : "Pago pendiente registrado"}</div>
              <div style={{ ...S.caption }}>
                {confirmed ? `Se descontarán ${ctg} CTG del saldo del veterinario.` : "Se notificará al veterinario. Cita en estado de revisión."}
              </div>
              <div style={{ marginTop:20 }}><Btn full onClick={onClose}>Cerrar</Btn></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   BOOKING MODAL — 4 steps, validated
═════════════════════════════════════════════════════════════ */
const BookingModal = ({ vet, onClose }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ date:"", time:"", service:"", pet:"Max", address:"", notes:"", pay:"CTG" });
  const [complete, setComplete] = useState(false);

  const SERVICES = [
    { id:"consult",  name:"Consulta domiciliaria",  price:85000 },
    { id:"vaccine",  name:"Vacunación completa",    price:65000 },
    { id:"deworm",   name:"Desparasitación",        price:45000 },
    { id:"review",   name:"Revisión preventiva",    price:75000 },
    { id:"urgent",   name:"Urgencia domiciliaria",  price:150000 },
  ];
  const SLOTS = ["09:00","09:30","10:00","10:30","11:00","14:00","14:30","15:00","15:30","16:00","17:00"];
  const svc = SERVICES.find(s => s.id === form.service);

  const canGo2 = form.date && form.time && form.address;
  const canGo3 = form.service;

  if (complete) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,25,21,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:900, backdropFilter:"blur(6px)" }} className="fade-in">
      <div style={{ width:400, ...S.card, padding:"48px 40px", textAlign:"center", boxShadow:"0 24px 60px rgba(0,0,0,.15)" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:`${T.sage}12`, border:`1px solid ${T.sage}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 20px" }}>✓</div>
        <div style={{ fontFamily:F.serif, fontSize:26, fontWeight:400, marginBottom:8 }}>Cita agendada</div>
        <div style={{ ...S.caption, marginBottom:24 }}>{vet.name} · {form.date} · {form.time}</div>
        <div style={{ background:T.surfaceAlt, borderRadius:10, padding:"14px 16px", marginBottom:24, textAlign:"left" }}>
          {[["Servicio", svc?.name], ["Mascota", form.pet], ["Pago", form.pay], ["Total", `$${(svc?.price||0).toLocaleString("es-CO")} COP`]].map(([k,v]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.line}`, fontSize:13 }}>
              <span style={{ color:T.inkSec }}>{k}</span>
              <span style={{ fontWeight:600, color:k==="Total"?T.sage:T.ink }}>{v}</span>
            </div>
          ))}
        </div>
        <Btn full onClick={onClose}>Ver mis citas</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,25,21,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:900, backdropFilter:"blur(6px)" }} className="fade-in">
      <div style={{ width:520, maxHeight:"88vh", overflowY:"auto", ...S.card, boxShadow:"0 24px 60px rgba(0,0,0,.15)" }}>

        {/* Header */}
        <div style={{ padding:"22px 28px 0", borderBottom:`1px solid ${T.line}`, paddingBottom:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
            <div>
              <div style={{ ...S.label, marginBottom:4 }}>Nuevo agendamiento</div>
              <div style={{ fontFamily:F.serif, fontSize:20, fontWeight:400 }}>{vet.name}</div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:T.inkMuted, fontSize:18, cursor:"pointer" }}>×</button>
          </div>
          {/* Stepper */}
          <div style={{ display:"flex", alignItems:"center", gap:0 }}>
            {["Fecha","Servicio","Pago","Confirmar"].map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", flex:i<3?1:"none" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:step>i+1?T.sage:step===i+1?T.sage:T.surfaceAlt, border:`1.5px solid ${step>=i+1?T.sage:T.line}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:step>=i+1?T.inkInv:T.inkMuted, transition:"all .25s" }}>
                    {step>i+1?"✓":i+1}
                  </div>
                  <div style={{ fontSize:10, fontWeight:600, color:step===i+1?T.sage:T.inkMuted, letterSpacing:".3px", whiteSpace:"nowrap" }}>{s}</div>
                </div>
                {i<3 && <div style={{ flex:1, height:1, background:step>i+1?T.sage:T.line, margin:"0 8px 16px", transition:"background .25s" }}/>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:"24px 28px" }}>
          {step===1 && (
            <div className="fade-up">
              <div style={S.g2}>
                <Field label="Mascota">
                  <select style={{ ...S.input, marginTop:6 }} value={form.pet} onChange={e=>setForm({...form,pet:e.target.value})}>
                    <option>Max — Golden Retriever</option>
                    <option>Mochi — Gato siamés</option>
                  </select>
                </Field>
                <Field label="Fecha">
                  <input type="date" style={{ ...S.input, marginTop:6 }} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
                </Field>
              </div>
              <div style={{ marginTop:16, marginBottom:16 }}>
                <Field label="Dirección de atención">
                  <input style={{ ...S.input, marginTop:6 }} placeholder="Calle 30 #45-12, Cartagena" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
                </Field>
              </div>
              <Field label="Horario disponible">
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
                  {SLOTS.map(s => (
                    <div key={s} onClick={()=>setForm({...form,time:s})} style={{ padding:"7px 14px", borderRadius:8, border:`1.5px solid ${form.time===s?T.sage:T.line}`, background:form.time===s?`${T.sage}10`:T.surface, color:form.time===s?T.sage:T.inkSec, fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .12s" }}>
                      {s}
                    </div>
                  ))}
                </div>
              </Field>
              <div style={{ marginTop:24 }}>
                <Btn full onClick={()=>setStep(2)} disabled={!canGo2}>Continuar</Btn>
              </div>
            </div>
          )}

          {step===2 && (
            <div className="fade-up">
              <Field label="Tipo de servicio">
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
                  {SERVICES.map(s => (
                    <div key={s.id} onClick={()=>setForm({...form,service:s.id})} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 16px", borderRadius:10, border:`1.5px solid ${form.service===s.id?T.sage:T.line}`, background:form.service===s.id?`${T.sage}07`:T.surface, cursor:"pointer", transition:"all .12s" }}>
                      <span style={{ fontSize:14, fontWeight:form.service===s.id?600:400, color:form.service===s.id?T.ink:T.inkSec }}>{s.name}</span>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:14, fontWeight:600, color:form.service===s.id?T.sage:T.inkMuted }}>${s.price.toLocaleString("es-CO")}</div>
                        <div style={{ fontSize:11, color:T.gold }}>≈ {Math.round(s.price/420)} CTG</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
              <div style={{ marginTop:16 }}>
                <Field label="Notas adicionales">
                  <textarea style={{ ...S.input, minHeight:68, resize:"none", marginTop:6 }} placeholder="Síntomas, observaciones…" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
                </Field>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:24 }}>
                <Btn variant="ghost" onClick={()=>setStep(1)}>← Atrás</Btn>
                <Btn full onClick={()=>setStep(3)} disabled={!canGo3}>Continuar</Btn>
              </div>
            </div>
          )}

          {step===3 && (
            <div className="fade-up">
              <Field label="Método de pago">
                <div style={{ marginTop:8 }}>
                  <PaySelector value={form.pay} onChange={v=>setForm({...form,pay:v})} amount={svc?.price||0}/>
                </div>
              </Field>
              {form.pay==="TRANSFER" && (
                <div style={{ marginTop:12, padding:"10px 14px", background:`${T.payTRF}08`, borderRadius:8, border:`1px solid ${T.payTRF}30`, fontSize:12.5, color:T.payTRF }}>
                  → La plataforma rastrea la transferencia. La comisión se descuenta automáticamente del saldo CTG del veterinario.
                </div>
              )}
              <div style={{ display:"flex", gap:10, marginTop:24 }}>
                <Btn variant="ghost" onClick={()=>setStep(2)}>← Atrás</Btn>
                <Btn full onClick={()=>setStep(4)}>Continuar</Btn>
              </div>
            </div>
          )}

          {step===4 && (
            <div className="fade-up">
              <div style={{ background:T.surfaceAlt, borderRadius:10, padding:"18px 20px", marginBottom:20 }}>
                <div style={{ ...S.label, marginBottom:14 }}>Resumen de tu cita</div>
                {[
                  ["Veterinario", vet.name],
                  ["Mascota", form.pet],
                  ["Fecha", `${form.date} · ${form.time}`],
                  ["Servicio", svc?.name || "—"],
                  ["Dirección", form.address || "—"],
                  ["Método de pago", form.pay],
                  ["Total", `$${(svc?.price||0).toLocaleString("es-CO")} COP`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.line}`, fontSize:13.5 }}>
                    <span style={{ color:T.inkSec }}>{k}</span>
                    <span style={{ fontWeight:600, color:k==="Total"?T.sage:T.ink }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <Btn variant="ghost" onClick={()=>setStep(3)}>← Atrás</Btn>
                <Btn full variant={form.pay==="CTG"?"gold":"primary"} onClick={()=>setComplete(true)}>
                  {form.pay==="CTG" ? "◈ Pagar con CTG" : form.pay==="PSE" ? "Pagar con PSE" : "Registrar transferencia"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
═════════════════════════════════════════════════════════════ */
const AdminDashboard = () => {
  const [showChat, setShowChat] = useState(false);
  const [showTransfer, setShowTransfer] = useState(null);

  return (
    <div style={{ padding:"28px 32px" }}>
      {showChat && <Chat vetName="Dra. Valeria Ospina" onClose={()=>setShowChat(false)}/>}
      {showTransfer && <TransferModal apt={showTransfer} onClose={()=>setShowTransfer(null)}/>}

      {/* KPIs */}
      <div style={{ ...S.g4, marginBottom:24 }}>
        <Metric label="CITAS HOY"             value="47"      sub="↑ 12 % vs. ayer"      accent={T.sage}/>
        <Metric label="VETERINARIOS ACTIVOS"  value="23"      sub="3 pendientes"           accent={T.sageLt}/>
        <Metric label="VOLUMEN CTG HOY"        value="4,821"   sub="≈ $2.02 M COP"         accent={T.gold}/>
        <Metric label="COMISIONES HOY"         value="$420 K"  sub="CTG + fiat"             accent={T.goldLt}/>
      </div>

      {/* Two columns */}
      <div style={{ ...S.g2, marginBottom:20 }}>
        {/* Payment methods */}
        <div style={S.card}>
          <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.line}` }}>
            <div style={S.h3}>Ingresos por método de pago</div>
          </div>
          <div style={{ padding:"20px 22px" }}>
            {[
              { label:"CTG One Token", pct:48, val:"$9.8 M", color:T.gold,   badge:"gold" },
              { label:"PSE",           pct:32, val:"$6.5 M", color:T.payPSE, badge:"pse" },
              { label:"Transferencia", pct:20, val:"$4.1 M", color:T.payTRF, badge:"trf" },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <Badge variant={r.badge}>{r.label}</Badge>
                    <span style={{ fontFamily:F.mono, fontSize:12, color:T.inkMuted }}>{r.pct}%</span>
                  </span>
                  <span style={{ fontFamily:F.serif, fontSize:17, fontWeight:400, color:T.ink }}>{r.val}</span>
                </div>
                <Bar pct={r.pct} color={r.color}/>
              </div>
            ))}
          </div>
        </div>

        {/* Transfer tracking */}
        <div style={S.card}>
          <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.line}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={S.h3}>Transferencias — trazabilidad</div>
            <Badge variant="warn">En vivo</Badge>
          </div>
          <div style={{ padding:"8px 0" }}>
            {[
              { vet:"Dra. Ospina",  cl:"Laura G.",  amt:85000,  st:"Confirmada",  tier:"elite" },
              { vet:"Dr. Mora",     cl:"Carlos R.", amt:65000,  st:"Pendiente",   tier:"pro" },
              { vet:"Dra. Ríos",   cl:"Sofía H.",  amt:75000,  st:"En disputa",  tier:"free" },
              { vet:"Dr. Castro",   cl:"Miguel T.", amt:45000,  st:"Confirmada",  tier:"pro" },
            ].map((r, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 22px", borderBottom:i<3?`1px solid ${T.line}`:"none" }}>
                <TierBadge t={r.tier}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500, color:T.ink }}>{r.vet}</div>
                  <div style={{ ...S.caption }}>{r.cl}</div>
                </div>
                <span style={{ fontFamily:F.mono, fontSize:13, color:T.sage }}>${r.amt.toLocaleString("es-CO")}</span>
                <Badge variant={r.st==="Confirmada"?"ok":r.st==="Pendiente"?"warn":"err"}>{r.st}</Badge>
                <Btn size="sm" variant="ghost" onClick={()=>setShowTransfer({ service:"Consulta", pet:"Max", amount:r.amt, vet:r.vet, tier:r.tier })}>›</Btn>
              </div>
            ))}
            <div style={{ padding:"14px 22px" }}>
              <Btn variant="ghost" size="sm" onClick={()=>setShowChat(true)}>🛡 Revisar chat arbitrado</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Recent appointments — ledger style */}
      <div style={S.card}>
        <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.line}`, display:"flex", justifyContent:"space-between" }}>
          <div style={S.h3}>Citas recientes</div>
          <Btn size="sm" variant="ghost">Ver todas →</Btn>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:13 }}>
            <thead>
              <tr style={{ background:T.surfaceAlt }}>
                {["ID","Paciente","Veterinario","Tier","Servicio","Método","Comisión","Estado"].map(h=>(
                  <th key={h} style={{ padding:"10px 16px", textAlign:"left", ...S.label }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { id:"#C0047", pac:"Laura G.",  vet:"Dra. Ospina", tier:"elite", svc:"Consulta",  pay:"CTG",      comm:"$2.550", st:"Completada" },
                { id:"#C0048", pac:"Carlos R.", vet:"Dr. Mora",    tier:"pro",   svc:"Vacunación",pay:"TRANSFER", comm:"$5.200", st:"Verificando" },
                { id:"#C0049", pac:"Sofía H.",  vet:"Dra. Ríos",  tier:"free",  svc:"Revisión",  pay:"PSE",      comm:"$7.500", st:"Confirmada" },
                { id:"#C0050", pac:"Miguel T.", vet:"Dr. Castro",  tier:"pro",   svc:"Consulta",  pay:"CTG",      comm:"$6.800", st:"En camino" },
              ].map((r,i)=>(
                <tr key={i} style={{ borderBottom:`1px solid ${T.line}` }}>
                  <td style={{ padding:"12px 16px" }}><span style={S.mono}>{r.id}</span></td>
                  <td style={{ padding:"12px 16px", fontWeight:500 }}>{r.pac}</td>
                  <td style={{ padding:"12px 16px", color:T.inkSec }}>{r.vet}</td>
                  <td style={{ padding:"12px 16px" }}><TierBadge t={r.tier}/></td>
                  <td style={{ padding:"12px 16px" }}><span style={{ background:T.surfaceAlt, padding:"3px 10px", borderRadius:6, fontSize:12, fontWeight:500 }}>{r.svc}</span></td>
                  <td style={{ padding:"12px 16px" }}><PayBadge m={r.pay}/></td>
                  <td style={{ padding:"12px 16px", fontFamily:F.mono, color:T.err }}>{r.comm}</td>
                  <td style={{ padding:"12px 16px" }}><Badge variant={r.st==="Completada"?"ok":r.st==="Verificando"?"warn":r.st==="En camino"?"sage":"default"}>{r.st}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   SUBSCRIPTION TIERS
═════════════════════════════════════════════════════════════ */
const TiersPage = () => {
  const [current, setCurrent] = useState("pro");
  return (
    <div style={{ padding:"28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom:36, maxWidth:560 }}>
        <div style={{ ...S.label, marginBottom:10 }}>PLANES VETERINARIOS</div>
        <div style={{ fontFamily:F.serif, fontSize:36, fontWeight:300, color:T.ink, lineHeight:1.2, marginBottom:12 }}>
          Elige el nivel que<br/><em>impulsa tu práctica</em>
        </div>
        <div style={{ fontSize:15, color:T.inkSec, lineHeight:1.6 }}>Las comisiones se descuentan automáticamente en CTG Token según el nivel de suscripción activo.</div>
      </div>

      {/* Tier cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.15fr 1.3fr", gap:20, marginBottom:36, alignItems:"start" }}>
        {Object.values(TIERS).map(tier => {
          const active = current === tier.id;
          const isElite = tier.id === "elite";
          return (
            <div key={tier.id} style={{ ...S.card, border:`1.5px solid ${active||isElite ? tier.color+"60" : T.line}`, boxShadow:isElite?"0 8px 32px rgba(184,150,46,.12)":"none", position:"relative", overflow:"hidden" }}>
              {isElite && (
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${T.gold},${T.goldLt})` }}/>
              )}
              {isElite && (
                <div style={{ position:"absolute", top:14, right:14 }}>
                  <Badge variant="gold">Mejor valor</Badge>
                </div>
              )}
              <div style={{ padding:"28px 28px 24px" }}>
                <div style={{ ...S.label, color:tier.color, marginBottom:12 }}>{tier.badge}</div>
                <div style={{ fontFamily:F.serif, fontSize:isElite?32:26, fontWeight:300, color:T.ink, marginBottom:20 }}>{tier.name}</div>

                {/* Price */}
                <div style={{ marginBottom:20 }}>
                  {tier.price===0 ? (
                    <div style={{ fontFamily:F.serif, fontSize:40, fontWeight:300, color:T.ink }}>Gratis</div>
                  ) : (
                    <>
                      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                        <span style={{ fontFamily:F.serif, fontSize:40, fontWeight:300, color:tier.color }}>${tier.price}</span>
                        <span style={{ fontSize:13, color:T.inkMuted }}>USD / mes</span>
                      </div>
                      <div style={{ fontSize:12, color:T.inkMuted, marginTop:3 }}>≈ ${tier.priceCOP.toLocaleString("es-CO")} COP</div>
                    </>
                  )}
                </div>

                {/* Commission highlight */}
                <div style={{ background:`${tier.color}0A`, border:`1px solid ${tier.color}30`, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
                  <div style={{ ...S.label, color:tier.color, marginBottom:6 }}>COMISIÓN POR SERVICIO</div>
                  <div style={{ fontFamily:F.serif, fontSize:isElite?44:36, fontWeight:300, color:tier.color, lineHeight:1 }}>{tier.commission}%</div>
                  {tier.limit && <div style={{ ...S.caption, marginTop:6, color:T.warn }}>Límite: {tier.limit} servicios/mes</div>}
                </div>

                {/* Benefits */}
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
                  {tier.perks.map((b, i) => (
                    <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                      <div style={{ width:14, height:14, borderRadius:"50%", background:`${tier.color}20`, border:`1px solid ${tier.color}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:tier.color, flexShrink:0, marginTop:2 }}>✓</div>
                      <span style={{ fontSize:13, color:T.inkSec, lineHeight:1.4 }}>{b}</span>
                    </div>
                  ))}
                </div>

                <Btn full variant={active ? (isElite?"gold":"primary") : "ghost"} onClick={()=>setCurrent(tier.id)}>
                  {active ? "Plan activo" : `Activar ${tier.name}`}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>

      {/* Commission calculator */}
      <div style={S.card}>
        <div style={{ padding:"20px 28px", borderBottom:`1px solid ${T.line}` }}>
          <div style={S.h3}>Calculadora de rentabilidad neta</div>
          <div style={{ ...S.caption, marginTop:4 }}>Estimación con $1.000.000 COP en servicios mensuales</div>
        </div>
        <div style={{ padding:"20px 28px" }}>
          <div style={S.g3}>
            {Object.values(TIERS).map(tier => {
              const gross   = 1000000;
              const commAmt = gross * tier.commission / 100;
              const subAmt  = tier.priceCOP;
              const net     = gross - commAmt - subAmt;
              const pct     = Math.round(net / gross * 100);
              return (
                <div key={tier.id} style={{ background:T.surfaceAlt, borderRadius:10, padding:"18px 20px", border:`1px solid ${tier.id===current?tier.color+"50":T.line}` }}>
                  <div style={{ ...S.label, color:tier.color, marginBottom:12 }}>{tier.name}</div>
                  <div style={{ fontSize:12, color:T.err, marginBottom:4 }}>– ${commAmt.toLocaleString("es-CO")} comisión ({tier.commission}%)</div>
                  {tier.price>0 && <div style={{ fontSize:12, color:T.warn, marginBottom:4 }}>– ${subAmt.toLocaleString("es-CO")} suscripción</div>}
                  <Hr my={10}/>
                  <div style={{ fontFamily:F.serif, fontSize:22, color:T.sage, fontWeight:400 }}>
                    ${net.toLocaleString("es-CO")}
                  </div>
                  <div style={{ ...S.caption, marginTop:4 }}>Neto · {pct}% del bruto</div>
                  <div style={{ marginTop:12 }}>
                    <Bar pct={pct} color={tier.color}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   VET PANEL
═════════════════════════════════════════════════════════════ */
const VetPanel = () => {
  const [showChat, setShowChat] = useState(false);
  const [showTrf, setShowTrf]   = useState(false);
  const tier = TIERS.elite;

  return (
    <div style={{ padding:"28px 32px" }}>
      {showChat && <Chat vetName="Dra. Valeria Ospina" onClose={()=>setShowChat(false)}/>}
      {showTrf && (
        <TransferModal apt={{ service:"Vacunación", pet:"Luna", amount:65000, vet:"Dra. Ospina", tier:"elite" }} onClose={()=>setShowTrf(false)}/>
      )}

      {/* Tier header */}
      <div style={{ ...S.card, marginBottom:24, padding:"20px 28px", display:"flex", alignItems:"center", gap:20, borderLeft:`3px solid ${tier.color}` }}>
        <div>
          <div style={{ ...S.label, color:tier.color, marginBottom:4 }}>PLAN ACTIVO</div>
          <div style={{ fontFamily:F.serif, fontSize:22, fontWeight:400 }}>{tier.name}</div>
          <div style={{ ...S.caption, marginTop:3 }}>{tier.commission}% comisión · Servicios ilimitados · $20 USD/mes</div>
        </div>
        <div style={{ marginLeft:"auto", textAlign:"right" }}>
          <div style={{ ...S.label, marginBottom:4 }}>Saldo CTG (comisiones)</div>
          <div style={{ fontFamily:F.serif, fontSize:24, fontWeight:400, color:T.gold }}>842.50 CTG</div>
          <div style={{ ...S.caption }}>≈ $353.850 COP</div>
        </div>
        <Btn variant="ghost" size="sm" onClick={()=>setShowChat(true)}>💬 Chat cliente</Btn>
      </div>

      <div style={{ ...S.g4, marginBottom:24 }}>
        <Metric label="CITAS HOY"          value="6"     accent={T.sage}/>
        <Metric label="INGRESOS HOY"       value="$485K" sub="Neto 3% comm." accent={T.gold}/>
        <Metric label="CALIFICACIÓN"        value="4.9 ★" accent={T.goldLt}/>
        <Metric label="TRANSF. PENDIENTES" value="2"     sub="Requieren verificación" accent={T.warn}/>
      </div>

      <div style={{ ...S.g2 }}>
        {/* Schedule */}
        <div style={S.card}>
          <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.line}` }}>
            <div style={S.h3}>Agenda de hoy</div>
          </div>
          <div style={{ padding:"8px 0" }}>
            {[
              { h:"09:00", pac:"Max — Laura G.",  tipo:"Consulta",    pay:"CTG",      st:"Completada" },
              { h:"10:30", pac:"Luna — Carlos R.",tipo:"Vacunación",   pay:"TRANSFER", st:"Verificar" },
              { h:"12:00", pac:"Buddy — Sofía H.",tipo:"Revisión",     pay:"PSE",      st:"Confirmada" },
              { h:"15:30", pac:"Nala — Miguel T.",tipo:"Consulta",     pay:"CTG",      st:"Pendiente" },
            ].map((c, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 22px", borderBottom:i<3?`1px solid ${T.line}`:"none" }}>
                <div style={{ fontFamily:F.mono, fontSize:13, color:T.inkMuted, width:44, flexShrink:0 }}>{c.h}</div>
                <div style={{ width:2, height:38, borderRadius:1, background:c.st==="Completada"?T.lineHi:c.st==="Verificar"?T.warn:T.sage, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{c.pac}</div>
                  <div style={{ ...S.caption }}>{c.tipo}</div>
                </div>
                <PayBadge m={c.pay}/>
                {c.st==="Verificar"
                  ? <Btn size="sm" variant="transfer" onClick={()=>setShowTrf(true)}>Verificar</Btn>
                  : <Badge variant={c.st==="Completada"?"default":c.st==="Confirmada"?"ok":"warn"}>{c.st}</Badge>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Clinical record */}
          <div style={S.card}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${T.line}` }}>
              <div style={S.h3}>Registro clínico</div>
            </div>
            <div style={{ padding:"18px 22px" }}>
              <div style={{ marginBottom:14 }}>
                <Field label="Paciente"><select style={{ ...S.input, marginTop:6 }}><option>Max — Golden Retriever (Laura Gómez)</option></select></Field>
              </div>
              <div style={{ ...S.g2, marginBottom:14 }}>
                <Field label="Diagnóstico"><input style={{ ...S.input, marginTop:6 }} placeholder="Diagnóstico…"/></Field>
                <Field label="Peso"><input style={{ ...S.input, marginTop:6 }} placeholder="28.5 kg"/></Field>
              </div>
              <div style={{ marginBottom:14 }}>
                <Field label="Tratamiento"><textarea style={{ ...S.input, minHeight:60, resize:"none", marginTop:6 }} placeholder="Medicamentos, dosis…"/></Field>
              </div>
              <Btn full>Guardar registro</Btn>
            </div>
          </div>

          {/* Private price list */}
          <div style={S.card}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${T.line}` }}>
              <div style={S.h3}>Lista de precios privada</div>
              <div style={{ ...S.caption, marginTop:3 }}>Solo visible para clientes a través del chat arbitrado</div>
            </div>
            <div style={{ padding:"8px 0" }}>
              {[
                { s:"Consulta domiciliaria", p:85000 },
                { s:"Vacunación", p:65000 },
                { s:"Urgencia domiciliaria", p:150000 },
              ].map((p, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 22px", borderBottom:i<2?`1px solid ${T.line}`:"none" }}>
                  <span style={{ fontSize:13.5, color:T.ink }}>{p.s}</span>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ fontFamily:F.mono, fontSize:13, color:T.sage }}>${p.p.toLocaleString("es-CO")}</span>
                    <span style={{ ...S.caption, color:T.gold }}>≈{Math.round(p.p/420)} CTG</span>
                    <Btn size="sm" variant="ghost">✎</Btn>
                  </div>
                </div>
              ))}
              <div style={{ padding:"12px 22px" }}>
                <Btn size="sm" variant="ghost" full>+ Agregar servicio</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   APPOINTMENT TRACKING
═════════════════════════════════════════════════════════════ */
const TrackingPage = () => {
  const [showBooking, setShowBooking] = useState(false);
  const [showTrf, setShowTrf]         = useState(null);
  const [expanded, setExpanded]       = useState(0);

  const apts = [
    { id:"#C0047", vet:"Dra. Valeria Ospina", tier:"elite", pet:"🐕 Max", svc:"Consulta domiciliaria", date:"Hoy · 14:00", pay:"CTG", st:"En camino", pct:60, eta:"12 min", amount:85000 },
    { id:"#C0048", vet:"Dr. Andrés Mora",     tier:"pro",   pet:"🐈 Mochi",svc:"Vacunación",          date:"Lun · 10:30", pay:"TRANSFER", st:"Confirmada", pct:20, eta:"Mañana", amount:65000 },
    { id:"#C0049", vet:"Dra. Carolina Ríos",  tier:"free",  pet:"🐕 Max", svc:"Revisión preventiva",  date:"Vie · 09:00", pay:"PSE",      st:"Pendiente",  pct:5, eta:"6 días", amount:75000 },
  ];

  const stages = ["Confirmada","Pago","En camino","Llegó","Completada"];
  const stageIdx = { "Confirmada":1,"Pagada":2,"En camino":3,"Llegó":4,"Completada":5 };

  return (
    <div style={{ padding:"28px 32px" }}>
      {showBooking && <BookingModal vet={{ name:"Dra. Valeria Ospina", tier:"elite" }} onClose={()=>setShowBooking(false)}/>}
      {showTrf && <TransferModal apt={showTrf} onClose={()=>setShowTrf(null)}/>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:28 }}>
        <div>
          <div style={{ ...S.label, marginBottom:6 }}>SEGUIMIENTO</div>
          <div style={{ fontFamily:F.serif, fontSize:28, fontWeight:300 }}>Mis citas</div>
        </div>
        <Btn onClick={()=>setShowBooking(true)}>+ Nueva cita</Btn>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {apts.map((apt, i) => {
          const open = expanded === i;
          const sidx = Math.ceil(apt.pct / 20);
          return (
            <div key={i} style={{ ...S.card, border:`1.5px solid ${open&&apt.st==="En camino"?T.sage:T.line}`, transition:"border .2s" }}>
              {/* Summary row */}
              <div style={{ padding:"18px 24px", display:"flex", alignItems:"center", gap:16, cursor:"pointer" }} onClick={()=>setExpanded(open?-1:i)}>
                <div style={{ fontFamily:F.mono, fontSize:12, color:T.inkMuted, width:56, flexShrink:0 }}>{apt.id}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:14, fontWeight:500 }}>{apt.vet}</span>
                    <TierBadge t={apt.tier}/>
                  </div>
                  <div style={{ ...S.caption, marginTop:3 }}>{apt.pet} · {apt.svc} · {apt.date}</div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <PayBadge m={apt.pay}/>
                  <Badge variant={apt.st==="En camino"?"sage":apt.st==="Confirmada"?"ok":"default"}>{apt.st}</Badge>
                </div>
                <div style={{ textAlign:"right", minWidth:80 }}>
                  <div style={{ fontFamily:F.serif, fontSize:16, color:T.sage }}>{apt.eta}</div>
                  <div style={{ ...S.caption }}>ETA</div>
                </div>
                <div style={{ color:T.inkMuted, fontSize:16, transition:"transform .2s", transform:open?"rotate(180deg)":"none" }}>⌄</div>
              </div>

              {/* Expandable detail */}
              {open && (
                <div style={{ padding:"0 24px 20px" }} className="fade-up">
                  <Bar pct={apt.pct} color={apt.st==="En camino"?T.sage:T.gold}/>
                  {/* Progress stages */}
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, marginBottom:20 }}>
                    {stages.map((st, j) => (
                      <div key={j} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background:sidx>j?T.sage:T.surfaceAlt, border:`1.5px solid ${sidx>j?T.sage:T.line}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:sidx>j?T.inkInv:T.inkMuted }}>
                          {sidx>j?"✓":j+1}
                        </div>
                        <div style={{ fontSize:10, color:sidx>j?T.sage:T.inkMuted, fontWeight:600 }}>{st}</div>
                      </div>
                    ))}
                  </div>
                  {/* Map placeholder */}
                  <div style={{ background:T.surfaceAlt, borderRadius:10, height:110, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, border:`1px solid ${T.line}` }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:28 }}>⊙</div>
                      <div style={{ ...S.caption, marginTop:6 }}>Mapa en tiempo real</div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display:"flex", gap:10 }}>
                    {apt.pay==="TRANSFER" && (
                      <Btn variant="transfer" size="sm" onClick={()=>setShowTrf({...apt,tier:apt.tier})}>→ Verificar transferencia</Btn>
                    )}
                    <Btn variant="ghost" size="sm">💬 Chat con vet</Btn>
                    <div style={{ marginLeft:"auto" }}>
                      <Btn variant="ghost" size="sm" variant="danger">Cancelar cita</Btn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   ACCOUNTING — LEDGER VIEW
═════════════════════════════════════════════════════════════ */
const AccountingPage = () => {
  const [filter, setFilter] = useState("all");
  const [expandedTx, setExpandedTx] = useState(null);

  const txs = [
    { id:"TX0047", date:"22 Feb · 14:12", vet:"Dra. Ospina",  tier:"elite", client:"Laura G.",  svc:"Consulta",   amount:85000,  pay:"CTG",      comm:2550,  pct:3,  hash:"0xA3F2…B91C", st:"LIQUIDADO" },
    { id:"TX0048", date:"22 Feb · 10:15", vet:"Dr. Mora",     tier:"pro",   client:"Carlos R.", svc:"Vacunación", amount:65000,  pay:"TRANSFER", comm:5200,  pct:8,  hash:"—",            st:"VERIFICANDO" },
    { id:"TX0049", date:"22 Feb · 09:30", vet:"Dra. Ríos",   tier:"free",  client:"Sofía H.",  svc:"Revisión",   amount:75000,  pay:"PSE",      comm:7500,  pct:10, hash:"—",            st:"LIQUIDADO" },
    { id:"TX0050", date:"21 Feb · 16:00", vet:"Dr. Castro",   tier:"pro",   client:"Miguel T.", svc:"Consulta",   amount:85000,  pay:"CTG",      comm:6800,  pct:8,  hash:"0xC7D1…44E2", st:"LIQUIDADO" },
    { id:"TX0051", date:"21 Feb · 11:30", vet:"Dra. López",   tier:"free",  client:"Ana M.",    svc:"Deworm",     amount:45000,  pay:"PSE",      comm:4500,  pct:10, hash:"—",            st:"DISPUTA" },
    { id:"TX0052", date:"20 Feb · 15:45", vet:"Dra. Ospina",  tier:"elite", client:"Juan P.",   svc:"Urgencia",   amount:150000, pay:"CTG",      comm:4500,  pct:3,  hash:"0xE8C4…921A", st:"LIQUIDADO" },
  ];

  const FILTERS = ["all","CTG","PSE","TRANSFER","LIQUIDADO","VERIFICANDO","DISPUTA"];
  const shown = filter==="all" ? txs : txs.filter(t => t.pay===filter || t.st===filter);
  const totAmt  = shown.reduce((a,t)=>a+t.amount,0);
  const totComm = shown.reduce((a,t)=>a+t.comm,0);

  return (
    <div style={{ padding:"28px 32px" }}>
      {/* KPIs */}
      <div style={{ ...S.g4, marginBottom:24 }}>
        <Metric label="FACTURADO"   value={`$${(totAmt/1000).toFixed(0)}K`}     sub={`${shown.length} transacciones`} accent={T.sage}/>
        <Metric label="COMISIONES"  value={`$${(totComm/1000).toFixed(1)}K`}    sub="COP este período"                accent={T.gold}/>
        <Metric label="CTG COBRADO" value={`${(totComm/420).toFixed(0)} CTG`}   sub="Debitado de vets"                accent={T.goldLt}/>
        <Metric label="EN DISPUTA"  value="1"                                    sub="TX0051 — revisar"                accent={T.err}/>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {FILTERS.map(f => (
          <Btn key={f} size="sm" variant={filter===f?"dark":"ghost"} onClick={()=>setFilter(f)}>
            {f==="all"?"Todos":f}
          </Btn>
        ))}
        <div style={{ marginLeft:"auto" }}>
          <Btn size="sm" variant="ghost">⬇ Exportar CSV</Btn>
        </div>
      </div>

      {/* Ledger — accordion rows */}
      <div style={S.card}>
        <div style={{ padding:"14px 22px", borderBottom:`1px solid ${T.line}`, display:"flex", gap:0 }}>
          {["ID","Fecha","Veterinario / Cliente","Método","Monto","Comisión","Estado"].map(h=>(
            <div key={h} style={{ ...S.label, flex:h==="Veterinario / Cliente"?2:1 }}>{h}</div>
          ))}
        </div>
        {shown.map((tx, i) => {
          const open = expandedTx===tx.id;
          return (
            <div key={tx.id}>
              <div style={{ display:"flex", alignItems:"center", gap:0, padding:"14px 22px", borderBottom:`1px solid ${T.line}`, cursor:"pointer", background:open?T.surfaceAlt:"transparent", transition:"background .15s" }}
                onClick={()=>setExpandedTx(open?null:tx.id)}>
                <div style={{ flex:1 }}><span style={S.mono}>{tx.id}</span></div>
                <div style={{ flex:1 }}><span style={{ fontSize:12.5, color:T.inkSec, fontFamily:F.mono }}>{tx.date}</span></div>
                <div style={{ flex:2 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{tx.vet}</div>
                  <div style={{ ...S.caption }}>{tx.client} · <span style={{ fontFamily:F.mono, fontSize:11 }}>{tx.svc}</span></div>
                </div>
                <div style={{ flex:1 }}><PayBadge m={tx.pay}/></div>
                <div style={{ flex:1, fontFamily:F.mono, fontSize:13.5, fontWeight:500 }}>${tx.amount.toLocaleString("es-CO")}</div>
                <div style={{ flex:1, color:T.err, fontFamily:F.mono, fontSize:13 }}>–${tx.comm.toLocaleString("es-CO")}</div>
                <div style={{ flex:1, display:"flex", gap:8, alignItems:"center" }}>
                  <Badge variant={tx.st==="LIQUIDADO"?"ok":tx.st==="VERIFICANDO"?"warn":"err"}>{tx.st}</Badge>
                  <span style={{ color:T.inkMuted, transition:"transform .15s", transform:open?"rotate(180deg)":"none" }}>⌄</span>
                </div>
              </div>

              {/* Accordion detail */}
              {open && (
                <div style={{ padding:"16px 22px 20px 22px", background:T.surfaceAlt, borderBottom:`1px solid ${T.line}` }} className="fade-up">
                  <div style={{ ...S.g4 }}>
                    <div>
                      <div style={S.label}>TIER</div>
                      <div style={{ marginTop:6 }}><TierBadge t={tx.tier}/></div>
                    </div>
                    <div>
                      <div style={S.label}>% COMISIÓN</div>
                      <div style={{ fontFamily:F.serif, fontSize:22, color:T.err, marginTop:4 }}>{tx.pct}%</div>
                    </div>
                    <div>
                      <div style={S.label}>NETO VETERINARIO</div>
                      <div style={{ fontFamily:F.serif, fontSize:22, color:T.sage, marginTop:4 }}>${(tx.amount-tx.comm).toLocaleString("es-CO")}</div>
                    </div>
                    <div>
                      <div style={S.label}>CTG DESCONTADO</div>
                      <div style={{ fontFamily:F.serif, fontSize:22, color:T.gold, marginTop:4 }}>{(tx.comm/420).toFixed(2)}</div>
                      <div style={S.caption}>CTG Token</div>
                    </div>
                  </div>
                  {tx.hash !== "—" && (
                    <div style={{ marginTop:16, padding:"10px 14px", background:`${T.gold}08`, borderRadius:8, border:`1px solid ${T.gold}30`, display:"flex", gap:10, alignItems:"center" }}>
                      <CTGMark size={20}/>
                      <div>
                        <div style={{ ...S.label, color:T.gold }}>HASH ON-CHAIN · POLYGON</div>
                        <div style={{ fontFamily:F.mono, fontSize:12, color:T.inkSec, marginTop:2 }}>{tx.hash}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Footer totals */}
        <div style={{ padding:"16px 22px", display:"flex", justifyContent:"flex-end", gap:40 }}>
          {[["Total facturado","$"+totAmt.toLocaleString("es-CO"),T.ink],["Comisiones Nvet","$"+totComm.toLocaleString("es-CO"),T.err],["CTG cobrado",(totComm/420).toFixed(2)+" CTG",T.gold]].map(([k,v,c])=>(
            <div key={k} style={{ textAlign:"right" }}>
              <div style={S.label}>{k}</div>
              <div style={{ fontFamily:F.serif, fontSize:20, fontWeight:400, color:c, marginTop:4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   MOBILE APP
═════════════════════════════════════════════════════════════ */
const MobileApp = ({ screen, setScreen }) => {
  const navItems = [
    { id:"home",   icon:"⊙",  label:"Inicio" },
    { id:"book",   icon:"◎",  label:"Citas" },
    { id:"wallet", icon:"◈",  label:"Wallet" },
    { id:"chat",   icon:"◇",  label:"Chat" },
    { id:"pets",   icon:"◆",  label:"Mascotas" },
  ];

  const sc = {
    home:    <MHome setScreen={setScreen}/>,
    book:    <MBook setScreen={setScreen}/>,
    booking: <MBooking setScreen={setScreen}/>,
    track:   <MTrack/>,
    wallet:  <MWallet/>,
    chat:    <MChat/>,
    pets:    <MPets/>,
    vet:     <MVet setScreen={setScreen}/>,
  };

  const isActive = (id) => screen===id || (screen==="vet"&&id==="book") || (screen==="booking"&&id==="book") || (screen==="track"&&id==="book");

  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"28px 32px", gap:40, flexWrap:"wrap", alignItems:"flex-start" }}>
      {/* Phone */}
      <div>
        <div style={{ ...S.label, marginBottom:12, textAlign:"center" }}>APP USUARIO · iOS / ANDROID</div>
        <div style={{ width:322, background:T.dark, borderRadius:42, padding:10, boxShadow:"0 32px 80px rgba(0,0,0,.2)" }}>
          <div style={{ background:T.canvas, borderRadius:34, overflow:"hidden", height:628, position:"relative", border:`1px solid ${T.line}` }}>
            <div style={{ height:"calc(100% - 60px)", overflowY:"auto", scrollbarWidth:"none" }}>
              {sc[screen] || sc.home}
            </div>
            {/* Bottom nav */}
            <div style={{ position:"absolute", bottom:0, left:0, right:0, height:60, background:T.surface, borderTop:`1px solid ${T.line}`, display:"flex" }}>
              {navItems.map(n => {
                const a = isActive(n.id);
                return (
                  <div key={n.id} onClick={()=>setScreen(n.id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, cursor:"pointer", color:a?T.sage:T.inkMuted, fontSize:9, fontWeight:a?600:400, letterSpacing:".3px" }}>
                    <span style={{ fontSize:17 }}>{n.icon}</span>
                    {n.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Flow guide */}
      <div style={{ maxWidth:280 }}>
        <div style={{ ...S.label, marginBottom:12 }}>PANTALLAS DEL FLUJO</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {[
            { id:"home",    label:"Inicio",             desc:"Dashboard personal" },
            { id:"book",    label:"Mis citas",          desc:"Lista y seguimiento" },
            { id:"vet",     label:"Perfil veterinario", desc:"Info + precio vía chat" },
            { id:"booking", label:"Agendar",            desc:"4 pasos + método de pago" },
            { id:"track",   label:"Seguimiento live",   desc:"ETA + progreso" },
            { id:"wallet",  label:"Wallet CTG",         desc:"Saldo + métodos de pago" },
            { id:"chat",    label:"Chat arbitrado",     desc:"Precios privados + protección" },
            { id:"pets",    label:"Mascotas",           desc:"Perfiles + historial" },
          ].map(s => (
            <div key={s.id} onClick={()=>setScreen(s.id)} className="hover-lift"
              style={{ padding:"11px 14px", borderRadius:10, background:screen===s.id?`${T.sage}10`:T.surface, border:`1px solid ${screen===s.id?T.sage+"40":T.line}`, cursor:"pointer", display:"flex", gap:10, alignItems:"center", transition:"all .12s" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:screen===s.id?T.sage:T.line, flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:screen===s.id?T.sage:T.ink }}>{s.label}</div>
                <div style={{ ...S.caption }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* Mobile screens — minimal, no repeated headers */
const MHead = ({ title, sub, back, onBack }) => (
  <div style={{ padding:"14px 18px 12px", borderBottom:`1px solid ${T.line}`, display:"flex", alignItems:"center", gap:10, background:T.surface }}>
    {back && <button onClick={onBack} style={{ background:"none", border:"none", color:T.inkMuted, fontSize:18, cursor:"pointer", marginRight:4 }}>‹</button>}
    {!back && <div style={{ marginRight:4 }}><Logo size={22} text={false}/></div>}
    <div style={{ flex:1 }}>
      {title && <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>{title}</div>}
      {sub && <div style={{ fontSize:11, color:T.inkMuted }}>{sub}</div>}
    </div>
  </div>
);

const MHome = ({ setScreen }) => (
  <div>
    <div style={{ padding:"14px 18px 12px", background:T.surface, borderBottom:`1px solid ${T.line}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <Logo size={26} text={true}/>
      <div style={{ width:32, height:32, borderRadius:"50%", background:`${T.sage}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:T.sage }}>L</div>
    </div>
    <div style={{ padding:"16px 18px" }}>
      {/* Next appt card */}
      <div style={{ background:T.sage, borderRadius:14, padding:"16px 18px", marginBottom:14, color:T.inkInv }}>
        <div style={{ fontSize:10, opacity:.7, fontWeight:600, letterSpacing:1, marginBottom:6 }}>PRÓXIMA CITA</div>
        <div style={{ fontSize:16, fontWeight:600 }}>Dra. Valeria Ospina</div>
        <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>🐕 Max · Hoy 14:00 · Consulta</div>
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button onClick={()=>setScreen("track")} style={{ padding:"7px 14px", borderRadius:8, background:"rgba(255,255,255,.18)", border:"none", color:T.inkInv, fontSize:12, fontWeight:600, cursor:"pointer" }}>Seguimiento →</button>
          <button onClick={()=>setScreen("chat")} style={{ padding:"7px 14px", borderRadius:8, background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.25)", color:T.inkInv, fontSize:12, cursor:"pointer" }}>Chat</button>
        </div>
      </div>

      {/* CTG mini */}
      <div onClick={()=>setScreen("wallet")} style={{ background:T.surface, borderRadius:12, padding:"12px 14px", marginBottom:14, border:`1px solid ${T.gold}30`, display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
        <CTGMark size={28}/>
        <div>
          <div style={{ ...S.label, color:T.gold, marginBottom:2 }}>CTG BALANCE</div>
          <div style={{ fontFamily:F.serif, fontSize:20, color:T.gold }}>1,240.50 CTG</div>
        </div>
        <span style={{ marginLeft:"auto", color:T.inkMuted, fontSize:16 }}>›</span>
      </div>

      {/* Quick actions */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        {[["🩺","Nueva cita","vet"],["📋","Mis citas","book"],["💬","Chat vet","chat"],["🐾","Mascotas","pets"]].map(([ic,lb,sc])=>(
          <div key={lb} onClick={()=>setScreen(sc)} style={{ background:T.surface, border:`1px solid ${T.line}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", display:"flex", gap:10, alignItems:"center" }} className="hover-lift">
            <span style={{ fontSize:18 }}>{ic}</span>
            <span style={{ fontSize:13, fontWeight:500 }}>{lb}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MVet = ({ setScreen }) => (
  <div>
    <MHead title="Dra. Valeria Ospina" sub="Pequeños animales · 8 años" back onBack={()=>setScreen("book")}/>
    <div style={{ padding:"16px 18px" }}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <TierBadge t="elite"/>
        <Badge variant="ok">Disponible hoy</Badge>
      </div>
      {/* Slots */}
      <div style={{ ...S.card, padding:"14px 16px", marginBottom:14 }}>
        <div style={{ ...S.label, marginBottom:10 }}>HORARIO DISPONIBLE</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {["09:30","11:00","14:00","15:30","17:00"].map((h,i)=>(
            <span key={i} style={{ padding:"7px 13px", borderRadius:8, border:`1.5px solid ${i===2?T.sage:T.line}`, background:i===2?`${T.sage}10`:"transparent", color:i===2?T.sage:T.inkSec, fontSize:13, fontWeight:600 }}>{h}</span>
          ))}
        </div>
      </div>
      {/* Price via chat notice */}
      <div style={{ background:`${T.gold}08`, border:`1px solid ${T.gold}30`, borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
        <div style={{ ...S.label, color:T.gold, marginBottom:6 }}>◈ PRECIOS — SOLO VÍA CHAT ARBITRADO</div>
        <div style={{ fontSize:12.5, color:T.inkSec, lineHeight:1.6 }}>
          Los precios se comparten a través del chat monitoreado por Nvet Care para tu protección contra cobros abusivos.
        </div>
        <div style={{ marginTop:12 }}>
          <Btn size="sm" variant="ghost" onClick={()=>setScreen("chat")}>Iniciar chat → ver precios</Btn>
        </div>
      </div>
      <Btn full variant="gold" onClick={()=>setScreen("booking")}>Agendar cita →</Btn>
    </div>
  </div>
);

const MBook = ({ setScreen }) => (
  <div>
    <MHead title="Mis Citas"/>
    <div style={{ padding:"14px 18px" }}>
      <div style={{ marginBottom:12 }}>
        <Btn full onClick={()=>setScreen("vet")}>+ Nueva cita</Btn>
      </div>
      {[
        { vet:"Dra. Ospina", pet:"🐕 Max", svc:"Consulta", date:"Hoy · 14:00", pay:"CTG", st:"En camino", pct:60 },
        { vet:"Dr. Mora",    pet:"🐈 Mochi",svc:"Vacunación",date:"Lun · 10:30", pay:"TRANSFER", st:"Confirmada", pct:20 },
        { vet:"Dra. Ríos",  pet:"🐕 Max", svc:"Revisión",   date:"Vie · 09:00", pay:"PSE", st:"Pendiente", pct:5 },
      ].map((c,i)=>(
        <div key={i} style={{ ...S.card, padding:"14px 16px", marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <div style={{ fontSize:14, fontWeight:600 }}>{c.vet}</div>
            <Badge variant={c.st==="En camino"?"sage":c.st==="Confirmada"?"ok":"default"}>{c.st}</Badge>
          </div>
          <div style={{ ...S.caption, marginBottom:8 }}>{c.pet} · {c.svc} · {c.date}</div>
          <Bar pct={c.pct} color={c.st==="En camino"?T.sage:T.gold} thin/>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <PayBadge m={c.pay}/>
            {c.st==="En camino" && <Btn size="sm" variant="ghost" onClick={()=>setScreen("track")}>📍 Seguir →</Btn>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MBooking = ({ setScreen }) => {
  const [pay, setPay] = useState("CTG");
  return (
    <div>
      <MHead title="Agendar cita" back onBack={()=>setScreen("vet")}/>
      <div style={{ padding:"14px 18px" }}>
        <div style={{ marginBottom:12 }}><Field label="Mascota"><select style={{ ...S.input, marginTop:6 }}><option>🐕 Max — Golden</option><option>🐈 Mochi</option></select></Field></div>
        <div style={{ ...S.g2, marginBottom:12 }}>
          <Field label="Fecha"><input type="date" style={{ ...S.input, marginTop:6 }}/></Field>
          <Field label="Hora"><select style={{ ...S.input, marginTop:6 }}><option>14:00</option><option>15:30</option></select></Field>
        </div>
        <div style={{ marginBottom:12 }}><Field label="Servicio"><select style={{ ...S.input, marginTop:6 }}><option>Consulta · $85.000 / 202 CTG</option><option>Vacunación · $65.000 / 155 CTG</option></select></Field></div>
        <div style={{ marginBottom:16 }}>
          <Field label="Método de pago">
            <div style={{ marginTop:8 }}><PaySelector value={pay} onChange={setPay} amount={85000} mode="compact"/></div>
          </Field>
        </div>
        {/* Summary */}
        <div style={{ background:T.surfaceAlt, borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
          {[["Consulta","$85.000"],["Plataforma","$5.000"],["Total","$90.000"]].map(([k,v],i,a)=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:i<a.length-1?`1px solid ${T.line}`:"none", fontSize:13 }}>
              <span style={{ color:T.inkSec }}>{k}</span>
              <span style={{ fontWeight:i===a.length-1?700:400, color:i===a.length-1?T.sage:T.ink }}>{v}</span>
            </div>
          ))}
        </div>
        <Btn full variant={pay==="CTG"?"gold":"primary"} onClick={()=>setScreen("track")}>
          {pay==="CTG"?"◈ Pagar con CTG":pay==="PSE"?"Pagar con PSE":"Registrar transferencia"}
        </Btn>
      </div>
    </div>
  );
};

const MTrack = () => (
  <div>
    <MHead title="Seguimiento en tiempo real"/>
    <div style={{ padding:"14px 18px" }}>
      <div style={{ background:T.sage, borderRadius:14, padding:"18px 18px", marginBottom:14, color:T.inkInv }}>
        <div style={{ fontSize:10, opacity:.7, fontWeight:600, letterSpacing:1 }}>VETERINARIO EN CAMINO</div>
        <div style={{ fontSize:16, fontWeight:600, marginTop:6 }}>Dra. Valeria Ospina</div>
        <div style={{ fontFamily:F.serif, fontSize:48, fontWeight:300, marginTop:6, lineHeight:1 }}>12 min</div>
        <div style={{ fontSize:12, opacity:.7, marginTop:6 }}>3.2 km · Pagado con CTG ✓</div>
      </div>
      <div style={{ background:T.surfaceAlt, borderRadius:12, height:120, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:14, border:`1px solid ${T.line}` }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:28 }}>⊙</div>
          <div style={{ ...S.caption, marginTop:4 }}>Mapa en tiempo real</div>
        </div>
      </div>
      <div style={{ ...S.card, padding:"14px 16px" }}>
        {[
          { l:"Cita confirmada",       done:true,  t:"13:15" },
          { l:"◈ Pago CTG procesado",  done:true,  t:"13:16" },
          { l:"Veterinario en camino", done:true,  t:"13:47" },
          { l:"Llegada estimada",      done:false, t:"14:00" },
          { l:"Servicio completado",   done:false, t:"—" },
        ].map((s,i)=>(
          <div key={i} style={{ display:"flex", gap:10, alignItems:"center", marginBottom:i<4?10:0 }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:s.done?T.sage:T.surfaceAlt, border:`1.5px solid ${s.done?T.sage:T.line}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:T.inkInv, flexShrink:0 }}>{s.done?"✓":""}</div>
            <div style={{ flex:1, fontSize:13, color:s.done?T.ink:T.inkMuted, fontWeight:s.done?500:400 }}>{s.l}</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:T.inkMuted }}>{s.t}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MWallet = () => (
  <div>
    <MHead title="Wallet CTG" sub="Polygon Mainnet"/>
    <div style={{ padding:"14px 18px" }}>
      {/* Balance */}
      <div style={{ background:T.dark, borderRadius:16, padding:"20px 18px", marginBottom:14, color:T.inkInv, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:`${T.gold}18` }}/>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <CTGMark size={28}/>
          <div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,.5)", letterSpacing:1.5, fontFamily:F.mono }}>CTG ONE TOKEN</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", fontFamily:F.mono, marginTop:2 }}>0x3F9…d4A2</div>
          </div>
        </div>
        <div style={{ fontFamily:F.serif, fontSize:36, fontWeight:300, color:"#E8D070" }}>1,240.50</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,.4)", marginTop:3 }}>≈ $521.010 COP</div>
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          {["Pagar","Recargar","Enviar"].map(a=>(
            <button key={a} style={{ flex:1, padding:"9px", borderRadius:8, background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.15)", color:T.inkInv, fontSize:12, fontWeight:600, cursor:"pointer" }}>{a}</button>
          ))}
        </div>
      </div>
      {/* Pay methods */}
      <div style={{ ...S.card, marginBottom:14 }}>
        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${T.line}` }}>
          <div style={{ ...S.label }}>MÉTODOS DE PAGO</div>
        </div>
        {[
          { m:"CTG",      lbl:"CTG One Token",    sub:"Polygon · descuento 5.5%",         v:"gold" },
          { m:"PSE",      lbl:"PSE Bancario",     sub:"ACH Colombia",                      v:"pse" },
          { m:"TRANSFER", lbl:"Transferencia",    sub:"Nequi · Daviplata · Bancolombia",   v:"trf" },
        ].map((p,i)=>(
          <div key={p.m} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderBottom:i<2?`1px solid ${T.line}`:"none" }}>
            <PayBadge m={p.m}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500 }}>{p.lbl}</div>
              <div style={{ ...S.caption }}>{p.sub}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Transactions */}
      {[
        { t:"Pago Dra. Ospina", amt:"-20.24 CTG", date:"Hoy · 09:30" },
        { t:"Recarga CTG",      amt:"+240 CTG",   date:"20 Feb" },
        { t:"Pago Dr. Mora",    amt:"-15.48 CTG", date:"14 Feb" },
      ].map((tx,i)=>(
        <div key={i} style={{ ...S.card, padding:"11px 14px", marginBottom:8, display:"flex", gap:12, alignItems:"center" }}>
          <div style={{ width:34, height:34, borderRadius:8, background:tx.amt.startsWith("-")?T.surfaceAlt:`${T.ok}10`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
            {tx.amt.startsWith("-")?"↑":"↓"}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13.5, fontWeight:500 }}>{tx.t}</div>
            <div style={{ ...S.caption }}>{tx.date}</div>
          </div>
          <div style={{ fontFamily:F.mono, fontSize:13.5, fontWeight:500, color:tx.amt.startsWith("-")?T.ink:T.ok }}>{tx.amt}</div>
        </div>
      ))}
    </div>
  </div>
);

const MChat = () => {
  const [msgs, setMsgs] = useState([
    { from:"sys",  text:"Chat protegido por Nvet Care. Precios compartidos son vinculantes.", ts:"14:22" },
    { from:"vet",  text:"Hola, soy la Dra. Ospina ¿En qué puedo ayudarte?", ts:"14:23" },
  ]);
  const [input, setInput] = useState("");
  const send = () => { if(input.trim()) { setMsgs(m=>[...m,{from:"user",text:input,ts:"ahora"}]); setInput(""); }};
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <MHead title="Dra. Valeria Ospina" sub="🛡 Chat arbitrado · precios protegidos"/>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ marginBottom:10, display:"flex", justifyContent:m.from==="user"?"flex-end":m.from==="sys"?"center":"flex-start" }}>
            {m.from==="sys"
              ? <span style={{ background:T.surfaceAlt, padding:"5px 12px", borderRadius:16, fontSize:11, color:T.inkMuted }}>{m.text}</span>
              : <div style={{ background:m.from==="user"?T.sage:T.surface, borderRadius:10, padding:"9px 12px", maxWidth:"75%", fontSize:13, color:m.from==="user"?T.inkInv:T.ink, border:m.from==="vet"?`1px solid ${T.line}`:"none" }}>{m.text}</div>
            }
          </div>
        ))}
      </div>
      <div style={{ padding:"10px 14px 14px", borderTop:`1px solid ${T.line}`, display:"flex", gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} style={{ ...S.input, flex:1, fontSize:13 }} placeholder="Mensaje…"/>
        <Btn onClick={send} style={{ padding:"10px 14px", flexShrink:0 }}>↑</Btn>
      </div>
    </div>
  );
};

const MPets = () => (
  <div>
    <MHead title="Mis Mascotas"/>
    <div style={{ padding:"14px 18px" }}>
      {[
        { name:"Max", breed:"Golden Retriever", age:"3 años", weight:"28.5 kg", icon:"🐕", ok:true },
        { name:"Mochi", breed:"Gato siamés", age:"1 año", weight:"4.2 kg", icon:"🐈", ok:false },
      ].map((p,i)=>(
        <div key={i} style={{ ...S.card, padding:"16px", marginBottom:12 }}>
          <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:T.surfaceAlt, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>{p.icon}</div>
            <div>
              <div style={{ fontFamily:F.serif, fontSize:18, fontWeight:400 }}>{p.name}</div>
              <div style={{ ...S.caption }}>{p.breed} · {p.age}</div>
            </div>
            <div style={{ marginLeft:"auto" }}><Badge variant={p.ok?"ok":"warn"}>{p.ok?"Vacunas al día":"Vacuna pendiente"}</Badge></div>
          </div>
          <Hr my={10}/>
          <div style={{ ...S.g2 }}>
            {[["Peso",p.weight],["Última visita","15 Feb 2026"]].map(([k,v])=>(
              <div key={k} style={{ background:T.surfaceAlt, borderRadius:8, padding:"10px 12px" }}>
                <div style={S.label}>{k}</div>
                <div style={{ fontSize:14, fontWeight:500, marginTop:4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Btn full variant="ghost">+ Agregar mascota</Btn>
    </div>
  </div>
);

/* ═════════════════════════════════════════════════════════════
   MAIN APP SHELL
═════════════════════════════════════════════════════════════ */
const NAV = {
  ADMIN:  [{ id:"dashboard",  label:"Dashboard",      icon:"◈" },{ id:"tracking",   label:"Seguimiento",    icon:"◎" },{ id:"accounting", label:"Contabilidad",   icon:"⬡" },{ id:"tiers",      label:"Suscripciones",  icon:"◆" }],
  VET:    [{ id:"vet",        label:"Mi Panel",        icon:"◈" }],
  USER:   [{ id:"mobile",     label:"App Móvil",       icon:"◎" }],
};

const TITLES = {
  dashboard:  { h:"Dashboard",         s:"Centro de operaciones Nvet Care" },
  tracking:   { h:"Seguimiento",       s:"Agendamiento y trazabilidad de citas" },
  accounting: { h:"Contabilidad",      s:"Comisiones · transferencias · liquidaciones CTG" },
  tiers:      { h:"Suscripciones",     s:"Free Vet · VetPro · VetElite" },
  vet:        { h:"Panel Veterinario", s:"Dra. Valeria Ospina · VetElite" },
  mobile:     { h:"App Móvil",         s:"Flujo completo usuario final" },
};

export default function App() {
  const [role,   setRole]   = useState("ADMIN");
  const [view,   setView]   = useState("dashboard");
  const [mobile, setMobile] = useState("home");

  const switchRole = r => { setRole(r); setView(NAV[r][0].id); };
  const info = TITLES[view] || TITLES.dashboard;

  const renderView = () => {
    if (view==="dashboard")  return <AdminDashboard/>;
    if (view==="tracking")   return <TrackingPage/>;
    if (view==="accounting") return <AccountingPage/>;
    if (view==="tiers")      return <TiersPage/>;
    if (view==="vet")        return <VetPanel/>;
    if (view==="mobile")     return <MobileApp screen={mobile} setScreen={setMobile}/>;
    return <AdminDashboard/>;
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:T.canvas }}>
      <CSS/>

      {/* SIDEBAR */}
      <div style={{ width:216, background:T.dark, display:"flex", flexDirection:"column", height:"100vh", position:"sticky", top:0, flexShrink:0 }}>
        {/* Logo */}
        <div style={{ padding:"24px 20px 20px", borderBottom:`1px solid ${T.darkLine}` }}>
          <Logo size={32} text={true} inverted={true}/>
        </div>

        {/* Role tabs */}
        <div style={{ padding:"14px 12px 10px" }}>
          <div style={{ fontSize:9, fontFamily:F.mono, color:"rgba(255,255,255,.25)", letterSpacing:2, marginBottom:8, paddingLeft:4 }}>VISTA</div>
          <div style={{ display:"flex", background:T.darkAlt, borderRadius:8, padding:3, gap:2 }}>
            {["ADMIN","VET","USER"].map(r=>(
              <div key={r} onClick={()=>switchRole(r)} style={{ flex:1, textAlign:"center", padding:"7px 0", borderRadius:6, fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:F.mono, letterSpacing:.5, background:role===r?T.sage:"transparent", color:role===r?T.inkInv:"rgba(255,255,255,.35)", transition:"all .15s" }}>
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding:"4px 10px", flex:1 }}>
          <div style={{ fontSize:9, fontFamily:F.mono, color:"rgba(255,255,255,.25)", letterSpacing:2, marginBottom:8, paddingLeft:6 }}>NAVEGACIÓN</div>
          {NAV[role].map(n=>(
            <div key={n.id} onClick={()=>setView(n.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:8, cursor:"pointer", marginBottom:2, background:view===n.id?"rgba(255,255,255,.07)":"transparent", color:view===n.id?T.inkInv:"rgba(255,255,255,.4)", fontSize:13.5, fontWeight:view===n.id?500:400, transition:"all .15s", borderLeft:view===n.id?`2px solid ${T.sage}`:"2px solid transparent" }}>
              <span style={{ fontFamily:F.mono, fontSize:14 }}>{n.icon}</span>
              {n.label}
            </div>
          ))}
        </div>

        {/* CTG ticker */}
        <div style={{ margin:"0 10px 10px", borderRadius:10, background:T.darkAlt, border:`1px solid ${T.darkLine}`, padding:"12px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <CTGMark size={18}/>
            <span style={{ fontSize:10, fontFamily:F.mono, color:T.gold, letterSpacing:1 }}>CTG / COP</span>
          </div>
          <div style={{ fontFamily:F.serif, fontSize:20, fontWeight:400, color:"#E8D070" }}>$420</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,.25)", fontFamily:F.mono, marginTop:2 }}>Polygon · precio de mercado</div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 20px", borderTop:`1px solid ${T.darkLine}` }}>
          <div style={{ fontSize:9, fontFamily:F.mono, color:"rgba(255,255,255,.2)", letterSpacing:1, marginBottom:3 }}>POWERED BY</div>
          <div style={{ fontSize:12, fontWeight:500, color:"rgba(255,255,255,.45)" }}>CTG One Corporation</div>
          <div style={{ fontSize:9, fontFamily:F.mono, color:"rgba(255,255,255,.2)" }}>MVP v4.0 · FEB 2026</div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, overflow:"auto" }}>
        {/* Topbar */}
        <div style={{ background:T.surface, borderBottom:`1px solid ${T.line}`, padding:"14px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20, backdropFilter:"blur(8px)" }}>
          <div>
            <div style={{ fontFamily:F.serif, fontSize:20, fontWeight:400, color:T.ink }}>{info.h}</div>
            <div style={{ ...S.caption, marginTop:1 }}>{info.s}</div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {view==="dashboard"  && <Btn>+ Nueva cita</Btn>}
            {view==="accounting" && <Btn variant="ghost">⬇ Exportar</Btn>}
            <div style={{ width:34, height:34, borderRadius:"50%", background:`${T.sage}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:T.sage }}>JP</div>
          </div>
        </div>

        {renderView()}
      </div>
    </div>
  );
}
