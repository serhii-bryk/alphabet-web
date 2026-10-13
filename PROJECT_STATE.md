# Project state

Source of truth for the current product. Read this before reconstructing history.

Update this file at the end of every completed milestone, and whenever an important architecture or integration decision changes. Record names and decisions only. Never store secrets, passwords, API keys, tokens, HMAC material, or personal test-account credentials.

Last updated: 2026-10-13 (player casino personalization; Git handoff).

## Product goal

AlphaBet is the user-facing casino product, focused on Casino, Live Casino, and Sportsbook. The browser talks only to our BFF. Platform is the account, catalog, and game-launch system. Cosmoswin and Betfinal are references for known Platform contracts, not runtime brands.

## Architecture

pnpm workspace rooted at `new-brand-test`. Install dependencies once there with `pnpm install`. Do not install inside `apps/*` or `packages/*`.

- `apps/web` — Next.js UI. Locale prefix `en` and `ar`. `/` redirects to `/en/casino`. Browser calls same-origin `/api/*`, which Next rewrites to the BFF.
- `apps/bff` — Hono server. The only process that calls Platform.
- `packages/contracts` — browser-facing types.
- `packages/domain` — use cases and Platform-to-product mapping.
- `packages/platform` — HMAC transport, wire schemas, and endpoint paths.
- `packages/config` — shared public config.

Dependency direction: browser → BFF → domain → platform. `apps/web` must not import `@brand/platform`, wire types, or server config.

Local run from `new-brand-test`: `pnpm dev` starts web on port 3000 and BFF on port 4000. The BFF dev script must be `tsx watch` first, then flags. `tsx --env-file=… watch` treats `watch` as a filename and fails.

## AI / Cursor workflow

Fast Development Mode, coordinated by `.cursor/agents/orchestrator.md`.

- One implementation agent when the work is not separable. Split into `bff-developer` and `frontend-developer` only when it is.
- During implementation: targeted tests only. No full suite and no reviewers after every edit.
- When a milestone is implementation-complete: typecheck, lint, relevant Vitest, Playwright where the UI changed, then independent test review and code review. UX review only if the user-visible UI changed materially.
- After that verification, the orchestrator prepares the Git handoff in `.cursor/rules/git-handoff.mdc` and waits for approval. It does not commit on `main`, `master`, or `develop`, and does not push, unless explicitly authorized.
- Stop for human approval before architecture, Platform contracts, auth/security, database schema, payments, major dependencies, deployment, or product tradeoffs.
- CI mocks Platform and never calls stage.

## Implemented features

