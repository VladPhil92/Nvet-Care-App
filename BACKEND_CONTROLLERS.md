# Backend Controllers - NestJS

**Fecha**: 23 de Abril, 2026  
**Archivos creados**: 6 archivos core (589 líneas)  
**Estado**: Controllers esenciales implementados ✅

---

## 📋 Controllers Implementados

### 1. AuthController (71 líneas) ✅

**Ruta base**: `/auth`

**Endpoints**:

| Método | Endpoint | Descripción | Guards |
|--------|----------|-------------|--------|
| POST | `/auth/register` | Registrar usuario | - |
| POST | `/auth/login` | Iniciar sesión | - |
| POST | `/auth/refresh` | Renovar access token | - |
| POST | `/auth/logout` | Cerrar sesión | JWT |
| GET | `/auth/me` | Obtener usuario actual | JWT |

**Características**:
- ✅ Registro con validación (email, password min 8 chars)
- ✅ Login retorna { user, accessToken, refreshToken }
- ✅ Refresh token automático
- ✅ Logout invalida refresh token
- ✅ GET /me retorna usuario completo con vetProfile

**DTOs**:
- `RegisterDto`: email, password, firstName, lastName, phone?, role?
- `LoginDto`: email, password

---

### 2. AppointmentsController (209 líneas) ✅

**Ruta base**: `/appointments`

**Endpoints**:

| Método | Endpoint | Descripción | Guards | Roles |
|--------|----------|-------------|--------|-------|
| GET | `/appointments` | Listar citas con filtros | JWT | ALL |
| GET | `/appointments/today` | Citas del día | JWT | VET |
| GET | `/appointments/:id` | Detalle de cita | JWT | Owner/Admin |
| POST | `/appointments` | Crear cita | JWT | CLIENT |
| PATCH | `/appointments/:id` | Actualizar cita | JWT | Owner/Admin |
| DELETE | `/appointments/:id` | Cancelar cita | JWT | Owner/Admin |
| GET | `/appointments/:id/tracking` | Tracking (GPS, ETA) | JWT | Owner/Admin |
| PATCH | `/appointments/:id/status` | Cambiar estado | JWT | VET (owner) |
| POST | `/appointments/:id/clinical-notes` | Agregar notas | JWT | VET (owner) |

**Características**:
- ✅ Filtros: status, startDate, endDate
- ✅ Ownership verification (cliente/vet/admin)
- ✅ Solo clientes pueden crear citas
- ✅ Solo vets pueden actualizar status
- ✅ Solo vets pueden agregar notas clínicas (diagnosis, treatment)
- ✅ Tracking con geolocalización del veterinario

**Query params**:
```typescript
GET /appointments?status=CONFIRMED&startDate=2026-04-01&endDate=2026-04-30
```

---

### 3. ChatController (196 líneas) ✅

**Ruta base**: `/chat`

**Endpoints**:

| Método | Endpoint | Descripción | Guards | Roles |
|--------|----------|-------------|--------|-------|
| GET | `/chat/:appointmentId/messages` | Obtener mensajes | JWT | Participant |
| POST | `/chat/:appointmentId/messages` | Enviar mensaje | JWT | Participant |
| POST | `/chat/:appointmentId/share-price` | Compartir precio oficial | JWT | VET |
| GET | `/chat/:appointmentId/metadata` | Metadata del chat | JWT | Participant |
| POST | `/chat/:appointmentId/mark-read` | Marcar como leído | JWT | Participant |
| POST | `/chat/messages/:messageId/report` | Reportar mensaje | JWT | ALL |
| GET | `/chat/active` | Chats activos | JWT | ALL |
| DELETE | `/chat/messages/:messageId` | Borrar mensaje (5 min) | JWT | Sender |
| GET | `/chat/:appointmentId/search` | Buscar mensajes | JWT | Participant |
| GET | `/chat/:appointmentId/messages/page` | Paginación | JWT | Participant |

**Características**:
- ✅ Verificación de participante en cada endpoint
- ✅ Solo vets pueden compartir precios oficiales
- ✅ Ventana de 5 minutos para borrar mensajes
- ✅ Sistema de reportes (ABUSIVE_PRICING, INAPPROPRIATE, SPAM, OTHER)
- ✅ Búsqueda de mensajes
- ✅ Paginación con cursor (before/after)
- ✅ Metadata: participants, isMonitored, unreadCount

