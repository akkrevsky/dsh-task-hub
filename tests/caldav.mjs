/**
 * CalDAV reader, discovery and pull-sync tests — no network.
 * Run with: node tests/caldav.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discover,
  fetchRange,
  parseIcs,
  parseIcsDate,
  zonedWallToUtc,
} from '../caldav.js'
import { AccountsStore, connectAccount, deleteEventRemote, pushEvent, syncAccount } from '../accounts.js'
import { TaskStore, createEvent, createTask } from '../index.js'

const dir = await mkdtemp(join(tmpdir(), 'dsh-task-hub-caldav-'))

/* ------------------------------------------------------------------ parsing */

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VEVENT',
  'UID:evt-1@example.com',
  'DTSTAMP:20261101T000000Z',
  'DTSTART;TZID=Europe/Moscow:20261120T100000',
  'DTEND;TZID=Europe/Moscow:20261120T113000',
  'SUMMARY:Планёрка команды',
  'DESCRIPTION:Созвон по релизу\\nи макетам',
  'BEGIN:VALARM',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-2@example.com',
  'DTSTART:20261121T120000Z',
  'DURATION:PT1H30M',
  'SUMMARY:UTC встреча',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-3@example.com',
  'DTSTART;VALUE=DATE:20261122',
  'DTEND;VALUE=DATE:20261123',
  'SUMMARY:Целый день',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const events = parseIcs(ICS)
assert.equal(events.length, 3, 'three VEVENTs parsed')

const [moscow, utc, allDay] = events
assert.equal(moscow.uid, 'evt-1@example.com')
assert.equal(moscow.title, 'Планёрка команды')
assert.equal(moscow.notes, 'Созвон по релизу\nи макетам', 'escaped newlines are decoded')
assert.equal(moscow.startAt, '2026-11-20T07:00:00.000Z', 'TZID Europe/Moscow is +03:00')
assert.equal(moscow.endAt, '2026-11-20T08:30:00.000Z')
assert.equal(moscow.allDay, false)
assert.equal(utc.startAt, '2026-11-21T12:00:00.000Z')
assert.equal(Date.parse(utc.endAt) - Date.parse(utc.startAt), 90 * 60000, 'DURATION is applied')
assert.equal(allDay.allDay, true)
assert.equal(allDay.startAt, '2026-11-22T00:00:00.000Z')
assert.equal(allDay.endAt, '2026-11-23T00:00:00.000Z')

// Folded lines and recurrence flags
const folded = parseIcs([
  'BEGIN:VEVENT',
  'UID:f@example.com',
  'DTSTART:20261120T100000Z',
  'SUMMARY:Очень длинное название которое',
  '  продолжается на второй строке',
  'RRULE:FREQ=WEEKLY',
  'END:VEVENT',
].join('\n'))
assert.equal(folded[0].title, 'Очень длинное название которое продолжается на второй строке')
assert.equal(folded[0].recurring, true)

// DST-safe wall time conversion
assert.equal(zonedWallToUtc(2026, 7, 1, 12, 0, 0, 'Europe/Berlin'), Date.UTC(2026, 6, 1, 10, 0, 0))
assert.equal(zonedWallToUtc(2026, 1, 15, 12, 0, 0, 'Europe/Berlin'), Date.UTC(2026, 0, 15, 11, 0, 0))
assert.equal(parseIcsDate('20261120T100000Z').ms, Date.UTC(2026, 10, 20, 10, 0, 0))
assert.equal(parseIcsDate('20261120').allDay, true)

/* ---------------------------------------------------------------- discovery */

const PRINCIPAL_XML = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href>'
  + '<d:propstat><d:prop><d:current-user-principal><d:href>/principals/users/me%40example.com/</d:href>'
  + '</d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>'

const HOME_XML = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
  + '<d:response><d:href>/principals/users/me%40example.com/</d:href><d:propstat><d:prop>'
  + '<c:calendar-home-set><d:href>/calendars/me%40example.com/</d:href></c:calendar-home-set>'
  + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>'

