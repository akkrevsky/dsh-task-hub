# Task Hub

Tasks, a calendar and a unified mailbox as one first-class workspace in the
DeepSeek Harness left sidebar.

> **Status: M5 — tasks, calendar and mail.** Lists, a task tree, a calendar
> with two-way CalDAV and a Mail panel over IMAP (Yandex / Mail.ru / Gmail):
> folders, message list, reader, "To task", and reply/new messages over SMTP
> with an explicit confirmation. Google Calendar (OAuth) and VTODO sync are not
> implemented yet.

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
  notes and a linked task. A right rail shows the mini-month, connection status
  and the next events.
- Accounts tab: provider, login and app password, per-calendar toggles, sync
  and remove — replacing the earlier drawer.
- Task ↔ event link: "To calendar" in the task editor; deleting a task detaches
  its events; deleting an event keeps the task.
- Storage: `$DSH_HOME/plugin-data/dsh-task-hub/tasks.json` (or
  `DSH_TASK_HUB_STORE`), written through a temporary file and `rename()`.
- HTTP API under `/dsh-task-hub/api` and agent tools `tasks_list`,
  `tasks_create`, `tasks_update`, `calendar_agenda`.
- CalDAV accounts: discovery, `calendar-query` REPORT over −30…+180 days, an
  iCalendar reader for VEVENT (TZID/DST via `Intl`, all-day, DURATION), and a
  read-only badge in the event editor. Passwords live in `secrets.json` (0600)
  and never reach the browser.
- Mail: a second `main` panel (`dsh-task-hub-mail`) and rail entry; IMAP via
  `imapflow`, bodies via `mailparser`; the reader returns plain text (HTML is
  stripped), and "To task" copies the subject and the beginning of the body.
- Sending: `nodemailer` inside the same isolated worker, SMTP hosts by provider
  (smtp.yandex.ru / smtp.mail.ru / smtp.gmail.com, port 465). The client asks
  for confirmation with the recipient and subject before sending.
- Every IMAP operation runs in a short-lived child process (`mail-cli.mjs`):
  imapflow 1.7.8 can emit an unhandled rejection when a server drops the
  connection, which would end the Host. In a child it only fails that request.
- Client strings for `en` and `ru`; the UI follows the host theme through
  `--dsw-alias-*` tokens.

## Limitations

- Imported events open read-only; edit-back of an existing provider event is the next step.
- Deleting an imported event deletes it on the provider too.
- Google Calendar (M4) is not implemented; forwarding and attachments download are not implemented.
- The week view shows a 24-hour grid without drag-and-drop resizing.
- Single user, single profile: no sharing, no conflict resolution.
- The store is a plain JSON file; it is not a database and has no history.

## Roadmap

| Milestone | Scope |
|---|---|
| M0 ✅ | Bundle, rail entry, panel, locale, packaging |
| M1 ✅ | Local lists, tree, subtasks, due dates, tags, JSON store, agent tools |
| M2 ✅ | Calendar views (month / week / agenda) on local data, task ↔ event link |
| M3 (pull) ✅ | CalDAV import: Yandex and Mail.ru, discovery, iCalendar reader |
| M3 (push) ✅ | Create/update/delete events with If-None-Match/If-Match, conflict surfaced as an error |
| M4 | Google: OAuth 2.0 (loopback + PKCE), Calendar `syncToken`, Tasks API |
| M5 (read) ✅ | Mail over IMAP, read-only, "to task" |
| M5 (send) ✅ | Reply/new message over SMTP with confirmation |
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
