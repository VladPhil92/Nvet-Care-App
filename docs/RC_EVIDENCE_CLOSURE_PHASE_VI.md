# RC Evidence Closure — Phase VI

## Objective

Phase VI converts the remaining release-candidate evidence blockers for `1.0.0-rc.1` into a single fail-closed operational control plane. It does not replace `RELEASE_CLOSURE_CONTROL.json` or the Operator Evidence Control Plane; it adds live observations, dependency ordering and an explicit operator handoff for the final RC closure.

## Tracked pre-promotion gates

### Provider recovery lane

1. `production-backup-configured`
   - Source: `RC_READINESS.json`
   - Live observation: Railway production volume backup metadata
   - Required provider state: configured schedule(s), at least one visible backup, freshness <= 48 hours, and retention >= 168 hours
   - A green observation only produces a suggested evidence submission. It never changes readiness directly.

2. `provider-restore-drill`
   - Depends on `production-backup-configured=verified`
   - Requires a real operator-controlled provider restore drill and retained redacted evidence
   - Phase VI never performs the restore automatically.

### Financial proof lane

3. `real-transfer-rail`
   - Depends on `provider-restore-drill=verified`
   - Requires a controlled minimal-value real bank transfer, bank-side reference and independently confirmed funds movement
   - Application state or synthetic staging evidence is insufficient.

### Repository governance lane

4. `main-branch-protection`
   - Can close in parallel with the provider/finance lane
   - Phase VI observes whether `main` is protected and, when GitHub permissions allow it, whether `CI Success` is a required status check
   - The workflow is read-only and never changes repository administration settings.

## Promotion boundary

`1.0.0-rc.1` is promotion-eligible only when all four pre-promotion gates above are already `verified` through the authoritative readiness projection.

After promotion, `rc-promoted` remains a separate append-only Operator Evidence gate for Android and Cartagena beta dependencies.

## Safety model

- Live observation never auto-verifies evidence.
- Readiness manifests are never edited directly by the Phase VI workflow.
- Only approved append-only records from the Operator Evidence Control Plane may project external evidence into readiness.
- Restore operations and real money movement are never executed automatically.
- `--enforce-ready` fails until every pre-promotion gate is legitimately verified.

## Workflow

`.github/workflows/rc-evidence-closure.yml`

The workflow runs:

- contract validation on relevant pull requests;
- live observations on `main`, schedule and manual dispatch;
- Railway production-backup inspection using the existing read-only auditor;
- GitHub branch-protection inspection using read-only API calls;
- generation of `.artifacts/rc-evidence-closure.json`;
- artifact retention for 30 days.

Manual modes:

```bash
node scripts/rc-evidence-closure-control.mjs --contract-only
node scripts/rc-evidence-closure-control.mjs
node scripts/rc-evidence-closure-control.mjs --enforce-ready
```

## Intended execution order

```text
Engineering baseline complete
        |
        +--> repository governance lane: protect main + CI Success
        |
        +--> provider lane: production backup -> provider restore drill
                                      |
                                      +--> financial lane: real TRANSFER

All four pre-promotion gates verified
        |
        v
RC promotion eligible
        |
        v
Promote 1.0.0-rc.1
        |
        v
Record rc-promoted evidence
        |
        +--> Cartagena beta
        +--> Android production track
```

## Current external blockers

Phase VI intentionally does not close issue #128 or issue #77 by itself. Those issues represent real provider, financial and repository-administration state. The phase is complete when the orchestration logic is merged and validated; RC promotion remains blocked until those real-world gates are satisfied and approved.
