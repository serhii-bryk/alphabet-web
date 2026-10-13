# Platform-only Product Guidance

## Architecture

- Browser → BFF → domain/Platform. The browser never calls Platform.
- `apps/web` must not import `@brand/platform`, Platform wire types, or server-only config.
- Browser contracts live in `packages/contracts`; mapping and use cases live in `packages/domain`; Platform transport lives in `packages/platform`.
- Platform secrets, JWTs, cookies, HMAC signatures, passwords, and payment credentials stay server-side and out of logs.
- Validate external and HTTP boundaries with Zod. Use strict TypeScript and avoid unsafe casts.
- Never add EveryMatrix, `platformSource`, Cosmoswin/Betfinal branching, legacy DTOs, or a CMS casino catalog unless explicitly approved.
- Cosmoswin and Betfinal are references for known Platform contracts only.

## Product

- Casino, Live Casino, and Sportsbook are the visual and product focus.
- Build mobile-first with existing tokens and primitives. Support accessibility and reduced motion; do not use GIFs for core motion.
- Stake informs hierarchy and density only; Shuffle and MyStake inform interactions only. Never copy branding, assets, colors, or layouts.

## Delivery

- The orchestrator delegates implementation, independent testing, UX review for UI work, and technical review.
- Use Vitest for unit/integration tests and Playwright for browser behavior.
- CI must mock Platform and never call stage. Do not claim success without direct verification.
- Done means typecheck, lint, relevant tests, runtime checks, and no remaining Blocker.
- Ask before architecture, Platform-contract, database, auth/security, payment, major dependency, deployment, or production changes.
- After the verification a task already requires, the orchestrator prepares the Git handoff in `.cursor/rules/git-handoff.mdc` and waits for approval of that specific action. Do not push, force-push, rebase, reset, cherry-pick, merge, or open a pull request unless explicitly asked.
- `PROJECT_STATE.md` is the current-state source of truth. Update it at the end of every completed milestone and when an important architecture or integration decision changes. Never store secrets or personal test credentials there.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
