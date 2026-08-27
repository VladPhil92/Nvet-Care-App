## Mobile Navigation · Nvet Care
**Sprint 2 — Día 1 · Fase 11.1 completada**

Esta capa establece la **espina dorsal de navegación** de la app móvil: state machine condicional por rol/modo, tipado type-safe, deep linking y bottom tabs themed con la paleta oficial.

---

## 1. Estructura de archivos entregada

```
mobile/
├── App.tsx                                  # Providers raíz + NavigationContainer
└── src/
    ├── navigation/
    │   ├── types.ts                         # Param lists tipados type-safe
    │   ├── linking.ts                       # Deep linking nvetcare:// + universal
    │   ├── RootNavigator.tsx                # State machine principal
    │   ├── AuthNavigator.tsx                # Login/Register/ForgotPassword
    │   ├── ClientNavigator.tsx              # Bottom tabs Sage (CLIENT)
    │   └── VetNavigator.tsx                 # Bottom tabs Gold (VET)
    ├── components/navigation/
    │   ├── TabBarIcon.tsx                   # Glifos themed con badge counter
    │   └── ScreenPlaceholder.tsx            # Componente reutilizable para pantallas WIP
    └── screens/
        ├── auth/
        │   ├── LoginScreen.tsx              # Form + validación + a11y
        │   ├── RegisterScreen.tsx           # Selector rol + validación
        │   └── ForgotPasswordScreen.tsx     # Flujo de recuperación
        ├── client/
        │   ├── HomeScreen.tsx               # (existente, integrado)
        │   ├── ClientSearchPlaceholder.tsx
        │   └── ClientAppointmentsPlaceholder.tsx
        ├── vet/
        │   ├── VetDashboardScreen.tsx       # (existente, integrado)
        │   ├── VetSchedulePlaceholder.tsx
        │   └── VetEarningsPlaceholder.tsx
        └── shared/
            ├── ProfileScreen.tsx            # (existente, integrado)
            └── ChatModalPlaceholder.tsx
```

---

## 2. Stack de providers (raíz → hojas)

```tsx
<GestureHandlerRootView>          // gestures globales
  <SafeAreaProvider>              // insets de notch / home indicator
    <QueryProvider>               // TanStack Query + persistencia AsyncStorage
      <UserModeProvider>          // contexto modo CLIENT/VET
        <NavigationContainer>     // estado nav + deep linking
          <RootNavigator />       // state machine
        </NavigationContainer>
      </UserModeProvider>
    </QueryProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

**Por qué este orden:**
- `GestureHandlerRootView` debe ser el wrapper más externo (requisito de RN Gesture Handler)
- `SafeAreaProvider` antes de Query porque algunos screens en hooks de carga inicial podrían usar insets
- `QueryProvider` antes de `UserModeProvider` porque `useCurrentUserQuery` se invoca dentro del segundo
- `NavigationContainer` después de los providers de datos para que las pantallas tengan acceso a hooks

---

## 3. State machine de RootNavigator

```
              ┌────────────────────────┐
              │  isPending (1ª query)  │
              └───────────┬────────────┘
                          ▼
                    ┌──────────┐
                    │  Splash  │
                    └────┬─────┘
                         │
        useCurrentUserQuery resuelve
                         │
              ┌──────────┴───────────────┐
              │                          │
         no auth                     auth ok
              │                          │
              ▼                          ▼
       ┌─────────────┐         ┌─────────────────┐
       │ AuthStack   │         │ user.role + mode │
       │ Login/      │         └─────────┬────────┘
       │ Register/   │                   │
       │ ForgotPass  │      ┌────────────┼────────────┐
       └─────────────┘      │            │            │
                       role=CLIENT  role=VET     role=VET
                                    mode=CLIENT  mode=VET
                                       │            │
                                       ▼            ▼
                              ┌──────────────┐  ┌──────────────┐
                              │ Client Tabs  │  │  Vet Tabs    │
                              │ Sage theme   │  │  Gold theme  │
                              └──────────────┘  └──────────────┘
