/**
 * Google Calendar (OAuth 2.0) for Task Hub.
 *
 * The user's client is a "web" OAuth client whose redirect URI is a loopback
 * address, so the flow is: open the consent page, let Google redirect to
 * 127.0.0.1, then paste the address bar URL back into Task Hub. The code is
 * exchanged server-side; the refresh token lives in a 0600 file in the plugin
 * data directory and never reaches the browser.
 *
 * Sync is pull + import for now: Google events become read-only Task Hub
 * events with a `source` block, like CalDAV imports.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_LIST = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars'
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
]
const CONFIG_FILE = 'google-client.json'
const TOKENS_FILE = 'google-tokens.json'
const COLOR = '#4285F4'

export const GOOGLE_STATE_TTL_MS = 15 * 60 * 1000
const pendingStates = new Map()

async function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(file, value, mode = 0o600) {
  await mkdir(join(file, '..'), { recursive: true }).catch(() => {})
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode })
  await rename(tmp, file)
  await chmod(file, mode)
}

export async function loadClientConfig(dir) {
  const config = await readJson(join(dir, CONFIG_FILE), null)
  if (!config?.clientId || !config?.clientSecret || !config?.redirectUri) {
    throw new Error('Google OAuth не настроен: нет google-client.json')
  }
  return config
}

export async function googleStatus(dir) {
  const config = await readJson(join(dir, CONFIG_FILE), null)
  if (!config) return { configured: false, redirectUri: null }
  return { configured: true, redirectUri: config.redirectUri, clientId: config.clientId }
}

export async function createAuthUrl(dir) {
  const config = await loadClientConfig(dir)
  const state = randomUUID()
  pendingStates.set(state, Date.now() + GOOGLE_STATE_TTL_MS)
  for (const [key, expiresAt] of pendingStates) {
    if (expiresAt < Date.now()) pendingStates.delete(key)
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, redirectUri: config.redirectUri }
}

export function consumeState(state) {
  if (!state) return false
  const expiresAt = pendingStates.get(state)
  if (!expiresAt) return false
  pendingStates.delete(state)
  return expiresAt > Date.now()
}

/** Accept either a bare code or the redirect URL Google produced. */
export function extractCode(value) {
  const input = String(value ?? '').trim()
  if (!input) throw new Error('вставьте адрес после входа в Google или код')
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input)
    const code = url.searchParams.get('code')
    if (!code) throw new Error('в ссылке нет параметра code')
    return { code, state: url.searchParams.get('state') }
  }
  return { code: input, state: null }
}

async function tokenRequest(dir, body) {
  const config = await loadClientConfig(dir)
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      ...body,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const reason = payload?.error_description || payload?.error || `HTTP ${response.status}`
    throw new Error(`Google token: ${reason}`)
  }
  return payload
}

export async function exchangeCode(dir, code) {
  const tokens = await tokenRequest(dir, { grant_type: 'authorization_code', code })
  return normalizeTokens(tokens)
}

export async function refreshTokens(dir, tokens) {
  if (!tokens?.refreshToken) throw new Error('Google: нет refresh token — подключите аккаунт заново')
  const next = await tokenRequest(dir, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
  return { ...normalizeTokens(next), refreshToken: tokens.refreshToken }
}

function normalizeTokens(tokens) {
  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : 0,
    scope: tokens.scope ?? null,
  }
}

export async function validAccessToken(dir, tokens) {
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 60000) return tokens.accessToken
  const refreshed = await refreshTokens(dir, tokens)
  return refreshed.accessToken
}

