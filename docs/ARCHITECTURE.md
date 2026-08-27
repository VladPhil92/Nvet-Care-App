# Nvet Care — Arquitectura canónica

**Estado:** vigente  
**Última revisión:** 2026-08-24

Este documento define la única arquitectura válida del repositorio Nvet Care. Cualquier implementación nueva debe vivir dentro de uno de los paquetes canónicos descritos aquí.

## Monorepo

```text
Nvet-Care-App/
├── mobile/       # React Native + TypeScript — aplicación cliente/veterinario
├── backend/      # NestJS + Prisma + PostgreSQL — API y lógica de dominio
├── dashboard/    # React + Vite + TypeScript — consola administrativa
├── docs/         # Arquitectura, roadmap y documentación operativa vigente
├── .github/      # CI/CD y automatización
├── package.json  # Workspace root
└── README.md     # Entrada principal del proyecto
```

## Fuente de verdad por capa

### `mobile/`
Aplicación móvil oficial. Contiene navegación, pantallas, stores, servicios API, hooks, tests unitarios/MSW y configuración Detox E2E.

No se debe crear una segunda aplicación React Native paralela en el repositorio.

### `backend/`
API oficial. Contiene autenticación, usuarios/veterinarios, mascotas, citas, pagos, chat, reviews, administración, health checks, Prisma y utilidades comunes.

Las migraciones de base de datos y el schema Prisma deben mantenerse únicamente aquí.

### `dashboard/`
Dashboard administrativo standalone (Vite + React). **Deprecado como plataforma web** — ver `docs/RELEASE_ROADMAP.md` § Plataformas y arquitectura de producto: la única plataforma web de Nvet Care es `ctgone.com/nvetcareapp` (repo `ctg_one_website`). Este paquete se conserva en el repo pero no se despliega ni se desarrolla más como producto.

Los prototipos JSX monolíticos no forman parte del runtime del dashboard.

### `.github/workflows/`
Automatización oficial del proyecto:

- `ci.yml`: validación backend/mobile/dashboard.
- `mobile-e2e.yml`: E2E móvil.
- `deploy-backend.yml`: despliegue backend.

La existencia de un workflow no implica por sí sola que producción esté habilitada; cada pipeline debe validarse contra infraestructura y secrets reales.

## Límites de arquitectura

1. No duplicar lógica entre `mobile`, `backend` y `dashboard`.
2. No introducir nuevos prototipos ejecutables en la raíz.
3. No almacenar secrets o `.env` productivos en Git.
4. Todo nuevo módulo backend debe registrarse explícitamente en `AppModule` y contar con pruebas acordes a su criticidad.
5. El cliente móvil no debe contener reglas financieras o de autorización que deban imponerse en servidor.
6. Los estados de citas y pagos deben ser controlados por el backend mediante transiciones válidas.
7. Producción debe desplegarse desde artefactos reproducibles y pipelines verificables.

## Producto 1.0: circuito crítico

La arquitectura se considera lista para release cuando soporte de extremo a extremo:

```text
Registro → verificación → mascota → búsqueda de veterinario → solicitud
→ aceptación → servicio → pago → finalización → review
```

Mapas, chat, notificaciones y dashboard deben integrarse alrededor de ese circuito, no crear flujos paralelos.

## Entornos objetivo

```text
local       desarrollo individual
staging     integración completa y QA
production  usuarios reales
```

Cada entorno debe tener base de datos, variables, credenciales y dominios separados.

## Cambios arquitectónicos

Toda modificación que cree un nuevo paquete de primer nivel, cambie el modelo de despliegue, sustituya la base de datos o altere el flujo de pagos debe documentarse antes de incorporarse a `main`.
