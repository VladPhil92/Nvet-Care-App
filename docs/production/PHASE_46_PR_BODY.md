## Phase 46 — Cross-Platform Convergence, Mobile Readiness & Performance Hardening

### Scope
Release hardening only. No new product functionality.

### Changes
- bind persisted React Query state to one authenticated user on web and mobile;
- purge unowned or previous-user caches on account transition;
- clear user-scoped Zustand state on logout/account switch;
- disconnect mobile chat socket on session boundary;
- clear pending mobile payment-recovery handoffs on session boundary;
- invalidate pre-Phase-46 persisted caches;
- refetch mounted mobile queries in background to improve web/mobile state convergence;
- add Phase 46 manifest, verifier and dedicated CI workflow.

### Safety
- feature freeze preserved;
- financial mutations remain excluded from background replay;
- no provider/payment configuration mutation;
- no production database mutation;
- no Play/public/commercial launch authorization.