- Casino and Live Casino lobbies backed by the Platform game catalog, with search, categories, and a provider filter. Studios that share a `groupedCode` are shown once and filter with `group` (`grouped_provider`). A short Popular rail appears only when a page has more than eight games; the rest of the page is a grid.
- The user-facing name is AlphaBet. Locales are English (`en`) and Arabic (`ar`), with `dir="rtl"` for Arabic and a header language switch that keeps the current path. Homepage, product, promo, and journal banners use original images in `apps/web/public/banners/`.
- Homepage hero is local product content, not a CMS. For guests it is the main signup entry: Register and a quick email, password, and country form open the existing registration dialog and can prefill those three fields in memory. Google, Apple, and Phone stay visible and disabled. Signed-in players see Play and Explore sports instead, with no signup controls. Casino and Sports are the two main choices under the hero; Live Casino stays a secondary casino link. `/register` remains for a direct visit and for footer, sports, and promotions links. It is not the header or hero path.
- Product switch for Casino, Live Casino, and Sports is in the header on desktop and a sticky bar on mobile. A full footer and short info pages (journal, support, responsible gaming, terms, privacy) ship with the shell. Promotions and the sports room stay honest placeholders.
- Demo game launch, and real-money launch for a signed-in player. A game card click launches immediately. Guests launch demo when the catalog allows it; otherwise the existing login dialog opens. Signed-in players launch real money. The same game in the same mode is focused instead of launched again. A different mode replaces that panel with a new launch. Logout closes real panels and leaves demo panels. Login does not relabel a demo iframe as real.
- Game workspace: up to 5 open games, each with its own launch state. Desktop (viewport at least 1100px) uses overlapping in-page windows with drag, resize, minimize, maximize, restore, and a minimized dock. Narrower viewports show one expanded game and a horizontal switcher. Adding a game collapses the workspace to a dock so the lobby stays usable; existing iframes stay mounted. There is no separate browser pop-out.
- Guest demo play is timed in the browser (`alphabet.demoPlay.v1`). Defaults are 10 minutes for the soft prompt and 20 minutes for the stronger prompt. `NEXT_PUBLIC_DEMO_PROMPT_SOFT_MS` / `NEXT_PUBLIC_DEMO_PROMPT_STRONG_MS`, and non-production `demoSoftMs` / `demoStrongMs` query params, override them. Register and Sign in open the existing dialogs. Dismiss leaves the game running. An authenticated session stops the prompts.
- In-game Deposit opens the existing cashier above the workspace. The game iframe stays mounted. A successful deposit refreshes the existing account balance query. Test Deposit stays available when `PAYMENTS_TEST_MODE=true`.
- Game information under the focused or expanded game uses catalog fields the browser already receives: name, image, provider, categories, format, game type, RTP, volatility, demo availability, real-money availability, and listed time. Empty values are omitted. RTP and volatility are shown as Platform sent them. Provider game ids are not shown.
- Login, logout, and an httpOnly session cookie. The Platform JWT stays on the server.
- Account profile and balance for the authenticated player.
- Payments core: cashier deposit and withdrawal through the BFF. The browser never calls the payment provider or Platform directly. A confirmed deposit credits the wallet only from the BFF after a trusted captured callback. Test deposit is a separate guarded path. Transaction history is not built.
- Registration UI and BFF: two-step signup. A successful Platform register is followed by the existing login flow, which seals the httpOnly session. Email verification is not required. One stage call with `SESSION_SECRET` set created an account, logged in, and returned an authenticated session while `emailVerified` was false. That call is not part of CI.
- Player casino personalization stored on Platform. Favorites, last played, and most played use the sealed session player id. The browser calls `/api/player/favorites`, `/api/player/last-played`, and `/api/player/most-played` and never sends a player id. Favorites are the full Platform list. Last played and most played use Platform’s paginator (`page`, `limit`, `order`, and the confirmed date or count filters). Pages are `/favorites`, `/recently-played`, and `/most-played` (no locale prefix). Guests get the existing sign-in dialog from a heart and a sign-in prompt on those pages. Signed-in hearts are optimistic, shared across cards, game info, and the game toolbar, and roll back on failure. The default casino lobby shows compact Recently Played and Favorites rails, then the existing discovery grid, then Most Played. Empty rails stay hidden. A successful real launch refreshes last played and most played. Logout drops those caches.
- In-product support chat. The browser calls `POST /api/support/chat` and `GET /api/support/channels`. The BFF calls the AI provider. Confirmed product facts live in `apps/bff/src/support/knowledge.ts`. Answers can include only the safe actions `navigate`, `open_cashier`, `open_login`, `open_registration`, and `open_human_support`. The active conversation is kept in `sessionStorage` (`alphabet.supportChat.v1`). English and Arabic are supported, and Arabic uses a right-to-left panel. Human handoff shows only configured contacts. Support cannot move money or change an account.

## Current integrations

- Platform partner API, signed with `X-API-KEY`, `X-TIMESTAMP`, and `X-SIGNATURE`. `FINAL_PLATFORM_API_URL` must end with `/api/v1`.
- Payments: the BFF calls the payment provider for method init and submit, and Platform for the wallet ledger. Bonus engine, CMS catalog, and a sportsbook provider are not integrated.
- Email verification is not part of signup. `apps/bff/src/email-verification-adapter.ts` and Platform `activateEmail` remain in the repo, unused and not wired into registration.

## Platform endpoints already used

All paths are under the configured `/api/v1` base.

