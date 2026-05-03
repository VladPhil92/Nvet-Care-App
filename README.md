# Nvet Care Platform

**Plataforma completa de servicios veterinarios domiciliarios con integración blockchain CTG Token**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)

Desarrollado por **CTG One Corporation** | 2026

---

## 📋 Descripción

Nvet Care es una plataforma integral que conecta veterinarios con dueños de mascotas para servicios domiciliarios, con un sistema de pagos innovador basado en blockchain (CTG Token) y métodos tradicionales (PSE, Transferencias).

### Características Principales

- 🏥 **App Móvil Unificada**: Una sola aplicación con modo Cliente y Veterinario
- 💰 **Sistema de Tiers**: Free, Pro y Elite con comisiones variables (10%, 8%, 3%)
- 💬 **Chat Arbitrado**: Protección contra cobros abusivos con precios verificados
- 🔗 **Blockchain Integration**: CTG Token en Polygon para descuento automático de comisiones
- 📊 **Dashboard Admin SaaS**: Panel completo de métricas, tracking y contabilidad
- ✅ **Trazabilidad de Pagos**: Tracking automático de transferencias bancarias

---

## 🏗️ Arquitectura del Monorepo

```
Nvet-Care-Platform/
├── mobile/           # React Native app (iOS + Android)
├── backend/          # NestJS API REST + Prisma + PostgreSQL
├── dashboard/        # React + Vite SaaS admin panel
└── README.md         # Este archivo
```

---

## 🚀 Setup Inicial

### Prerequisitos

- **Node.js** 18+ y npm 9+
- **Docker** y Docker Compose (para backend)
- **React Native CLI** (para mobile)
- **Android Studio** o **Xcode** (según plataforma)

### Instalación Rápida

```bash
# Clonar repositorio
git clone https://github.com/VladPhil92/Nvet-Care-App.git
cd Nvet-Care-Platform

# Instalar todas las dependencias
npm run install:all
```

---

## 📱 Mobile App

**Tecnología**: React Native 0.75.4 + TypeScript

### Características

- Navegación unificada con cambio de modo Usuario ↔ Veterinario
- Integración con backend via Axios
- Gestión de estado con Zustand
- Mapas en tiempo real (react-native-maps)
- AsyncStorage para persistencia local

### Ejecutar

```bash
# Android
npm run mobile

# iOS
npm run mobile:ios
```

**Documentación completa**: [mobile/README.md](./mobile/README.md)

---

## 🔧 Backend API

**Tecnología**: NestJS + Prisma + PostgreSQL + Redis

### Características

- API REST con Swagger docs (`/api/docs`)
- Autenticación JWT con refresh tokens
- Roles: CLIENT, VET, ADMIN
- WebSockets para chat en tiempo real
- Integración Web3.js (Polygon)

### Ejecutar

```bash
# Levantar servicios (PostgreSQL + Redis)
cd backend
docker-compose up -d

# Ejecutar migraciones
npm run backend:migrate

# Iniciar servidor dev
npm run backend
```

**Puerto**: http://localhost:3000  
**Documentación completa**: [backend/README.md](./backend/README.md)

---

## 🖥️ Dashboard Admin

**Tecnología**: React 18 + Vite + TypeScript

### Características

- Panel administrativo con métricas en tiempo real
- Tracking de transferencias con trazabilidad
- Gestión de tiers y comisiones
- Ledger contable con filtros avanzados
- Preview de mobile app

### Ejecutar

```bash
npm run dashboard
```

**Puerto**: http://localhost:3001  
**Documentación completa**: [dashboard/README.md](./dashboard/README.md)

---

## 🎨 Design System

### Paleta de Colores

- **Canvas**: `#F8F6F2` (Fondo principal - papel premium)
- **Sage Green**: `#4A6741` (Brand primary - oliva profundo)
- **CTG Gold**: `#B8962E` (Acento único - oro cálido)
- **Ink**: `#1A1915` (Texto primario)

### Tipografía

- **Display**: Cormorant Garamond (elegancia serif)
- **UI**: DM Sans (legibilidad moderna)
- **Mono**: DM Mono (código y números)

---

## 🔐 Seguridad

- ✅ Passwords hasheados con bcrypt
- ✅ JWT con refresh tokens
- ✅ Rate limiting en endpoints críticos
- ✅ CORS configurado
- ✅ Validación de inputs (class-validator)
- ✅ SQL injection protection (Prisma)
- ✅ Helmet.js para headers seguros

---

## 📊 Modelo de Datos Simplificado

```
User ──1:1── VetProfile (tier: FREE | PRO | ELITE)
 │
 ├──1:N── Pet
 │
 └──1:N── Appointment ──1:1── Transaction (CTG | PSE | TRANSFER)
             │
             └──1:N── Message (chat arbitrado)
```

---

## 💳 Sistema de Pagos

### Métodos Soportados

1. **CTG Token** (Recomendado - 5.5% descuento)
   - Polygon blockchain
   - Descuento automático de comisiones desde saldo del vet

2. **PSE** (ACH Colombia)
   - Integración con pasarelas locales
   - Confirmación automática

3. **Transferencia Bancaria**
   - Tracking manual con verificación
   - Sistema de arbitraje en disputas

### Comisiones por Tier

| Tier | Precio Mensual | Comisión | Límite |
|------|---------------|----------|--------|
| Free | $0 | 10% | 5 servicios/mes |
| Pro  | $10 USD | 8% | Ilimitado |
| Elite| $20 USD | **3%** | Ilimitado + beneficios premium |

---

## 🧪 Testing

```bash
# Backend - Tests unitarios
npm run backend:test

# Backend - E2E
cd backend && npm run test:e2e

# Mobile - Jest
cd mobile && npm run test
```

---

## 🚢 Deploy

### Backend (Railway)

```bash
cd backend
railway up
```

### Mobile (Android - Google Play)

```bash
cd mobile/android
./gradlew bundleRelease
```

### Dashboard (Vercel)

```bash
cd dashboard
vercel --prod
```

---

## 📞 Soporte

- **Email**: dev@ctgone.co
- **GitHub Issues**: [Reportar bug](https://github.com/VladPhil92/Nvet-Care-App/issues)
- **Documentación**: [docs.nvetcare.com](#)

---

## 🤝 Contribución

Este es un proyecto propietario de **CTG One Corporation**. Para contribuciones internas:

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/nueva-feature`
3. Commit con co-author: `git commit -m 'Add: nueva feature' --trailer 'Co-Authored-By: Oz <oz-agent@warp.dev>'`
4. Push: `git push origin feature/nueva-feature`
5. Abrir Pull Request

---

## 📄 Licencia

**Propietario**: CTG One Corporation  
**Año**: 2026  
**Tipo**: Proprietary - Todos los derechos reservados

---

## 📈 Roadmap

- [x] Fase 1: Reorganización de monorepo
- [ ] Fase 2: App móvil unificada (cambio de modo)
- [ ] Fase 3: Integración backend completa
- [ ] Fase 4: Sistema de tiers y CTG Token
- [ ] Fase 5: Chat arbitrado con WebSockets
- [ ] Fase 6: Deploy a producción
- [ ] Fase 7: Testing E2E completo

---

**Última actualización**: 21/04/2026
