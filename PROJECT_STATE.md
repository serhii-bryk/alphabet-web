# Project state

Source of truth for the current product. Read this before reconstructing history.

Update this file at the end of every completed milestone, and whenever an important architecture or integration decision changes. Record names and decisions only. Never store secrets, passwords, API keys, tokens, HMAC material, or personal test-account credentials.

Last updated: 2026-10-15 (Fast Development Mode 2.0).

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

Fast Development Mode 2.0. One primary agent implements the task. `.cursor/agents/orchestrator.md` does not delegate by default.

- Read the code the change touches. Open a contract only when the behavior is not already in this repo.
- Tests are file paths: `pnpm --filter @brand/domain test -- src/auth.test.ts`. No path runs every test file in that package. Root `pnpm test` is `turbo test` with `dependsOn: ["^test"]`, so it runs every suite and each dependency suite first. Do not use it for a feature.
- Auth, session, payments, security, and responsible gaming still get the changed use case, BFF route, and browser caller run once.
- When the change is done: typecheck and lint the affected packages, and Playwright only for a spec that changed. No second reviewer pass.
- The Git handoff is `.cursor/rules/git-handoff.mdc`. Do not commit on `main`, `master`, or `develop`, and do not push, unless explicitly authorized.
- The report is what shipped, the commands and counts, blockers, and the handoff. Mention a retry only when it changed the result.
- Stop for human approval before architecture, Platform contracts, auth/security, database schema, payments, major dependencies, deployment, or product tradeoffs.
- CI mocks Platform and never calls stage.

## Implemented features

