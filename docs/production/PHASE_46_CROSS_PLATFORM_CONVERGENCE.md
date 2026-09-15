# Phase 46 — Cross-Platform Convergence, Mobile Readiness & Performance Hardening

## Objective

Phase 46 does not add product functionality. It reduces release risk by making the existing Android and web surfaces converge on the same authenticated-session, cache and freshness semantics while preserving the Phase 27 feature freeze.

## Release-blocking defect closed

Before Phase 46, both surfaces persisted React Query state but neither authentication store explicitly bound persisted application data to one Nvet user. A logout or account switch could therefore leave user-scoped query or Zustand state resident until later refetch/GC. Mobile also kept chat/socket and payment-recovery state outside the React Query cache.

Phase 46 makes account identity a hard client-state boundary:

- persisted query state is owned by one user ID;
- missing ownership metadata is treated as legacy/untrusted state;
- a user change purges query cache and user-scoped runtime stores before the new session is adopted;
- logout performs the same purge on both web and mobile;
- mobile additionally disconnects chat, clears appointments/wallet state and deletes pending payment recovery handoffs;
- legacy cache busters prevent pre-Phase-46 persisted data from hydrating as trusted state;
- mobile mounted screens refetch in the background so changes performed on web converge promptly after navigation/foreground use.

## Financial safety boundary

This phase does **not** make payment mutations durable. Recovered booking payment remains an explicit user-confirmed continuation. Logout/account switching deletes local recovery handoffs instead of replaying or transferring them between sessions.

## Automated contract

Run:

```bash
node scripts/verify-cross-platform-convergence-phase46.mjs --write-evidence
```

The dedicated GitHub Actions workflow additionally requires mobile TypeScript validation, mobile unit tests and a dashboard production build.

## Out of scope

- new marketplace capabilities;
- new payment rails;
- new clinical modules;
- public Google Play publication;
- commercial launch authorization;
- synthetic fulfillment of provider/operator evidence.

Phase 46 is release hardening only.
