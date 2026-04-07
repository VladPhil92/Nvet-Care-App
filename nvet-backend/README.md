# Nvet Care Backend

API REST backend para la plataforma Nvet Care - Servicios veterinarios domiciliarios con integración CTG Token.

## 🚀 Stack Tecnológico

- **Framework:** Nest.js (Node.js + TypeScript)
- **ORM:** Prisma
- **Base de Datos:** PostgreSQL 15+
- **Cache:** Redis
- **Autenticación:** JWT (Passport.js)
- **Blockchain:** Web3.js (Polygon)
- **Documentación:** Swagger/OpenAPI

## 📋 Prerequisitos

- Node.js 20+ 
- Docker & Docker Compose
- npm o yarn

## 🔧 Setup Inicial

### 1. Clonar e instalar dependencias

```bash
cd nvet-backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Levantar servicios con Docker

```bash
docker-compose up -d
```

Esto iniciará:
- PostgreSQL en `localhost:5432`
- Redis en `localhost:6379`

### 4. Ejecutar migraciones de Prisma

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. (Opcional) Cargar datos de prueba

```bash
npm run seed
```

### 6. Iniciar servidor de desarrollo

```bash
npm run start:dev
```

La API estará disponible en: `http://localhost:3000`
Swagger docs: `http://localhost:3000/api/docs`

## 📁 Estructura del Proyecto

```
nvet-backend/
├── src/
│   ├── auth/              # Autenticación y autorización
│   ├── users/             # Gestión de usuarios
│   ├── vets/              # Módulo veterinarios
│   ├── pets/              # Módulo mascotas
│   ├── appointments/      # Gestión de citas
│   ├── payments/          # Transacciones y pagos
│   ├── chat/              # Chat arbitrado
│   ├── blockchain/        # Integración CTG Token
│   ├── common/            # Guards, filters, decorators
│   │   ├── guards/
│   │   ├── decorators/
│   │   └── filters/
│   └── main.ts
├── prisma/
│   ├── schema.prisma      # Definición de modelos
│   ├── migrations/        # Migraciones
│   └── seed.ts            # Datos de prueba
├── test/
│   ├── unit/
│   └── e2e/
└── docker-compose.yml
```

## 🔐 Autenticación

### Registro

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "role": "CLIENT" | "VET",
  "firstName": "Juan",
  "lastName": "Pérez"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Respuesta:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "CLIENT"
  }
}
```

### Uso del Token

Incluir en headers:
```http
Authorization: Bearer <accessToken>
```

## 📚 Endpoints Principales

### Users

- `GET /api/users/me` - Perfil usuario autenticado
- `PATCH /api/users/:id` - Actualizar perfil

### Veterinarios

- `GET /api/vets` - Listar veterinarios (filtros: tier, specialties)
- `GET /api/vets/:id` - Detalle veterinario
- `GET /api/vets/:id/prices` - Lista de precios
- `POST /api/vets/:id/prices` - Crear precio (solo VET)

### Mascotas

- `POST /api/pets` - Registrar mascota
- `GET /api/pets` - Listar mis mascotas
- `GET /api/pets/:id` - Detalle mascota

### Citas

- `POST /api/appointments` - Crear cita
- `GET /api/appointments` - Listar citas (filtros: status, date)
- `GET /api/appointments/:id` - Detalle cita
- `PATCH /api/appointments/:id/status` - Actualizar estado

## 🎭 Roles y Permisos

### ADMIN
- Acceso completo a todas las operaciones
- Ver transacciones de todos los usuarios
- Moderar chat arbitrado

### VET
- Gestionar su perfil y precios
- Ver y actualizar sus citas
- Ver sus transacciones y saldo CTG
- Participar en chat arbitrado

### CLIENT
- Crear y gestionar citas
- Registrar mascotas
- Ver sus transacciones
- Participar en chat arbitrado

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests E2E
npm run test:e2e

# Coverage
npm run test:cov
```

## 🔍 Comandos Prisma Útiles

```bash
# Generar Prisma Client
npx prisma generate

# Crear migración
npx prisma migrate dev --name <nombre>

# Aplicar migraciones en producción
npx prisma migrate deploy

# Abrir Prisma Studio (DB GUI)
npx prisma studio

# Reset completo de DB (¡CUIDADO!)
npx prisma migrate reset
```

## 📊 Modelo de Datos Simplificado

```
User ──1:1── VetProfile
 │
 ├──1:N── Pet
 │
 └──1:N── Appointment ──1:1── Transaction
             │
             └──1:N── Message
```

## 🔐 Seguridad

- ✅ Passwords hasheados con bcrypt
- ✅ JWT con refresh tokens
- ✅ Rate limiting en endpoints auth
- ✅ Helmet.js para headers seguros
- ✅ CORS configurado
- ✅ Validación de inputs con class-validator
- ✅ SQL injection protection (Prisma)

## 🚢 Deploy

### Railway

```bash
# Instalar CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up
```

### Variables de entorno requeridas en producción:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `REDIS_URL`
- Resto según `.env.example`

## 📝 Logs

Los logs se guardan en formato JSON estructurado:

```json
{
  "timestamp": "2026-02-24T12:00:00.000Z",
  "level": "info",
  "context": "AppointmentsService",
  "message": "Appointment created",
  "appointmentId": "uuid",
  "userId": "uuid"
}
```

## 🤝 Contribución

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/nueva-feature`
3. Commit: `git commit -m 'Add: nueva feature'`
4. Push: `git push origin feature/nueva-feature`
5. Abrir Pull Request

## 📄 Licencia

Propietario: CTG One Corporation
Fecha: 2026

## 📞 Soporte

- Email: dev@ctgone.co
- Documentación: [docs.nvetcare.com]
