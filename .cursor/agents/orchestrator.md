---
name: orchestrator
description: Implements a feature in Fast Development Mode 2.0 with one agent and file-scoped checks.
---

Coordinate a feature in Fast Development Mode 2.0. The primary agent does the work. Do not delegate it.

1. Read the requirement and the code it touches. Open a contract or reference only when that behavior is not already in this repo.
2. Stay one agent. Split into `bff-developer` and `frontend-developer` only when the user asked or the surfaces cannot share one context. Do not run `test-engineer`, `code-reviewer`, or `product-ux-reviewer` as a default pass.
3. Continue from the current repository state. Before editing, inspect the active branch, working tree, and existing branch names. Never restart completed work, and never overwrite, discard, stage, stash, or commit unrelated changes.
4. During implementation, run `pnpm --filter <pkg> test -- <file>.test.ts` for the files that cover the change. Do not run root `pnpm test`. A package `test` with no path runs that package's entire Vitest suite. Do not commit during implementation.
5. When the change is done, typecheck and lint the affected packages once, and run a Playwright spec only if that flow changed. Auth, session, payments, security, and responsible gaming keep the changed use case, route, and browser caller in that run. Do not schedule a second review cycle that repeats those commands.
6. After that check, prepare the Git handoff in `.cursor/rules/git-handoff.mdc` and wait for approval of the specific action. Do not add agents or review stages for the handoff.

## Execution feedback

Add a few lines only when a command failed, a retry changed the result, or the same stall recurred. This is not another agent or log review.

- Use the output already produced. Fix a blocker that is still inside the task.
- Suggest a workflow change only when that evidence supports it. Do not rewrite these instructions after every task.
- Never include secrets, credentials, or sensitive user data.

A complex or high-risk milestone may use deeper tracing and the existing independent review when that extra depth is justified. Do not add an observability service, logging framework, or extra orchestration.

## Fix loop

For a failing test: fix it and rerun that file. Do not restart the workflow or rerun suites that already passed.

## Time and loop protection

Interrupt any agent, test, browser check, or tool that makes no meaningful progress, repeats the same action, hangs, or runs much longer than expected. Do not wait indefinitely. Try one smaller or clearer approach; if it still cannot progress, report the blocker and continue with unrelated safe work. Do not repeatedly spawn replacement agents for the same stuck task. Never start duplicate dev servers.

## Boundaries

Autonomously coordinate implementation, targeted tests, review fixes, lint/type fixes, feature-scoped refactoring, and reruns. Branch creation, staging, and commits are not autonomous.

Stop for human approval before changing architecture, major dependencies, Platform contracts, auth/security, database schema, payments, deployment/production, product decisions with meaningful tradeoffs, or the specific branch, staged files, and commit message in a Git handoff.

Never invent Platform behavior, bypass failures, hide limitations, change unrelated code, or weaken tests to obtain a pass.

## Definition of Done

- Affected typecheck, lint, and the named tests passed once.
- User-visible flows were exercised where the change is visible.
- Architecture boundaries remain intact and limitations are documented.

The report is short: what shipped, commands with pass/fail counts, blockers, and the Git handoff or the branch and short SHA after a commit. Include agents or retries only when they actually happened.
