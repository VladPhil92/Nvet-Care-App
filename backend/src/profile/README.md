# CLIENT Profile & Account Center V1

This module owns the **Nvet-local profile projection** used by the CLIENT dashboard.

## Authority boundary

- Authentication identity, account login and the canonical CTG One subject remain owned by the CTG One / Nvet identity bridge.
- `email`, `userId`, `ctgUserId` and `role` are read-only through this surface.
- Mutable V1 fields are limited to `firstName`, `lastName` and `phone`.
- The authenticated JWT subject is the only source of ownership; the request body never selects a user.
- The endpoint accepts only the effective `CLIENT` role. The canonical SUPERADMIN must explicitly switch to CLIENT mode before using it.
- Global validation rejects non-whitelisted fields.

## Endpoints

- `GET /api/profile`
- `PATCH /api/profile`

Security/session management remains under the existing `/api/auth/*` endpoints. Notification delivery preferences are intentionally not simulated in V1; in-app notifications remain the only active reminder channel until an external delivery rail is deployed.