- Casino and Live Casino lobbies backed by the Platform game catalog, with search, categories, and a provider filter. Studios that share a `groupedCode` are shown once and filter with `group` (`grouped_provider`). A short Popular rail appears only when a page has more than eight games; the rest of the page is a grid.
- Global search (⌘K / Ctrl+K and `/search`) covers catalog games, providers, categories, the three promotion previews, and existing pages and in-page sections. Games launch through the current player. Promotions open `/promotions/welcome`, `/promotions/weekend-live`, and `/promotions/journal-drops`, using the same preview copy as the promotions list. Same-page section results scroll in place after search closes, and closing search restores focus without moving the page. On Casino, the Spin the house card scrolls to `#games`. Game search is debounced, at least two characters, limited to eight games, and the BFF caches identical public searches for 15 seconds and rate-limits them. Providers and categories are loaded once and filtered locally.
- The user-facing name is AlphaBet. Locales are English (`en`) and Arabic (`ar`), with `dir="rtl"` for Arabic and a header language switch that keeps the current path. Homepage, product, promo, and journal banners use original images in `apps/web/public/banners/`.
- Homepage hero is local product content, not a CMS. For guests it is the main signup entry: Register and a quick email, password, and country form open the existing registration dialog and can prefill those three fields in memory. Google, Apple, and Phone stay visible and disabled. Signed-in players see Play and Explore sports instead, with no signup controls. Casino and Sports are the two main choices under the hero; Live Casino stays a secondary casino link. Join, Register, and Create account stay hidden for a signed-in player and while the session is still resolving. Guests still get them from the header, hero, footer, and promotions. Signed-in players get Account in that footer slot and Deposit on promotions. `/register` remains a direct guest visit. It is not the header or hero path.
- Product switch for Casino, Live Casino, and Sports is in the header on desktop and a sticky bar on mobile. The same header, sidebar, mobile navigation, and footer wrap every normal route, including Sports. The sportsbook iframe keeps its own height and the footer follows it. Short info pages (journal, support, responsible gaming, terms, privacy) ship with the shell. Promotions are an honest placeholder on `/promotions`, linked from the desktop sidebar and the mobile navigation. Casino and Live Casino lobbies do not carry a promotions rail. Non-clickable lobby and page heroes shift the image slightly with the pointer on a fine pointer, and drift with CSS on touch. Clickable cards keep their hover. `prefers-reduced-motion` leaves those heroes still.
- Demo game launch, and real-money launch for a signed-in player. A game card click launches immediately. Guests launch demo when the catalog allows it; otherwise the existing login dialog opens. Signed-in players launch real money. The same game in the same mode is focused instead of launched again. A different mode replaces that panel with a new launch. Logout closes real panels and leaves demo panels. Login does not relabel a demo iframe as real.
- Game workspace: up to 5 open games, each with its own launch state. A normal launch is an in-flow page inside the shell, with the site header, the game player, the footer, and the open-games bar. The bar stays on every normal route while games are open, including Sports and Promotions. Leaving the page parks the game without unmounting its iframe; choosing its tab returns to that same session. Pop-out is an in-app floating window (drag, resize, minimize, maximize, restore), not a separate browser window, and it does not take the site header or footer. Parked iframes stay mounted, full size, and in the viewport at opacity 0 so they keep running. There is no dedicated game route.
- Guest demo play is timed in the browser (`alphabet.demoPlay.v1`). Defaults are 10 minutes for the soft prompt and 20 minutes for the stronger prompt. `NEXT_PUBLIC_DEMO_PROMPT_SOFT_MS` / `NEXT_PUBLIC_DEMO_PROMPT_STRONG_MS`, and non-production `demoSoftMs` / `demoStrongMs` query params, override them. Register and Sign in open the existing dialogs. Dismiss leaves the game running. An authenticated session stops the prompts.
- In-game Deposit opens the existing cashier above the workspace. The game iframe stays mounted. A successful deposit refreshes the existing account balance query. Test Deposit stays available when `PAYMENTS_TEST_MODE=true`.
- Game information under the focused or expanded game uses catalog fields the browser already receives: name, image, provider, categories, format, game type, RTP, volatility, demo availability, real-money availability, and listed time. Empty values are omitted. RTP and volatility are shown as Platform sent them. Provider game ids are not shown.
- Login, logout, and an httpOnly session cookie. The Platform JWT stays on the server. Email and password stay the standard account path. Telegram Login Widget sign-in is added when `TELEGRAM_BOT_ID` is set: the browser sends the widget payload to the BFF, Platform verifies it and creates or reuses the player, and the BFF seals the same `brand_session`. A Telegram player may have no email. Google, phone/SMS, Facebook, and Apple are not shown as working sign-in methods.
- Account profile and balance for the authenticated player.
- Payments core: cashier deposit and withdrawal through the BFF. The browser never calls the payment provider or Platform directly. A confirmed deposit credits the wallet only from the BFF after a trusted captured callback. Test deposit is a separate guarded path. Development mock Card and Bank transfer methods are a third path: they stay pending and do not move money. Transaction history is not built.
- Registration UI and BFF: two-step signup. A successful Platform register is followed by the existing login flow, which seals the httpOnly session. Email verification is not required. One stage call with `SESSION_SECRET` set created an account, logged in, and returned an authenticated session while `emailVerified` was false. That call is not part of CI.
- Player casino personalization stored on Platform. Favorites, last played, and most played use the sealed session player id. The browser calls `/api/player/favorites`, `/api/player/last-played`, and `/api/player/most-played` and never sends a player id. Favorites are the full Platform list. Last played and most played use Platform’s paginator (`page`, `limit`, `order`, and the confirmed date or count filters). Pages are `/favorites`, `/recently-played`, and `/most-played` (no locale prefix). Guests get the existing sign-in dialog from a heart and a sign-in prompt on those pages. Signed-in hearts are optimistic, shared across cards, game info, and the game toolbar, and roll back on failure. The default casino lobby shows compact Recently Played and Favorites rails, then the existing discovery grid, then Most Played. Empty rails stay hidden. A successful real launch refreshes last played and most played. Logout drops those caches.
- In-product support chat with two modes: Support and Site Assistant. A floating launcher stays at the bottom-right on every page, including desktop. Minimize collapses the panel and keeps the mode, draft, and conversation in `sessionStorage` (`alphabet.supportChat.v1`). New conversation is the only reset. The browser calls `POST /api/support/chat` and `GET /api/support/channels`. FAQ topics and simple commands are answered in the BFF without a model. Short follow-ups such as “why?” and “open it” reuse the previous site topic before any model call. Free-text product questions can call OpenAI only when `AI_CHAT_ENABLED` is exactly `true`, `NODE_ENV` is not `production`, and `OPENAI_API_KEY` is set on the server. The default model is `gpt-4o-mini`. Confirmed product facts live in `apps/bff/src/support/knowledge.ts` and `apps/bff/src/support/faq.ts`. The model cannot choose URLs, player ids, raw API calls, or `fill_field`. Allowed actions are `navigate`, `open_cashier`, `open_login`, `open_registration`, `open_human_support`, `scroll_to` (`games`), `open_promotion` (`welcome`, `weekend-live`, `journal-drops`), `open_game` only after a real catalog search, and `fill_field` for `search`, `catalog_search`, `deposit_amount`, `withdraw_amount`, `email`, `first_name`, `last_name`, `country`, and `phone`. Filling a field never submits it. There is no promo-code field. Passwords, OTPs, card details, and bank details are refused. Site Assistant runs one safe action through the existing router, dialogs, cashier, search, and game launcher. Deposit and withdraw open the existing cashier and do not move money. A balance question in either mode reads only the sealed session. Guests are sent to login. The amount is not sent to OpenAI. Transaction history is not available and is not invented. The chat can explain reality check, cool-off, and self-exclusion. It cannot change, cancel, or submit them, and it does not place bets or change account settings. Server rate limits use the sealed player id, an httpOnly `ab_ai_scope` cookie, and the client IP. They are not cleared by New conversation or a refresh. English and Arabic are supported, and Arabic uses a right-to-left panel. Site Assistant remaps the panel accent to the existing positive token. Human handoff shows only configured contacts.
- Responsible gaming at `/responsible-gaming` (Player Control Center). Guests can read the live Platform catalog and can still open that page from the footer. Signed-in players can save a reality-check interval and submit cool-off or self-exclusion. Sidebar and menu “Play safe” and Account are shown only while the player is signed in, including the desktop sidebar, the mobile menu, and the mobile Account tab. The sidebar and menu Account item opens `/account`. They appear and disappear with sign-in and sign-out. The footer and the signed-in account section still link to responsible gaming.
  - Reality check: `GET /casino/realityCheckSettings` returns allowed minutes, including `0` (off). `GET` and `POST /player/:id/reality-check` read and save `{ value }`. The header and mobile session timer uses the newest Platform login (`GET /player/:id/logins`, `limit=1`, ordered `created_at` desc, `login_at` only) and is shown only when the signed-in player’s saved interval is greater than `0`. `0` hides the timer completely, including its loading and unavailable states, and shows no reminder. Saving a new interval, signing in, and signing out update that visibility without a refresh. IP and browser are not sent to the web app. If login history is missing, the timer is labeled as device time and is not enforcement. The reminder is a client prompt from the saved interval. Acknowledgement is stored in `localStorage` (`alphabet.playerControl.v1`) so a remount or another tab does not restart it. Sign-in and sign-out clear that device fallback and the session-clock cache.
  - Cool-off and self-exclusion: durations come only from `GET /casino/coolOffSettings` and `GET /casino/selfexclusionSettings`. A guest read of the running Stage catalog on 2026-10-15 showed cool-off 24 hours, 7 days, 30 days, and 3 months, plus reasons, and self-exclusion 6 months, 1 year, 5 years, and Permanent. Those `text` values are shown as Platform sent them, including on the Arabic page. `POST /player/:id/exclusion` takes `period_id` and, for cool-off only, an optional `reason_id`. Periods with `date_selector` are refused before the POST because the partner body has no custom date and a null duration would be permanent. Self-exclusion does not send a reason. There is no partner cancel and no partner read of the current exclusion. A successful exclusion revokes sessions, so the BFF clears `brand_session`. The page keeps an informational receipt in `sessionStorage` (`alphabet.playerControl.receipt.v1`) until the next successful login. That receipt is not protection.
  - Login `403` `player_has_excluded` maps to `account_restricted`. Real launch of `player_not_active` or `player_has_excluded` uses the same code and clears the session cookie. An `account_restricted` response from a responsible-gaming route also clears the cookie. Sports launch has no separate restricted code; a revoked session fails the next authenticated sports call.
  - Not done against Stage: saving a reality-check interval, posting a cool-off or self-exclusion, or signing in as a restricted player. Do not post an exclusion except on a disposable Stage account. Deposit limits are not in this partner API.

