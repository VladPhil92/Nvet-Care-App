# Nvet Care Dashboard

**Admin SaaS Platform** - Panel de control administrativo para la plataforma Nvet Care.

---

## 🎨 Stack Tecnológico

- **Framework**: React 18 + Vite
- **Lenguaje**: TypeScript
- **Styling**: Inline CSS con Design System
- **Estado**: React Hooks (useState)
- **Build**: Vite 5.x

---

## 📁 Estructura del Proyecto

```
dashboard/
├── src/
│   ├── components/           # Componentes reutilizables
│   │   ├── UI.tsx           # Botones, Badges, Métricas, etc.
│   │   ├── Logos.tsx        # Logo Nvet Care + CTG Mark
│   │   ├── Badges.tsx       # PayBadge, TierBadge
│   │   ├── PaymentMethodSelector.tsx
│   │   └── Sidebar.tsx      # Navegación lateral
│   ├── pages/               # Páginas principales
│   │   ├── AdminDashboard.tsx    # Panel admin con KPIs
│   │   ├── VetPanel.tsx          # Panel veterinario
│   │   ├── TiersPage.tsx         # Planes y suscripciones
│   │   ├── AccountingPage.tsx    # Ledger contable
│   │   ├── TrackingPage.tsx      # Seguimiento de citas
│   │   └── MobileApp.tsx         # Preview de app móvil
│   ├── theme/
│   │   └── tokens.ts        # Design tokens (colores, fuentes, TIERS)
│   ├── types/               # TypeScript types
│   ├── services/            # API calls (próximamente)
│   ├── App.tsx              # Componente raíz
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚀 Instalación y Uso

### Prerequisitos

- Node.js 18+
- npm 9+

### Comandos

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run dev
# → http://localhost:3001

# Build para producción
npm run build

# Preview de build
npm run preview

# Linting
npm run lint

# Type checking
npm run typecheck
```

---

## 🎨 Design System

### Paleta de Colores

**Neutrals**
- Canvas: `#F8F6F2` (Fondo principal)
- Surface: `#FFFFFF` (Cards)
- Ink: `#1A1915` (Texto primario)

**Brand**
- Sage Green: `#4A6741` (Primary)
- CTG Gold: `#B8962E` (Accent único)

**Payments**
- CTG: `#B8962E` (Oro)
- PSE: `#1A56DB` (Azul)
- Transferencia: `#0F766E` (Teal)

### Tipografía

- **Display**: Cormorant Garamond (Elegancia serif)
- **UI**: DM Sans (Legibilidad moderna)
- **Mono**: DM Mono (Código y números)

---

## 📊 Páginas Implementadas

### ✅ Admin Dashboard
- KPIs en tiempo real (Citas, Veterinarios, CTG Volume, Comisiones)
- Ingresos por método de pago con gráficos
- Tracking de transferencias con trazabilidad
- Tabla de citas recientes

### ✅ Tiers Page
- Cards de planes (Free, Pro, Elite)
- Calculadora de rentabilidad neta
- Comparación visual de comisiones

### 🚧 Vet Panel (En desarrollo)
- Dashboard de veterinario
- Agenda del día
- Gestión de precios privados

### 🚧 Accounting Page (En desarrollo)
- Ledger contable con filtros
- Visualización de transacciones
- Exportación a CSV

### 🚧 Tracking Page (En desarrollo)
- Seguimiento de citas en tiempo real
- Estados y progreso
- Mapa de ubicación

### 🚧 Mobile Preview (En desarrollo)
- Vista previa de la app móvil
- Navegación entre pantallas

---

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz:

```env
VITE_API_URL=http://localhost:3000
VITE_CTG_RATE=420
```

### Proxy API

El dashboard está configurado para hacer proxy al backend en desarrollo:

```typescript
// vite.config.ts
server: {
  port: 3001,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

---

## 🧩 Componentes Principales

### UI Components

```tsx
import { Btn, Badge, Metric, Field, Bar, Hr } from '@/components/UI'

// Botón
<Btn variant="primary" size="md" onClick={handleClick}>Guardar</Btn>

// Badge
<Badge variant="gold">Elite</Badge>

// Métrica
<Metric label="INGRESOS" value="$420K" sub="↑ 12%" accent={T.gold} />

// Barra de progreso
<Bar pct={75} color={T.sage} />
```

### Badges Especializados

```tsx
import { PayBadge, TierBadge } from '@/components/Badges'

<PayBadge m="CTG" />
<TierBadge t="elite" />
```

### Payment Selector

```tsx
import { PaymentMethodSelector } from '@/components/PaymentMethodSelector'

<PaymentMethodSelector 
  value={paymentMethod}
  onChange={setPaymentMethod}
  amount={85000}
  mode="full"
/>
```

---

## 📝 Próximos Pasos

- [ ] Conectar con backend API (Axios)
- [ ] Implementar autenticación JWT
- [ ] Agregar gestión de estado global (Zustand)
- [ ] WebSockets para actualizaciones en tiempo real
- [ ] Modales interactivos (Chat, Transferencias)
- [ ] Exportación de reportes (CSV, PDF)
- [ ] Modo oscuro
- [ ] Responsive design (tablet/mobile)

---

## 🤝 Contribución

Este proyecto es parte del monorepo **Nvet-Care-Platform**. Para contribuir:

1. Trabajar desde la raíz del monorepo
2. Seguir convenciones de TypeScript
3. Mantener el design system consistente
4. Usar componentes reutilizables de `/components`

---

**Desarrollado por CTG One Corporation** | 2026
