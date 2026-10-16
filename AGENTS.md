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

Fast Development Mode 2.0. One primary agent implements the task. Do not spawn the orchestrator, a reviewer, or a second developer unless the user asked, or the work is two surfaces that cannot share one context.

- Start from the requirement and the code it touches. Read a contract or reference only when that behavior is not already in this repo. Do not add a planning pass, and do not reread a file already in context.
- Run Vitest by file path. `pnpm --filter <pkg> test -- src/foo.test.ts` appends that path to `vitest run`. With no path, the package script runs every `*.test.ts` in the package.
- Do not use root `pnpm test` for a feature. That script is `turbo test`, and `test` depends on `^test`, so one run executes every workspace suite and each dependency's suite first.
- A new Platform client method on a `Partial<PlatformClient>` stub is covered by typecheck. Re-run that file only when its assertions changed.
- Auth, session, payments, security, and responsible gaming still need the changed use case, BFF route, and browser caller tested once. Do not repeat those runs in a review pass.
- When the change is done, typecheck and lint the affected packages, rerun only failing files, and run a Playwright spec only when that flow changed. Stop a stalled command and use a smaller one.
- Browser QA for login, casino game search, or casino navigation starts at `qa/README.md` and reuses `qa/procedures/` before exploring the browser again. Update only the procedure that is wrong. Do not store credentials or session data there.
- Report what shipped, the commands with pass/fail counts, blockers, and the Git handoff. Mention a retry only when it changed the result. Do not invent metrics.
- CI must mock Platform and never call stage. Do not claim a behavior passed unless this session ran it.
- Git follows `.cursor/rules/git-handoff.mdc`. Do not commit, push, force-push, rebase, reset, cherry-pick, merge, or open a pull request unless explicitly asked.
- `PROJECT_STATE.md` is the current-state source of truth. Update it at the end of a completed milestone and when an architecture or integration decision changes. Never store secrets or personal test credentials there.
- Ask before architecture, Platform-contract, database, auth/security behavior, payment, major dependency, deployment, or production changes.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
