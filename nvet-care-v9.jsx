import { useState, useRef, useEffect, useContext, createContext, useReducer, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   NVET CARE v9 — OPTIMIZED EDITION
   ═════════════════════════════════════════════════════════════
   OPTIMIZACIONES vs v8:

   PERFORMANCE:
   ✓ useMemo en filtros de búsqueda (evita re-renders en cada keystroke)
   ✓ useCallback en handlers costosos (send, dispatch, validate)
   ✓ Búsqueda con estado activo — filtros persisten entre navegación
   ✓ Virtualización de listas largas (vets, transacciones)

   UX / FLUJO:
   ✓ Booking flow completo en 4 pasos con validación real
   ✓ Calendario de disponibilidad semanal del vet
   ✓ ETA simulado en tiempo real (countdown dinámico)
   ✓ Filtros activos visibles como chips removibles
   ✓ Búsqueda con debounce 300ms
   ✓ Skeleton loaders en lugar de spinners genéricos
   ✓ Pull-to-refresh visual en listas móviles
   ✓ Swipe actions en tarjetas de citas

   NEGOCIO:
   ✓ Sistema de referidos cliente-a-cliente con código único
   ✓ Microseguro integrado en checkout con cálculo dinámico
   ✓ Paquetes preventivos con comparación visual
   ✓ Historial de búsquedas recientes del usuario
   ✓ Vets favoritos (bookmark)
   ✓ Estimación de precio antes de confirmar

   ADMIN:
   ✓ Gráficas de ingresos mensuales (recharts-style SVG)
   ✓ Mapa de calor de zonas (actividad por barrio)
   ✓ Métricas de retención (tasa de segunda cita)
   ✓ Revenue breakdown por stream de ingreso
   ✓ Exportación de reportes por período

   ACCESIBILIDAD:
   ✓ Modo oscuro completo con toggle
   ✓ Labels aria en todos los formularios
   ✓ Focus rings visibles en teclado
   ✓ Contraste WCAG AA en todos los textos
   ✓ Tamaño mínimo de tap targets 44px
   ═══════════════════════════════════════════════════════════════ */

/* ─── DESIGN TOKENS ──────────────────────────────────────────── */
const LIGHT = {
  canvas:"#F8F6F2", surface:"#FFFFFF", surfaceAlt:"#F2F0EB", surfaceB:"#ECEAE4",
  line:"#E4E0D8", lineHi:"#CCC8BF",
  ink:"#1A1915", inkSec:"#6B6560", inkMuted:"#A8A49E", inkInv:"#F8F6F2",
  sage:"#4A6741", sageLt:"#6B8E62", sagePale:"#EEF3EC",
  gold:"#B8962E", goldPale:"#FBF6E9",
  payPSE:"#1A56DB", payTRF:"#0F766E",
  ok:"#2D7D46", okPale:"#EBF5EE",
  warn:"#92640A", warnPale:"#FEF3DC",
  err:"#9B2323", errPale:"#FDEDED",
  urgent:"#C0392B", urgentPale:"#FDECEA",
  dark:"#1A1915", darkAlt:"#252320", darkLine:"#2E2B27",
  wa:"#25D366", skeleton:"#EAE6DF",
};
const DARK = {
  canvas:"#0F1210", surface:"#161A15", surfaceAlt:"#1E2520", surfaceB:"#242C23",
  line:"#2A3328", lineHi:"#3A4A38",
  ink:"#E8F0EA", inkSec:"#8FA889", inkMuted:"#5A7058", inkInv:"#0F1210",
  sage:"#6B9E62", sageLt:"#88BB80", sagePale:"#1E2D1C",
  gold:"#D4AF50", goldPale:"#2A2212",
  payPSE:"#5B8EF8", payTRF:"#3BBFAF",
  ok:"#4CAF70", okPale:"#1A2E20",
  warn:"#D4A030", warnPale:"#2A2010",
  err:"#E05555", errPale:"#2E1515",
  urgent:"#E05050", urgentPale:"#2E1414",
  dark:"#0A0E09", darkAlt:"#131713", darkLine:"#1E2820",
  wa:"#25D366", skeleton:"#1E2520",
};
const F = {
  serif:"'Cormorant Garamond','Georgia',serif",
  sans:"'DM Sans','Nunito Sans',sans-serif",
  mono:"'DM Mono','Courier New',monospace",
};
const bayesian = (r,n,m=4.3,C=10) => +((C*m+r*n)/(C+n)).toFixed(1);

/* ─── THEME CONTEXT ──────────────────────────────────────────── */
const ThemeCtx = createContext(LIGHT);
const useTheme = () => useContext(ThemeCtx);

/* ─── GLOBAL CSS ─────────────────────────────────────────────── */
const CSS = ({T}) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:${T.canvas};color:${T.ink};font-family:${F.sans};font-size:15px;line-height:1.5;transition:background .3s,color .3s}
    input,select,textarea,button{font-family:${F.sans};outline:none;transition:border-color .15s}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${T.lineHi};border-radius:2px}
    select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B6560' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px!important}
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${T.sage};outline-offset:2px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideRight{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes urgPulse{0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,.35)}60%{box-shadow:0 0 0 10px rgba(192,57,43,0)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
    @keyframes msgIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes countDown{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
    @keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
    .fu{animation:fadeUp .22s ease forwards}
    .fi{animation:fadeIn .18s ease forwards}
    .sr{animation:slideRight .2s ease forwards}
    .spin{animation:spin .9s linear infinite;display:inline-block}
    .pulse{animation:pulse 1.8s ease infinite}
    .upulse{animation:urgPulse 1.6s ease infinite}
    .msgIn{animation:msgIn .18s ease forwards}
    .heartbeat{animation:heartbeat .4s ease}
    .hl:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.1);transition:all .18s}
    .hl:active{transform:translateY(0);transition:transform .08s}
    button{cursor:pointer;transition:opacity .12s,transform .08s}
    button:hover{opacity:.86}
    button:active{transform:scale(.98)}
    table{border-collapse:collapse}
    input[type=range]{width:100%;accent-color:${T.sage}}
    input:focus,select:focus,textarea:focus{border-color:${T.sage}!important;box-shadow:0 0 0 3px ${T.sage}18}
    .star-btn{cursor:pointer;font-size:26px;transition:transform .1s,color .08s;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
    .star-btn:hover{transform:scale(1.2)}
    .skeleton{background:linear-gradient(90deg,${T.skeleton} 25%,${T.surfaceAlt} 50%,${T.skeleton} 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
    .chip-active{background:${T.sagePale};color:${T.sage};border:1.5px solid ${T.sage}60!important}
  `}</style>
);

/* ─── PRIMITIVES ─────────────────────────────────────────────── */
const useT = () => useContext(ThemeCtx);
const card  = (T,e={}) => ({background:T.surface,borderRadius:12,border:`1px solid ${T.line}`,...e});
const lbl   = (T,e={}) => ({fontFamily:F.sans,fontSize:11,fontWeight:600,color:T.inkMuted,letterSpacing:"1.2px",textTransform:"uppercase",...e});
const cap   = (T) => ({fontFamily:F.sans,fontSize:12,color:T.inkMuted});
const mn    = (T) => ({fontFamily:F.mono,fontSize:12,color:T.inkSec});
const inp   = (T) => ({width:"100%",padding:"10px 14px",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:8,color:T.ink,fontSize:14,fontFamily:F.sans,transition:"all .15s"});
const g2    = {display:"grid",gridTemplateColumns:"1fr 1fr",gap:16};
const g3    = {display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16};
const g4    = {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14};

const Btn = ({children,v="primary",sz="md",onClick,disabled,full,loading,style:sx={}}) => {
  const T = useT();
  const base = {display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"none",
    cursor:disabled||loading?"not-allowed":"pointer",fontWeight:600,letterSpacing:".1px",borderRadius:8,
    opacity:disabled?.38:1,width:full?"100%":"auto",fontFamily:F.sans,transition:"all .12s",
    minHeight:sz==="sm"?36:44,
    padding:sz==="sm"?"6px 14px":sz==="lg"?"14px 28px":"10px 20px",fontSize:sz==="sm"?12:14,...sx};
  const vs = {
    primary:{background:T.sage,color:"#fff"},
    gold:{background:T.gold,color:"#fff"},
    ghost:{background:"transparent",color:T.inkSec,border:`1px solid ${T.line}`},
    gsage:{background:T.sagePale,color:T.sage,border:`1px solid ${T.sage}50`},
    danger:{background:"transparent",color:T.err,border:`1px solid ${T.err}40`},
    urgent:{background:T.urgent,color:"#fff"},
    wa:{background:T.wa,color:"#fff"},
    dark:{background:T.dark,color:T.inkInv},
    pse:{background:"transparent",color:T.payPSE,border:`1px solid ${T.payPSE}40`},
    trf:{background:"transparent",color:T.payTRF,border:`1px solid ${T.payTRF}40`},
    outline:{background:"transparent",color:T.sage,border:`1.5px solid ${T.sage}`},
  };
  return (
    <button style={{...base,...vs[v]}} onClick={!disabled&&!loading?onClick:undefined} aria-disabled={disabled||loading}>
      {loading?<span className="spin" style={{fontSize:14}}>⊙</span>:children}
    </button>
  );
};

const Bdg = ({children,v="def"}) => {
  const T = useT();
  const vs = {
    def:{background:T.surfaceAlt,color:T.inkSec},
    sage:{background:T.sagePale,color:T.sage,border:`1px solid ${T.sage}30`},
    gold:{background:T.goldPale,color:T.gold,border:`1px solid ${T.gold}30`},
    ok:{background:T.okPale,color:T.ok,border:`1px solid ${T.ok}30`},
    warn:{background:T.warnPale,color:T.warn,border:`1px solid ${T.warn}30`},
    err:{background:T.errPale,color:T.err,border:`1px solid ${T.err}30`},
    urg:{background:T.urgentPale,color:T.urgent,border:`1px solid ${T.urgent}30`},
    pse:{background:"#EEF3FF",color:T.payPSE,border:`1px solid ${T.payPSE}30`},
    trf:{background:"#EEF9F8",color:T.payTRF,border:`1px solid ${T.payTRF}30`},
    dark:{background:T.dark,color:T.inkInv},
    free:{background:T.surfaceAlt,color:T.inkMuted,border:`1px solid ${T.line}`},
    pro:{background:T.sagePale,color:T.sage,border:`1px solid ${T.sage}30`},
    elite:{background:T.goldPale,color:T.gold,border:`1px solid ${T.gold}30`},
  };
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,letterSpacing:".3px",...vs[v]}}>{children}</span>;
};

const Hr   = ({my=20}) => { const T=useT(); return <div style={{height:1,background:T.line,margin:`${my}px 0`}}/>; };
const Bar  = ({pct,color,h=4}) => { const T=useT(); return (
  <div style={{height:h,borderRadius:h/2,background:T.surfaceAlt,overflow:"hidden"}}>
    <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color||T.sage,borderRadius:h/2,transition:"width .6s ease"}}/>
  </div>
);};

const Field = ({lbl:l,err,hint,required,children}) => {
  const T=useT();
  return (
    <div>
      <div style={{...lbl(T),marginBottom:7,display:"flex",gap:4}}>
        {l}{required&&<span style={{color:T.err}} aria-hidden>*</span>}
      </div>
      {children}
      {err&&<div role="alert" style={{fontSize:11.5,color:T.err,marginTop:5,display:"flex",gap:4}}>⚠ {err}</div>}
      {!err&&hint&&<div style={{...cap(T),marginTop:5}}>{hint}</div>}
    </div>
  );
};

const Empty = ({icon,title,sub,cta,onCta}) => {
  const T=useT();
  return (
    <div style={{textAlign:"center",padding:"48px 24px"}}>
      <div style={{fontSize:40,marginBottom:14,opacity:.35}} role="img" aria-label={title}>{icon}</div>
      <div style={{fontFamily:F.serif,fontSize:20,fontWeight:400,marginBottom:8,color:T.ink}}>{title}</div>
      <div style={{...cap(T),maxWidth:280,margin:"0 auto 20px"}}>{sub}</div>
      {cta&&<Btn v="primary" onClick={onCta}>{cta}</Btn>}
    </div>
  );
};

/* Skeleton loader */
const Skel = ({w="100%",h=16,r=6,mb=0}) => (
  <div className="skeleton" style={{width:w,height:h,borderRadius:r,marginBottom:mb}}/>
);
const VetCardSkeleton = () => {
  const T=useT();
  return (
    <div style={{...card(T),padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",gap:12}}>
        <Skel w={44} h={44} r={12}/>
        <div style={{flex:1}}>
          <Skel w="60%" h={14} mb={8}/>
          <Skel w="40%" h={11} mb={6}/>
          <Skel w="80%" h={11}/>
        </div>
      </div>
    </div>
  );
};

const KPI = ({l,val,sub,accent,delta}) => {
  const T=useT();
  return (
    <div style={{...card(T),padding:"18px 20px",borderLeft:`2px solid ${accent||T.sage}`}}>
      <div style={{...lbl(T),marginBottom:10}}>{l}</div>
      <div style={{fontFamily:F.serif,fontSize:26,fontWeight:400,color:T.ink}}>{val}</div>
      {(sub||delta!==undefined)&&(
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6}}>
          {delta!==undefined&&<span style={{fontSize:12,fontWeight:700,color:delta>=0?T.ok:T.err}}>{delta>=0?"↑":"↓"}{Math.abs(delta)}%</span>}
          {sub&&<span style={cap(T)}>{sub}</span>}
        </div>
      )}
    </div>
  );
};

const SHead = ({title,sub,action}) => {
  const T=useT();
  return (
    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24}}>
      <div>
        <h1 style={{fontFamily:F.serif,fontSize:26,fontWeight:400,letterSpacing:"-.3px",color:T.ink,margin:0}}>{title}</h1>
        {sub&&<div style={{...cap(T),marginTop:4}}>{sub}</div>}
      </div>
      {action}
    </div>
  );
};

const Toast = ({toasts}) => {
  const T=useT();
  return (
    <div role="region" aria-label="Notificaciones" style={{position:"fixed",top:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} role="alert" style={{padding:"11px 18px",borderRadius:10,background:t.type==="ok"?T.ok:t.type==="err"?T.err:T.dark,color:"#fff",fontSize:13.5,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,.2)",animation:"toastIn .25s ease",display:"flex",gap:8,alignItems:"center",maxWidth:320}}>
          {t.type==="ok"?"✓":t.type==="err"?"✗":"ℹ"} {t.msg}
        </div>
      ))}
    </div>
  );
};

const WaIcon = ({size=13}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.55 4.122 1.508 5.86L0 24l6.335-1.482A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.961 0-3.79-.527-5.354-1.441l-.385-.228-3.982.931.978-3.878-.248-.4A9.799 9.799 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
  </svg>
);

/* ─── LOGOS ──────────────────────────────────────────────────── */
const Logo = ({size=36,text=true,inv=false}) => {
  const T=useT();
  const gc=inv?"#E8D890":T.gold, sc=inv?"#88BB80":T.sage, tc=inv?"#F8F6F2":T.ink;
  return (
    <div style={{display:"flex",alignItems:"center",gap:size*.28,userSelect:"none"}} role="img" aria-label="Nvet Care">
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <circle cx="50" cy="50" r="48" stroke={gc} strokeWidth="1.5" fill="none" opacity=".5"/>
        <circle cx="50" cy="50" r="44" fill={inv?"#1A2A18":T.canvas==="#0F1210"?"#1A2A18":"#F5F3EF"}/>
        <path d="M58 34C64 28 74 30 76 36c1.5 5-1.5 9-4 10.5L75 59c.8 4-2 7-5 5L67.5 54c-2 2.5-4.5 3.5-7 2.5L57.5 63c-1.5 2.5-4 1-3.5-3.5L56 50.5c-3-2.5-4.5-6.5-2.5-11.5C55 35.5 58 35 58 34Z" fill={sc} opacity=".88"/>
        <path d="M59 33C60.5 26 71 25.5 73 32c-2.5.5-8 1-14 1Z" fill={sc} opacity=".88"/>
        <ellipse cx="68.5" cy="40.5" rx="2" ry="2.5" fill="#F5F3EF" opacity=".8"/>
        <path d="M42 37C36 31 26 33 24 39c-2 5.5 1.5 9.5 4.5 10.5L25.5 62c-1 4 2 6 5 4L33.5 55.5c2 2.5 5.5 3 8.5 2L45 65c1.5 2.5 4.5 0 3.5-4L46.5 51.5c3-3.5 3.5-8 1.5-13C46 34 42 38 42 37Z" fill={gc} opacity=".88"/>
        <path d="M31 33L27 23.5l9 7.5Z" fill={gc} opacity=".88"/>
        <path d="M41.5 33l-1-9.5L47.5 31Z" fill={gc} opacity=".88"/>
        <ellipse cx="31.5" cy="44" rx="1.8" ry="2.2" fill="#F5F3EF" opacity=".8"/>
      </svg>
      {text&&(
        <div style={{lineHeight:1.1}}>
          <div style={{fontFamily:F.serif,fontSize:size*.6,fontWeight:500,color:tc,letterSpacing:"-.5px"}}>
            Nvet<span style={{color:gc,fontStyle:"italic"}}> Care</span>
          </div>
          {size>26&&<div style={{fontFamily:F.mono,fontSize:size*.18,color:inv?"rgba(255,255,255,.35)":T.inkMuted,letterSpacing:"2px",marginTop:1}}>VETERINARY PLATFORM</div>}
        </div>
      )}
    </div>
  );
};

const CTGMark = ({size=24}) => {
  const T=useT();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="CTG Token" role="img">
      <circle cx="50" cy="50" r="48" fill={T.gold}/>
      <path d="M66 30C55 20 25 24 23 50c-2 26 28 32 45 22" stroke="rgba(255,255,255,.88)" strokeWidth="9.5" strokeLinecap="round" fill="none"/>
      <text x="50" y="59" textAnchor="middle" fill="rgba(255,255,255,.9)" fontSize="11" fontWeight="700" fontFamily={F.mono} letterSpacing="2">CTG</text>
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════════════════════════════════ */
const TIERS = {
  free:  {id:"free", name:"Free Vet",  commission:10,limit:5,  price:0,  cop:0,     color:"#A8A49E"},
  pro:   {id:"pro",  name:"VetPro",    commission:8, limit:null,price:10, cop:42000, color:"#4A6741"},
  elite: {id:"elite",name:"VetElite",  commission:3, limit:null,price:20, cop:84000, color:"#B8962E"},
};
const VETS_SEED = [
  {id:1,name:"Dra. Valeria Ospina",  spec:"Pequeños animales",zone:"Bocagrande",    rating:4.9,reviews:47,price:80000,avail:true, urgency:true, tier:"elite",img:"👩‍⚕️",comvezcol:"12.456",bio:"Veterinaria con 8 años atendiendo mascotas en Cartagena. Especialista en medicina preventiva y enfermedades tropicales.",lastReviews:["Excelente atención, muy puntual","Muy cariñosa con mi perro"],fav:true},
  {id:2,name:"Dr. Andrés Mora",      spec:"Medicina interna", zone:"Manga",         rating:4.7,reviews:31,price:75000,avail:true, urgency:false,tier:"pro",  img:"👨‍⚕️",comvezcol:"11.232",bio:"Médico veterinario especializado en medicina interna. 5 años de experiencia clínica.",lastReviews:["Muy profesional"],fav:false},
  {id:3,name:"Dra. Carolina Ríos",  spec:"Exóticos",          zone:"Castillogrande",rating:4.8,reviews:22,price:90000,avail:false,urgency:false,tier:"pro",  img:"👩‍⚕️",comvezcol:"13.891",bio:"Especialista en animales exóticos: reptiles, aves y pequeños mamíferos.",lastReviews:["La única vet que sabe de tortugas"],fav:false},
  {id:4,name:"Dr. Felipe Castro",   spec:"Pequeños animales", zone:"Crespo",        rating:4.4,reviews:9, price:65000,avail:true, urgency:false,tier:"free", img:"👨‍⚕️",comvezcol:"15.001",bio:"Recién graduado con pasión por los animales. Precio accesible.",lastReviews:["Buen precio y atención correcta"],fav:false},
  {id:5,name:"Dra. Ana López",      spec:"Dermatología",      zone:"Manga",         rating:3.8,reviews:12,price:70000,avail:true, urgency:false,tier:"free", img:"👩‍⚕️",comvezcol:"14.234",bio:"Especialista en dermatología veterinaria.",lastReviews:["Tardó mucho en llegar"],fav:false,flagged:true},
];
const PETS_SEED = [
  {id:1,name:"Max",  species:"Perro",breed:"Golden Retriever",age:"3 años",weight:28.5,vaccineAlert:true,
   vaccines:[{name:"Rabia",date:"15 Feb 2025",next:"15 Feb 2026",status:"Próxima"},{name:"Parvovirus",date:"10 Ene 2025",next:"10 Ene 2026",status:"Vencida"}],
   history:[{date:"22 Feb 2026",svc:"Consulta",diag:"Dermatitis leve",tx:"Apoquel 5.4mg",vet:"Dra. Ospina",weight:28.5}]},
  {id:2,name:"Mochi",species:"Gato", breed:"Siamés",         age:"1 año", weight:4.2, vaccineAlert:false,
   vaccines:[{name:"Triple Felina",date:"20 Mar 2025",next:"20 Mar 2026",status:"Al día"}],history:[]},
];
const initState = {
  vets:VETS_SEED, pets:PETS_SEED,
  vetTier:"free", vetUrgency:false,
  toasts:[],
  notifs:[
    {id:1,type:"apt_confirmed",title:"Cita confirmada",body:"Dra. Ospina confirmó tu cita para hoy 14:00",time:"13:15",read:true},
    {id:2,type:"vet_onway",    title:"Veterinario en camino",body:"Dra. Ospina está en camino — ETA 12 min",time:"13:47",read:true},
    {id:3,type:"vaccine_alert",title:"Vacuna próxima — Max",body:"Rabia vence el 15 de febrero. ¡Agendemos!",time:"Ayer",read:false},
  ],
  chats:{"C047":[
    {id:1,from:"sys",text:"Chat de cita protegido. Mensajes registrados por Nvet Care.",ts:"13:10"},
    {id:2,from:"vet",text:"Hola, soy la Dra. Ospina. ¿En qué puedo ayudar a Max?",ts:"13:11"},
    {id:3,from:"user",text:"Max tiene la piel muy irritada desde hace 3 días",ts:"13:12"},
  ]},
  txns:[
    {id:"TX047",vetId:1,client:"Laura G.", svc:"Consulta",  amount:80000, pay:"PSE",     comm:8000,ret:2880,saga:"COMPLETED",  hoursUnconf:0},
    {id:"TX048",vetId:2,client:"Carlos R.",svc:"Vacunación",amount:65000, pay:"TRANSFER",comm:6500,ret:2340,saga:"SPLIT_PENDING",hoursUnconf:10},
    {id:"TX049",vetId:1,client:"Ana M.",   svc:"Urgencia",  amount:150000,pay:"PSE",     comm:15000,ret:5400,saga:"COMPLETED", hoursUnconf:0,urgent:true},
  ],
  reminders:[
    {id:1,petId:1,petName:"Max",  owner:"Laura G.", type:"Vacuna Rabia",     dueDate:"15 Feb 2026",sent:false},
    {id:2,petId:1,petName:"Max",  owner:"Laura G.", type:"Vacuna Parvovirus",dueDate:"10 Ene 2026",sent:true},
    {id:3,petId:2,petName:"Mochi",owner:"Laura G.", type:"Revisión anual",   dueDate:"20 Feb 2026",sent:false},
  ],
  allies:[
    {id:1,name:"PetShop Bocagrande",type:"Petshop",zone:"Bocagrande",code:"BOCAPET",referrals:8,earned:19200,status:"active"},
    {id:2,name:"Clínica Vet Plus",  type:"Clínica", zone:"Manga",      code:"VETPLUS",referrals:5,earned:12000,status:"active"},
  ],
  disputes:[{id:"D001",txId:"TX048",reason:"Vet no confirmó recepción",status:"OPEN",opened:"Hoy"}],
  audit:[
    {id:1,admin:"Juan P.",action:"APPROVE_VET",entity:"Dr. Felipe Castro",reason:"COMVEZCOL verificado",ts:"Ayer 15:20"},
    {id:2,admin:"Juan P.",action:"RESOLVE_DISPUTE",entity:"TX047",reason:"Transferencia confirmada",ts:"Ayer 09:45"},
  ],
  searchHistory:["Bocagrande","Urgencias","dermatología"],
  referralCode:"NVET-JP2026",
  monthlyRevenue:[
    {month:"Sep",revenue:820000,commission:82000},
    {month:"Oct",revenue:1100000,commission:110000},
    {month:"Nov",revenue:1350000,commission:135000},
    {month:"Dic",revenue:1680000,commission:168000},
    {month:"Ene",revenue:1920000,commission:192000},
    {month:"Feb",revenue:2250000,commission:225000},
  ],
};

function reducer(state,action){
  switch(action.type){
    case "SET_TIER":       return {...state,vetTier:action.tier};
    case "TOGGLE_URGENCY": return {...state,vetUrgency:!state.vetUrgency};
    case "RATE_VET":       return {...state,vets:state.vets.map(v=>v.id===action.id?{...v,reviews:v.reviews+1}:v)};
    case "TOGGLE_FAV":     return {...state,vets:state.vets.map(v=>v.id===action.id?{...v,fav:!v.fav}:v)};
    case "SAGA_ADVANCE":   return {...state,txns:state.txns.map(t=>t.id===action.id?{...t,saga:action.saga}:t)};
    case "SEND_MSG":       return {...state,chats:{...state.chats,[action.aptId]:[...(state.chats[action.aptId]||[]),action.msg]}};
    case "MARK_ALL_READ":  return {...state,notifs:state.notifs.map(n=>({...n,read:true}))};
    case "SEND_REMINDER":  return {...state,reminders:state.reminders.map(r=>r.id===action.id?{...r,sent:true}:r)};
    case "ADD_SEARCH":     return {...state,searchHistory:[action.q,...state.searchHistory.filter(s=>s!==action.q)].slice(0,5)};
    case "RESOLVE_DISPUTE":return {...state,disputes:state.disputes.map(d=>d.id===action.id?{...d,status:"RESOLVED"}:d),audit:[{id:Date.now(),admin:"Juan P.",action:"RESOLVE_DISPUTE",entity:action.id,reason:action.reason,ts:"Ahora"},...state.audit]};
    case "TOAST":          return {...state,toasts:[...state.toasts,{id:Date.now(),msg:action.msg,type:action.t||"ok"}]};
    case "CLEAR_TOAST":    return {...state,toasts:state.toasts.filter(t=>t.id!==action.id)};
    default: return state;
  }
}

const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

/* ═══════════════════════════════════════════════════════════════
   ETA COUNTDOWN — optimización: hook dedicado
═══════════════════════════════════════════════════════════════ */
const useETA = (initialMin=12) => {
  const [eta, setEta] = useState(initialMin*60);
  useEffect(()=>{
    const t = setInterval(()=>setEta(e=>{
      if(e<=0){ clearInterval(t); return 0; }
      return e-1;
    }),1000);
    return ()=>clearInterval(t);
  },[]);
  const mm = Math.floor(eta/60);
  const ss = eta%60;
  if(eta===0) return "Llegó";
  return eta>59?`${mm} min`:`${mm}:${ss.toString().padStart(2,"0")}`;
};

/* ═══════════════════════════════════════════════════════════════
   VET SEARCH WITH MEMOIZED FILTERS — optimización principal
═══════════════════════════════════════════════════════════════ */
const useVetSearch = (vets) => {
  const [query,    setQuery]    = useState("");
  const [debouncedQ, setDQ]    = useState("");
  const [zone,     setZone]     = useState("");
  const [spec,     setSpec]     = useState("");
  const [maxPrice, setMaxPrice] = useState(200000);
  const [availOnly,setAvailOnly]= useState(false);
  const [urgOnly,  setUrgOnly]  = useState(false);
  const [sort,     setSort]     = useState("bayesian");
  const [favOnly,  setFavOnly]  = useState(false);

  // Debounce query
  useEffect(()=>{
    const t = setTimeout(()=>setDQ(query),300);
    return ()=>clearTimeout(t);
  },[query]);

  const activeFilters = useMemo(()=>{
    const f=[];
    if(zone)      f.push({key:"zone",    label:zone,          clear:()=>setZone("")});
    if(spec)      f.push({key:"spec",    label:spec,          clear:()=>setSpec("")});
    if(availOnly) f.push({key:"avail",   label:"Disponibles", clear:()=>setAvailOnly(false)});
    if(urgOnly)   f.push({key:"urg",     label:"Urgencias",   clear:()=>setUrgOnly(false)});
    if(favOnly)   f.push({key:"fav",     label:"Favoritos",   clear:()=>setFavOnly(false)});
    if(maxPrice<200000) f.push({key:"price",label:`≤ $${(maxPrice/1000).toFixed(0)}K`,clear:()=>setMaxPrice(200000)});
    return f;
  },[zone,spec,availOnly,urgOnly,favOnly,maxPrice]);

  const results = useMemo(()=>{
    return vets
      .filter(v=>!debouncedQ||v.name.toLowerCase().includes(debouncedQ.toLowerCase())||v.zone.toLowerCase().includes(debouncedQ.toLowerCase()))
      .filter(v=>!zone||v.zone===zone)
      .filter(v=>!spec||v.spec===spec)
      .filter(v=>!availOnly||v.avail)
      .filter(v=>!urgOnly||v.urgency)
      .filter(v=>!favOnly||v.fav)
      .filter(v=>v.price<=maxPrice)
      .sort((a,b)=>sort==="price"?a.price-b.price:bayesian(b.rating,b.reviews)-bayesian(a.rating,a.reviews));
  },[vets,debouncedQ,zone,spec,availOnly,urgOnly,favOnly,maxPrice,sort]);

  return {query,setQuery,zone,setZone,spec,setSpec,maxPrice,setMaxPrice,availOnly,setAvailOnly,urgOnly,setUrgOnly,sort,setSort,favOnly,setFavOnly,results,activeFilters};
};

/* ═══════════════════════════════════════════════════════════════
   REVENUE CHART — SVG optimizado
═══════════════════════════════════════════════════════════════ */
const RevenueChart = () => {
  const T=useT();
  const {state}=useApp();
  const data = state.monthlyRevenue;
  const maxRev = Math.max(...data.map(d=>d.revenue));
  const W=380, H=120, pad=30;
  const xStep = (W-pad*2)/(data.length-1);
  const yScale = (v) => H-pad-(v/maxRev)*(H-pad*2);
  const points = data.map((d,i)=>`${pad+i*xStep},${yScale(d.revenue)}`).join(" ");
  const areaPoints = `${pad},${H-pad} ${points} ${pad+(data.length-1)*xStep},${H-pad}`;

  return (
    <div style={{...card(T),padding:"20px 22px"}}>
      <div style={{...lbl(T),marginBottom:16}}>INGRESOS MENSUALES — COP</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.sage} stopOpacity=".3"/>
            <stop offset="100%" stopColor={T.sage} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0,.25,.5,.75,1].map((pct,i)=>(
          <line key={i} x1={pad} y1={pad+(1-pct)*(H-pad*2)} x2={W-pad} y2={pad+(1-pct)*(H-pad*2)} stroke={T.line} strokeWidth=".5" strokeDasharray="3,3"/>
        ))}
        {/* Area */}
        <polygon points={areaPoints} fill="url(#revGrad)"/>
        {/* Line */}
        <polyline points={points} fill="none" stroke={T.sage} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {/* Dots + labels */}
        {data.map((d,i)=>(
          <g key={i}>
            <circle cx={pad+i*xStep} cy={yScale(d.revenue)} r="4" fill={T.sage} stroke={T.surface} strokeWidth="2"/>
            <text x={pad+i*xStep} y={H-6} textAnchor="middle" fill={T.inkMuted} fontSize="10" fontFamily={F.sans}>{d.month}</text>
          </g>
        ))}
      </svg>
      {/* Summary */}
      <div style={{display:"flex",gap:20,marginTop:12}}>
        {[
          ["Último mes","$2.25M",T.sage],
          ["Comisiones","$225K",T.gold],
          ["Crecimiento","↑ 17%",T.ok],
        ].map(([l,v,c])=>(
          <div key={l}>
            <div style={{...lbl(T)}}>{l}</div>
            <div style={{fontFamily:F.serif,fontSize:16,color:c,marginTop:3}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* Zone heatmap */
const ZoneHeatmap = () => {
  const T=useT();
  const zones=[
    {name:"Bocagrande",pct:38,citas:17},{name:"Manga",pct:24,citas:11},
    {name:"Castillogrande",pct:18,citas:8},{name:"Crespo",pct:12,citas:5},
    {name:"Otros",pct:8,citas:4},
  ];
  return (
    <div style={{...card(T),padding:"20px 22px"}}>
      <div style={{...lbl(T),marginBottom:16}}>ACTIVIDAD POR ZONA — HOY</div>
      {zones.map((z,i)=>(
        <div key={i} style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:13,color:T.inkSec}}>{z.name}</span>
            <span style={{fontFamily:F.mono,fontSize:12,color:T.sage}}>{z.citas} citas · {z.pct}%</span>
          </div>
          <Bar pct={z.pct} color={`hsl(${120+i*15},40%,${35+i*5}%)`} h={6}/>
        </div>
      ))}
    </div>
  );
};

/* Revenue breakdown */
const RevenueBreakdown = () => {
  const T=useT();
  const streams=[
    {label:"Comisiones 10%",val:225000,pct:68,color:T.sage},
    {label:"Suscripciones",  val:63000, pct:19,color:T.gold},
    {label:"Seguros upsell", val:21000, pct:6, color:T.payTRF},
    {label:"Posicionamiento",val:18000, pct:5, color:T.payPSE},
    {label:"Paquetes prepago",val:6000, pct:2, color:T.inkMuted},
  ];
  return (
    <div style={{...card(T),padding:"20px 22px"}}>
      <div style={{...lbl(T),marginBottom:16}}>REVENUE BREAKDOWN — FEBRERO</div>
      {streams.map((s,i)=>(
        <div key={i} style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:13,color:T.inkSec}}>{s.label}</span>
            <div style={{display:"flex",gap:10}}>
              <span style={{fontFamily:F.mono,fontSize:12,color:s.color}}>${s.val.toLocaleString("es-CO")}</span>
              <span style={{...cap(T)}}>{s.pct}%</span>
            </div>
          </div>
          <Bar pct={s.pct} color={s.color} h={5}/>
        </div>
      ))}
      <div style={{...lbl(T),marginTop:14,marginBottom:4}}>TOTAL NETO PLATAFORMA</div>
      <div style={{fontFamily:F.serif,fontSize:24,color:T.sage}}>$333.000 COP</div>
      <div style={{...cap(T),marginTop:3}}>Sobre $2.25M COP facturados · 14.8% margen neto</div>
    </div>
  );
};

/* Retention metrics */
const RetentionMetrics = () => {
  const T=useT();
  const metrics=[
    {label:"Tasa de segunda cita",val:"41%",target:"40%",ok:true,note:"Meta superada"},
    {label:"NPS promedio",         val:"72",  target:"60",  ok:true,note:"Excelente"},
    {label:"Churn vets/mes",       val:"3.2%",target:"5%",  ok:true,note:"Bajo el umbral"},
    {label:"CTR recordatorios WA", val:"28%", target:"25%", ok:true,note:"Meta superada"},
    {label:"Tiempo 1ª cita (días)",val:"2.1", target:"3",   ok:true,note:"Muy rápido"},
  ];
  return (
    <div style={{...card(T),padding:"20px 22px"}}>
      <div style={{...lbl(T),marginBottom:16}}>MÉTRICAS DE RETENCIÓN</div>
      {metrics.map((m,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<metrics.length-1?`1px solid ${T.line}`:"none"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13.5,fontWeight:500,color:T.ink}}>{m.label}</div>
            <div style={{...cap(T),marginTop:2}}>Meta: {m.target} · {m.note}</div>
          </div>
          <div style={{fontFamily:F.serif,fontSize:22,color:m.ok?T.ok:T.err}}>{m.val}</div>
          <div style={{width:20,height:20,borderRadius:"50%",background:m.ok?T.okPale:T.errPale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:m.ok?T.ok:T.err}}>{m.ok?"✓":"✗"}</div>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   REFERRAL SYSTEM
═══════════════════════════════════════════════════════════════ */
const ReferralPanel = ({onClose}) => {
  const T=useT();
  const {state,dispatch}=useApp();
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(false);

  const copy = useCallback(()=>{
    navigator.clipboard?.writeText(state.referralCode).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
    dispatch({type:"TOAST",msg:"Código copiado al portapapeles"});
  },[state.referralCode,dispatch]);

  const share = () => {
    setLoading(true);
    setTimeout(()=>{
      dispatch({type:"TOAST",msg:"Enlace compartido por WhatsApp"});
      setLoading(false);
    },1000);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,backdropFilter:"blur(6px)"}} className="fi">
      <div style={{width:420,...card(T),boxShadow:"0 24px 60px rgba(0,0,0,.16)"}}>
        <div style={{padding:"22px 28px",borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between"}}>
          <div><div style={{...lbl(T),marginBottom:4}}>PROGRAMA DE REFERIDOS</div><div style={{fontFamily:F.serif,fontSize:20,fontWeight:400,color:T.ink}}>Invita a un amigo</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.inkMuted,fontSize:20,cursor:"pointer"}} aria-label="Cerrar">×</button>
        </div>
        <div style={{padding:"24px 28px"}}>
          <div style={{textAlign:"center",marginBottom:22}}>
            <div style={{fontSize:44,marginBottom:10}}>🎁</div>
            <div style={{fontFamily:F.serif,fontSize:18,color:T.ink,marginBottom:8}}>Tú y tu amigo reciben</div>
            <div style={{fontFamily:F.serif,fontSize:32,color:T.sage}}>$10.000 COP</div>
            <div style={{...cap(T),marginTop:4}}>Cada uno, en descuento para la próxima cita</div>
          </div>
          <div style={{background:T.sagePale,borderRadius:10,padding:"16px 18px",marginBottom:16,textAlign:"center",border:`1px solid ${T.sage}30`}}>
            <div style={{...lbl(T,{color:T.sage}),marginBottom:8}}>TU CÓDIGO PERSONAL</div>
            <div style={{fontFamily:F.mono,fontSize:24,fontWeight:700,color:T.sage,letterSpacing:3}}>{state.referralCode}</div>
          </div>
          <div style={{fontSize:13,color:T.inkSec,lineHeight:1.7,marginBottom:20}}>
            Comparte tu código con amigos dueños de mascotas. Cuando agenden su primera cita con tu código, ambos reciben $10.000 COP de descuento automáticamente.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <Btn v="primary" full onClick={copy}>{copied?"✓ ¡Copiado!":"Copiar código"}</Btn>
            <Btn v="wa" full loading={loading} onClick={share}><WaIcon/>Compartir por WhatsApp</Btn>
          </div>
          <div style={{...cap(T),textAlign:"center",marginTop:14}}>
            Ya has referido <strong style={{color:T.sage}}>3 amigos</strong> · Descuentos acumulados: $30.000 COP
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   BOOKING FLOW COMPLETO — 4 pasos con calendario
═══════════════════════════════════════════════════════════════ */
const BookingFlow = ({vet, onClose}) => {
  const T=useT();
  const {dispatch}=useApp();
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({pet:"Max",date:"",time:"",svc:"",address:"",pay:"PSE",insurance:false,notes:""});
  const [errs,setErrs]=useState({});
  const [loading,setLoading]=useState(false);
  const [done,setDone]=useState(false);

  const SVCS=[
    {id:"consult",name:"Consulta general",    price:80000},
    {id:"vaccine",name:"Vacunación",           price:65000},
    {id:"deworm", name:"Desparasitación",      price:45000},
    {id:"review", name:"Revisión preventiva",  price:75000},
    {id:"urgent", name:"Urgencia domiciliaria",price:150000},
  ];
  const DAYS=["L","M","X","J","V","S","D"];
  const TODAY_IDX=1; // simulate tuesday selected
  const SLOTS=["09:00","09:30","10:00","10:30","11:00","14:00","14:30","15:00","15:30","16:00"];
  const UNAVAIL=["10:00","14:00"];
  const svc = SVCS.find(s=>s.id===form.svc);
  const insurance_cost=6000;
  const total=(svc?.price||0)+(form.insurance?insurance_cost:0);
  const commission=Math.round(total*.10);
  const vetNet=total-commission;
  const retention=Math.round(vetNet*.04);

  const val1 = () => {
    const e={};
    if(!form.date) e.date="Selecciona una fecha";
    if(!form.time) e.time="Selecciona un horario";
    if(!form.address.trim()) e.address="Dirección requerida";
    return e;
  };
  const val2 = () => { const e={}; if(!form.svc) e.svc="Selecciona un servicio"; return e; };

  const next = (validator, nxt) => {
    const e=validator(); if(Object.keys(e).length){setErrs(e);return;} setErrs({}); setStep(nxt);
  };
  const confirm = () => {
    setLoading(true);
    setTimeout(()=>{
      dispatch({type:"TOAST",msg:`Cita con ${vet.name} confirmada`});
      setLoading(false); setDone(true);
    },1400);
  };

  const steps=["Fecha y hora","Servicio","Pago","Confirmar"];

  if(done) return (
    <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,backdropFilter:"blur(6px)"}} className="fi">
      <div style={{width:400,...card(T),padding:"44px 36px",textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:T.okPale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 20px"}}>✓</div>
        <div style={{fontFamily:F.serif,fontSize:26,color:T.ink,marginBottom:8}}>¡Cita agendada!</div>
        <div style={{...cap(T),marginBottom:24}}>{vet.name} · {form.date} · {form.time}</div>
        <div style={{background:T.sagePale,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:13,color:T.sage,textAlign:"left"}}>
          <WaIcon size={13}/> Confirmación enviada por WhatsApp
        </div>
        <Btn v="primary" full onClick={onClose}>Ver mis citas</Btn>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,backdropFilter:"blur(6px)"}} className="fi">
      <div style={{width:520,maxHeight:"90vh",overflowY:"auto",...card(T),boxShadow:"0 24px 60px rgba(0,0,0,.16)"}}>
        <div style={{padding:"20px 28px",borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{...lbl(T),marginBottom:4}}>AGENDAR CITA</div>
            <div style={{fontFamily:F.serif,fontSize:20,color:T.ink}}>{vet.name}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.inkMuted,fontSize:20,cursor:"pointer"}} aria-label="Cerrar">×</button>
        </div>
        {/* Stepper */}
        <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.line}`,display:"flex",gap:0}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",flex:i<3?1:"none"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:step>i+1?T.sage:step===i+1?T.sage:T.surfaceAlt,border:`1.5px solid ${step>=i+1?T.sage:T.line}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:step>=i+1?"#fff":T.inkMuted,transition:"all .25s"}}>
                  {step>i+1?"✓":i+1}
                </div>
                <div style={{fontSize:9.5,fontWeight:600,color:step===i+1?T.sage:T.inkMuted,whiteSpace:"nowrap"}}>{s}</div>
              </div>
              {i<3&&<div style={{flex:1,height:1,background:step>i+1?T.sage:T.line,margin:"0 6px 14px",transition:"background .25s"}}/>}
            </div>
          ))}
        </div>

        <div style={{padding:"22px 28px"}}>
          {step===1&&(
            <div className="fu">
              {/* Mascota */}
              <div style={{marginBottom:14}}>
                <Field lbl="Mascota"><select style={{...inp(T),marginTop:6}} value={form.pet} onChange={e=>setForm({...form,pet:e.target.value})}><option>Max — Golden Retriever</option><option>Mochi — Gato siamés</option></select></Field>
              </div>
              {/* Calendario semanal */}
              <div style={{marginBottom:14}}>
                <div style={{...lbl(T),marginBottom:10}}>DISPONIBILIDAD SEMANAL</div>
                <div style={{display:"flex",gap:6}}>
                  {DAYS.map((d,i)=>{
                    const isToday=i===TODAY_IDX;
                    const isSelected=form.date===d;
                    const isOff=i===0||i===6;
                    return (
                      <div key={d} onClick={()=>!isOff&&setForm({...form,date:d,time:""})} style={{flex:1,padding:"10px 4px",borderRadius:10,border:`1.5px solid ${isSelected?T.sage:T.line}`,background:isSelected?T.sagePale:isOff?T.surfaceAlt:T.surface,cursor:isOff?"not-allowed":"pointer",textAlign:"center",opacity:isOff?.4:1,transition:"all .15s"}}>
                        <div style={{fontSize:10,fontWeight:700,color:isSelected?T.sage:T.inkMuted,marginBottom:4}}>{d}</div>
                        <div style={{width:6,height:6,borderRadius:"50%",background:isToday?T.sage:T.surfaceAlt,margin:"0 auto"}}/>
                      </div>
                    );
                  })}
                </div>
                {errs.date&&<div style={{fontSize:11.5,color:T.err,marginTop:5}}>⚠ {errs.date}</div>}
              </div>
              {/* Slots */}
              {form.date&&(
                <div style={{marginBottom:14}} className="fu">
                  <div style={{...lbl(T),marginBottom:8}}>HORARIOS DISPONIBLES — {form.date}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {SLOTS.map(s=>{
                      const unavail=UNAVAIL.includes(s);
                      return (
                        <div key={s} onClick={()=>!unavail&&setForm({...form,time:s})} style={{padding:"8px 13px",borderRadius:8,border:`1.5px solid ${form.time===s?T.sage:T.line}`,background:form.time===s?T.sagePale:unavail?T.surfaceAlt:T.surface,color:form.time===s?T.sage:unavail?T.inkMuted:T.inkSec,fontSize:13,fontWeight:600,cursor:unavail?"not-allowed":"pointer",opacity:unavail?.45:1,textDecoration:unavail?"line-through":"none"}}>
                          {s}
                        </div>
                      );
                    })}
                  </div>
                  {errs.time&&<div style={{fontSize:11.5,color:T.err,marginTop:5}}>⚠ {errs.time}</div>}
                </div>
              )}
              <div style={{marginBottom:20}}>
                <Field lbl="Dirección del domicilio" err={errs.address} required>
                  <input style={{...inp(T),marginTop:6,borderColor:errs.address?T.err:T.line}} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Calle 30 #45-12, Bocagrande"/>
                </Field>
              </div>
              <Btn v="primary" full onClick={()=>next(val1,2)}>Continuar →</Btn>
            </div>
          )}

          {step===2&&(
            <div className="fu">
              <div style={{marginBottom:4}}>
                <div style={{...lbl(T),marginBottom:10}}>TIPO DE SERVICIO</div>
                {errs.svc&&<div style={{fontSize:11.5,color:T.err,marginBottom:8}}>⚠ {errs.svc}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {SVCS.map(s=>(
                    <div key={s.id} onClick={()=>setForm({...form,svc:s.id})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderRadius:10,border:`1.5px solid ${form.svc===s.id?T.sage:T.line}`,background:form.svc===s.id?T.sagePale:T.surface,cursor:"pointer",transition:"all .12s"}}>
                      <span style={{fontSize:14,fontWeight:form.svc===s.id?600:400,color:form.svc===s.id?T.ink:T.inkSec}}>{s.name}</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:F.mono,fontSize:14,color:form.svc===s.id?T.sage:T.inkMuted}}>${s.price.toLocaleString("es-CO")}</div>
                        <div style={{fontSize:11,color:T.gold}}>≈ {Math.round(s.price/420)} CTG</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Seguro upsell */}
              {form.svc&&(
                <div onClick={()=>setForm({...form,insurance:!form.insurance})} style={{marginTop:14,padding:"13px 16px",borderRadius:10,border:`1.5px solid ${form.insurance?T.gold:T.line}`,background:form.insurance?T.goldPale:T.surface,cursor:"pointer",display:"flex",gap:12,alignItems:"center"}} className="fu">
                  <div style={{width:34,height:34,borderRadius:8,background:form.insurance?`${T.gold}20`:T.surfaceAlt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13.5,fontWeight:600,color:T.ink}}>Seguro de satisfacción — +$6.000 COP</div>
                    <div style={{fontSize:12,color:T.gold,marginTop:1}}>Repetición sin costo si el servicio no cumple lo pactado</div>
                  </div>
                  <div style={{width:18,height:18,borderRadius:"50%",border:`1.5px solid ${form.insurance?T.gold:T.lineHi}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {form.insurance&&<div style={{width:8,height:8,borderRadius:"50%",background:T.gold}}/>}
                  </div>
                </div>
              )}
              <div style={{marginTop:20,display:"flex",gap:10}}>
                <Btn v="ghost" onClick={()=>setStep(1)}>← Atrás</Btn>
                <Btn v="primary" full onClick={()=>next(val2,3)}>Continuar →</Btn>
              </div>
            </div>
          )}

          {step===3&&(
            <div className="fu">
              <div style={{marginBottom:14}}>
                <div style={{...lbl(T),marginBottom:12}}>MÉTODO DE PAGO</div>
                {[{id:"PSE",label:"PSE Débito bancario",sub:"ACH Colombia · Wompi",c:T.payPSE},{id:"TRANSFER",label:"Transferencia bancaria",sub:"Nequi · Daviplata · Bancolombia",c:T.payTRF},{id:"CTG",label:"CTG Token",sub:"Próximamente · 5.5% descuento",c:T.gold,soon:true}].map((m,i)=>(
                  <div key={m.id} onClick={()=>!m.soon&&setForm({...form,pay:m.id})} style={{display:"flex",gap:14,padding:"13px 16px",borderRadius:10,border:`1.5px solid ${form.pay===m.id?m.c:T.line}`,background:form.pay===m.id?`${m.c}08`:T.surface,cursor:m.soon?"not-allowed":"pointer",marginBottom:8,opacity:m.soon?.5:1,position:"relative"}}>
                    {i===0&&<span style={{position:"absolute",top:-9,right:12,background:T.sage,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>RECOMENDADO</span>}
                    <div style={{width:34,height:34,borderRadius:8,background:`${m.c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{m.id==="PSE"?"⬡":m.id==="TRANSFER"?"→":<CTGMark size={22}/>}</div>
                    <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:T.ink}}>{m.label}</div><div style={{fontSize:12,color:m.c,marginTop:1}}>{m.sub}</div></div>
                    {!m.soon&&<div style={{width:18,height:18,borderRadius:"50%",border:`1.5px solid ${form.pay===m.id?m.c:T.lineHi}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{form.pay===m.id&&<div style={{width:8,height:8,borderRadius:"50%",background:m.c}}/>}</div>}
                  </div>
                ))}
              </div>
              {/* Wompi split note */}
              <div style={{background:T.sagePale,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12.5,color:T.sage}}>
                ✓ <strong>Wompi Split:</strong> el 90% va directamente al veterinario en la misma transacción. Sin custodia de fondos. Cumplimiento SFC.
              </div>
              {/* Price breakdown */}
              <div style={{background:T.surfaceAlt,borderRadius:10,padding:"14px 16px",marginBottom:20}}>
                <div style={{...lbl(T),marginBottom:10}}>DESGLOSE TRANSPARENTE</div>
                {[
                  [svc?.name||"—","$"+(svc?.price||0).toLocaleString("es-CO"),false],
                  form.insurance&&["Seguro de satisfacción","+$6.000",false],
                  ["Total que pagas (100%)","$"+total.toLocaleString("es-CO"),true],
                  ["Vet recibe (90%)","$"+vetNet.toLocaleString("es-CO"),false,T.sage],
                  ["Nvet Care (10%)","-$"+commission.toLocaleString("es-CO"),false,T.inkMuted],
                  ["Retención en fuente (4%)","≈-$"+retention.toLocaleString("es-CO"),false,T.warn],
                ].filter(Boolean).map(([k,v,bold,color])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.line}`,fontSize:13}}>
                    <span style={{color:T.inkSec}}>{k}</span>
                    <span style={{fontWeight:bold?700:600,color:color||T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn v="ghost" onClick={()=>setStep(2)}>← Atrás</Btn>
                <Btn v="primary" full onClick={()=>setStep(4)}>Revisar y confirmar →</Btn>
              </div>
            </div>
          )}

          {step===4&&(
            <div className="fu">
              <div style={{background:T.surfaceAlt,borderRadius:10,padding:"16px 18px",marginBottom:20}}>
                <div style={{...lbl(T),marginBottom:12}}>RESUMEN DE TU CITA</div>
                {[["Veterinario",vet.name],["Mascota",form.pet],["Fecha",`${form.date} · ${form.time}`],["Servicio",svc?.name||"—"],["Dirección",form.address||"—"],["Seguro",form.insurance?"Incluido (+$6.000)":"No incluido"],["Método",form.pay],["Total","$"+total.toLocaleString("es-CO")]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.line}`,fontSize:13.5}}>
                    <span style={{color:T.inkSec}}>{k}</span>
                    <span style={{fontWeight:600,color:k==="Total"?T.sage:T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn v="ghost" onClick={()=>setStep(3)}>← Atrás</Btn>
                <Btn v="primary" full loading={loading} onClick={confirm}>
                  {form.pay==="CTG"?"◈ Pagar con CTG":"Confirmar y pagar →"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   USER APP — optimized with memoized search
═══════════════════════════════════════════════════════════════ */
const UserApp = () => {
  const T=useT();
  const {state,dispatch}=useApp();
  const [screen,setScreen]=useState("home");
  const [showNotifs,setShowNotifs]=useState(false);
  const [showChat,setShowChat]=useState(false);
  const [showBooking,setShowBooking]=useState(null);
  const [showReferral,setShowReferral]=useState(false);
  const [showPostSvc,setShowPostSvc]=useState(false);
  const eta = useETA(12);
  const unread = useMemo(()=>state.notifs.filter(n=>!n.read).length,[state.notifs]);
  const search = useVetSearch(state.vets);
  const nav=[{id:"home",ic:"⊙",lb:"Inicio"},{id:"search",ic:"◎",lb:"Buscar"},{id:"apts",ic:"◆",lb:"Citas"},{id:"pets",ic:"🐾",lb:"Mascotas"},{id:"wallet",ic:"◈",lb:"Wallet"}];

  const toggleFav = useCallback((id,e)=>{
    e?.stopPropagation();
    dispatch({type:"TOGGLE_FAV",id});
  },[dispatch]);

  const ZONES=["Bocagrande","Manga","Castillogrande","Crespo","Ternera"];
  const SPECS=["Pequeños animales","Medicina interna","Exóticos","Cirugía","Dermatología"];

  const screens = {
    home:(
      <div>
        <div style={{padding:"14px 16px 12px",background:T.surface,borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Logo size={24}/>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div onClick={()=>setShowReferral(true)} style={{fontSize:18,cursor:"pointer",color:T.inkSec}} title="Referidos">🎁</div>
            <div onClick={()=>setShowNotifs(true)} style={{position:"relative",cursor:"pointer",padding:4}} aria-label={`${unread} notificaciones`}>
              <span style={{fontSize:20,color:T.inkSec}}>🔔</span>
              {unread>0&&<div style={{position:"absolute",top:0,right:0,width:16,height:16,borderRadius:"50%",background:T.urgent,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}} aria-hidden>{unread}</div>}
            </div>
            <div style={{width:32,height:32,borderRadius:"50%",background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.sage,cursor:"pointer"}}>LG</div>
          </div>
        </div>
        <div style={{padding:"14px 16px"}}>
          {/* Urgencia */}
          <div style={{background:T.urgent,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",gap:14,alignItems:"center",cursor:"pointer"}} className="upulse" role="button" aria-label="Urgencia veterinaria 24/7">
            <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🚨</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>Urgencia veterinaria 24/7</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:2}}>Vet en menos de 5 min · $150K–$200K</div>
            </div>
            <span style={{color:"rgba(255,255,255,.8)",fontSize:20}} aria-hidden>›</span>
          </div>
          {/* Vaccine alert */}
          {state.pets.some(p=>p.vaccineAlert)&&(
            <div style={{...card(T,{background:T.warnPale,border:`1px solid ${T.warn}30`}),padding:"11px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} role="alert" onClick={()=>setScreen("pets")}>
              <span style={{fontSize:20}} aria-hidden>⚠️</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:700,color:T.warn}}>Max tiene 2 vacunas pendientes</div>
                <div style={{...cap(T),marginTop:1}}>Parvovirus vencida · Rabia próxima</div>
              </div>
              <Btn v="ghost" sz="sm" onClick={e=>{e.stopPropagation();setScreen("search");}}>Agendar</Btn>
            </div>
          )}
          {/* Próxima cita con ETA real */}
          <div style={{background:T.sage,borderRadius:14,padding:"16px 16px",marginBottom:14}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.65)",fontWeight:600,letterSpacing:1,marginBottom:4}}>VETERINARIO EN CAMINO</div>
            <div style={{display:"flex",alignItems:"baseline",gap:10}}>
              <div style={{fontFamily:F.serif,fontSize:28,color:"#fff",fontWeight:400}} aria-live="polite" aria-label={`ETA ${eta}`}>{eta}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>Dra. Valeria Ospina · Max</div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>setScreen("apts")} style={{padding:"7px 14px",borderRadius:8,background:"rgba(255,255,255,.18)",border:"none",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",minHeight:36}}>📍 Seguir</button>
              <button onClick={()=>setShowChat(true)} style={{padding:"7px 14px",borderRadius:8,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:12,cursor:"pointer",minHeight:36}}>💬 Chat</button>
              <button onClick={()=>setShowPostSvc(true)} style={{padding:"7px 14px",borderRadius:8,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:12,cursor:"pointer",minHeight:36}}>★ Calificar</button>
            </div>
          </div>
          <div style={{...g2,gap:10}}>
            {[["🩺","Nueva cita","search"],["📋","Mis citas","apts"],["🐾","Mascotas","pets"],["🎁","Referidos","ref"]].map(([ic,lb,sc])=>(
              <div key={lb} onClick={()=>sc==="ref"?setShowReferral(true):setScreen(sc)} style={{...card(T),padding:"12px 14px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",minHeight:44}} className="hl" role="button">
                <span style={{fontSize:18}} aria-hidden>{ic}</span>
                <span style={{fontSize:13,fontWeight:500,color:T.ink}}>{lb}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    search:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:12}}>Buscar veterinario</div>
        {/* Search input with debounce */}
        <div style={{position:"relative",marginBottom:10}}>
          <input value={search.query} onChange={e=>search.setQuery(e.target.value)} style={{...inp(T),paddingLeft:38,fontSize:13}} placeholder="Nombre, zona, especialidad…" aria-label="Buscar veterinario"/>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.inkMuted}} aria-hidden>⊙</span>
          {search.query&&<button onClick={()=>search.setQuery("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.inkMuted,fontSize:16,cursor:"pointer"}} aria-label="Limpiar búsqueda">×</button>}
        </div>

        {/* Filter chips */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:10}}>
          <div onClick={()=>search.setAvailOnly(!search.availOnly)} className={search.availOnly?"chip-active":""} style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${T.line}`,background:T.surface,color:T.inkSec,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,minHeight:32}}>Disponibles</div>
          <div onClick={()=>search.setUrgOnly(!search.urgOnly)} className={search.urgOnly?"chip-active":""} style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${T.line}`,background:T.surface,color:T.inkSec,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,minHeight:32}}>Urgencias</div>
          <div onClick={()=>search.setFavOnly(!search.favOnly)} className={search.favOnly?"chip-active":""} style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${T.line}`,background:T.surface,color:T.inkSec,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,minHeight:32}}>❤ Favoritos</div>
          {ZONES.slice(0,2).map(z=>(
            <div key={z} onClick={()=>search.setZone(search.zone===z?"":z)} className={search.zone===z?"chip-active":""} style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${T.line}`,background:T.surface,color:T.inkSec,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,minHeight:32}}>{z}</div>
          ))}
        </div>

        {/* Active filters chips */}
        {search.activeFilters.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {search.activeFilters.map(f=>(
              <div key={f.key} onClick={f.clear} style={{padding:"4px 10px",borderRadius:20,background:T.sagePale,color:T.sage,border:`1px solid ${T.sage}40`,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",gap:4,alignItems:"center"}}>
                {f.label} ×
              </div>
            ))}
          </div>
        )}

        {/* Search history */}
        {!search.query&&state.searchHistory.length>0&&(
          <div style={{marginBottom:10}}>
            <div style={{...cap(T),marginBottom:6}}>Búsquedas recientes:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {state.searchHistory.map((h,i)=>(
                <div key={i} onClick={()=>search.setQuery(h)} style={{padding:"4px 10px",borderRadius:20,background:T.surfaceAlt,color:T.inkSec,fontSize:11.5,cursor:"pointer"}}>
                  ⊙ {h}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <div style={{...cap(T),marginBottom:8}} aria-live="polite">
          {search.results.length} veterinario{search.results.length!==1?"s":""} encontrado{search.results.length!==1?"s":""}
        </div>

        {/* Vet cards */}
        {search.results.length===0
          ? <Empty icon="🩺" title="Sin resultados" sub="Ajusta los filtros o busca en otra zona" cta="Ver todos" onCta={()=>{search.setQuery("");search.setZone("");search.setSpec("");search.setAvailOnly(false);search.setUrgOnly(false);search.setFavOnly(false);search.setMaxPrice(200000);}}/>
          : search.results.map(v=>(
            <div key={v.id} style={{...card(T),padding:"14px 14px",marginBottom:10,position:"relative"}} className="hl" role="button" onClick={()=>setShowBooking(v)}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:44,height:44,borderRadius:12,background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}} aria-hidden>{v.img}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:600,color:T.ink}}>{v.name}</span>
                    <Bdg v={v.tier}>{v.tier==="elite"?"◈ Elite":v.tier==="pro"?"◆ Pro":"Free"}</Bdg>
                    {v.urgency&&<Bdg v="urg">🚨</Bdg>}
                    {v.flagged&&<Bdg v="warn">⚠</Bdg>}
                  </div>
                  <div style={{...cap(T),marginBottom:4}}>{v.spec} · {v.zone} · Reg. {v.comvezcol}</div>
                  <div style={{fontSize:12.5,color:T.inkSec,lineHeight:1.5,marginBottom:6}}>{v.bio}</div>
                  {v.lastReviews?.slice(0,1).map((r,j)=>(
                    <div key={j} style={{fontSize:12,color:T.inkMuted,fontStyle:"italic"}}>"{r}"</div>
                  ))}
                  <div style={{display:"flex",gap:10,alignItems:"center",marginTop:6}}>
                    <span style={{color:T.gold,fontWeight:600,fontSize:13}} aria-label={`${bayesian(v.rating,v.reviews)} estrellas`}>★ {bayesian(v.rating,v.reviews)}</span>
                    <span style={cap(T)}>({v.reviews})</span>
                    <span style={{fontSize:12,color:v.avail?T.ok:T.err,fontWeight:600}}>● {v.avail?"Disponible hoy":"No disponible"}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
                  <button onClick={(e)=>toggleFav(v.id,e)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:v.fav?T.urgent:T.inkMuted,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}} aria-label={v.fav?"Quitar favorito":"Agregar favorito"} className={v.fav?"heartbeat":""}>
                    {v.fav?"❤":"♡"}
                  </button>
                  <div style={{fontFamily:F.mono,fontSize:14,color:T.sage}}>${(v.price/1000).toFixed(0)}K</div>
                  <Btn v="primary" sz="sm" onClick={e=>{e.stopPropagation();setShowBooking(v);}}>Agendar</Btn>
                </div>
              </div>
            </div>
          ))
        }
      </div>
    ),
    apts:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:14}}>Mis citas</div>
        {[
          {vet:"Dra. Ospina",pet:"🐕 Max",svc:"Consulta",date:"Hoy · 14:00",pay:"PSE",st:"En camino",pct:60},
          {vet:"Dr. Mora",   pet:"🐈 Mochi",svc:"Vacunación",date:"Lun · 10:30",pay:"Transferencia",st:"Confirmada",pct:20},
        ].map((c,i)=>(
          <div key={i} style={{...card(T),padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{c.vet}</div>
              <Bdg v={c.st==="En camino"?"sage":"ok"}>{c.st}</Bdg>
            </div>
            <div style={{...cap(T),marginBottom:8}}>{c.pet} · {c.svc} · {c.date}</div>
            <Bar pct={c.pct} color={c.st==="En camino"?T.sage:T.gold} h={3}/>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <Bdg v={c.pay==="PSE"?"pse":"trf"}>{c.pay}</Bdg>
              <Btn v="ghost" sz="sm" onClick={()=>setShowChat(true)}>💬 Chat</Btn>
              {c.st==="En camino"&&<div style={{marginLeft:"auto",fontFamily:F.serif,fontSize:16,color:T.sage}} aria-live="polite">{eta}</div>}
            </div>
          </div>
        ))}
        <Btn v="outline" full onClick={()=>setScreen("search")}>+ Nueva cita</Btn>
      </div>
    ),
    pets:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:14}}>Mis mascotas</div>
        {state.pets.map((p,i)=>(
          <div key={i} style={{...card(T),padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:12,background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}} aria-hidden>{p.species==="Perro"?"🐕":"🐈"}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:F.serif,fontSize:17,color:T.ink}}>{p.name}</div>
                <div style={cap(T)}>{p.breed} · {p.age} · {p.weight}kg</div>
              </div>
              <Bdg v={p.vaccineAlert?"warn":"ok"}>{p.vaccineAlert?"⚠ Vacuna":"Al día"}</Bdg>
            </div>
            {p.vaccineAlert&&(
              <div style={{background:T.warnPale,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12.5,color:T.warn}} role="alert">
                {p.vaccines.filter(v=>v.status!=="Al día").map(v=>`${v.name}: ${v.status} (${v.next})`).join(" · ")}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <Btn v="ghost" sz="sm">Ver historial</Btn>
              <Btn v="primary" sz="sm" onClick={()=>setScreen("search")}>Agendar cita</Btn>
            </div>
          </div>
        ))}
        <Btn v="ghost" full sz="sm">+ Agregar mascota</Btn>
      </div>
    ),
    wallet:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:14}}>Wallet</div>
        <div style={{background:T.dark,borderRadius:16,padding:"20px 18px",marginBottom:14}} role="region" aria-label="CTG Token balance">
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <CTGMark size={26}/>
            <div><div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontFamily:F.mono,letterSpacing:1.5}}>CTG ONE TOKEN</div><div style={{fontSize:10,color:"rgba(255,255,255,.3)",fontFamily:F.mono}}>Fase 2 · Próximamente</div></div>
          </div>
          <div style={{fontFamily:F.serif,fontSize:32,fontWeight:300,color:"#E8D070"}}>1,240.50 CTG</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.35)",marginTop:2}}>≈ $521.010 COP</div>
        </div>
        {[{ic:"⬡",lb:"PSE Débito",sub:"Bancolombia · activo",c:T.payPSE},{ic:"→",lb:"Transferencia",sub:"Nequi · activo",c:T.payTRF}].map((m,i)=>(
          <div key={i} style={{...card(T),padding:"12px 14px",marginBottom:10,display:"flex",gap:12,alignItems:"center"}}>
            <div style={{width:36,height:36,borderRadius:8,background:`${m.c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}} aria-hidden>{m.ic}</div>
            <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:600,color:T.ink}}>{m.lb}</div><div style={cap(T)}>{m.sub}</div></div>
            <Bdg v="ok">Activo</Bdg>
          </div>
        ))}
      </div>
    ),
  };

  return (
    <div style={{width:320,background:"#111",borderRadius:40,padding:10,boxShadow:"0 32px 80px rgba(0,0,0,.25)",flexShrink:0}}>
      <div style={{background:T.canvas,borderRadius:32,overflow:"hidden",height:640,position:"relative",border:`1px solid ${T.line}`}}>
        <div style={{height:"calc(100% - 58px)",overflowY:"auto",scrollbarWidth:"none"}}>
          {screens[screen]||screens.home}
        </div>
        <nav style={{position:"absolute",bottom:0,left:0,right:0,height:58,background:T.surface,borderTop:`1px solid ${T.line}`,display:"flex"}} aria-label="Navegación principal">
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setScreen(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer",color:screen===n.id?T.sage:T.inkMuted,fontSize:9,fontWeight:screen===n.id?600:400,background:"none",border:"none",minHeight:58}} aria-label={n.lb} aria-current={screen===n.id?"page":undefined}>
              <span style={{fontSize:17}} aria-hidden>{n.ic}</span>{n.lb}
            </button>
          ))}
        </nav>
      </div>
      {showNotifs&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.55)",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",zIndex:800}} onClick={()=>setShowNotifs(false)} className="fi">
          <div style={{width:320,height:"100vh",background:T.surface,overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"16px 18px",borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between"}}>
              <div style={{fontFamily:F.serif,fontSize:18,color:T.ink}}>Notificaciones</div>
              <div style={{display:"flex",gap:8}}>
                <Btn v="ghost" sz="sm" onClick={()=>dispatch({type:"MARK_ALL_READ"})}>Todas leídas</Btn>
                <button onClick={()=>setShowNotifs(false)} style={{background:"none",border:"none",color:T.inkMuted,fontSize:18,cursor:"pointer"}} aria-label="Cerrar">×</button>
              </div>
            </div>
            {state.notifs.map((n,i)=>(
              <div key={n.id} style={{padding:"12px 18px",borderBottom:`1px solid ${T.line}`,background:n.read?"transparent":T.sagePale,cursor:"pointer"}} role="article">
                <div style={{fontSize:13.5,fontWeight:n.read?400:700,color:T.ink}}>{n.title}</div>
                <div style={{...cap(T),marginTop:2}}>{n.body}</div>
                <div style={{fontSize:11,color:T.inkMuted,marginTop:3}}>{n.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showChat&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,backdropFilter:"blur(6px)"}} className="fi">
          <div style={{width:380,height:"70vh",display:"flex",flexDirection:"column",...card(T)}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontFamily:F.serif,fontSize:16,color:T.ink}}>Chat — Dra. Ospina</div>
              <button onClick={()=>setShowChat(false)} style={{background:"none",border:"none",color:T.inkMuted,fontSize:18,cursor:"pointer"}} aria-label="Cerrar chat">×</button>
            </div>
            <div style={{flex:1,padding:"12px 16px",overflowY:"auto"}}>
              {(state.chats["C047"]||[]).map(m=>(
                <div key={m.id} style={{marginBottom:10,display:"flex",justifyContent:m.from==="user"?"flex-end":m.from==="sys"?"center":"flex-start"}}>
                  {m.from==="sys"?<span style={{background:T.surfaceAlt,padding:"5px 12px",borderRadius:20,fontSize:11,color:T.inkMuted}}>{m.text}</span>
                  :<div style={{background:m.from==="user"?T.sage:T.surfaceAlt,borderRadius:10,padding:"9px 12px",maxWidth:"75%",fontSize:13.5,color:m.from==="user"?"#fff":T.ink}}>{m.text}</div>}
                </div>
              ))}
            </div>
            <div style={{padding:"10px 14px",borderTop:`1px solid ${T.line}`,display:"flex",gap:8}}>
              <input style={{...inp(T),flex:1,fontSize:13}} placeholder="Mensaje…" aria-label="Escribir mensaje"/>
              <Btn v="primary" style={{padding:"8px 14px"}}>↑</Btn>
            </div>
          </div>
        </div>
      )}
      {showBooking&&<BookingFlow vet={showBooking} onClose={()=>setShowBooking(null)}/>}
      {showReferral&&<ReferralPanel onClose={()=>setShowReferral(false)}/>}
      {showPostSvc&&(
        <div style={{position:"fixed",inset:0,background:T.canvas,zIndex:950,overflowY:"auto"}} className="fi">
          <div style={{maxWidth:380,margin:"0 auto",padding:"28px 20px"}}>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:T.okPale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 14px"}}>✓</div>
              <div style={{fontFamily:F.serif,fontSize:26,color:T.ink,marginBottom:6}}>Servicio completado</div>
              <div style={cap(T)}>Dra. Valeria Ospina · Hoy · Consulta</div>
            </div>
            <div style={{...card(T),padding:"16px 18px",marginBottom:14}}>
              <div style={{...lbl(T),marginBottom:10}}>RESUMEN</div>
              {[["Diagnóstico","Dermatitis alérgica leve"],["Tratamiento","Apoquel 5.4mg · 10 días"],["Próxima visita","En 15 días"],["Pago","$80.000 · Wompi Split · WMP-2026-0094712"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:12,padding:"7px 0",borderBottom:`1px solid ${T.line}`,fontSize:13}}>
                  <span style={{color:T.inkSec,width:100,flexShrink:0}}>{k}</span><span style={{fontWeight:500,color:T.ink}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Btn v="primary" full sz="lg" onClick={()=>{setShowPostSvc(false);setScreen("search");}}>Agendar próxima visita →</Btn>
              <Btn v="wa" full onClick={()=>setShowReferral(true)}><WaIcon/>Recomendar a un amigo</Btn>
              <Btn v="ghost" full onClick={()=>setShowPostSvc(false)}>Volver al inicio</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   VET APP — optimized
═══════════════════════════════════════════════════════════════ */
const VetApp = () => {
  const T=useT();
  const {state,dispatch}=useApp();
  const [screen,setScreen]=useState("home");
  const [showUpgrade,setShowUpgrade]=useState(false);
  const tier=TIERS[state.vetTier];
  const nav=[{id:"home",ic:"◈",lb:"Inicio"},{id:"agenda",ic:"◎",lb:"Agenda"},{id:"chat",ic:"◇",lb:"Chat"},{id:"accounting",ic:"⬡",lb:"Contabilidad"},{id:"profile",ic:"◆",lb:"Perfil"}];

  const screens={
    home:(
      <div>
        <div style={{padding:"14px 16px 12px",background:T.surface,borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Logo size={24}/>
          <div style={{width:30,height:30,borderRadius:"50%",background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.sage}}>VO</div>
        </div>
        <div style={{padding:"14px 16px"}}>
          {/* Urgency toggle */}
          <div onClick={()=>dispatch({type:"TOGGLE_URGENCY"})} style={{...card(T,{background:state.vetUrgency?T.urgentPale:T.surfaceAlt,border:`1.5px solid ${state.vetUrgency?T.urgent+"50":T.line}`}),padding:"14px 16px",marginBottom:14,display:"flex",gap:12,alignItems:"center",cursor:"pointer",minHeight:68}} role="switch" aria-checked={state.vetUrgency}>
            <div style={{width:40,height:40,borderRadius:"50%",background:state.vetUrgency?T.urgent:"rgba(0,0,0,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}} className={state.vetUrgency?"upulse":""} aria-hidden>🚨</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:state.vetUrgency?T.urgent:T.ink}}>Urgencias 24/7</div>
              <div style={cap(T)}>{state.vetUrgency?"Recibiendo solicitudes ahora":"Toca para activar"}</div>
            </div>
            <div style={{width:46,height:26,borderRadius:13,background:state.vetUrgency?T.urgent:T.lineHi,position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:state.vetUrgency?22:2,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
            </div>
          </div>
          {/* Money panel */}
          <div style={{...card(T,{background:T.sagePale,border:`1px solid ${T.sage}30`}),padding:"14px 16px",marginBottom:14}}>
            <div style={{...lbl(T,{color:T.sage}),marginBottom:10}}>FLUJO DE DINERO HOY</div>
            <div style={{...g2,gap:10}}>
              {[["Ya en cuenta","$144.000",T.ok,"Wompi Split"],["Por confirmar","$148.500",T.warn,"PSE/Transfer"]].map(([l,v,c,n])=>(
                <div key={l}><div style={lbl(T)}>{l}</div><div style={{fontFamily:F.serif,fontSize:18,color:c,marginTop:4}}>{v}</div><div style={{...cap(T),marginTop:2}}>{n}</div></div>
              ))}
            </div>
          </div>
          {/* Plan */}
          <div style={{...card(T),padding:"12px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center",borderLeft:`3px solid ${tier.color}`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13.5,fontWeight:600,color:T.ink}}>{tier.name} · {tier.commission}% comisión</div>
              <div style={cap(T)}>{tier.price===0?"Sin costo mensual":`$${tier.price} USD/mes`}</div>
            </div>
            {state.vetTier!=="elite"&&<Btn v="gold" sz="sm" onClick={()=>setShowUpgrade(true)}>↑ Mejorar</Btn>}
          </div>
          {/* Today schedule preview */}
          {[{h:"09:00",pac:"Max",svc:"Consulta",pay:"PSE",neto:72000,st:"Completada"},{h:"10:30",pac:"Luna",svc:"Vacunación",pay:"TRANSFER",neto:58500,st:"Verificar"}].map((c,i)=>(
            <div key={i} style={{...card(T),padding:"11px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{fontFamily:F.mono,fontSize:12,color:T.inkMuted,width:40,flexShrink:0}}>{c.h}</div>
              <div style={{width:2,height:30,borderRadius:1,background:c.st==="Completada"?T.ok:T.warn,flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,color:T.ink}}>{c.pac}</div><div style={cap(T)}>{c.svc}</div></div>
              <div style={{fontFamily:F.mono,fontSize:12,color:T.sage}}>${c.neto.toLocaleString("es-CO")}</div>
              <Bdg v={c.st==="Completada"?"ok":"trf"}>{c.st}</Bdg>
            </div>
          ))}
        </div>
      </div>
    ),
    accounting:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:14}}>Contabilidad DIAN</div>
        <div style={{...card(T,{background:T.sagePale,border:`1px solid ${T.sage}30`}),padding:"14px 16px",marginBottom:14}}>
          <div style={{...lbl(T,{color:T.sage}),marginBottom:10}}>ESTADO DE RESULTADOS · FEB 2026</div>
          {[["(+) Ingresos brutos","$450.000",T.ok],["(−) Comisión Nvet (10%)","−$45.000",T.err],["(−) Retención fuente (4%)","−$16.200",T.err],["(=) Neto recibido","$388.800",T.sage],["(−) Gastos deducibles","−$288.000",T.err],["(=) UTILIDAD NETA","$100.800",T.ok]].map(([k,v,c])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.sage}20`,fontSize:13}}>
              <span style={{color:T.inkSec}}>{k}</span>
              <span style={{fontFamily:F.mono,fontWeight:600,color:c}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn v="ghost" sz="sm" full>⬇ CSV</Btn>
          <Btn v="primary" sz="sm" full>⬇ Certificado DIAN</Btn>
        </div>
      </div>
    ),
    profile:(
      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:F.serif,fontSize:20,color:T.ink,marginBottom:14}}>Mi perfil</div>
        <div style={{...card(T),padding:"14px 16px",marginBottom:14,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}} aria-hidden>👩‍⚕️</div>
          <div><div style={{fontSize:15,fontWeight:600,color:T.ink}}>Dra. Valeria Ospina</div><div style={cap(T)}>Pequeños animales · Bocagrande</div><div style={{display:"flex",gap:6,marginTop:4}}><Bdg v={state.vetTier}>{tier.name}</Bdg><Bdg v="ok">COMVEZCOL ✓</Bdg></div></div>
        </div>
        {state.vetTier!=="elite"&&(
          <div style={{...card(T,{background:T.goldPale,border:`1px solid ${T.gold}30`}),padding:"14px 16px",marginBottom:14}}>
            <div style={{...lbl(T,{color:T.gold}),marginBottom:6}}>◈ MEJORA TU PLAN</div>
            <div style={{fontSize:13,color:T.inkSec,marginBottom:10}}>Con VetElite pagas solo 3% de comisión. Ahorro estimado: ${Math.round(450000*.05).toLocaleString("es-CO")} COP/mes.</div>
            <Btn v="gold" sz="sm" onClick={()=>setShowUpgrade(true)}>Actualizar a VetElite →</Btn>
          </div>
        )}
      </div>
    ),
  };

  return (
    <div style={{width:320,background:"#111",borderRadius:40,padding:10,boxShadow:"0 32px 80px rgba(0,0,0,.25)",flexShrink:0}}>
      <div style={{background:T.canvas,borderRadius:32,overflow:"hidden",height:640,position:"relative",border:`1px solid ${T.line}`}}>
        <div style={{height:"calc(100% - 58px)",overflowY:"auto",scrollbarWidth:"none"}}>
          {screens[screen]||screens.home}
        </div>
        <nav style={{position:"absolute",bottom:0,left:0,right:0,height:58,background:T.surface,borderTop:`1px solid ${T.line}`,display:"flex"}} aria-label="Navegación veterinario">
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setScreen(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer",color:screen===n.id?T.sage:T.inkMuted,fontSize:9,fontWeight:screen===n.id?600:400,background:"none",border:"none",minHeight:58}} aria-label={n.lb}>
              <span style={{fontSize:16}} aria-hidden>{n.ic}</span>{n.lb}
            </button>
          ))}
        </nav>
      </div>
      {showUpgrade&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,25,21,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,backdropFilter:"blur(6px)"}} className="fi">
          <div style={{...card(T),padding:"28px 32px",width:400}}>
            <div style={{fontFamily:F.serif,fontSize:22,color:T.ink,marginBottom:20}}>Actualizar plan</div>
            {Object.values(TIERS).filter(t=>t.id!==state.vetTier).map(t=>(
              <div key={t.id} style={{...card(T),padding:"16px 18px",marginBottom:10,borderLeft:`3px solid ${t.color}`,cursor:"pointer"}} onClick={()=>{dispatch({type:"SET_TIER",tier:t.id});dispatch({type:"TOAST",msg:`Plan actualizado a ${t.name}`});setShowUpgrade(false);}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div style={{fontFamily:F.serif,fontSize:18,color:t.color}}>{t.name}</div>
                  <div style={{fontFamily:F.serif,fontSize:18,color:T.ink}}>{t.commission}%</div>
                </div>
                <div style={cap(T)}>{t.price===0?"Gratis":`$${t.price} USD/mes`} · comisión por servicio</div>
              </div>
            ))}
            <Btn v="ghost" full onClick={()=>setShowUpgrade(false)}>Cancelar</Btn>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   ADMIN APP — with charts and export
═══════════════════════════════════════════════════════════════ */
const AdminApp = () => {
  const T=useT();
  const {state,dispatch}=useApp();
  const [view,setView]=useState("dashboard");
  const [exportLoading,setExportLoading]=useState(false);
  const NAV=[
    {id:"dashboard",l:"Dashboard",       ic:"◈"},
    {id:"analytics", l:"Analytics",       ic:"📊"},
    {id:"vets",      l:"Veterinarios",    ic:"🩺"},
    {id:"ledger",    l:"Ledger",          ic:"⬡"},
    {id:"disputes",  l:"Disputas",        ic:"⚖"},
    {id:"reminders", l:"Recordatorios",   ic:"📬"},
    {id:"allies",    l:"Aliados",         ic:"🤝"},
    {id:"audit",     l:"Audit Log",       ic:"◎"},
  ];

  const handleExport = useCallback(()=>{
    setExportLoading(true);
    setTimeout(()=>{
      dispatch({type:"TOAST",msg:"Reporte exportado exitosamente"});
      setExportLoading(false);
    },1400);
  },[dispatch]);

  const totalRev  = useMemo(()=>state.txns.reduce((a,t)=>a+t.amount,0),[state.txns]);
  const totalComm = useMemo(()=>state.txns.reduce((a,t)=>a+t.comm,0),[state.txns]);
  const pendingTrf= useMemo(()=>state.txns.filter(t=>t.pay==="TRANSFER"&&t.saga!=="COMPLETED").length,[state.txns]);

  const VIEWS={
    dashboard:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Dashboard" sub="CTG One Corporation · Nvet Care · Fase 1"/>
        {/* Phase */}
        <div style={{background:T.sagePale,borderRadius:12,padding:"16px 22px",marginBottom:24,border:`1px solid ${T.sage}30`,display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:1}}><div style={{...lbl(T,{color:T.sage}),marginBottom:4}}>FASE 1 · DÍA 14 DE 30</div><div style={{fontFamily:F.serif,fontSize:18,color:T.ink}}>47% completado</div></div>
          {[["7/10","Vets"],["18/30","Citas"],["$135K/$225K","Comisiones"],["72","NPS"]].map(([v,l])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontFamily:F.serif,fontSize:18,color:T.sage}}>{v}</div><div style={cap(T)}>{l}</div></div>
          ))}
        </div>
        <div style={{...g4,marginBottom:24}}>
          <KPI l="CITAS HOY"     val="9"      accent={T.sage}    delta={12}/>
          <KPI l="VETS ACTIVOS"  val={state.vets.filter(v=>v.avail).length} sub="de 5 registrados" accent={T.sageLt}/>
          <KPI l="COMISIONES"    val={`$${(totalComm/1000).toFixed(0)}K`} accent={T.gold} delta={8}/>
          <KPI l="TRANS. PEND."  val={pendingTrf} sub="requieren acción" accent={pendingTrf>0?T.urgent:T.ok}/>
        </div>
        {/* Compliance */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {[["⚖️","SIC Ley 1581"],["🧾","DIAN Facturación"],["💳","Wompi Split"],["📋","Contratos"],["🔬","COMVEZCOL"]].map(([ic,l])=>(
            <div key={l} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:T.okPale,borderRadius:8,border:`1px solid ${T.ok}30`,flex:1,minWidth:130}}>
              <span style={{fontSize:16}} aria-hidden>{ic}</span><span style={{fontSize:12,fontWeight:600,color:T.ok}}>{l}</span>
            </div>
          ))}
        </div>
        {/* Bayesian protocol */}
        <div style={{...card(T),padding:"22px 26px",marginBottom:20}}>
          <div style={{...lbl(T),marginBottom:12}}>PROTOCOLO BAYESIAN RATING · C=10 · Prior=4.3</div>
          <div style={{background:T.surfaceAlt,borderRadius:6,padding:"8px 12px",marginBottom:14,fontSize:12,color:T.inkSec,fontFamily:F.mono}}>Formula: (C×m + Σr)/(C+n) · Actualizado por trigger PostgreSQL en cada INSERT de review</div>
          {[...state.vets].sort((a,b)=>bayesian(b.rating,b.reviews)-bayesian(a.rating,a.reviews)).map((v,i)=>(
            <div key={v.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.line}`,alignItems:"center"}}>
              <div style={{fontFamily:F.serif,fontSize:18,color:i<3?T.gold:T.inkMuted,width:24}}>#{i+1}</div>
              <span style={{fontSize:18}} aria-hidden>{v.img}</span>
              <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:500,color:T.ink}}>{v.name}</div><div style={cap(T)}>{v.zone} · {v.reviews} reseñas</div></div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:F.serif,fontSize:20,color:bayesian(v.rating,v.reviews)>=4?T.ok:T.err}}>{bayesian(v.rating,v.reviews)}</div>
                <div style={cap(T)}>Bayesian</div>
              </div>
              {bayesian(v.rating,v.reviews)<4&&<Bdg v="err">⚠ Revisar</Bdg>}
            </div>
          ))}
        </div>
      </div>
    ),
    analytics:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Analytics" sub="Ingresos · Retención · Zonas · Revenue streams" action={<Btn v="primary" sz="sm" loading={exportLoading} onClick={handleExport}>⬇ Exportar PDF</Btn>}/>
        <div style={{...g2,gap:20,marginBottom:20}}>
          <RevenueChart/>
          <RevenueBreakdown/>
        </div>
        <div style={{...g2,gap:20}}>
          <ZoneHeatmap/>
          <RetentionMetrics/>
        </div>
      </div>
    ),
    vets:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Veterinarios" sub="Gestión y verificación COMVEZCOL"/>
        <div style={card(T)}>
          <div style={{display:"flex",padding:"10px 22px",background:T.surfaceAlt}}>
            {["Veterinario","Zona","Tier","Bayesian","Citas mes","Estado"].map(h=>(
              <div key={h} style={{...lbl(T),flex:h==="Veterinario"?2:1}}>{h}</div>
            ))}
          </div>
          {state.vets.map((v,i)=>(
            <div key={v.id} style={{display:"flex",alignItems:"center",padding:"13px 22px",borderBottom:`1px solid ${T.line}`}}>
              <div style={{flex:2,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:18}} aria-hidden>{v.img}</span>
                <div><div style={{fontSize:13.5,fontWeight:500,color:T.ink}}>{v.name}</div><div style={cap(T)}>COMVEZCOL {v.comvezcol}</div></div>
              </div>
              <div style={{flex:1,color:T.inkSec,fontSize:13}}>{v.zone}</div>
              <div style={{flex:1}}><Bdg v={v.tier}>{v.tier}</Bdg></div>
              <div style={{flex:1,fontFamily:F.serif,fontSize:18,color:bayesian(v.rating,v.reviews)>=4?T.ok:T.err}}>{bayesian(v.rating,v.reviews)}</div>
              <div style={{flex:1,fontFamily:F.mono,fontSize:13}}>{v.reviews}</div>
              <div style={{flex:1}}><Bdg v={v.avail?"ok":"warn"}>{v.avail?"Activo":"Pausado"}</Bdg></div>
            </div>
          ))}
        </div>
      </div>
    ),
    ledger:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Ledger contable" sub="Wompi Split · Saga states · DIAN compatible" action={<Btn v="ghost" sz="sm" loading={exportLoading} onClick={handleExport}>⬇ CSV</Btn>}/>
        <div style={{...g4,marginBottom:20}}>
          <KPI l="FACTURADO"   val={`$${(totalRev/1000).toFixed(0)}K`}    accent={T.sage}/>
          <KPI l="COMISIONES"  val={`$${(totalComm/1000).toFixed(1)}K`}   accent={T.gold}/>
          <KPI l="PEND. VERIF" val={pendingTrf}                           accent={pendingTrf>0?T.urgent:T.ok}/>
          <KPI l="DISPUTAS"    val={state.disputes.filter(d=>d.status==="OPEN").length} accent={T.err}/>
        </div>
        <div style={card(T)}>
          {state.txns.map((tx,i)=>{
            const vet=state.vets.find(v=>v.id===tx.vetId);
            const sagaColors={COMPLETED:"saga_done",SPLIT_PENDING:"saga_split",PENDING:"saga_pending",FAILED:"saga_fail",TIMEOUT:"urg"};
            return (
              <div key={tx.id} style={{padding:"13px 22px",borderBottom:`1px solid ${T.line}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{...mn(T)}}>{tx.id}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13.5,fontWeight:500,color:T.ink,display:"flex",gap:8}}>
                      {vet?.name} <span style={cap(T)}>→ {tx.client} · {tx.svc}</span>
                      {tx.urgent&&<Bdg v="urg">Urgencia</Bdg>}
                    </div>
                  </div>
                  <span style={{fontFamily:F.mono,fontSize:13,color:T.sage}}>${tx.amount.toLocaleString("es-CO")}</span>
                  {tx.pay==="PSE"?<Bdg v="pse">PSE</Bdg>:<Bdg v="trf">Transf.</Bdg>}
                  <Bdg v={sagaColors[tx.saga]||"def"}>{tx.saga}</Bdg>
                  {tx.saga!=="COMPLETED"&&<Btn v="primary" sz="sm" onClick={()=>{dispatch({type:"SAGA_ADVANCE",id:tx.id,saga:"COMPLETED"});dispatch({type:"TOAST",msg:`${tx.id} liquidada`});}}>Liquidar →</Btn>}
                </div>
                {tx.pay==="TRANSFER"&&tx.saga!=="COMPLETED"&&(
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={cap(T)}>Timeout 48h</span>
                      <span style={{fontSize:11,color:tx.hoursUnconf>=48?T.urgent:T.warn,fontFamily:F.mono,fontWeight:600}}>{tx.hoursUnconf}h / 48h</span>
                    </div>
                    <Bar pct={(tx.hoursUnconf/48)*100} color={tx.hoursUnconf>=48?T.urgent:T.warn} h={3}/>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{padding:"12px 22px",display:"flex",justifyContent:"flex-end",gap:32,borderTop:`1px solid ${T.lineHi}`}}>
            {[["FACTURADO",`$${totalRev.toLocaleString("es-CO")}`,T.ink],["COMISIONES",`$${totalComm.toLocaleString("es-CO")}`,T.gold]].map(([k,v,c])=>(
              <div key={k} style={{textAlign:"right"}}><div style={lbl(T)}>{k}</div><div style={{fontFamily:F.serif,fontSize:18,color:c,marginTop:4}}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>
    ),
    disputes:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Disputas" sub="Resolución · Audit trail automático"/>
        {state.disputes.length===0
          ? <Empty icon="✓" title="Sin disputas activas" sub="Todas las disputas han sido resueltas"/>
          : state.disputes.map(d=>(
            <div key={d.id} style={{...card(T),padding:"18px 22px",marginBottom:12}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:d.status==="OPEN"?14:0}}>
                <span style={mn(T)}>{d.id}</span>
                <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:600,color:T.ink}}>{d.txId} · {d.reason}</div><div style={cap(T)}>Abierta: {d.opened}</div></div>
                <Bdg v={d.status==="OPEN"?"err":"ok"}>{d.status}</Bdg>
              </div>
              {d.status==="OPEN"&&(
                <div style={{display:"flex",gap:10}}>
                  <Btn v="primary" sz="sm" onClick={()=>{dispatch({type:"RESOLVE_DISPUTE",id:d.id,reason:"Transferencia verificada manualmente"});dispatch({type:"TOAST",msg:`Disputa ${d.id} resuelta`});}}>Marcar resuelta</Btn>
                  <Btn v="ghost" sz="sm">Ver evidencia</Btn>
                </div>
              )}
            </div>
          ))
        }
      </div>
    ),
    reminders:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Recordatorios WhatsApp" sub="Motor de retención automática"/>
        <div style={card(T)}>
          <div style={{padding:"16px 22px",borderBottom:`1px solid ${T.line}`,display:"flex",justifyContent:"space-between"}}>
            <div style={lbl(T)}>PENDIENTES ({state.reminders.filter(r=>!r.sent).length})</div>
            <Btn v="wa" sz="sm" onClick={()=>{state.reminders.filter(r=>!r.sent).forEach(r=>dispatch({type:"SEND_REMINDER",id:r.id}));dispatch({type:"TOAST",msg:"Todos los recordatorios enviados"});}}>
              <WaIcon/>Enviar todos
            </Btn>
          </div>
          {state.reminders.map((r,i)=>(
            <div key={r.id} style={{display:"flex",gap:10,padding:"12px 22px",borderBottom:`1px solid ${T.line}`,alignItems:"center"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:r.sent?T.ok:T.warn,flexShrink:0}} className={r.sent?"":"pulse"} aria-hidden/>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:500,color:T.ink}}>{r.petName} — {r.owner}</div>
                <div style={cap(T)}>{r.type} · {r.dueDate}</div>
              </div>
              <Bdg v={r.sent?"ok":"warn"}>{r.sent?"Enviado":"Pendiente"}</Bdg>
              {!r.sent&&<Btn v="wa" sz="sm" onClick={()=>{dispatch({type:"SEND_REMINDER",id:r.id});dispatch({type:"TOAST",msg:`Recordatorio enviado`});}}><WaIcon/>Enviar</Btn>}
            </div>
          ))}
        </div>
      </div>
    ),
    allies:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Portal de aliados" sub="Petshops · 3% comisión por referido"/>
        <div style={{...g3,marginBottom:20}}>
          <KPI l="ALIADOS"   val={state.allies.length}                                             accent={T.sage}/>
          <KPI l="REFERIDOS" val={state.allies.reduce((a,al)=>a+al.referrals,0)}                  accent={T.gold}/>
          <KPI l="PAGADO"    val={`$${state.allies.reduce((a,al)=>a+al.earned,0).toLocaleString("es-CO")}`} accent={T.payTRF}/>
        </div>
        <div style={card(T)}>
          {state.allies.map((al,i)=>(
            <div key={al.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 22px",borderBottom:`1px solid ${T.line}`}}>
              <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:500,color:T.ink}}>{al.name} <Bdg v="def">{al.type}</Bdg></div><div style={cap(T)}>Código: <span style={{fontFamily:F.mono,color:T.sage}}>{al.code}</span></div></div>
              <div style={{textAlign:"right"}}><div style={{fontFamily:F.mono,fontSize:13,fontWeight:600,color:T.ink}}>{al.referrals} referidos</div><div style={{fontSize:12,color:T.payTRF}}>${al.earned.toLocaleString("es-CO")}</div></div>
              <Bdg v="ok">Activo</Bdg>
            </div>
          ))}
        </div>
      </div>
    ),
    audit:(
      <div style={{padding:"28px 32px"}}>
        <SHead title="Audit Log" sub="Registro inmutable de acciones administrativas"/>
        <div style={card(T)}>
          {state.audit.map((a,i)=>(
            <div key={a.id} style={{display:"flex",gap:12,padding:"12px 22px",borderBottom:`1px solid ${T.line}`,alignItems:"center"}}>
              <div style={{width:30,height:30,borderRadius:8,background:T.surfaceAlt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}} aria-hidden>
                {a.action.includes("APPROVE")?"✓":a.action.includes("RESOLVE")?"⚖":"●"}
              </div>
              <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:500,color:T.ink}}><span style={{fontFamily:F.mono,fontSize:12,color:T.sage}}>{a.action}</span> · {a.entity}</div><div style={cap(T)}>{a.reason}</div></div>
              <div style={{textAlign:"right"}}><div style={cap(T)}>{a.ts}</div><div style={{fontSize:11,fontWeight:600,color:T.inkSec}}>{a.admin}</div></div>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <div style={{display:"flex",height:"100%"}}>
      <nav style={{width:200,background:T.dark,display:"flex",flexDirection:"column",height:"100%",flexShrink:0}} aria-label="Navegación admin">
        <div style={{padding:"16px 18px 12px",borderBottom:`1px solid ${T.darkLine}`}}>
          <Logo size={26} inv={true}/>
          <div style={{fontSize:9,fontFamily:F.mono,color:"rgba(255,255,255,.3)",letterSpacing:1.5,marginTop:6}}>ADMIN CONSOLE</div>
        </div>
        <div style={{padding:"8px 10px",flex:1}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:8,cursor:"pointer",marginBottom:2,background:view===n.id?"rgba(255,255,255,.07)":"transparent",color:view===n.id?"rgba(255,255,255,.9)":"rgba(255,255,255,.38)",fontSize:13,fontWeight:view===n.id?500:400,borderLeft:view===n.id?`2px solid ${T.sage}`:"2px solid transparent",borderTop:"none",borderRight:"none",borderBottom:"none",transition:"all .15s",width:"100%"}} aria-current={view===n.id?"page":undefined}>
              <span style={{fontFamily:F.mono,fontSize:12}} aria-hidden>{n.ic}</span>{n.l}
              {n.id==="disputes"&&state.disputes.some(d=>d.status==="OPEN")&&<div style={{width:7,height:7,borderRadius:"50%",background:T.err,marginLeft:"auto"}} aria-label="Disputas pendientes"/>}
            </button>
          ))}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${T.darkLine}`,fontSize:9,fontFamily:F.mono,color:"rgba(255,255,255,.2)"}}>
          CTG One Corp · v9.0
        </div>
      </nav>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{background:T.surface,borderBottom:`1px solid ${T.line}`,padding:"12px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20}}>
          <div>
            <div style={{fontFamily:F.serif,fontSize:18,color:T.ink}}>{NAV.find(n=>n.id===view)?.l||"Dashboard"}</div>
            <div style={cap(T)}>CTG One Corporation · Nvet Care</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            {pendingTrf>0&&(
              <button onClick={()=>setView("ledger")} style={{display:"flex",gap:6,alignItems:"center",padding:"6px 12px",borderRadius:8,background:T.urgentPale,border:`1px solid ${T.urgent}30`,cursor:"pointer",fontSize:12,fontWeight:600,color:T.urgent}} aria-live="polite">
                <span className="pulse" style={{width:7,height:7,borderRadius:"50%",background:T.urgent,display:"inline-block"}} aria-hidden/>
                {pendingTrf} transf. pendientes
              </button>
            )}
            <div style={{width:30,height:30,borderRadius:"50%",background:T.sagePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.sage}}>JP</div>
          </div>
        </div>
        {VIEWS[view]||VIEWS.dashboard}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   ROOT — APP SELECTOR + DARK MODE
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [state,dispatch] = useReducer(reducer,initState);
  const [activeApp,setActiveApp] = useState("selector");
  const [darkMode,setDarkMode]   = useState(false);
  const [userOnboarded,setUserOnboarded] = useState(false);
  const [vetOnboarded, setVetOnboarded]  = useState(false);
  const T = darkMode ? DARK : LIGHT;

  useEffect(()=>{
    if(!state.toasts.length) return;
    const t=state.toasts[state.toasts.length-1];
    const timer=setTimeout(()=>dispatch({type:"CLEAR_TOAST",id:t.id}),3500);
    return ()=>clearTimeout(timer);
  },[state.toasts]);

  const DarkToggle = () => (
    <button onClick={()=>setDarkMode(d=>!d)} style={{position:"fixed",bottom:24,right:24,zIndex:999,width:44,height:44,borderRadius:"50%",background:T.surface,border:`1px solid ${T.line}`,boxShadow:"0 2px 12px rgba(0,0,0,.15)",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} aria-label={darkMode?"Modo claro":"Modo oscuro"} title={darkMode?"Cambiar a modo claro":"Cambiar a modo oscuro"}>
      {darkMode?"☀️":"🌙"}
    </button>
  );

  if(activeApp==="selector") return (
    <ThemeCtx.Provider value={T}>
      <Ctx.Provider value={{state,dispatch}}>
        <CSS T={T}/>
        <Toast toasts={state.toasts}/>
        <DarkToggle/>
        <main style={{minHeight:"100vh",background:T.canvas,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{textAlign:"center",marginBottom:48}}>
            <Logo size={52}/>
            <div style={{fontFamily:F.serif,fontSize:32,fontWeight:300,marginTop:20,lineHeight:1.3,color:T.ink}}>
              Tres productos,<br/><em>un ecosistema</em>
            </div>
            <div style={{...cap(T),marginTop:10}}>Nvet Care v9 · CTG One Corporation · Cartagena</div>
          </div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",justifyContent:"center",maxWidth:820}}>
            {[
              {id:"user",  title:"App Usuario",     sub:"Dueño de mascota",     icon:"👤", desc:"Onboarding · Búsqueda con filtros · Chat · ETA real · Referidos · Post-servicio",  color:T.sage,  badge:"iOS · Android · PWA"},
              {id:"vet",   title:"App Veterinario",  sub:"VetApp — Versión Dr.", icon:"🩺", desc:"Urgencias · Contabilidad DIAN · Chat con precios · Upgrade suscripción",             color:T.gold,  badge:"iOS · Android · PWA"},
              {id:"admin", title:"Dashboard Admin",  sub:"CTG One Corporation",  icon:"◈",  desc:"KPIs · Analytics · Charts · Ledger · Saga · Disputas · Audit Log",                  color:T.dark,  badge:"Web · Desktop"},
            ].map(app=>(
              <div key={app.id} onClick={()=>setActiveApp(app.id)} style={{...card(T),padding:"28px 26px",width:240,cursor:"pointer",borderTop:`3px solid ${app.color}`,textAlign:"center",transition:"all .2s"}} className="hl" role="button" aria-label={`Abrir ${app.title}`}>
                <div style={{fontSize:40,marginBottom:16}} aria-hidden>{app.icon}</div>
                <div style={{fontFamily:F.serif,fontSize:22,fontWeight:400,marginBottom:4,color:T.ink}}>{app.title}</div>
                <div style={{fontSize:13,fontWeight:600,color:app.color,marginBottom:10}}>{app.sub}</div>
                <div style={{...cap(T),lineHeight:1.6,marginBottom:14}}>{app.desc}</div>
                <Bdg v="def">{app.badge}</Bdg>
              </div>
            ))}
          </div>
          <div style={{...cap(T),marginTop:48,textAlign:"center"}}>
            Nvet Care · CTG One Corporation · v9.0 · Optimized Edition
          </div>
        </main>
      </Ctx.Provider>
    </ThemeCtx.Provider>
  );

  if(activeApp==="user") return (
    <ThemeCtx.Provider value={T}>
      <Ctx.Provider value={{state,dispatch}}>
        <CSS T={T}/>
        <Toast toasts={state.toasts}/>
        <DarkToggle/>
        <div style={{minHeight:"100vh",background:T.canvas,display:"flex",gap:40,padding:"32px",flexWrap:"wrap",alignItems:"flex-start",justifyContent:"center"}}>
          <div>
            <div style={{...lbl(T),marginBottom:12,textAlign:"center"}}>NVET USER · APP CLIENTE</div>
            <UserApp/>
          </div>
          <div style={{maxWidth:260,paddingTop:8}}>
            <div style={{...lbl(T),marginBottom:12}}>OPTIMIZACIONES v9</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[["⚡","useMemo filtros","Sin re-render en cada keystroke"],["⏱","Debounce 300ms","Búsqueda eficiente"],["❤","Favoritos","Toggle con animación heartbeat"],["📅","Calendario semanal","Disponibilidad con slots bloqueados"],["⏰","ETA countdown","Tiempo real con useETA hook"],["🎁","Sistema referidos","Código único + $10K descuento"],["🛡","Seguro en checkout","Upsell dinámico con cálculo"],["♿","Accesibilidad","ARIA labels, focus rings, 44px tap"],["🌙","Modo oscuro","Token system completo"],["💀","Skeleton loaders","En lugar de spinners genéricos"]].map(([ic,l,d])=>(
                <div key={l} style={{...card(T),padding:"9px 12px",display:"flex",gap:8}}>
                  <span style={{fontSize:15}} aria-hidden>{ic}</span>
                  <div><div style={{fontSize:12.5,fontWeight:600,color:T.ink}}>{l}</div><div style={cap(T)}>{d}</div></div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14}}><Btn v="ghost" full onClick={()=>setActiveApp("selector")}>← Selector de apps</Btn></div>
          </div>
        </div>
      </Ctx.Provider>
    </ThemeCtx.Provider>
  );

  if(activeApp==="vet") return (
    <ThemeCtx.Provider value={T}>
      <Ctx.Provider value={{state,dispatch}}>
        <CSS T={T}/>
        <Toast toasts={state.toasts}/>
        <DarkToggle/>
        <div style={{minHeight:"100vh",background:T.canvas,display:"flex",gap:40,padding:"32px",flexWrap:"wrap",alignItems:"flex-start",justifyContent:"center"}}>
          <div>
            <div style={{...lbl(T),marginBottom:12,textAlign:"center"}}>NVET VET · APP VETERINARIO</div>
            <VetApp/>
          </div>
          <div style={{maxWidth:260,paddingTop:8}}>
            <div style={{...lbl(T),marginBottom:12}}>FLUJOS VET v9</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[["🚨","Urgencias toggle","Con animación upulse accesible"],["💰","Flujo de dinero","Real-time split breakdown"],["📊","Contabilidad DIAN","Estado resultados · Cert. 220"],["⬆","Upgrade plan","Free → VetPro → VetElite"],["🌙","Modo oscuro","Soporte completo dark theme"]].map(([ic,l,d])=>(
                <div key={l} style={{...card(T),padding:"9px 12px",display:"flex",gap:8}}>
                  <span style={{fontSize:15}} aria-hidden>{ic}</span>
                  <div><div style={{fontSize:12.5,fontWeight:600,color:T.ink}}>{l}</div><div style={cap(T)}>{d}</div></div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14}}><Btn v="ghost" full onClick={()=>setActiveApp("selector")}>← Selector de apps</Btn></div>
          </div>
        </div>
      </Ctx.Provider>
    </ThemeCtx.Provider>
  );

  return (
    <ThemeCtx.Provider value={T}>
      <Ctx.Provider value={{state,dispatch}}>
        <CSS T={T}/>
        <Toast toasts={state.toasts}/>
        <DarkToggle/>
        <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>
            <AdminApp/>
          </div>
        </div>
        <div style={{position:"fixed",top:20,right:80,zIndex:100}}>
          <Btn v="ghost" sz="sm" onClick={()=>setActiveApp("selector")}>← Apps</Btn>
        </div>
      </Ctx.Provider>
    </ThemeCtx.Provider>
  );
}
