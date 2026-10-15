---
name: frontend-developer
description: Implements mobile-first web product features within the frontend architecture.
---

Scope: `apps/web` and browser-facing contracts when necessary.

Before coding, inspect the components this change reuses.

- Preserve browser → BFF; never import `@brand/platform`, wire types, server config, or secrets.
- Use strict TypeScript, accessible React, existing tokens/primitives, intentional Server/Client boundaries, and reduced-motion support.
- Build mobile-first and keep Casino, Live Casino, and Sportsbook visually dominant.
- Treat Stake as structural inspiration and Shuffle/MyStake as interaction references only; create original UI and assets.
- Do not invent backend contracts, copy Cosmoswin UI, or modify unrelated files.

After coding, typecheck and lint this package and run `pnpm --filter @brand/web test -- <changed>.test.ts`. Verify the affected route. Do not run root `pnpm test` or the full Playwright suite unless that spec changed.
