# Casino game search

Checked 2026-10-16 on `http://localhost:3000/casino` as a guest. Query `book` returned eight games plus one page result.

## Steps

1. Open `http://localhost:3000/casino` and wait for the heading `Casino`.
2. Open search with the header button `Search ⌘K`, or with Ctrl+K / ⌘K.
3. Wait for the dialog labeled `Search AlphaBet` and the combobox placeholder `Search games, promotions, and pages`.
4. An empty dialog shows the listbox `Search results` with browse options (Casino, Live Casino, Sports, Promotions, Support). That is not a game search.
5. Type the query into the combobox. One character shows `Type at least 2 characters.` and does not request games.
6. At two or more characters, wait until `[aria-busy="true"]` inside the dialog is gone. The client debounce is 280ms. The wait is the busy state clearing, not a sleep.
7. Read the listbox `Search results`.

## Completion

- A `Games` group is present, and its options are game rows (title, provider, and a play action), or
- the alert `Search is temporarily unavailable. Please try again.` is visible, or
- the empty copy `No results for “{query}”.` is visible.

Game rows are capped at eight. On 2026-10-16, `book` showed Book of Amaterasu, Book of Anksunamun Rockways, Book of Aztec King, Book of Dead, Book of Dead GO Collect, Book of Dead GO Collect High Limit, Book of Fallen, and Book of Golden Sands, then a Pages row for Sports.

Close with `Escape` or `Close search` unless the task needs a result. Choosing a game launches it. That is outside this procedure.

`/search?q=` is the same search on its own page. This check used the dialog only.
