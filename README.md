# Nvet Care Platform

Plataforma de servicios veterinarios domiciliarios con aplicación móvil unificada para clientes y veterinarios y API backend. El dashboard/web administrativo vigente vive en `ctgone.com/nvetcareapp` (repo `ctg_one_website`); el paquete `dashboard/` local está deprecado como producto desplegable.

**Estado del producto:** productización / preparación de release  
**Versión objetivo:** Nvet Care 1.0  
**Arquitectura oficial:** `mobile` + `backend` + superficie web federada en CTG One

> El roadmap histórico quedó superado por la evolución del código. El estado vigente y la ruta a producción se mantienen en [`docs/RELEASE_ROADMAP.md`](./docs/RELEASE_ROADMAP.md).

## Arquitectura

```text
Nvet-Care-App/
├── mobile/       # React Native + TypeScript
├── backend/      # NestJS + Prisma + PostgreSQL
├── dashboard/    # React + Vite + TypeScript — deprecado, no desplegado
├── docs/         # Arquitectura, integración y roadmap vigentes
├── .github/      # CI/CD
└── package.json  # npm workspaces
```

Fuentes principales:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura y autoridad por capa;
- [`docs/CTG_ONE_INTEGRATION.md`](./docs/CTG_ONE_INTEGRATION.md) — contrato de federación con CTG One;
- [`docs/RELEASE_ROADMAP.md`](./docs/RELEASE_ROADMAP.md) — ruta a producción.

## CTG One ecosystem integration

Nvet es un bounded context veterinario autónomo dentro del ecosistema CTG One.

```text
CTG One / Supabase identity
        ↓
ctgone.com server-side BFF
        ↓
Nvet /auth/ctg-identity-exchange
        ↓
Nvet effective role + domain authorization
        ↓
Nvet appointments / pets / services / chat / payments
```

Reglas de coherencia:

- CTG One es autoridad de la cuenta/sesión del ecosistema;
- Nvet backend es autoridad de roles y reglas veterinarias;
- el navegador no debe autoasignarse `SUPERADMIN`, `VET` o `CLIENT`;
- no existe un login público separado para administración;
- `ctgone.com/nvetcareapp` es la única superficie web activa de Nvet;
- Nvet conserva su propia identidad visual; la armonía con CTG One se logra mediante contratos, patrones de seguridad, observabilidad y microbranding de cuenta conectada, no forzando el estilo negro/dorado de Wallet.

Nvet no necesita las mismas versiones de React/Node que CTG Wallet o `ctg_one_website`. La compatibilidad se certifica en los límites de API, identidad, CI y despliegue.

## Estado actual

El repositorio contiene implementación material para:

- autenticación JWT/refresh, verificación de email, sesiones y 2FA;
- federación de identidad CTG One para la superficie web;
- proyección server-side de rol efectivo;
- perfiles de veterinarios;
- CRUD de mascotas;
- citas;
- reviews y recálculo de rating;
- pagos y webhook PSE;
- chat/WebSockets;
- administración;
- health checks;
- aplicación móvil React Native;
- Jest/MSW/Detox;
- workflows de CI y despliegue.

La existencia de estas capas no implica que toda capacidad esté habilitada en producción. La prioridad de release es validar builds reproducibles, entornos, integraciones externas y el circuito E2E antes de presentar una función como productiva.

## Circuito crítico 1.0

```text
Registro / identidad
  ↓
Verificación
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

- Node.js 18+ en el workspace root (CI puede usar una versión más nueva compatible)
- npm 9+
- Docker / Docker Compose para desarrollo backend
- PostgreSQL
- Android Studio para Android
- Xcode para iOS

Las versiones exactas de cada paquete viven en sus respectivos `package.json`/lockfiles; no duplicar números de dependencias en documentación como fuente autoritativa.

## Instalación

Desde la raíz:

```bash
npm install
```

El repositorio utiliza npm workspaces para:

- `mobile`
- `backend`
- `dashboard` (legacy/deprecado como producto)

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

Android/iOS dependen de los proyectos nativos, signing y configuración del entorno objetivo.

### Dashboard local (deprecado)

El dashboard standalone se conserva como referencia histórica; no es una superficie de desarrollo o despliegue activa. La web canónica es `ctgone.com/nvetcareapp`.

## Calidad

El workflow `.github/workflows/ci.yml` valida las capas del monorepo. Los cambios de identidad/federación deben pasar además contratos coherentes con `ctg_one_website`.

Baseline esperado:

```text
backend: install → prisma generate → lint/build/tests
mobile:  install → lint/typecheck/tests
legacy dashboard: checks de no regresión mientras permanezca en el repo
```

## Producción

El backend incluye [`backend/BOOTSTRAP_PROD.md`](./backend/BOOTSTRAP_PROD.md) para secrets, migraciones, mail transaccional y smoke tests.

Antes de declarar una release completa deben existir como mínimo:

- CI verde;
- staging separado;
- PostgreSQL con backups;
- secrets fuera del repositorio;
- email transaccional real;
- CORS/HTTPS productivos;
- geolocalización real donde aplique;
- pruebas E2E del circuito crítico;
- observabilidad y smoke tests;
- signing/distribución móvil;
- evidencia de compatibilidad entre el backend Nvet desplegado y la superficie federada de CTG One.

Un merge no equivale por sí solo a un deployment. Producción debe validarse contra el proveedor/runtime correspondiente.

## Seguridad

No versionar credenciales, claves JWT, API keys, secrets de cifrado ni archivos `.env` reales. La configuración productiva debe residir en el secret manager del proveedor.

La elevación de rol se decide en servidor. Las superficies web federadas deben mantener tokens sensibles fuera del browser cuando exista un BFF server-side capaz de realizar el intercambio.

## Documentación vigente

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura canónica.
- [`docs/CTG_ONE_INTEGRATION.md`](./docs/CTG_ONE_INTEGRATION.md) — federación CTG One/Nvet.
- [`docs/RELEASE_ROADMAP.md`](./docs/RELEASE_ROADMAP.md) — ruta a producción.
- [`docs/LEGACY.md`](./docs/LEGACY.md) — artefactos históricos y política de limpieza.
- [`backend/BOOTSTRAP_PROD.md`](./backend/BOOTSTRAP_PROD.md) — bootstrap backend.

Los informes `*_AUDIT.md`, `*_COMPLETE.md` y `MOBILE_*.md` conservados en raíz son snapshots históricos hasta completar su clasificación.

## Licencia

Proyecto propietario. Todos los derechos reservados.