```

**Caso especial — vet operando como cliente**: un veterinario puede cambiar `mode` a 'CLIENT' (vía `useUserMode.toggleMode`) para reservar servicios para sus propias mascotas. El navigator se re-monta limpio con `key="client-flow"`.

---

## 4. Type-safety end-to-end

Cada screen recibe `route` y `navigation` con tipos inferidos:

```tsx
import type { LoginScreenProps } from '../../navigation/types'

export default function LoginScreen({ navigation }: LoginScreenProps) {
  // ✅ TS conoce que navigation puede ir a 'Login' | 'Register' | 'ForgotPassword'
  navigation.navigate('Register', { role: 'VET' })

  // ❌ Error de compilación: 'NoExiste' no es ruta válida
  // navigation.navigate('NoExiste')
}
```

`CompositeScreenProps` se usa cuando un screen está dentro de un tab pero también puede navegar a screens del Root (ej. ChatModal):

```tsx
type ClientHomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'ClientHome'>,
  NativeStackScreenProps<RootStackParamList>
>
```

---

## 5. Deep linking

### 5.1 Esquemas
| Esquema | Uso |
|---|---|
| `nvetcare://` | Custom scheme (clientes con app instalada) |
| `https://app.nvetcare.co` | Universal Links iOS / App Links Android |
| `https://nvetcare.co` | Fallback al sitio web si la app no está instalada |

### 5.2 Rutas mapeadas
| URL | Resultado |
|---|---|
| `nvetcare://login` | AuthStack > Login |
| `nvetcare://register?role=VET` | AuthStack > Register con role pre-seleccionado |
| `nvetcare://home` | ClientStack > ClientHome |
| `nvetcare://search?specialty=Felinos&city=Bogot%C3%A1` | ClientStack > Search con filtros |
| `nvetcare://appointments` | ClientStack > Appointments |
| `nvetcare://chat/abc-123` | ChatModal con appointmentId |
| `nvetcare://vet/dashboard` | VetStack > Dashboard |

### 5.3 Setup en producción
- **iOS**: agregar `apple-app-site-association` en `https://app.nvetcare.co/.well-known/apple-app-site-association` (sin extensión, Content-Type `application/json`)
- **Android**: agregar `assetlinks.json` en `https://app.nvetcare.co/.well-known/assetlinks.json` + `<intent-filter android:autoVerify="true">` en AndroidManifest

---

## 6. Bottom tabs themed

### 6.1 Diferenciación visual por rol
| Aspecto | CLIENT (Sage) | VET (Gold) |
|---|---|---|
| Color activo | `#5B7553` | `#C9A961` |
| Tabs | Inicio, Buscar, Citas, Perfil | Panel, Agenda, Ingresos, Perfil |
| Icono | ⌂ ⌕ ◷ ◉ | ◰ ▦ ▲ ◉ |

### 6.2 Características de la tab bar
- **Lazy loading**: `lazy: true` → cada tab se monta solo al visitarse (mejor startup)
- **Safe area aware**: padding bottom 28pt en iOS para no chocar con home indicator
- **Indicador focused**: bubble Sage/Gold detrás del glifo cuando está activo
- **Badge counter** soportado en `TabBarIcon` para notificaciones futuras
- **a11y**: `tabBarAccessibilityLabel` en cada tab

---

## 7. Flujos auth integrados

### 7.1 Login flow
```
LoginScreen
  → useLoginMutation.mutate({ email, password })
    → onSuccess: qc.setQueryData(qk.auth.me(), user)
    → useCurrentUserQuery se invalida + refetch
    → RootNavigator detecta user.role → re-render con ClientStack o VetStack
    → key change fuerza re-mount limpio
```

### 7.2 Register flow
```
RegisterScreen
  → mutate(registerDto)
    → onSuccess: prime cache + invalidate non-auth queries
    → mismo flow que login
    → si role='VET': pantalla siguiente sugiere completar verificación profesional
```

