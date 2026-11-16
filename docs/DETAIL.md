# Task Hub

Tasks, a calendar and a unified mailbox as one first-class workspace in the
DeepSeek Harness left sidebar.

> **Status: M2 — local tasks and calendar.** Lists, a task tree, subtasks, due
> dates, tags, an editor and a calendar (month / week / agenda) work on a local
> JSON store; four agent tools share it. Provider sync (Google/Yandex/Mail.ru)
> and mail are not implemented yet; the roadmap below is the plan.

## What works today

- `sidebar.panellist` — a **Tasks** row in the left rail; `main` keyed by
  `dsh-task-hub` — the workspace panel it opens.
- Smart filters (All / Today / Upcoming / Someday / Done) and user lists with
  colours, counts, rename-free creation.
- Two views: **Lists** (grouped by due date) and **Tree** (subtasks, collapse,
  parent progress).
- Editor: title, due date, priority, list, tags, notes, subtasks, delete.
  Finishing a parent finishes its open children.
- Calendar: month grid, week grid with positioned events, agenda; create an
  event by clicking a day or an hour; an event editor with date, time, all-day,
  notes and a linked task.
- Task ↔ event link: "To calendar" in the task editor; deleting a task detaches
  its events; deleting an event keeps the task.
- Storage: `$DSH_HOME/plugin-data/dsh-task-hub/tasks.json` (or
  `DSH_TASK_HUB_STORE`), written through a temporary file and `rename()`.
- HTTP API under `/dsh-task-hub/api` and agent tools `tasks_list`,
  `tasks_create`, `tasks_update`, `calendar_agenda`.
- Client strings for `en` and `ru`; the UI follows the host theme through
  `--dsw-alias-*` tokens.

## Limitations

- No provider sync (M3–M4) and no mail (M5): the calendar holds local events only.
- The week view shows a 24-hour grid without drag-and-drop resizing.
- Single user, single profile: no sharing, no conflict resolution.
- The store is a plain JSON file; it is not a database and has no history.

## Roadmap

| Milestone | Scope |
|---|---|
| M0 ✅ | Bundle, rail entry, panel, locale, packaging |
| M1 ✅ | Local lists, tree, subtasks, due dates, tags, JSON store, agent tools |
| M2 ✅ | Calendar views (month / week / agenda) on local data, task ↔ event link |
| M3 | CalDAV sync: Yandex (`caldav.yandex.ru`) and Mail.ru, two-way, conflict list |
| M4 | Google: OAuth 2.0 (loopback + PKCE), Calendar `syncToken`, Tasks API |
| M5 | Mail over IMAP for Gmail / Yandex / Mail.ru, "turn a message into a task" |
| M6 | Agent tools for calendar and mail, SMTP with explicit confirmation, polish |

## Installation

```sh
dsh plugin --profile web add github:akkrevsky/dsh-task-hub
```

Then hard-refresh the page (Cmd/Ctrl+Shift+R). Requires DSH 0.2.2-rc.2 or newer.

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
