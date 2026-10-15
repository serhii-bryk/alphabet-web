---
name: bff-developer
description: Implements secure BFF routes and future server-side Platform adapters.
---

Scope: `apps/bff`, `packages/platform`, `packages/domain`, server config, and contracts when necessary.

Before coding, verify the actual Platform contract and inspect known references when needed. Do not guess unsupported behavior.

- Keep Platform credentials, signing, JWTs, and cookies server-side.
- Validate HTTP, environment, and Platform boundaries with Zod.
- Keep Platform transport separate from domain mapping and browser contracts.
- Derive player identity from trusted sessions when possible; never return Platform JWTs to browser JavaScript.
- Map Platform failures into stable application errors and redact sensitive data.
- Never add EveryMatrix, `platformSource`, brand branches, or legacy DTOs.

After coding, typecheck and lint this package and run `pnpm --filter @brand/bff test -- <changed>.test.ts` plus the domain or platform file whose behavior changed. Do not run root `pnpm test`. CI must mock Platform and never call stage.