### 7.3 Logout flow (desde ProfileScreen)
```
useLogoutMutation
  → onSuccess: qc.clear() ← limpia TODO el cache
  → useCurrentUserQuery devuelve undefined
  → RootNavigator key='auth-flow' → re-mount → AuthStack
```

---

## 8. Validación type-safe de formularios

Login y Register implementan **validación dual**:

| Capa | Cuándo | Velocidad | Confiabilidad |
|---|---|---|---|
| Client (regex + length) | Antes del submit | Inmediata | Solo UX, no seguridad |
| Server (DTOs + class-validator) | En el endpoint | <50ms | Source of truth |

Errores se muestran inline bajo cada campo + `Alert.alert()` para errores del servidor.

---

## 9. Dependencias requeridas

```bash
cd mobile

# Core de React Navigation
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs

# Peer deps obligatorias
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler

# Para iOS
cd ios && pod install
```

### Configuración nativa adicional

**Android `MainActivity.kt`** — habilitar Screen Container:
```kotlin
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

class MainActivity : ReactActivity() {
  // ya existe, no requiere cambios
}
```

**iOS `Info.plist`** — registrar custom scheme:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>nvetcare</string></array>
  </dict>
</array>
```

**Android `AndroidManifest.xml`** — registrar custom scheme + app links:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="nvetcare" />
</intent-filter>
```

---

## 10. Pantallas existentes integradas

Las 4 pantallas ya implementadas (`HomeScreen`, `VetDashboardScreen`, `ProfileScreen`, `VetVerificationScreen`) están **conectadas pero aún consumiendo data mock**. La migración a hooks de React Query se hará en Sprint 2 — Día 2:

- `HomeScreen` → `useTodayAppointmentsQuery` + `useBalanceQuery`
- `VetDashboardScreen` → `useTodayAppointmentsQuery` + `useEarningsQuery` + `useBalanceQuery`
- `ProfileScreen` → `useCurrentUserQuery` + `useLogoutMutation`
- `VetVerificationScreen` → `useMyVerificationStatusQuery` + upload mutation

---

## 11. Pantallas pendientes (Sprint 2 — Días 2-5)

### Cliente
- [ ] `SearchVetsScreen` con `useInfiniteVetSearchQuery` + filtros + map view
- [ ] `VetDetailsScreen` con tabs (perfil, precios, reviews, agenda)
- [ ] `BookAppointmentScreen` stepper 4 pasos (vet, fecha, pago, confirmar)
- [ ] `MyAppointmentsScreen` con segmented control (Próximas / Pasadas)
- [ ] `AppointmentTrackingScreen` con MapBox/Google Maps + ETA tiempo real

### Veterinario
- [ ] `ScheduleScreen` con calendar component + slots disponibles
- [ ] `EarningsScreen` con gráficos (Victory Native)
- [ ] `PatientsScreen` historial clínico
- [ ] `PriceManagementScreen` CRUD precios

### Compartidas
- [ ] `ChatScreen` integrado con `useChatStore` + WebSocket reconnection
- [ ] `WalletScreen` con `useBalanceQuery` + transactions list
- [ ] `NotificationsScreen` (FCM integrado)

---

## 12. Métricas de éxito esperadas

| Métrica | Antes | Objetivo |
|---|---|---|
| Time to interactive (login → home) | sin medir | <2 s |
| Tab switch latency | sin medir | <100 ms (lazy mount) |
| Memory footprint inicial | sin medir | <150 MB |
| Deep link → pantalla correcta | manual | <1 s |
| Error de tipos en navegación | -- | 0 (TS strict) |

---

## Próxima fase del plan

**Sprint 2 — Día 2**: integrar las 4 pantallas existentes con hooks de React Query (eliminar mock data), y comenzar con `SearchVetsScreen` + `VetDetailsScreen` (las dos pantallas que desbloquean el flujo de booking).