**Share price example**:
```typescript
POST /chat/:appointmentId/share-price
{
  "priceData": {
    "serviceName": "Consulta Domiciliaria",
    "priceCop": 150000,
    "priceCtg": 5000
  }
}
```

---

### 4. ChatGateway (182 líneas) - WebSocket ✅

**Namespace**: `/` (default)

**Events (Client → Server)**:

| Event | Payload | Descripción | Role |
|-------|---------|-------------|------|
| `joinAppointment` | `appointmentId` | Unirse a sala de chat | ALL |
| `leaveAppointment` | `appointmentId` | Salir de sala | ALL |
| `message` | `{ appointmentId, content }` | Enviar mensaje | Participant |
| `sharePrice` | `{ appointmentId, priceData }` | Compartir precio | VET |
| `typing` | `{ appointmentId, isTyping }` | Indicador escribiendo | Participant |

**Events (Server → Client)**:

| Event | Payload | Descripción |
|-------|---------|-------------|
| `message` | `Message` | Nuevo mensaje recibido |
| `priceShared` | `Message` | Precio oficial compartido |
| `typing` | `{ userId, isTyping }` | Usuario escribiendo |

**Características**:
- ✅ Autenticación JWT en WebSocket
- ✅ Rooms por appointmentId
- ✅ Auto-join/leave de rooms
- ✅ Verificación de participante en cada event
- ✅ Broadcast a todos en room (incluido sender para `message`)
- ✅ Broadcast solo a otros para `typing` (excluye sender)
- ✅ Persistencia en DB de todos los mensajes
- ✅ Cleanup automático en disconnect

**Connection flow**:
```typescript
// Client
const socket = io('http://localhost:3000', {
  auth: { token: accessToken }
});

socket.emit('joinAppointment', appointmentId);

socket.on('message', (message) => {
  // Handle new message
});

socket.on('typing', ({ userId, isTyping }) => {
  // Show typing indicator
});
```

---

## 🔐 Guards Implementados

### 1. JwtAuthGuard
- Valida access token JWT
- Extrae user payload (id, email, role)
- Usado en todos los endpoints protegidos

### 2. RolesGuard
- Valida rol del usuario
- Usado con decorator @Roles(UserRole.VET, UserRole.ADMIN)
- Requiere JwtAuthGuard

### 3. WsJwtGuard
- Valida JWT en WebSocket connections
- Extrae token de `socket.handshake.auth.token`
- Attach user a socket.user

---

## 📦 DTOs Implementados

### Auth
- `RegisterDto` (26 líneas)
- `LoginDto` (9 líneas)

### Appointments
- `CreateAppointmentDto`
- `UpdateAppointmentDto`
- `UpdateStatusDto`
- `AddClinicalNotesDto`

### Chat
- `SendMessageDto`
- `SharePriceDto`
- `ReportMessageDto`

---

## 🔄 Flujo de Autenticación

```
1. POST /auth/register
   └─> Crear usuario + hash password
       └─> Retornar { user, accessToken, refreshToken }

2. POST /auth/login
   └─> Validar password
       └─> Generar tokens
           └─> Retornar { user, accessToken, refreshToken }

3. Requests autenticados
   └─> Header: Authorization: Bearer {accessToken}
       └─> JwtAuthGuard valida token
           └─> Attach user a request.user

4. Token expirado (401)
   └─> POST /auth/refresh
       └─> Body: { refreshToken }
           └─> Generar nuevo accessToken
               └─> Retornar { accessToken }

5. POST /auth/logout
   └─> Invalidar refreshToken en BD/Redis
```

---

## 🔄 Flujo de Chat

### HTTP (Fallback)
```
1. GET /chat/:appointmentId/messages
   └─> Cargar historial completo

2. POST /chat/:appointmentId/messages
   └─> Enviar mensaje vía HTTP
       └─> Guardar en BD
           └─> Retornar mensaje
```

### WebSocket (Real-time)
```
1. socket.connect()
   └─> WsJwtGuard valida token
       └─> Attach user a socket.user

2. socket.emit('joinAppointment', appointmentId)
   └─> Verificar participante
       └─> socket.join(appointmentId)

3. socket.emit('message', { appointmentId, content })
   └─> Verificar participante
       └─> Guardar en BD
           └─> server.to(appointmentId).emit('message', message)
               └─> Todos en room reciben mensaje

4. socket.emit('typing', { appointmentId, isTyping: true })
   └─> Verificar participante
       └─> socket.to(appointmentId).emit('typing', { userId, isTyping })
           └─> Solo otros en room reciben indicador

5. socket.disconnect()
   └─> Auto-leave de todas las rooms
```