## Current integrations

- Platform partner API, signed with `X-API-KEY`, `X-TIMESTAMP`, and `X-SIGNATURE`. `FINAL_PLATFORM_API_URL` must end with `/api/v1`.
- Payments: the BFF calls the payment provider for method init and submit, and Platform for the wallet ledger. Bonus engine, CMS catalog, and a sportsbook provider are not integrated.
- Email verification is not part of signup. `apps/bff/src/email-verification-adapter.ts` and Platform `activateEmail` remain in the repo, unused and not wired into registration.

## Platform endpoints already used

All paths are under the configured `/api/v1` base.

- `GET /countries`, `GET /currencies`
- `POST /player/register`
- `POST /player/login`
- `POST /player/login/telegram` with `{ flow: "login_widget", payload }` — verified Telegram Login Widget only. Platform creates the player and wallets on the first accepted login, then returns the same auth session as password login (`profile`, `access_token`, `token_type`, `expires_in`). A later login with the same Telegram user id reuses that player. The payload hash is verified by Platform with the bot token. AlphaBet rejects a payload older than 24 hours, or more than 60 seconds in the future, before that call.
- `POST /player/:id/refresh`, `POST /player/:id/logout`
- `GET /player/:id/profile`, `GET /player/:id/balance`
- `GET /games`, `GET /games/providers`, `GET /games/categories`
- `POST /player/game/launch`
- `GET /player/:id/favorites`, `POST /player/:id/favorites` with JSON `{ game_id }`, `DELETE /player/:id/favorites/:gameId`
- `GET /player/:id/games/last-played`, `GET /player/:id/games/most-played`
- `POST /transactions/deposit` — the only wallet credit. Called after a captured deposit callback, and for the guarded test deposit.
- `POST /transactions/withdraw/request`, `POST /transactions/withdraw/approve`, `POST /transactions/withdraw/confirm`, `POST /transactions/withdraw/rollback`
- `GET /casino/coolOffSettings`, `GET /casino/selfexclusionSettings`, `GET /casino/realityCheckSettings` — partner HMAC, no player JWT
- `GET /player/:id/reality-check`, `POST /player/:id/reality-check` with `{ value }`
- `POST /player/:id/exclusion` with `{ period_id, reason_id? }`
- `GET /player/:id/logins` — partner HMAC, newest `login_at` only; IP and browser stay on the server

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
- `PAYMENTS_MOCK_MODE` — exactly `true` to show development Card and Bank transfer methods. Ignored when `NODE_ENV` is `production`. These methods do not call FinalPay and do not credit or reserve a wallet.
- `AI_CHAT_ENABLED` — exactly `true` before a live model call. Any other value, including unset, keeps the model off. FAQ and rules still work. Human handoff still works.
- `OPENAI_API_KEY` — server only. Never put it in a `NEXT_PUBLIC` variable. Live calls also require `AI_CHAT_ENABLED=true` and `NODE_ENV` other than `production`.
- `AI_CHAT_MODEL` — optional, default `gpt-4o-mini`. Must match `^[A-Za-z0-9._:-]{1,80}$`.
- `AI_CHAT_BASE_URL` — optional, default `https://api.openai.com/v1`. `http` is accepted only for localhost or `127.0.0.1`.
- `AI_CHAT_DAILY_BUDGET_USD` — optional, default `1`.
- `AI_CHAT_TOTAL_BUDGET_USD` — optional, default `5`. This total does not reset.
- `AI_CHAT_SESSION_LIMIT` — optional, default `10` model calls for one player or guest scope. A new chat does not reset it.
- `AI_CHAT_HOURLY_LIMIT` — optional, default `10` model calls per hour for that identity, and also per IP.
- `AI_CHAT_MAX_MESSAGE_CHARS` — optional, default `500`.
- `AI_CHAT_MAX_OUTPUT_TOKENS` — optional, default `250`.
- `AI_CHAT_MAX_INPUT_TOKENS` — optional, default `2000`. Used to reserve the worst-case request cost.
- `AI_CHAT_MAX_CONCURRENT` — optional, default `2`.
- `AI_CHAT_TIMEOUT_MS` — optional, default `8000`.
- `AI_CHAT_MAX_HISTORY` — optional, default `6`.
- `AI_CHAT_INPUT_USD_PER_MILLION` — optional, default `0.15`.
- `AI_CHAT_OUTPUT_USD_PER_MILLION` — optional, default `0.60`.
- The spend ledger is gitignored `apps/bff/data/ai-budget.json`, locked so processes on the same machine share it. These checks complement OpenAI organization and project billing limits. They do not replace them. Live calls stay off in production because this file is not a multi-host store.
- `SUPPORT_EMAIL` — optional human-support address
- `SUPPORT_TELEGRAM_URL` — optional `https` Telegram link
- `SUPPORT_WHATSAPP_URL` — optional `https` WhatsApp link
- `SUPPORT_HELPDESK_URL` — optional `https` helpdesk link
- `TELEGRAM_BOT_ID` — optional public numeric bot id, digits only. This is not the bot token. When it is missing or invalid, Telegram sign-in is hidden. Platform must have the `telegram` login method enabled, the `login_widget` flow on, and the bot token configured. The bot domain in BotFather must match `WEB_ORIGIN`.

