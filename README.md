# Nvet Care Platform

Plataforma de servicios veterinarios domiciliarios con aplicación móvil unificada para clientes y veterinarios, API backend y dashboard administrativo.

**Estado del producto:** productización / preparación de release  
**Versión objetivo:** Nvet Care 1.0  
**Arquitectura oficial:** `mobile` + `backend` + `dashboard`

> El roadmap histórico de abril de 2026 quedó superado por la evolución del código. El estado vigente y la ruta a producción se mantienen en [`docs/RELEASE_ROADMAP.md`](./docs/RELEASE_ROADMAP.md).

## Arquitectura

```text
Nvet-Care-App/
├── mobile/       # React Native + TypeScript
├── backend/      # NestJS + Prisma + PostgreSQL
├── dashboard/    # React + Vite + TypeScript
├── docs/         # Arquitectura y roadmap vigentes
├── .github/      # CI/CD
└── package.json  # npm workspaces
```

La definición completa de límites y fuentes de verdad está en [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Estado actual

El repositorio ya contiene implementación material para:

- autenticación JWT/refresh, verificación de email, sesiones y 2FA;
- perfiles de veterinarios;
- CRUD de mascotas;
- citas;
- reviews y recálculo de rating;
- pagos y webhook PSE;
- chat/WebSockets;
- administración;
- health checks;
- aplicación móvil React Native;
- dashboard React/Vite;
- Jest/MSW/Detox;
- workflows de CI y despliegue.

La existencia de estas capas no implica que producción esté habilitada. La prioridad actual es validar builds reproducibles, CI, staging, integraciones externas y el circuito E2E antes de añadir funcionalidades secundarias.

## Circuito crítico 1.0

```text
Registro
  ↓
Verificación de email
  ↓
Mascota
  ↓
Búsqueda de veterinario
  ↓
Solicitud / aceptación
  ↓
Servicio
  ↓
Pago
  ↓
Finalización
  ↓
Review
```

## Requisitos

- Node.js 18+ (CI usa Node 20)
- npm 9+
- Docker / Docker Compose para desarrollo backend
- PostgreSQL
- Android Studio para Android
- Xcode para iOS

## Instalación

Desde la raíz:

```bash
npm install
```

El repositorio utiliza npm workspaces para:

- `mobile`
- `backend`
- `dashboard`

También existe el helper histórico:

```bash
npm run install:all
```

que será revisado durante la Fase 1 de baseline técnico.

## Desarrollo

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run start:dev
```

Para PostgreSQL/Redis local:

```bash
cd backend
docker-compose up -d
```

### Mobile

```bash
cd mobile
npm install
npm run start
```

Android/iOS dependen de que los proyectos nativos estén presentes y correctamente configurados; su verificación es un bloqueante explícito del roadmap de release.

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

## Calidad

El workflow `.github/workflows/ci.yml` está diseñado para validar:

### Backend

```text
npm ci → prisma generate → lint → build → tests
```

### Mobile

```text
npm ci → lint → typecheck → Jest/MSW
```

### Dashboard

```text
npm ci → lint → build
```

El siguiente milestone técnico exige que esos checks pasen de forma verificable en `main`.

## Producción

El backend incluye [`backend/BOOTSTRAP_PROD.md`](./backend/BOOTSTRAP_PROD.md), que documenta secrets, migraciones, mail transaccional y smoke tests.

Antes de producción deben existir como mínimo:

- CI verde;
- proyectos nativos móviles compilables;
- staging separado;
- PostgreSQL con backups;
- secrets fuera del repositorio;
- email transaccional real;
- CORS de producción;
- HTTPS;
- geolocalización real;
- pruebas E2E del circuito crítico;
- observabilidad y smoke tests;
- signing y distribución de builds.

## Documentación vigente

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura canónica.
- [`docs/RELEASE_ROADMAP.md`](./docs/RELEASE_ROADMAP.md) — ruta a producción.
- [`docs/LEGACY.md`](./docs/LEGACY.md) — artefactos históricos y política de limpieza.
- [`backend/BOOTSTRAP_PROD.md`](./backend/BOOTSTRAP_PROD.md) — bootstrap backend.

Los informes `*_AUDIT.md`, `*_COMPLETE.md` y `MOBILE_*.md` conservados en raíz son snapshots históricos hasta completar su clasificación.

## Seguridad

No se deben versionar credenciales, claves JWT, API keys, secrets de cifrado ni archivos `.env` reales. La configuración productiva debe residir en el secret manager del proveedor de infraestructura.

## Licencia

Proyecto propietario. Todos los derechos reservados.
