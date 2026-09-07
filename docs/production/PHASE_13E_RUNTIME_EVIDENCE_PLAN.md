# Phase 13E — Production Privacy & Runtime Evidence

**Status:** planned; starts only after Phase 13D is merged and its production deployment is healthy.

## Objective

Convert the repository-side Google Play privacy and account-lifecycle controls into verifiable production evidence without treating documentation, CI intent or a successful build as proof that a public surface is actually reachable.

## Scope

Phase 13E will add a production-evidence boundary for:

- public HTTPS reachability of the account-deletion resource;
- publication of the privacy policy from a canonical source;
- explicit legal-controller, monitored privacy-contact and effective-date configuration;
- runtime probes that fail closed when a public page is missing, redirected to an unsafe origin, served over HTTP or materially inconsistent with the release contract;
- evidence artifacts that bind the checked URL, timestamp, response contract and release SHA;
- provider-processing review state for storage, email, payments, AI, maps and infrastructure without claiming provider-side deletion until that provider is actually verified.

## Non-goals

This phase does not fabricate Google Play Console evidence, does not create reviewer credentials, does not move real money, does not claim external provider purge guarantees and does not promote an Android release to production.

## Entry gate

Phase 13D must be merged with CI, Android Production Readiness and Railway Contract green. The deployed backend must remain healthy before runtime evidence is collected.

## Exit gate

The repository can generate a dated, machine-readable public-surface evidence artifact from production. `privacyPolicyPublished` may move to verified only when the configured legal metadata is real and the HTTPS policy URL is reachable. `accountDeletionProductionRoute` may move to verified only after the public deletion flow is reachable and tested without deleting a real customer account.
