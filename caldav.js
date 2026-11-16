/**
 * Minimal CalDAV client for Task Hub.
 *
 * Scope: discovery (principal → calendar-home → calendars), a time-range
 * calendar-query REPORT, and an iCalendar reader for the VEVENT subset the
 * calendar providers emit. No dependency; `fetch` is provided by Node.
 *
 * Time zones: DTSTART/DTEND with `TZID` are resolved through `Intl`, so IANA
 * zone names (Europe/Moscow, Asia/Yekaterinburg, …) work without parsing the
 * VTIMEZONE block. Floating times are treated as UTC and flagged.
 */

const DAV_NS = 'DAV:'
const CAL_NS = 'urn:ietf:params:xml:ns:caldav'

export const PROVIDERS = {
  yandex: {
    id: 'yandex',
    title: 'Яндекс',
    baseUrl: 'https://caldav.yandex.ru',
    color: '#FC3F1D',
    hint: 'Пароль приложения типа «Календарь»',
  },
  mailru: {
    id: 'mailru',
    title: 'Mail.ru',
    baseUrl: '',
    color: '#005FF9',
    hint: 'Ссылка CalDAV из настроек календаря Mail.ru',
  },
  caldav: {
    id: 'caldav',
    title: 'CalDAV',
    baseUrl: '',
    color: '#4D6BFE',
    hint: 'Адрес CalDAV-сервера',
  },
}

/* --------------------------------------------------------------------- http */

function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
}