export async function fetchProfile(accessToken) {
  try {
    const response = await fetch(USERINFO, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.email ?? null
  } catch {
    return null
  }
}

export async function fetchCalendars(accessToken) {
  const calendars = []
  let pageToken = null
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(CALENDAR_LIST)
    url.searchParams.set('maxResults', '250')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Google calendarList → HTTP ${response.status} ${text.slice(0, 120)}`)
    }
    const payload = await response.json()
    for (const item of payload.items ?? []) {
      if (item.deleted) continue
      if (item.accessRole === 'reader' || item.accessRole === 'owner' || item.accessRole === 'writer') {
        calendars.push({
          href: item.id,
          title: item.summaryOverride || item.summary || item.id,
          color: item.backgroundColor || COLOR,
          components: ['VEVENT'],
          selected: !item.hidden,
        })
      }
    }
    pageToken = payload.nextPageToken ?? null
    if (!pageToken) break
  }
  return calendars
}

export async function fetchEvents(accessToken, calendarId, from, to) {
  const items = []
  let pageToken = null
  for (let page = 0; page < 8; page += 1) {
    const url = new URL(`${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('timeMin', new Date(from).toISOString())
    url.searchParams.set('timeMax', new Date(to).toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('showDeleted', 'false')
    url.searchParams.set('maxResults', '2500')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Google events → HTTP ${response.status} ${text.slice(0, 120)}`)
    }
    const payload = await response.json()
    items.push(...(payload.items ?? []))
    pageToken = payload.nextPageToken ?? null
    if (!pageToken) break
  }
  return items
}

function readTokensFile(dir) {
  return readJson(join(dir, TOKENS_FILE), { version: 1, accounts: {} })
}

export async function readTokens(dir, id) {
  const data = await readTokensFile(dir)
  return data.accounts?.[id] ?? null
}

export async function writeTokens(dir, id, tokens) {
  const data = await readTokensFile(dir)
  if (!data.accounts) data.accounts = {}
  data.accounts[id] = tokens
  await writeJson(join(dir, TOKENS_FILE), data)
  return tokens
}

export async function deleteTokens(dir, id) {
  const data = await readTokensFile(dir)
  if (data.accounts && data.accounts[id]) {
    delete data.accounts[id]
    await writeJson(join(dir, TOKENS_FILE), data)
  }
}

/**
 * Complete the consent: exchange the code, read the profile and calendars.
 * The caller persists the account and the tokens.
 */
export async function completeConnect(dir, pasted) {
  const { code, state } = extractCode(pasted)
  if (state && !consumeState(state)) throw new Error('состояние OAuth истекло — начните заново')
  const tokens = await exchangeCode(dir, code)
  const accessToken = tokens.accessToken
  if (!accessToken) throw new Error('Google не вернул access token')
  const email = await fetchProfile(accessToken)
  const calendars = await fetchCalendars(accessToken)
  if (calendars.length === 0) throw new Error('в аккаунте нет доступных календарей')
  return { tokens, email, calendars }
}

/**
 * Pull events of the selected calendars into the task store.
 * Imported events carry a `source` block and stay read-only in the UI.
 */
export async function syncGoogle({ dir, accountsStore, taskStore, id, window: range }) {
  const account = await accountsStore.get(id)
  if (!account) throw new Error(`unknown account: ${id}`)
  const tokens = await readTokens(dir, id)
  if (!tokens) throw new Error('Google: нет сохранённых токенов — подключите аккаунт заново')
  let accessToken = tokens.accessToken
  if (!accessToken || tokens.expiresAt < Date.now() + 60000) {
    const refreshed = await refreshTokens(dir, tokens)
    await writeTokens(dir, id, refreshed)
    accessToken = refreshed.accessToken
  }
  const from = range?.from ?? new Date(Date.now() - 30 * 86400000)
  const to = range?.to ?? new Date(Date.now() + 180 * 86400000)
  const selected = (account.calendars ?? []).filter(calendar => calendar.selected !== false)
  if (selected.length === 0) throw new Error('не выбран ни один календарь')

  const imported = []
  for (const calendar of selected) {
    const items = await fetchEvents(accessToken, calendar.href, from, to)
    for (const item of items) {
      if (item.status === 'cancelled') continue
      const startValue = item.start?.dateTime ?? item.start?.date
      const endValue = item.end?.dateTime ?? item.end?.date
      if (!startValue) continue
      const startAt = new Date(startValue)
      const endDate = endValue ? new Date(endValue) : new Date(startAt.getTime() + 3600000)
      imported.push({
        calendar,
        item,
        fields: {
          title: item.summary || '(без названия)',
          notes: item.description || '',
          startAt: startAt.toISOString(),
          endAt: endDate.toISOString(),
          allDay: !item.start?.dateTime,
          color: calendar.color || COLOR,
          source: {
            accountId: id,
            calendarId: calendar.href,
            calendarTitle: calendar.title,
            href: item.id,
            etag: item.etag ?? null,
            uid: item.id,
          },
        },
      })
    }
  }

  const keep = new Set(imported.map(entry => `${entry.fields.source.calendarId}|${entry.fields.source.uid}`))
  const { result: counts, state } = await taskStore.mutate(draft => {
    const before = draft.events.length
    draft.events = draft.events.filter(event => {
      if (event.source?.accountId !== id) return true
      return keep.has(`${event.source.calendarId}|${event.source.uid}`)
    })
    const removed = before - draft.events.length
    let inserted = 0
    for (const entry of imported) {
      const key = `${entry.fields.source.calendarId}|${entry.fields.source.uid}`
      const existing = draft.events.find(candidate => candidate.source
        && candidate.source.accountId === id
        && `${candidate.source.calendarId}|${candidate.source.uid}` === key)
      if (existing) Object.assign(existing, entry.fields, { updatedAt: new Date().toISOString() })
      else {
        draft.events.push({
          id: randomUUID(),
          taskId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...entry.fields,
        })
        inserted += 1
      }
    }
    return { inserted, removed }
  })

  const { result: updated } = await accountsStore.mutate(data => {
    const found = data.accounts.find(item => item.id === id)
    if (found) {
      found.lastSyncAt = new Date().toISOString()
      found.status = 'ok'
      found.error = null
    }
    return found
  })

  return { state, imported: counts.inserted, removed: counts.removed, account: updated ? {
    id: updated.id,
    provider: updated.provider,
    username: updated.username,
    calendars: updated.calendars,
    status: updated.status,
    lastSyncAt: updated.lastSyncAt,
    mail: updated.mail ?? null,
    error: null,
  } : null }
}
