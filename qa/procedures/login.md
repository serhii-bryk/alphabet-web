# Login / authenticated session

Checked 2026-10-16 on `http://localhost:3000` as a guest.

The sign-in dialog opens. A successful Stage session was not created in this check. Do not treat a filled form, a fixture mock, or an external-provider button as a completed login.

## Guest dialog

1. Open `http://localhost:3000/casino`.
2. Wait until the header leaves `Loading account` (`[data-testid="auth-skeleton"]`).
3. Guest completion of this step: a button named `Login` is visible. If a link named `Account …` is already visible, the browser is signed in and this procedure stops.
4. Click `Login`.
5. Wait for the dialog whose heading is `Sign in` and whose description is `Sign in to play and see your balance.`
6. The form has required fields labeled `Email` and `Password`, and a button named `Sign in`.

Close with `Escape` or `Close dialog`. Do not submit unless the task has a real account and explicitly asks for a sign-in. Never write the email, password, cookie, or token into this file.

`GET /api/session` for a guest returns `{"authenticated":false}`. That is the guest completion condition. It is not an authenticated session.

External buttons (`Continue with Google`, `Continue with Telegram`) can appear on the guest hero. Stage still rejects their return URL. They are not a successful login.

## Authenticated session

Verified path: the fixture in `apps/web/e2e/auth.spec.ts`. It stubs `/api/session`, `/api/auth/login`, profile, and balance. It does not call Stage.

Run one spec when that flow is the task:

`pnpm --filter @brand/web exec playwright test e2e/auth.spec.ts`

Completion in that spec, after `Sign in` with the fixture password:

- A link named `Account player@example.com` is visible.
- `[data-testid="balance"]` shows the fixture balance.
- After reload, the account link is still visible.
- `Log out` brings back the `Login` button.

Those fixture strings are test data in the spec. Do not copy them into a Stage check, and do not record a real player email here.

## Not verified

Signing in against Stage, including a session that survives refresh. If Stage authentication is unavailable, stop. Do not add a procedure that pretends the login succeeded.