const LIST_XML = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
  + '<d:response><d:href>/calendars/me%40example.com/</d:href><d:propstat><d:prop><d:resourcetype>'
  + '<d:collection/></d:resourcetype><d:displayname>me@example.com</d:displayname></d:prop></d:propstat></d:response>'
  + '<d:response><d:href>/calendars/me%40example.com/inbox/</d:href><d:propstat><d:prop><d:resourcetype>'
  + '<d:collection/><c:schedule-inbox/></d:resourcetype></d:prop></d:propstat></d:response>'
  + '<d:response><d:href>/calendars/me%40example.com/work/</d:href><d:propstat><d:prop><d:resourcetype>'
  + '<c:calendar/><d:collection/></d:resourcetype><d:displayname>Работа</d:displayname>'
  + '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>'
  + '</d:prop></d:propstat></d:response></d:multistatus>'

const REPORT_XML = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
  + '<d:response><d:href>/calendars/me%40example.com/work/evt-1.ics</d:href><d:propstat><d:prop>'
  + '<d:getetag>"etag-1"</d:getetag><c:calendar-data>'
  + ICS.replace(/&/g, '&amp;').replace(/\r\n/g, '&#13;\n')
  + '</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>'

let reportBody = null
const fetchStub = async (url, options = {}) => {
  const method = options.method ?? 'GET'
  const respond = body => ({ ok: true, status: 207, text: async () => body })
  if (method === 'PROPFIND' && String(url) === 'https://caldav.example.com/') return respond(PRINCIPAL_XML)
  if (method === 'PROPFIND' && String(url).includes('/principals/')) return respond(HOME_XML)
  if (method === 'PROPFIND' && String(url).includes('/calendars/')) return respond(LIST_XML)
  if (method === 'REPORT') return respond(reportBody ?? REPORT_XML)
  throw new Error(`unexpected request: ${method} ${url}`)
}
globalThis.fetch = fetchStub

const discovered = await discover({
  baseUrl: 'https://caldav.example.com',
  username: 'me@example.com',
  password: 'secret',
})
assert.equal(discovered.principal, '/principals/users/me%40example.com/')
assert.equal(discovered.home, '/calendars/me%40example.com/')
assert.equal(discovered.calendars.length, 1, 'scheduling inbox/outbox are not calendars')
assert.equal(discovered.calendars[0].title, 'Работа')
assert.deepEqual(discovered.calendars[0].components, ['VEVENT'])

const range = await fetchRange({
  baseUrl: 'https://caldav.example.com',
  username: 'me@example.com',
  password: 'secret',
  calendarHref: '/calendars/me%40example.com/work/',
  from: new Date('2026-11-01T00:00:00Z'),
  to: new Date('2026-12-01T00:00:00Z'),
})
assert.equal(range.length, 1)
assert.equal(range[0].etag, '"etag-1"')
assert.equal(range[0].events.length, 3)

// Unauthorized credentials surface a clear error
globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '' })
await assert.rejects(
  () => discover({ baseUrl: 'https://caldav.example.com', username: 'me@example.com', password: 'nope' }),
  /401/,
)
globalThis.fetch = fetchStub

/* -------------------------------------------------------------- pull sync */

const accountsDir = join(dir, 'accounts')
const accountsStore = new AccountsStore(accountsDir)
const { account } = await connectAccount(accountsStore, {
  provider: 'caldav',
  username: 'me@example.com',
  password: 'secret',
  baseUrl: 'https://caldav.example.com',
})
assert.ok(account.id)
assert.equal(account.calendars.length, 1)
assert.equal(account.password, undefined, 'public account never carries a password')
const secretsRaw = JSON.parse(await readFile(join(accountsDir, 'secrets.json'), 'utf8'))
assert.equal(secretsRaw.accounts[account.id], 'secret')
const secretsMode = (await stat(join(accountsDir, 'secrets.json'))).mode & 0o777
assert.equal(secretsMode, 0o600, 'secrets.json is 0600')

const taskStore = new TaskStore(join(dir, 'tasks', 'tasks.json'))
await taskStore.mutate(draft => {
  createTask(draft, { title: 'Локальная задача' })
  createEvent(draft, { title: 'Локальное событие', startAt: '2026-11-20T09:00:00Z' })
})