- `GET /countries`, `GET /currencies`
- `POST /player/register`
- `POST /player/login`
- `POST /player/:id/refresh`, `POST /player/:id/logout`
- `GET /player/:id/profile`, `GET /player/:id/balance`
- `GET /games`, `GET /games/providers`, `GET /games/categories`
- `POST /player/game/launch`
- `GET /player/:id/favorites`, `POST /player/:id/favorites` with JSON `{ game_id }`, `DELETE /player/:id/favorites/:gameId`
- `GET /player/:id/games/last-played`, `GET /player/:id/games/most-played`
- `POST /transactions/deposit` — the only wallet credit. Called after a captured deposit callback, and for the guarded test deposit.
- `POST /transactions/withdraw/request`, `POST /transactions/withdraw/approve`, `POST /transactions/withdraw/confirm`, `POST /transactions/withdraw/rollback`

Registration sends the confirmed snake_case body: `email`, `password`, `country`, `currency`, `first_name`, `last_name`, `date_of_birth` (`YYYY-MM-DD`), `address`, `city`, `postal_code`, `phone_prefix` (digits, no leading `+`), `phone`. No IP, browser, or domain field is required on register. `POST /player/register` returns `{ profile }` and no access token. The BFF then calls the existing `POST /player/login` plus profile flow and seals `brand_session`. If that login fails, the account still exists, no cookie is set, and the response is `sign_in_unavailable`.

## Email verification

Not required for this brand. Signup does not call Nexus, `activateEmail`, or a check-email step. `email_verified` may still appear on the profile mapping and does not block login, session creation, casino, or real launch.

`GET /player/:id/activateEmail` and the Nexus adapter (`GET /api/accounts/validate/:token`, `POST /api/accounts/resend-email`) are unused. Do not expose them to the browser. `EMAIL_VERIFICATION_URL` and `NEXUS_VERIFICATION_API_URL` are not read on the signup path.

## Environment variable names

Values live in gitignored `.env.local` files. Examples: `apps/bff/.env.example`, `apps/web/.env.example`.

BFF:

- `PORT`
- `WEB_ORIGIN` — if unset, local mutations allow `http://localhost:3000`
- `FINAL_PLATFORM_API_URL`
- `FINAL_PLATFORM_API_KEY`
- `FINAL_PLATFORM_API_SECRET`
- `SESSION_SECRET` — required, at least 32 characters, or the session cookie cannot be sealed. Registration still creates the account, then returns `sign_in_unavailable` with no cookie.
- `DEFAULT_REGISTRATION_COUNTRY`
- `DEFAULT_REGISTRATION_CURRENCY`
- `FINALPAY_URL` — provider base, normalized without a trailing slash
- `FINALPAY_SECRET` — server only, used for init and callback checksums
- `FINALPAY_USER_PREFIX` — optional, default empty
- `FINALPAY_TRANSACTION_PREFIX` — optional, default `ab`
- `PAYMENTS_BRAND_NAME` — optional, default `alphabet`
- `PAYMENTS_CALLBACK_BASE_URL` — public BFF origin with no path. Required before a real deposit or withdrawal can start. If it is missing, those requests return `provider_unavailable`.
- `PAYMENTS_TEST_MODE` — exactly `true` to show Test Deposit. Ignored when `NODE_ENV` is `production`.
- `PAYMENTS_TEST_MAX_AMOUNT` — optional, default 50. Non-positive values and values above 1000 fall back to 50.
- `SUPPORT_AI_PROVIDER` — optional, `openai` (default) or `anthropic`
- `SUPPORT_AI_API_KEY` — required before the assistant can answer. If it is missing, chat returns `ai_unavailable` and human handoff still works
- `SUPPORT_AI_MODEL` — optional. Defaults to `gpt-4o-mini` for OpenAI and `claude-haiku-4-5` for Anthropic
- `SUPPORT_AI_BASE_URL` — optional. Defaults to `https://api.openai.com/v1` or `https://api.anthropic.com`. `http` is accepted only for localhost
- `SUPPORT_EMAIL` — optional human-support address
- `SUPPORT_TELEGRAM_URL` — optional `https` Telegram link
- `SUPPORT_WHATSAPP_URL` — optional `https` WhatsApp link
- `SUPPORT_HELPDESK_URL` — optional `https` helpdesk link