Web:

- `NEXT_PUBLIC_SITE_URL`
- `BFF_INTERNAL_URL` — defaults to `http://localhost:4000`
- `NEXT_DIST_DIR` — only to isolate a second Next dev server
- `NEXT_PUBLIC_DEMO_PROMPT_SOFT_MS` and `NEXT_PUBLIC_DEMO_PROMPT_STRONG_MS` — optional demo-prompt thresholds in milliseconds

## Current known blockers

- Sportsbook is not integrated. Promotions are not a real offer system.
- Registration’s public errors stay coarse on purpose. Upstream detail is only in the server log described below.
- Phone/SMS registration is not available. `POST /player/register` still requires email, password, and the full profile. Platform has no SMS OTP generate, send, or verify API.
- Google sign-in is not available. `config/login_methods.php` registers only the Telegram driver. There is no Google OAuth/OIDC driver or partner endpoint.
- Facebook sign-in is not available. There is no Facebook driver, route, or credential contract.
- Telegram does not supply a verified email or phone. Platform stores a null email and null password and does not collect date of birth or country on this path. AlphaBet does not invent those fields and does not merge the Telegram player with an email account. Cool-off, self-exclusion, blocked, and inactive still reject login. A cashier call for a player with no email sends an empty email because that is what Platform stored.
- Live OpenAI calls are refused when `NODE_ENV` is `production`, even if `AI_CHAT_ENABLED=true` and a key is set. The budget file lock is safe for several processes on one machine and is not a shared limit across hosts. A multi-instance deployment needs a real shared store before the model can be turned on. FAQ, rules, and Site Assistant commands keep working with the model off.
- Responsible gaming has no partner endpoint to read the current exclusion or to end one early. After a successful exclusion the session is cleared; the on-page receipt does not survive a later login and is not enforcement. Live Stage writes (reality-check save, cool-off, self-exclusion) have not been executed. Profile, balance, and payments do not have their own restricted-account mapper; they rely on Platform session revocation.

