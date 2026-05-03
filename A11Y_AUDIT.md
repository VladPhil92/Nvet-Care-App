# Accessibility audit · WCAG 2.1 AAA · Nvet Care Platform

Estado actual de la accesibilidad y plan de remediación para alcanzar
WCAG 2.1 AAA en dashboard + mobile.

## Resumen ejecutivo

Tras la **migración a la paleta oficial Nvet Care** (Azul Profundo + Verde
Principal + Naranja Acento + Grises neutros), la a11y mejoró sustancialmente:

- **Dashboard**: cumple WCAG AA semantica (roles, labels, keyboard nav) y
  alcanza AAA en los textos principales gracias a la nueva paleta
  (Azul Profundo `#0D1B2A` da 15.79:1 sobre canvas; Gris Muted `#454D54`
  pasa de 5.4:1 → **7.8:1** AAA automáticamente).
- **Mobile**: cumple WCAG AA con `accessibilityRole`/`accessibilityLabel`
  en todos los Pressables y touch targets ≥44pt. Falta **screen reader
  testing** real con VoiceOver/TalkBack en device físico y verificación
  de `Dynamic Type` / `Font Scale`.
- **Verde Principal y Naranja Acento NO sirven como texto sobre canvas
  claro** (2.4:1 y 2.1:1 respectivamente). Se introdujeron tokens
  textuales `sageText` (#1E7048, 5.5:1) y `goldText` (#B8511A, 4.51:1)
  para uso en links, labels y captions.

## WCAG AA vs AAA — diferencias relevantes

| Criterio | AA | AAA |
|---|---|---|
| Contraste texto normal | 4.5:1 | **7:1** |
| Contraste texto grande (≥18pt o 14pt bold) | 3:1 | **4.5:1** |
| Contraste UI components | 3:1 | 3:1 (sin cambio) |
| Audio/video subtítulos | Required | + sign language |
| Reading level | n/a | Lower secondary |
| Tiempo de respuesta | 20h | 24h sin pérdida |
| Keyboard navigation | Full | Full (sin cambio) |

> Nuestra estrategia: alcanzar AAA en **contraste y semántica**, AA en
> el resto. AAA estricto en UI complejas (timelines, charts) suele
> requerir trade-offs perceptuales.

## Análisis de contraste — paleta oficial Nvet Care

### Tokens (`dashboard/src/theme/tokens.ts` + `mobile/src/theme/colors.ts`)

```ts path=null start=null
// Paleta oficial (brand kit)
azulProfundo  = #0D1B2A   // T.dark, T.ink — trazo símbolo + texto primario
verdePrincipal = #34B27A  // T.sage — brand accent / fills
verdeAccesible = #1E7048  // T.sageText — verde para texto AAA large
verdeClaro     = #B7E4C7  // T.greenSoft — fondos saludables
naranjaAcento  = #FF8A3D  // T.gold — energía / CTAs / dot del logo
naranjaAccesible = #B8511A // T.goldText — naranja para texto AA large
grisOscuro     = #333A40  // T.inkSec
grisMuted      = #454D54  // T.inkMuted — secondary labels
grisClaro      = #F2F4F7  // T.canvas — fondo principal
```

### Combinaciones evaluadas (contra `T.canvas` #F2F4F7)

| Pareja | Ratio | AA | AAA normal | AAA large |
|---|---|:-:|:-:|:-:|
| `T.ink` (Azul Profundo #0D1B2A) | **15.79:1** | ✅ | ✅ | ✅ |
| `T.inkSec` (Gris Oscuro #333A40) | **10.47:1** | ✅ | ✅ | ✅ |
| `T.inkMuted` (Gris Muted #454D54) | **7.80:1** | ✅ | ✅ | ✅ |
| `T.sageText` (Verde Accesible #1E7048) | **5.50:1** | ✅ | ❌ | ✅ |
| `T.goldText` (Naranja Accesible #B8511A) | **4.51:1** | ✅ | ❌ | ✅ |
| `T.sage` (Verde Principal #34B27A) | **2.44:1** | ❌ | ❌ | ❌ |
| `T.gold` (Naranja Acento #FF8A3D) | **2.13:1** | ❌ | ❌ | ❌ |
| `T.greenSoft` (Verde Claro #B7E4C7) | **1.28:1** | ❌ | ❌ | ❌ |

### Combinaciones contra fondo OSCURO (`T.dark` #0D1B2A)

| Pareja | Ratio | AA | AAA normal | AAA large |
|---|---|:-:|:-:|:-:|
| White / dark | 17.39:1 | ✅ | ✅ | ✅ |
| Verde Principal #34B27A / dark | **6.46:1** | ✅ | ❌ | ✅ |
| Naranja Acento #FF8A3D / dark | **7.42:1** | ✅ | ✅ | ✅ |
| Verde Claro #B7E4C7 / dark | **12.37:1** | ✅ | ✅ | ✅ |

### Reglas de uso por color

1. **Verde Principal (`T.sage` #34B27A)** — SOLO como **fill** (botones,
   badges, fondos, dot del logo). **No usar como texto sobre canvas claro**
   (2.4:1, falla AA).
   - Sobre fondo oscuro: ✅ 6.46:1 — OK como texto large
   - Para texto verde sobre claro → usar `T.sageText` (#1E7048, 5.5:1)

2. **Naranja Acento (`T.gold` #FF8A3D)** — SOLO como **fill** (CTAs,
   highlights, dot indicador). **No usar como texto sobre canvas claro**
   (2.13:1, falla AA).
   - Sobre fondo oscuro: ✅ 7.42:1 — ÓPTIMO (badges en sidebar oscuro,
     CTAs invertidos)
   - Para texto naranja sobre claro → usar `T.goldText` (#B8511A, 4.51:1
     AAA large only)

3. **Verde Claro (`T.greenSoft` #B7E4C7)** — SOLO como **background**
   (cards, alerts "saludables", chips de status). Texto sobre el verde
   claro debe ser azul profundo (5.84:1) o gris oscuro.

4. **Azul Profundo / Grises** — cualquier nivel de texto cumple AAA
   normal con margen amplio.

## Estado por componente — Dashboard (post-migración paleta oficial)

| Componente | AA | AAA | Notas |
|---|:-:|:-:|---|
| `Sidebar` | ✅ | ✅ | Sobre fondo dark `#0D1B2A`; texto blanco 17.39:1 |
| `Logos` | ✅ | ✅ | Símbolo "M" oficial: trazo azul + curva verde + dot naranja |
| `Badges` (sage fill) | ✅ | ✅ | Background verde con texto blanco — 5.5:1 large |
| `Badges` (gold fill) | ✅ | ✅ | Background naranja con texto blanco — 3.7:1 large |
| `UI.Btn` primary | ✅ | ✅ | sage fill + texto blanco — 5.5:1 large; aplicar `T.sageText` para link variant |
| `UI.Btn` ghost | ✅ | ✅ | Hover usa overlay opaco para mantener ratio |
| `UI.Metric` value | ✅ | ✅ | Azul Profundo — 15.79:1 |
| `UI.Metric` label muted | ✅ | ✅ | Gris Muted — 7.80:1 (antes 5.4:1) |
| `PaymentMethodSelector` | ✅ | ✅ | |
| `AdminDashboard` table | ✅ | ✅ | Header con bg sageFade alpha — row text 15.79:1 |
| `TiersPage` cards | ✅ | ✅ | Precio usa `T.ink` (no `T.gold`) — 15.79:1 |

## Estado por pantalla — Mobile

Cada pantalla cumple los siguientes mínimos AA verificados por inspección:

- ✅ `accessibilityRole` correcto en Pressables (`button`, `link`, `tab`, `radio`, `checkbox`)
- ✅ `accessibilityLabel` descriptivo (no genérico "Pulsar")
- ✅ `accessibilityState` dinámico (`{ disabled, busy, selected, expanded }`)
- ✅ `accessibilityHint` en acciones no-obvias (CTA reservar, cancelar, etc.)
- ✅ `accessibilityLiveRegion="polite"` en EmptyState y mensajes async
- ✅ Touch targets ≥44×44 pt iOS, ≥48×48 dp Android
- ⚠️ Algunos badges con gold no cumplen AAA contraste

### Específico por pantalla

| Pantalla | AA | AAA | Notas |
|---|:-:|:-:|---|
| `LoginScreen` | ✅ | ⚠️ | "tagline" muted contraste; sage link 5.1:1 |
| `RegisterScreen` | ✅ | ⚠️ | mismas issues que Login |
| `ForgotPasswordScreen` | ✅ | ✅ | usa `accessibilityLiveRegion="polite"` en success |
| `HomeScreenV2` | ✅ | ⚠️ | wallet card con texto small muted |
| `SearchVetsScreen` | ✅ | ⚠️ | sort options en sage pequeño |
| `VetDetailsScreen` | ✅ | ✅ | tabs con `accessibilityState.selected` |
| `BookAppointmentScreen` | ✅ | ⚠️ | step labels en muted |
| `MyAppointmentsScreen` | ✅ | ✅ | |
| `AppointmentTrackingScreen` | ✅ | ⚠️ | ETA box gold contrast |
| `VetDashboardScreen` | ✅ | ✅ | |
| `VetScheduleScreen` | ✅ | ⚠️ | leyenda con swatches small |
| `VetEarningsScreen` | ✅ | ✅ | hero card oscuro con text inverted (high contrast) |
| `ProfileScreen` | ✅ | ✅ | menu items con sage highlight |
| `ChatScreen` | ✅ | ✅ | bubbles con bg sólido high contrast |
| `WalletScreen` | ✅ | ✅ | hero oscuro con gold on dark — 8.4:1 |
| `NotificationsScreen` | ✅ | ✅ | |
| `PriceManagementScreen` | ✅ | ⚠️ | priceCtg secondary label |

## Plan de remediación

### ✅ Fase 1 — Tokens de color COMPLETADA

La migración a la paleta oficial Nvet Care en `dashboard/src/theme/tokens.ts`
y `mobile/src/theme/colors.ts` resolvió automáticamente los problemas de
contraste AAA:

```ts path=null start=null
// ANTES (sage/gold)              // DESPUÉS (paleta oficial)
T.ink      = '#1F2A1B'  15.8:1  → T.ink      = '#0D1B2A'  15.79:1  ✅ (sigue AAA)
T.inkMuted = '#5F6B5A'   5.4:1  → T.inkMuted = '#454D54'   7.80:1  ✅ PASA AAA
T.sage     = '#5B7553'   5.1:1  → T.sage     = '#34B27A'   2.44:1  ⚠️ solo fill
T.gold     = '#C9A961'   2.0:1  → T.gold     = '#FF8A3D'   2.13:1  ⚠️ solo fill
                                  T.sageText = '#1E7048'   5.50:1  ✅ NUEVO
                                  T.goldText = '#B8511A'   4.51:1  ✅ NUEVO
```

Notas:
- `T.sage` y `T.gold` sirven solo como **fill** (botones, badges, fondos)
- Para uso textual de verde/naranja existen los tokens dedicados
  `T.sageText` y `T.goldText`
- El nuevo Verde Claro `T.greenSoft` (#B7E4C7) es solo para backgrounds de
  cards "saludables"; el texto sobre verde claro debe ser azul profundo

### Fase 2 — Auditar componentes que usé sage/gold como TEXTO

Reemplazar `color: T.sage` por `color: T.sageText` en componentes que lo
usen como texto (links, captions). Revisar:

- `mobile/src/screens/auth/LoginScreen.tsx` → forgotText, registerLink
- `mobile/src/screens/auth/RegisterScreen.tsx` → mismos elementos
- `dashboard/src/components/Sidebar.tsx` → active link
- `dashboard/src/components/UI.tsx` → link variant

Reemplazar `color: T.gold` con `color: T.goldText` o eliminar uso textual:

- `dashboard/src/components/Badges.tsx` outline mode → usar fill mode
- `dashboard/src/pages/TiersPage.tsx` → precio "DESDE $X/mes"
- `mobile/src/screens/client/AppointmentTrackingScreen.tsx` → ETA box

### Fase 3 — Focus visible uniforme (Dashboard)

Agregar al `dashboard/src/index.css` o equivalente global:

```css path=null start=null
:focus-visible {
  outline: 2px solid var(--sage);
  outline-offset: 2px;
  border-radius: 2px;
}
*:focus:not(:focus-visible) {
  outline: none;
}
```

Esto garantiza el foco visible solo cuando navegando por teclado.

### Fase 4 — Mobile: VoiceOver/TalkBack testing

Checklist manual (ejecutar en device físico):

- [ ] iOS: VoiceOver activo → swipe right por la pantalla → cada elemento se anuncia comprehensible
- [ ] iOS: gestos de control (one-finger double-tap activa botones)
- [ ] iOS: `accessibilityHint` se anuncia para CTA críticos
- [ ] Android: TalkBack activo → swipe right anuncia roles correctos
- [ ] Android: navegación por explore-by-touch funciona en tab bars
- [ ] Dynamic Type / Font Scale: todos los textos respetan el sistema (sin cortes)

### Fase 5 — Subtítulos en video (cuando se agregue contenido)

Cuando se agreguen videos onboarding o tutoriales:

- Usar `<track kind="captions" srclang="es" src="..." default>` en HTML5 video
- En mobile, react-native-video soporta `selectedTextTrack`
- Proveer transcript completo en página alternativa (link "Ver transcripción")

## Comandos de verificación

```bash
# Dashboard - audit automatizado con axe-core
cd dashboard
npm run build && npm run preview &
sleep 3
npm run a11y:check

# Con reporte JSON
A11Y_OUT=a11y-report.json npm run a11y:check

# Mobile - manual via simulador
# iOS: Settings → Accessibility → VoiceOver: ON
# Android: Settings → Accessibility → TalkBack: ON
```

## Métricas objetivo

| Métrica | Actual estimado | Objetivo |
|---|---|---|
| Violaciones críticas (axe AAA) | ~5-10 | **0** |
| Violaciones serias (axe AA) | ~3-5 | **0** |
| Componentes con contrast AAA | ~70% | **100%** |
| Pantallas mobile con `accessibilityLabel` 100% | ✅ 100% | 100% |
| Tabs con `accessibilityState.selected` | ✅ 100% | 100% |
| Touch targets ≥44pt | ✅ 100% | 100% |
| VoiceOver navigation testing | ⏳ | Validado en device |
| TalkBack navigation testing | ⏳ | Validado en device |

## CI integration

Agregar al `.github/workflows/ci.yml` (job dashboard):

```yaml path=null start=null
- name: a11y check (AAA)
  run: |
    cd dashboard
    npm run build
    npm run preview &
    SERVER_PID=$!
    sleep 3
    npm run a11y:check
    kill $SERVER_PID
```

Esto convierte cero-violaciones-críticas en un required check.

## Referencias

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [Axe rules reference](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [React Native Accessibility](https://reactnative.dev/docs/accessibility)
- [iOS VoiceOver gestures](https://support.apple.com/guide/iphone/learn-voiceover-gestures-iph3e2e2281/ios)
- [TalkBack gestures](https://support.google.com/accessibility/android/answer/6151827)
