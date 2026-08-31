# Nvet Care ↔ CTG One Integration Contract

**Status:** canonical federation contract  
**Last review:** 2026-08-31

## Purpose

Nvet Care is an autonomous veterinary bounded context inside the CTG One ecosystem. Technological harmony means sharing explicit identity, security, observability and release contracts without moving Nvet veterinary domain authority into the corporate website or forcing both products onto the same framework.

## Ownership

| Concern | Authority |
| --- | --- |
| CTG One account/session | CTG One / Supabase |
| Nvet user projection and effective veterinary role | Nvet backend |
| Pets, appointments, services, reviews, chat | Nvet backend / PostgreSQL |
| Nvet payment workflow | Nvet backend and its reviewed payment integration |
| Nvet mobile UI | `Nvet-Care-App/mobile` |
| Nvet web surface | `ctgone.com/nvetcareapp` in `ctg_one_website` |
| Nvet administration on web | CTG One Nvet surface + Nvet backend authorization |

## Federation flow

```text
Browser authenticated with CTG One / Supabase
        ↓
ctgone.com BFF reads canonical server-side session
        ↓
server-to-server POST /auth/ctg-identity-exchange
        ↓
Nvet validates trusted CTG identity evidence
        ↓
Nvet issues its bounded domain session
        ↓
httpOnly web session / role projection
        ↓
Nvet APIs enforce veterinary domain authorization
```

The browser must not become the trust boundary for exchanging or persisting raw bearer credentials when the CTG One BFF can keep the exchange server-side.

## Role rule

CTG One account identity and Nvet role are different concerns.

- CTG One answers **who is the ecosystem user?**
- Nvet answers **what may this user do inside the veterinary domain?**

SUPERADMIN, VET and CLIENT behavior must be derived server-side from canonical mappings. A public login form must not reveal a separate administrative entry point or allow the browser to self-assert an elevated role.

## Technology compatibility policy

Nvet does not need the same runtime versions as `ctg_one_website` or `CTG-Wallet`.

Current valid topology:

```text
ctg_one_website  → Next.js / React / Node
Nvet backend     → NestJS / Prisma / PostgreSQL
Nvet mobile      → React Native
CTG-Wallet       → React / Vite / Capacitor
```

Compatibility is enforced at the boundaries:

1. versioned auth/federation contracts;
2. fail-closed parsing and authorization;
3. CI contract tests;
4. health/readiness probes;
5. deployment compatibility evidence;
6. shared UX language for CTG-connected identity without erasing Nvet branding.

## Presentation harmony

Nvet retains its veterinary visual identity. CTG One microbranding should communicate account/federation continuity, not recolor Nvet into the Wallet/corporate black-and-gold system.

The public website must distinguish the maturity of:

- Nvet web platform;
- backend/API;
- mobile app release readiness;
- specific integrations such as payments, maps or notifications.

A product should not be described globally as either “live” or “concept” when its surfaces have different verified maturity states.

## Release contract

A cross-repository change affecting Nvet web federation should document:

- Nvet backend contract/version or endpoint change;
- paired `ctg_one_website` BFF/client change;
- deployment order;
- backwards-compatible/fail-closed behavior during partial rollout;
- CI evidence on both repositories;
- runtime health evidence before production is declared complete.

## Relationship to ecosystem registry

The cross-product registry lives in `ctg_one_website/docs/architecture/ECOSYSTEM_CONTRACT_REGISTRY.md`. This document is the Nvet-local projection of that contract and remains authoritative for Nvet-specific ownership boundaries.
