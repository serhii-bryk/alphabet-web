# Casino navigation

Checked 2026-10-16 on `http://localhost:3000` as a guest.

Use `localhost`, not `127.0.0.1`. Wait for the URL and heading after each link. A focused link that has not changed the URL is not finished; activate it again. Do not sleep.

## Open Casino

1. Open `http://localhost:3000/casino`.
2. Completion: heading `Casino`, product nav `Casino and sports` has `Casino` current, and lobby nav `Lobby sections` (`[data-lobby-nav]`) is visible.

That lobby nav contains `Explore games` (`#games`), `Casino`, `Live Casino`, and `Providers`. The category rail is `Game categories`. This check did not click a category.

## Live Casino

1. In `Lobby sections`, activate `Live Casino`.
2. Completion: URL path `/live-casino`, hash `#games`, heading `Live Casino`, and `#games` present.
3. Product nav `Casino` stays current. The sidebar `Live Casino` link becomes current.

## Providers

1. In `Lobby sections`, activate `Providers`.
2. Completion: the hash is `#providers` on the current lobby (`/casino` or `/live-casino`). The page does not leave that lobby.

## Sports

1. In the header product nav `Casino and sports`, activate `Sports`.
2. Completion: URL path `/sports`, the product link `Sports` is current, and the heading is `The book is open`.

On 2026-10-16 a guest also saw `Sportsbook unavailable` and `Try again`. The route change is still complete. Do not retry the sportsbook as part of navigation.

## Isolation

Stop when the destination heading and URL match. Do not search, sign in, or open a game unless that is a separate task.