Web:

- `NEXT_PUBLIC_SITE_URL`
- `BFF_INTERNAL_URL` — defaults to `http://localhost:4000`
- `NEXT_DIST_DIR` — only to isolate a second Next dev server
- `NEXT_PUBLIC_DEMO_PROMPT_SOFT_MS` and `NEXT_PUBLIC_DEMO_PROMPT_STRONG_MS` — optional demo-prompt thresholds in milliseconds

## Current known blockers

- Sportsbook is not integrated. Promotions are not a real offer system.
- Registration’s public errors stay coarse on purpose. Upstream detail is only in the server log described below.
- Social sign-in is not implemented.

## Current test setup

- Vitest for domain, platform, BFF, and browser-contract tests. Platform `fetch` is faked.
- Playwright in `apps/web/e2e` for registration, auth, and demo launch, against a fixture BFF.
- Commands from `new-brand-test`: `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm --filter @brand/web test:e2e`.
- One manual stage registration with `SESSION_SECRET` set created an account and an authenticated session without email verification. That call is not part of CI.

## Important architecture and security decisions

- Browser never calls Platform. Credentials, HMAC, and JWTs stay in the BFF.
- Player identity comes from the sealed session, not from a browser-supplied player id.
- Mutations require `application/json` and an `Origin` equal to `WEB_ORIGIN`. Requests with no `Origin` are allowed. The public registration error for a rejected mutation is still `registration_unavailable`.
- Registration failure logs may include only HTTP status, a stable upstream code, a classification, and response content-type. They must not include email, password, phone, address, date of birth, secrets, signatures, cookies, or response bodies.
- Do not add EveryMatrix, `platformSource`, brand branches, legacy DTOs, or a CMS casino catalog unless explicitly approved.
- Stake informs layout density only. Shuffle and MyStake inform interaction patterns only. Do not copy their branding, assets, colors, or layouts.

## Product features planned

- Casino and Live Casino remain the active product surface.
- Sportsbook is a reserved destination, not a current build.
- A real promotions view will replace the placeholder and the mock homepage rail.
- Email verification is not required. `email_verified` stays on the profile and does not gate play.

## Next recommended milestone

Casino personalization is in place. Transaction history is still deferred. Do not start another milestone until that is explicitly requested. A stage login with the stored test account was rejected as invalid credentials on 2026-10-13, so add, remove, and play-history were not confirmed against live Platform data. Email verification is not the next milestone.

## Payments

Browser routes, also registered with the `/api` prefix for direct tests: `GET /payments/methods`, `POST /payments/deposit`, `POST /payments/withdraw`, `GET /payments/status`, `POST /payments/callback/:paymentId`. Next rewrites browser `/api/*` to the BFF without the `/api` prefix. The callback is unauthenticated; its checksum is the authenticity check. Player id comes from the sealed session.

The provider creates the hosted payment and reports state through the callback. Platform `POST /transactions/deposit` is the only ledger credit. Withdrawals reserve with `withdraw/request` before the provider call, then approve and confirm on capture, or roll back on failure. Provider ids, submit URLs, checksums, and withdrawal hashes stay on the server. Intents are kept in memory and in gitignored `apps/bff/data/payment-intents.json` so a callback can find them after a dev reload. Tests use an in-memory store.

Test Deposit is not a provider method. It is added only when `PAYMENTS_TEST_MODE` is exactly `true` and `NODE_ENV` is not `production`. It credits with `POST /transactions/deposit` and rejects a second test credit for the same player within 15 seconds. A live provider deposit still needs `FINALPAY_URL`, `FINALPAY_SECRET`, and `PAYMENTS_CALLBACK_BASE_URL`.

## Explicitly deferred

- Transaction history.
- Sportsbook provider integration.
- Google and Apple sign-in.
- CMS-managed promotions or casino catalog.
- EveryMatrix and any legacy brand switch.
- Production deployment and a public registration error-contract redesign.