---

## 📊 Resumen

| Archivo | Tipo | Líneas | Funcionalidad |
|---------|------|--------|---------------|
| `auth.controller.ts` | Controller | 71 | Autenticación y registro |
| `register.dto.ts` | DTO | 26 | Validación registro |
| `login.dto.ts` | DTO | 9 | Validación login |
| `appointments.controller.ts` | Controller | 209 | CRUD citas + tracking |
| `chat.controller.ts` | Controller | 196 | HTTP chat API |
| `chat.gateway.ts` | Gateway | 182 | WebSocket real-time |
| **TOTAL** | | **693** | |

---

## 🚀 Próximos Pasos

### Servicios pendientes:
- [ ] `AuthService` - Lógica de negocio auth
- [ ] `AppointmentsService` - Lógica de negocio citas
- [ ] `ChatService` - Lógica de negocio chat
- [ ] `VetsService` - Búsqueda y gestión de vets
- [ ] `PaymentsService` - Procesamiento de pagos

### Guards pendientes:
- [ ] Implementar JwtAuthGuard
- [ ] Implementar RolesGuard
- [ ] Implementar WsJwtGuard

### DTOs pendientes:
- [ ] CreateAppointmentDto
- [ ] UpdateAppointmentDto
- [ ] UpdateStatusDto
- [ ] AddClinicalNotesDto
- [ ] SendMessageDto
- [ ] SharePriceDto
- [ ] ReportMessageDto

### Módulos:
- [ ] AuthModule
- [ ] AppointmentsModule
- [ ] ChatModule
- [ ] VetsModule
- [ ] PaymentsModule
- [ ] PrismaModule

### Configuración:
- [ ] JWT Strategy (Passport)
- [ ] Validation Pipe global
- [ ] CORS configuration
- [ ] Environment variables (.env)

---

## 📝 Notas Técnicas

### Dependencias requeridas:

```bash
cd backend

# NestJS core
npm install @nestjs/common @nestjs/core @nestjs/platform-express

# WebSockets
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# Authentication
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install bcrypt
npm install -D @types/bcrypt @types/passport-jwt

# Validation
npm install class-validator class-transformer

# Prisma
npm install @prisma/client
npm install -D prisma

# Config
npm install @nestjs/config
```

### JWT Configuration:

```typescript
// .env
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d
```

### WebSocket CORS:

```typescript
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:8081'],
    credentials: true,
  },
})
```

---

## 🎯 Endpoints Implementados

**Total**: 24 endpoints HTTP + 5 eventos WebSocket

### Auth (5 endpoints)
- ✅ POST /auth/register
- ✅ POST /auth/login
- ✅ POST /auth/refresh
- ✅ POST /auth/logout
- ✅ GET /auth/me

### Appointments (9 endpoints)
- ✅ GET /appointments
- ✅ GET /appointments/today
- ✅ GET /appointments/:id
- ✅ POST /appointments
- ✅ PATCH /appointments/:id
- ✅ DELETE /appointments/:id
- ✅ GET /appointments/:id/tracking
- ✅ PATCH /appointments/:id/status
- ✅ POST /appointments/:id/clinical-notes

### Chat (10 endpoints)
- ✅ GET /chat/:appointmentId/messages
- ✅ POST /chat/:appointmentId/messages
- ✅ POST /chat/:appointmentId/share-price
- ✅ GET /chat/:appointmentId/metadata
- ✅ POST /chat/:appointmentId/mark-read
- ✅ POST /chat/messages/:messageId/report
- ✅ GET /chat/active
- ✅ DELETE /chat/messages/:messageId
- ✅ GET /chat/:appointmentId/search
- ✅ GET /chat/:appointmentId/messages/page

### WebSocket (5 events)
- ✅ joinAppointment
- ✅ leaveAppointment
- ✅ message
- ✅ sharePrice
- ✅ typing

---

**Estado**: Controllers core implementados  
**Próxima tarea**: Implementar Services + Guards + DTOs