## Current test setup

- Vitest for domain, platform, BFF, and browser-contract tests. Platform `fetch` is faked.
- Playwright in `apps/web/e2e` for registration, auth, Telegram sign-in, and demo launch, against a fixture BFF. Telegram tests mock the widget script and never call Telegram or Platform.
- Feature checks name files: `pnpm --filter <pkg> test -- src/<file>.test.ts`, then typecheck and lint for the packages that changed. `pnpm --filter @brand/web exec playwright test e2e/<spec>.spec.ts` for one browser flow.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` from the repo root go through Turbo. `test` depends on `^test`, so `pnpm test` is the full suite, not the feature command. `pnpm --filter @brand/web test:e2e` runs every Playwright spec.
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
- A real promotions system will replace the placeholder on `/promotions`. The lobby no longer carries a mock promotions rail.
- Email verification is not required. `email_verified` stays on the profile and does not gate play.

## Next recommended milestone

Responsible gaming is in place. Telegram sign-in is implemented against `POST /player/login/telegram` and still needs a stage bot id, Platform login-method row, and BotFather domain before a live widget login can succeed. Phone/SMS and Google are blocked on missing Platform contracts. Deposit and Withdraw UI can be exercised with Test Deposit and the development mock cashier. A real FinalPay checkout is blocked until AlphaBet has an isolated provider tenant. Transaction history and sportsbook remain deferred.

## Payments

Browser routes, also registered with the `/api` prefix for direct tests: `GET /payments/methods`, `POST /payments/deposit`, `POST /payments/withdraw`, `GET /payments/status`, `POST /payments/callback/:paymentId`. Next rewrites browser `/api/*` to the BFF without the `/api` prefix. The callback is unauthenticated; its checksum is the authenticity check. Player id comes from the sealed session.

The provider creates the hosted payment and reports state through the callback. Platform `POST /transactions/deposit` is the only ledger credit. Withdrawals reserve with `withdraw/request` before the provider call, then approve and confirm on capture, or roll back on failure. Provider ids, submit URLs, checksums, and withdrawal hashes stay on the server. Intents are kept in memory and in gitignored `apps/bff/data/payment-intents.json` so a callback can find them after a dev reload. Tests use an in-memory store.

Test Deposit is not a provider method. It is added only when `PAYMENTS_TEST_MODE` is exactly `true` and `NODE_ENV` is not `production`. It credits with `POST /transactions/deposit` and rejects a second test credit for the same player within 15 seconds. A live provider deposit still needs `FINALPAY_URL`, `FINALPAY_SECRET`, and `PAYMENTS_CALLBACK_BASE_URL`.

Cosmoswin Stage FinalPay is not a safe AlphaBet tenant. Its customer reference is the Cosmoswin prefix plus a Cosmoswin user id, its transaction references use Cosmoswin prefixes, and its callback credits the Cosmoswin cashier. AlphaBet players live on Cobraflux. Live FinalPay stays disabled when the URL host is `finalpay.app` or a subdomain, or when the user prefix is `2616~`, `2002~`, `test-`, or `cwtest-`, or when the transaction prefix is `99999`, `cwtest-`, or `test-`. Production also ignores `PAYMENTS_MOCK_MODE` and `PAYMENTS_TEST_MODE`.

Development mock methods (`mock-card`, `mock-bank`) appear only when `PAYMENTS_MOCK_MODE` is exactly `true`, `NODE_ENV` is not `production`, and the live provider is not configured. Deposit and withdrawal both return `processing`. They do not redirect, do not call FinalPay, and do not call `POST /transactions/deposit` or `POST /transactions/withdraw/request`. The cashier labels them Development in English and Arabic. Amounts outside 10–500 on the mock card, a mock withdrawal above the Cobraflux balance, and a missing account reference are rejected. Closing the cashier or leaving the payment pending does not change the balance.

Before production, AlphaBet needs its own FinalPay tenant, player prefix, transaction prefix, and callback host. Those must be confirmed to be isolated from Cosmoswin and Betfinal. Until then, do not set a `*.finalpay.app` URL or a Cosmoswin prefix in the BFF environment.

## Explicitly deferred

- Transaction history.
- Sportsbook provider integration.
- Google, Apple, Facebook, and phone/SMS sign-in. They need Platform drivers that are not in this repo.
- Telegram Mini App (`flow: "mini_app"`). The website uses the login widget only.
- CMS-managed promotions or casino catalog.
- EveryMatrix and any legacy brand switch.
- Production deployment and a public registration error-contract redesign.