function normalizeBase(baseUrl) {
  const url = String(baseUrl || '').trim()
  if (!url) throw new Error('baseUrl is required')
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`
  return withScheme.endsWith('/') ? withScheme : `${withScheme}/`
}

function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString()
  } catch {
    throw new Error(`invalid href: ${href}`)
  }
}

async function davRequest({ baseUrl, username, password, method, url, body, depth = '0' }) {
  const headers = {
    authorization: basicAuth(username, password),
    'content-type': 'application/xml; charset=utf-8',
    accept: 'application/xml, text/xml, text/calendar, */*',
  }
  if (depth !== null) headers.depth = depth
  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  if (response.status === 401 || response.status === 403) {
    throw new Error('сервер отклонил логин или пароль (401)')
  }
  if (!response.ok && response.status !== 207) {
    throw new Error(`${method} ${url} → HTTP ${response.status}`)
  }
  return { status: response.status, text, url }
}

/* ---------------------------------------------------------------------- xml */

function xmlBlocks(xml, tag) {
  const pattern = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'gi')
  const result = []
  let match = pattern.exec(xml)
  while (match) {
    result.push(match[1])
    match = pattern.exec(xml)
  }
  return result
}

function xmlText(xml, tag) {
  const block = xmlBlocks(xml, tag)[0]
  return block === undefined ? undefined : decodeXml(block.replace(/<[^>]+>/g, '').trim())
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, '\r')
    .replace(/&amp;/g, '&')
}

function calendarHrefOf(block) {
  const href = xmlText(block, 'href')
  return href === undefined ? null : href.trim()
}

/* ------------------------------------------------------------------ discover */

/**
 * Discover the principal, the calendar home and the calendars of one account.
 * @returns {Promise<{principal: string, home: string, calendars: Array<{href: string, title: string, color: string|null, components: string[], writable: boolean}>}>}
 */
export async function discover({ baseUrl, username, password }) {
  if (!username) throw new Error('username is required')
  if (!password) throw new Error('password is required')
  const base = normalizeBase(baseUrl)

  const principalResponse = await davRequest({
    baseUrl: base,
    username,
    password,
    method: 'PROPFIND',
    url: base,
    body: '<?xml version="1.0" encoding="utf-8"?>'
      + `<d:propfind xmlns:d="${DAV_NS}"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  })
  const principalHref = xmlText(principalResponse.text, 'current-user-principal')
  if (!principalHref) throw new Error('сервер не вернул current-user-principal')
  const principalUrl = resolveUrl(base, principalHref)

  const homeResponse = await davRequest({
    baseUrl: base,
    username,
    password,
    method: 'PROPFIND',
    url: principalUrl,
    body: '<?xml version="1.0" encoding="utf-8"?>'
      + `<d:propfind xmlns:d="${DAV_NS}" xmlns:c="${CAL_NS}"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
  })
  const homeHref = xmlText(homeResponse.text, 'calendar-home-set')
  if (!homeHref) throw new Error('сервер не вернул calendar-home-set')
  const homeUrl = resolveUrl(base, homeHref)

  const listResponse = await davRequest({
    baseUrl: base,
    username,
    password,
    method: 'PROPFIND',
    url: homeUrl,
    depth: '1',
    body: '<?xml version="1.0" encoding="utf-8"?>'
      + `<d:propfind xmlns:d="${DAV_NS}" xmlns:c="${CAL_NS}"><d:prop>`
      + '<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/>'
      + '<d:current-user-privilege-set/>'
      + '</d:prop></d:propfind>',
  })

  const calendars = []
  for (const block of xmlBlocks(listResponse.text, 'response')) {
    const resourcetype = xmlBlocks(block, 'resourcetype')[0] ?? ''
    const isCalendar = /<(?:[\w-]+:)?calendar\b/i.test(resourcetype)
    const isScheduling = /schedule-(inbox|outbox)/i.test(resourcetype)
    if (!isCalendar || isScheduling) continue
    const href = calendarHrefOf(block)
    if (!href) continue
    const title = xmlText(block, 'displayname') || 'Календарь'
    const components = []
    for (const comp of xmlBlocks(block, 'supported-calendar-component-set')) {
      const names = comp.match(/name="([^"]+)"/gi) ?? []
      for (const name of names) components.push(name.replace(/^name="|"$/g, ''))
    }
    const privileges = xmlBlocks(block, 'current-user-privilege-set')[0] ?? ''
    calendars.push({
      href: href.endsWith('/') ? href : `${href}/`,
      title,
      components,
      writable: !/privilege[^>]*>\s*<(?:[\w-]+:)?read\b/i.test(privileges) || /write/i.test(privileges),
      color: null,
    })
  }
  if (calendars.length === 0) throw new Error('у аккаунта нет CalDAV-календарей')
  return { principal: principalHref, home: homeHref, calendars }
}

/* -------------------------------------------------------------------- report */

function icsEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/**
 * Fetch VEVENTs in a time range from one calendar collection.
 * @returns {Promise<Array<{href: string, etag: string|null, events: Array<object>}>>}
 */
export async function fetchRange({ baseUrl, username, password, calendarHref, from, to, signal }) {
  const base = normalizeBase(baseUrl)
  const url = resolveUrl(base, calendarHref)
  const start = toUtcStamp(from)
  const end = toUtcStamp(to)
  const body = '<?xml version="1.0" encoding="utf-8"?>'
    + `<C:calendar-query xmlns:D="${DAV_NS}" xmlns:C="${CAL_NS}">`
    + '<D:prop><D:getetag/><C:calendar-data/></D:prop>'
    + '<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">'
    + `<C:time-range start="${start}" end="${end}"/>`
    + '</C:comp-filter></C:comp-filter></C:filter></C:calendar-query>'

  const response = await davRequest({ baseUrl: base, username, password, method: 'REPORT', url, depth: '1', body, signal })
  const items = []
  for (const block of xmlBlocks(response.text, 'response')) {
    const href = calendarHrefOf(block)
    const data = xmlBlocks(block, 'calendar-data')[0]
    if (!href || data === undefined) continue
    const etag = xmlText(block, 'getetag') ?? null
    const events = parseIcs(decodeXml(data))
    if (events.length > 0) items.push({ href, etag, events })
  }
  return items
}

function toUtcStamp(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('invalid date range')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/* ------------------------------------------------------------------- writes */

async function writeRequest({ baseUrl, username, password, method, url, body, headers = {} }) {
  const response = await fetch(url, {
    method,
    headers: { authorization: basicAuth(username, password), ...headers },
    body,
  })
  if (response.status === 401 || response.status === 403) throw new Error('сервер отклонил логин или пароль (401)')
  if (response.status === 412 || response.status === 409) throw new Error('конфликт: событие уже изменили на сервере')
  if (response.status === 404) return { status: 404, etag: null }
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`${method} → HTTP ${response.status}`)
  }
  return { status: response.status, etag: response.headers.get('etag') ?? null }
}

/** PUT one iCalendar resource. Without an ETag the write is create-only. */
export async function putResource({ baseUrl, username, password, href, body, etag }) {
  const base = normalizeBase(baseUrl)
  const headers = { 'content-type': 'text/calendar; charset=utf-8' }
  if (etag) headers['if-match'] = etag
  else headers['if-none-match'] = '*'
  const result = await writeRequest({
    baseUrl: base,
    username,
    password,
    method: 'PUT',
    url: resolveUrl(base, href),
    body,
    headers,
  })
  if (result.status === 404) throw new Error('календарь не найден (404)')
  return { etag: result.etag }
}

/** Read one resource ETag; null when the resource is gone. */
export async function fetchEtag({ baseUrl, username, password, href }) {
  const base = normalizeBase(baseUrl)
  const url = resolveUrl(base, href)
  const response = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      authorization: basicAuth(username, password),
      'content-type': 'application/xml; charset=utf-8',
      depth: '0',
    },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>',
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`PROPFIND → HTTP ${response.status}`)
  const text = await response.text()
  const match = /<(?:[\w-]+:)?getetag\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?getetag>/i.exec(text)
  return match ? decodeXml(match[1].trim()) : null
}

/** DELETE one resource; a missing resource is not an error. */
export async function deleteResource({ baseUrl, username, password, href, etag }) {
  const base = normalizeBase(baseUrl)
  const headers = {}
  if (etag) headers['if-match'] = etag
  const result = await writeRequest({
    baseUrl: base,
    username,
    password,
    method: 'DELETE',
    url: resolveUrl(base, href),
    headers,
  })
  return { status: result.status }
}

/* ----------------------------------------------------------------------- ics */

const pad = n => String(n).padStart(2, '0')

export function unfoldIcs(text) {
  return String(text).replace(/\r?\n[ \t]/g, '')
}

function splitLine(line) {
  const index = line.indexOf(':')
  if (index < 0) return null
  const head = line.slice(0, index)
  const value = line.slice(index + 1)
  const [name, ...paramParts] = head.split(';')
  const params = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value }
}

function unescapeIcs(value) {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function tzOffsetMs(utcMs, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map(part => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - utcMs
}

/** Convert a wall-clock time in `timeZone` to a UTC epoch (two-pass, DST safe). */
export function zonedWallToUtc(year, month, day, hour, minute, second, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  let utc = wall
  for (let pass = 0; pass < 3; pass += 1) {
    const next = wall - tzOffsetMs(utc, timeZone)
    if (next === utc) break
    utc = next
  }
  return utc
}

/**
 * Parse a DTSTART/DTEND value.
 * @returns {{ms: number, allDay: boolean, timeZone: string|null, floating: boolean}|null}
 */
export function parseIcsDate(value, params = {}) {
  const raw = String(value).trim()
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(raw)) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
    if (!match) return null
    return {
      ms: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      allDay: true,
      timeZone: null,
      floating: true,
    }
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw)
  if (!match) return null
  const [, y, mo, d, h, mi, s, zulu] = match
  if (zulu) {
    return {
      ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s),
      allDay: false,
      timeZone: 'UTC',
      floating: false,
    }
  }
  const tzid = params.TZID
  if (tzid) {
    try {
      return {
        ms: zonedWallToUtc(+y, +mo, +d, +h, +mi, +s, tzid),
        allDay: false,
        timeZone: tzid,
        floating: false,
      }
    } catch {
      // Unknown zone: fall through to the floating branch.
    }
  }
  return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false, timeZone: null, floating: true }
}

function parseDuration(value) {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value).trim())
  if (!match) return null
  const [, w, d, h, mi, s] = match
  return ((Number(w || 0) * 7 + Number(d || 0)) * 86400
    + Number(h || 0) * 3600 + Number(mi || 0) * 60 + Number(s || 0)) * 1000
}

/**
 * Parse the VEVENTs of one iCalendar document into plain JSON.
 * Recurrence rules are reported, not expanded.
 */
export function parseIcs(text) {
  const events = []
  let current = null
  for (const line of unfoldIcs(text).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === 'BEGIN:VEVENT') {
      current = { params: {}, raw: {} }
      continue
    }
    if (trimmed === 'END:VEVENT') {
      if (current) {
        const start = current.start
        const end = current.end
        const duration = current.duration
        if (start) {
          const endMs = end?.ms ?? (duration ? start.ms + duration : start.ms + (start.allDay ? 86400000 : 3600000))
          events.push({
            uid: current.uid ?? null,
            title: current.title || '(без названия)',
            notes: current.notes ?? '',
            startAt: new Date(start.ms).toISOString(),
            endAt: new Date(endMs).toISOString(),
            allDay: start.allDay,
            timeZone: start.timeZone,
            floating: start.floating,
            status: current.status ?? null,
            rrule: current.rrule ?? null,
            // True when a recurrence rule is present; the reader keeps the first
            // occurrence only and the caller decides how to show it.
            recurring: Boolean(current.rrule),
          })
        }
      }
      current = null
      continue
    }
    if (!current) continue
    const parsed = splitLine(trimmed)
    if (!parsed) continue
    current.raw[parsed.name] = parsed.value
    switch (parsed.name) {
      case 'UID': current.uid = parsed.value; break
      case 'SUMMARY': current.title = unescapeIcs(parsed.value); break
      case 'DESCRIPTION': current.notes = unescapeIcs(parsed.value); break
      case 'DTSTART': current.start = parseIcsDate(parsed.value, parsed.params); break
      case 'DTEND': current.end = parseIcsDate(parsed.value, parsed.params); break
      case 'DURATION': current.duration = parseDuration(parsed.value); break
      case 'STATUS': current.status = parsed.value; break
      case 'RRULE': current.rrule = parsed.value; break
      default: break
    }
  }
  return events
}

/* ---------------------------------------------------------------- serializing */

/** Format one instant in a zone as an iCalendar UTC stamp. */
export function toIcsUtcStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Build a minimal VEVENT document used by the future push path and tests. */
export function buildIcsEvent({ uid, title, notes, startAt, endAt, allDay = false, stamp }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Task Hub//dsh-task-hub//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtcStamp(stamp ?? new Date())}`,
  ]
  if (allDay) {
    const day = String(startAt).slice(0, 10).replace(/-/g, '')
    const next = new Date(Date.parse(`${String(startAt).slice(0, 10)}T00:00:00Z`) + 86400000)
    lines.push(`DTSTART;VALUE=DATE:${day}`)
    lines.push(`DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`)
  } else {
    lines.push(`DTSTART:${toIcsUtcStamp(startAt)}`)
    lines.push(`DTEND:${toIcsUtcStamp(endAt)}`)
  }
  lines.push(`SUMMARY:${icsEscape(title)}`)
  if (notes) lines.push(`DESCRIPTION:${icsEscape(notes)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export { pad }
