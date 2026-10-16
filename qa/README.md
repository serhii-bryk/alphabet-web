# QA procedures

Reusable browser checks for AlphaBet. This is a folder of notes, not a test framework.

## Discover

Before exploring the browser for Casino, search, or login, read the matching file in `qa/procedures/`. Use it as-is. Explore again only when that file has no step for the task, or a step fails.

| Task | Procedure |
| --- | --- |
| Login or an authenticated session | `qa/procedures/login.md` |
| Casino game search | `qa/procedures/casino-game-search.md` |
| Casino, Live Casino, or Sports navigation | `qa/procedures/casino-navigation.md` |

## Reuse

- One task uses only the procedures it needs. Do not carry login, search, and navigation context into an unrelated check.
- If a selector or result is wrong, update that one file. Leave the others alone.
- Prefer the existing Playwright specs in `apps/web/e2e` when the task is a fixture-BFF flow. Do not add a new runner, database, or agent.
- Open the local app at `http://localhost:3000`. `http://127.0.0.1:3000` renders HTML, then Next blocks the dev scripts and the page never hydrates.
- Do not store credentials, session cookies, tokens, emails, or other personal data in these files.

## Waits

Wait for the completion condition in the procedure (a heading, a dialog, a listbox, or `aria-busy` clearing). Do not insert a fixed delay.

## Efficiency

Report numbers only when the tool already printed them. Do not build a metrics store.

- Execution time: the Playwright list reporter, or the duration of the browser check.
- Browser round trips: count navigations and snapshots that were part of the check.
- Token usage: mention it only when Cursor already showed a figure for that turn.