const first = await syncAccount({ accountsStore, taskStore, id: account.id })
assert.equal(first.imported, 3, 'three events imported')
assert.equal(first.state.events.length, 4, 'local event kept')
const imported = first.state.events.filter(event => event.source)
assert.equal(imported.length, 3)
assert.ok(imported.every(event => event.source.accountId === account.id))
assert.ok(imported.every(event => event.source.etag === '"etag-1"'))
assert.ok(first.account.lastSyncAt, 'sync time recorded')

const second = await syncAccount({ accountsStore, taskStore, id: account.id })
assert.equal(second.imported, 0, 're-sync does not duplicate')
assert.equal(second.state.events.length, 4)

reportBody = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>'
const third = await syncAccount({ accountsStore, taskStore, id: account.id })
assert.equal(third.removed, 3, 'events gone from the server are removed')
assert.equal(third.state.events.length, 1, 'local event survives')
assert.equal(third.state.events[0].title, 'Локальное событие')

/* --------------------------------------------------------- push + delete */

const pushedEvent = await taskStore.mutate(draft => createEvent(draft, {
  title: 'К отправке',
  startAt: '2026-11-25T09:00:00Z',
  endAt: '2026-11-25T10:00:00Z',
}))
const pushId = pushedEvent.result.id

const writes = []
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET'
  writes.push({ method, url: String(url), headers: options.headers ?? {}, body: options.body })
  if (method === 'PUT') {
    return {
      ok: true,
      status: 201,
      headers: { get: name => (name.toLowerCase() === 'etag' ? '"etag-new"' : null) },
      text: async () => '',
    }
  }
  if (method === 'DELETE') {
    return { ok: true, status: 204, headers: { get: () => null }, text: async () => '' }
  }
  throw new Error(`unexpected request: ${method} ${url}`)
}

const pushed = await pushEvent({ accountsStore, taskStore, id: pushId, accountId: account.id })
assert.equal(writes[0].method, 'PUT')
assert.equal(writes[0].headers['if-none-match'], '*', 'a new event is create-only')
assert.match(writes[0].body, /SUMMARY:К отправке/, 'the VEVENT carries the title')
assert.match(writes[0].body, /DTSTART:20261125T090000Z/)
assert.equal(pushed.event.source.etag, '"etag-new"', 'the ETag is stored for update guards')

await pushEvent({ accountsStore, taskStore, id: pushId, accountId: account.id })
assert.equal(writes[1].headers['if-match'], '"etag-new"', 'an update uses If-Match')

await deleteEventRemote({ accountsStore, taskStore, id: pushId })
assert.equal(writes[2].method, 'DELETE')
assert.equal(writes[2].headers['if-match'], '"etag-new"')
assert.equal((await taskStore.read()).events.find(item => item.id === pushId), undefined)

// Servers that omit ETag on PUT: read it back with PROPFIND.
const lateEvent = await taskStore.mutate(draft => createEvent(draft, {
  title: 'Без etag',
  startAt: '2026-11-27T09:00:00Z',
}))
const lateWrites = []
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET'
  lateWrites.push(method)
  if (method === 'PUT') return { ok: true, status: 201, headers: { get: () => null }, text: async () => '' }
  if (method === 'PROPFIND') {
    return {
      ok: true,
      status: 207,
      text: async () => '<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop>'
        + '<d:getetag>"etag-late"</d:getetag></d:prop></d:propstat></d:response></d:multistatus>',
    }
  }
  throw new Error(`unexpected request: ${method}`)
}
const late = await pushEvent({ accountsStore, taskStore, id: lateEvent.result.id, accountId: account.id })
assert.ok(lateWrites.includes('PROPFIND'), 'the ETag is read back when PUT does not return one')
assert.equal(late.event.source.etag, '"etag-late"')

// A concurrent edit on the server must surface as a conflict.
const conflictEvent = await taskStore.mutate(draft => createEvent(draft, {
  title: 'Конфликт',
  startAt: '2026-11-26T09:00:00Z',
}))
globalThis.fetch = async () => ({ ok: false, status: 412, headers: { get: () => null }, text: async () => '' })
await assert.rejects(
  () => pushEvent({ accountsStore, taskStore, id: conflictEvent.result.id, accountId: account.id }),
  /конфликт/,
)

console.log('ok: ics parse, TZID/DST, discovery, report, secrets 0600, pull sync, push and delete')
await rm(dir, { recursive: true, force: true })
