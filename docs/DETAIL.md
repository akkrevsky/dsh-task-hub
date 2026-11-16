# Task Hub

Tasks, a calendar and a unified mailbox as one first-class workspace in the
DeepSeek Harness left sidebar.

> **Status: M0 — scaffold.** The bundle registers a rail entry and an empty
> workspace panel. Task lists, the tree, calendars and mail are not implemented
> yet; the roadmap below is the plan, not a description of current behaviour.

## What works today

- `sidebar.panellist` — a **Tasks** row in the left rail, ordered after the
  built-in destinations.
- `main` keyed by `dsh-task-hub` — the workspace panel the row opens.
- Client strings for `en` and `ru`; the UI follows the host theme through
  `--dsw-alias-*` tokens.

Everything else on this page is planned.

## Roadmap

| Milestone | Scope |
|---|---|
| M0 (current) | Bundle, rail entry, panel, locale, packaging |
| M1 | Local lists, tree, subtasks, due dates, tags, JSON store, agent tools |
| M2 | Calendar views (month / week / agenda) on local data, task ↔ event link |
| M3 | CalDAV sync: Yandex (`caldav.yandex.ru`) and Mail.ru, two-way, conflict list |
| M4 | Google: OAuth 2.0 (loopback + PKCE), Calendar `syncToken`, Tasks API |
| M5 | Mail over IMAP for Gmail / Yandex / Mail.ru, "turn a message into a task" |
| M6 | Agent tools for calendar and mail, SMTP with explicit confirmation, polish |

## Installation

```sh
dsh plugin --profile web add github:akkrevsky/dsh-task-hub
```

Then hard-refresh the page (Cmd/Ctrl+Shift+R). Requires DSH 0.2.2-rc.2 or newer.

## Limitations

- No data is stored or synced yet: the panel is a placeholder.
- No agent tools are registered.
- No network access: the host half is an empty `apply()`.

## Design notes

- Both extension points are the shipped ones: the rail row comes from
  `sidebar.panellist`, the workspace from the keyed `main` slot. Nothing
  replaces a shipped panel or writes to the DOM.
- The Client module is a classic script registered through
  `window.__ModuleLoader__`; there is no build step and no runtime dependency
  besides the React the host already provides.
- Text goes through the Client locale service; colours through theme tokens.

## Privacy

Once sync lands, credentials (app passwords and OAuth tokens) will live in
`ctx.credentials` on the Host only. Nothing is sent anywhere except the
provider the user connects; the browser never talks to providers directly.

## License

MIT — see [LICENSE](../LICENSE).
