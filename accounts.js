/**
 * CalDAV accounts for Task Hub: account registry, secrets and pull sync.
 *
 * Accounts live in `accounts.json`; passwords live in `secrets.json` with mode
 * 0600 next to it. Both files stay inside the profile data directory and are
 * never sent to the browser — the Client API exposes accounts without secrets.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAIL_PRESETS, verifyMail } from './mail.js'
import {
  PROVIDERS,
  buildIcsEvent,
  deleteResource,
  discover,
  fetchEtag,
  fetchRange,
  putResource,
} from './caldav.js'

const SECRET_MODE = 0o600

export class AccountsStore {
  #dir
  #accountsFile
  #secretsFile
  #data = null
  #chain = Promise.resolve()

  constructor(dir) {
    this.#dir = dir
    this.#accountsFile = join(dir, 'accounts.json')
    this.#secretsFile = join(dir, 'secrets.json')
  }

  async #load() {
    if (this.#data) return this.#data
    const accounts = await readJson(this.#accountsFile, { version: 1, accounts: [] })
    const secrets = await readJson(this.#secretsFile, { version: 1, accounts: {} })
    const accountsList = Array.isArray(accounts.accounts) ? accounts.accounts.filter(isObject) : []
    const secretsMap = isObject(secrets.accounts) ? secrets.accounts : {}
    const mailSecrets = isObject(secrets.mail) ? secrets.mail : {}
    this.#data = { accounts: accountsList, secrets: secretsMap, mailSecrets }
    return this.#data
  }

  async list() {
    const data = await this.#load()
    return data.accounts.map(publicAccount)
  }

  async get(id) {
    const data = await this.#load()
    return data.accounts.find(account => account.id === id) ?? null
  }

  async password(id) {
    const data = await this.#load()
    return typeof data.secrets[id] === 'string' ? data.secrets[id] : null
  }

  async mailPassword(id) {
    const data = await this.#load()
    return typeof data.mailSecrets[id] === 'string' ? data.mailSecrets[id] : null
  }

  mutate(fn) {
    const run = async () => {
      const data = structuredClone(await this.#load())
      const result = fn(data)
      await this.#save(data)
      this.#data = data
      return { result, accounts: data.accounts.map(publicAccount) }
    }
    this.#chain = this.#chain.then(run, run)
    return this.#chain
  }

  async #save(data) {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 })
    await writeAtomic(this.#accountsFile, { version: 1, accounts: data.accounts })
    await writeAtomic(this.#secretsFile, {
      version: 1,
      accounts: data.secrets,
      mail: data.mailSecrets ?? {},
    }, SECRET_MODE)
    // writeAtomic renames over the file, which resets the mode; enforce it.
    await chmod(this.#secretsFile, SECRET_MODE)
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return isObject(parsed) ? parsed : fallback
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeAtomic(file, value, mode) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: mode ?? 0o600 })
  await rename(tmp, file)
  if (mode !== undefined) await chmod(file, mode)
}

function publicAccount(account) {
  return {
    id: account.id,
    provider: account.provider,
    username: account.username,
    baseUrl: account.baseUrl,
    calendars: account.calendars ?? [],
    status: account.status ?? 'ok',
    error: account.error ?? null,
    lastSyncAt: account.lastSyncAt ?? null,
    importedAt: account.importedAt ?? null,
    mail: account.mail
      ? {
        provider: account.mail.provider ?? 'custom',
        host: account.mail.host ?? '',
        port: account.mail.port ?? 993,
        secure: account.mail.secure !== false,
        username: account.mail.username ?? '',
        smtpHost: account.mail.smtpHost ?? '',
        smtpPort: account.mail.smtpPort ?? 465,
        status: account.mail.status ?? 'ok',
        lastCheckAt: account.mail.lastCheckAt ?? null,
      }
      : null,
  }
}

/** Attach IMAP settings to an existing account after a login check. */
export async function connectMail(accountsStore, id, input) {
  const account = await accountsStore.get(id)
  if (!account) throw new Error(`unknown account: ${id}`)
  const provider = MAIL_PRESETS[input?.provider] ? input.provider : (MAIL_PRESETS[account.provider] ? account.provider : 'custom')
  const preset = MAIL_PRESETS[provider]
  const username = String(input?.username || account.username || '').trim()
  const password = String(input?.password ?? '')
  if (!username) throw new Error('укажите логин почты')
  if (!password) throw new Error('укажите пароль приложения для почты')
  const config = {
    provider,
    host: String(input?.host || preset.host || '').trim(),
    port: Number(input?.port) || preset.port || 993,
    secure: input?.secure !== false,
    username,
    smtpHost: String(input?.smtpHost || preset.smtpHost || '').trim(),
    smtpPort: Number(input?.smtpPort) || preset.smtpPort || 465,
  }
  await verifyMail(config, password)
  const { result: updated, accounts } = await accountsStore.mutate(data => {
    const found = data.accounts.find(item => item.id === id)
    found.mail = { ...config, status: 'ok', lastCheckAt: new Date().toISOString() }
    data.mailSecrets[id] = password
    return found
  })
  return { account: publicAccount(updated), accounts }
}

export async function removeMail(accountsStore, id) {
  const { result, accounts } = await accountsStore.mutate(data => {
    const found = data.accounts.find(item => item.id === id)
    if (!found) throw new Error(`unknown account: ${id}`)
    delete found.mail
    delete data.mailSecrets[id]
    return found
  })
  return { account: publicAccount(result), accounts }
}

/** Resolve the account, its IMAP config and its mail password. */
export async function mailCredentials(accountsStore, id) {
  const account = await accountsStore.get(id)
  if (!account) throw new Error(`unknown account: ${id}`)
  if (!account.mail) throw new Error('для этого аккаунта почта не подключена')
  const password = await accountsStore.mailPassword(id)
  if (!password) throw new Error('нет пароля почты — подключите ящик заново')
  return { account, config: account.mail, password }
}

/**
 * Validate credentials against the provider, then persist the account.
 * @returns {Promise<{account: object, accounts: object[]}>}
 */
export async function connectAccount(accountsStore, input) {
  const providerId = PROVIDERS[input?.provider] ? input.provider : 'caldav'
  const preset = PROVIDERS[providerId]
  const username = String(input?.username ?? '').trim()
  const password = String(input?.password ?? '')
  const baseUrl = String(input?.baseUrl ?? '').trim() || preset.baseUrl
  if (!username) throw new Error('username is required')
  if (!password) throw new Error('password is required')
  if (!baseUrl) throw new Error('baseUrl is required')

  const discovered = await discover({ baseUrl, username, password })
  const account = {
    id: randomUUID(),
    provider: providerId,
    username,
    baseUrl,
    calendars: discovered.calendars.map(calendar => ({
      href: calendar.href,
      title: calendar.title,
      color: preset.color,
      components: calendar.components,
      // A VTODO-only collection holds tasks, not events: keep it visible but
      // out of the VEVENT sync until task sync exists.
      selected: calendar.components.length === 0 || calendar.components.includes('VEVENT'),
    })),
    status: 'ok',
    error: null,
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
  }
  const { accounts } = await accountsStore.mutate(data => {
    data.accounts.push(account)
    data.secrets[account.id] = password
    return account
  })
  return { account: publicAccount(account), accounts }
}

export async function removeAccount(accountsStore, id) {
  const account = await accountsStore.get(id)
  if (!account) throw new Error(`unknown account: ${id}`)
  const { accounts } = await accountsStore.mutate(data => {
    data.accounts = data.accounts.filter(item => item.id !== id)
    delete data.secrets[id]
    delete data.mailSecrets[id]
    return id
  })
  return { id, accounts }
}

export async function updateAccount(accountsStore, id, patch) {
  const { result: account, accounts } = await accountsStore.mutate(data => {
    const found = data.accounts.find(item => item.id === id)
    if (!found) throw new Error(`unknown account: ${id}`)
    if (Array.isArray(patch?.calendars)) {
      const selected = new Set(patch.calendars.map(item => String(item.href)).filter(Boolean))
      for (const calendar of found.calendars) {
        if (selected.size > 0) calendar.selected = selected.has(calendar.href)
      }
    }
    if (typeof patch?.title === 'string' && patch.title.trim()) found.username = patch.title.trim()
    return found
  })
  return { account: publicAccount(account), accounts }
}

export function syncWindow(now = new Date(), daysBack = 30, daysAhead = 180) {
  return {
    from: new Date(now.getTime() - daysBack * 86400000),
    to: new Date(now.getTime() + daysAhead * 86400000),
  }
}

function sourceKey(source) {
  return `${source.calendarId}|${source.uid ?? source.href}`
}

/**
 * Pull events for one account and merge them into the task store.
 * Imported events carry a `source` block; local events stay untouched.
 * @returns {Promise<{state: object, account: object, imported: number, removed: number}>}
 */
export async function syncAccount({ accountsStore, taskStore, id, window: range }) {
  const account = await accountsStore.get(id)
  if (!account) throw new Error(`unknown account: ${id}`)
  const password = await accountsStore.password(id)
  if (!password) throw new Error('для аккаунта нет пароля — переподключите его')

  const { from, to } = range ?? syncWindow()
  const selected = (account.calendars ?? []).filter(calendar => calendar.selected !== false
    && (calendar.components?.length === 0 || calendar.components?.includes('VEVENT')))
  if (selected.length === 0) throw new Error('не выбран ни один календарь')

  const imported = []
  for (const calendar of selected) {
    const items = await fetchRange({
      baseUrl: account.baseUrl,
      username: account.username,
      password,
      calendarHref: calendar.href,
      from,
      to,
    })
    for (const item of items) {
      for (const event of item.events) {
        imported.push({ calendar, item, event })
      }
    }
  }

  const keep = new Set(imported.map(entry => sourceKey({
    calendarId: entry.calendar.href,
    uid: entry.event.uid,
    href: entry.item.href,
  })))

  const { result: counts, state } = await taskStore.mutate(draft => {
    const before = draft.events.length
    draft.events = draft.events.filter(event => {
      if (event.source?.accountId !== id) return true
      return keep.has(sourceKey(event.source))
    })
    const removed = before - draft.events.length
    let inserted = 0
    for (const entry of imported) {
      const { calendar, item, event } = entry
      const source = {
        accountId: id,
        calendarId: calendar.href,
        calendarTitle: calendar.title,
        href: item.href,
        etag: item.etag,
        uid: event.uid,
      }
      const existing = draft.events.find(candidate => candidate.source
        && candidate.source.accountId === id
        && sourceKey(candidate.source) === sourceKey(source))
      const fields = {
        title: event.title,
        notes: event.notes,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        color: calendar.color || '#4D6BFE',
        source,
      }
      if (existing) {
        Object.assign(existing, fields, { updatedAt: new Date().toISOString() })
      } else {
        const now = new Date().toISOString()
        draft.events.push({
          id: randomUUID(),
          taskId: null,
          createdAt: now,
          updatedAt: now,
          ...fields,
        })
        inserted += 1
      }
    }
    return { inserted, removed }
  })

  const { result: updatedAccount } = await accountsStore.mutate(data => {
    const found = data.accounts.find(item => item.id === id)
    if (found) {
      found.lastSyncAt = new Date().toISOString()
      found.importedAt = found.lastSyncAt
      found.status = 'ok'
      found.error = null
    }
    return found
  })

  return {
    state,
    account: publicAccount(updatedAccount ?? account),
    imported: counts.inserted,
    removed: counts.removed,
  }
}

/**
 * Write one Task Hub event into a CalDAV calendar.
 * A local event becomes provider-backed; a provider event is updated with its
 * ETag, so a concurrent edit on the server fails with a conflict instead of
 * overwriting it.
 */
export async function pushEvent({ accountsStore, taskStore, id, accountId, calendarHref }) {
  const account = await accountsStore.get(accountId)
  if (!account) throw new Error(`unknown account: ${accountId}`)
  const password = await accountsStore.password(accountId)
  if (!password) throw new Error('для аккаунта нет пароля — переподключите его')
  const state = await taskStore.read()
  const event = state.events.find(item => item.id === id)
  if (!event) throw new Error(`unknown event: ${id}`)
  const calendar = account.calendars.find(item => item.href === calendarHref)
    ?? account.calendars.find(item => item.selected !== false
      && (item.components?.length === 0 || item.components?.includes('VEVENT')))
  if (!calendar) throw new Error('в аккаунте нет календаря для событий')

  const uid = event.source?.uid ?? `${id}@dsh-task-hub`
  const href = event.source?.href ?? `${calendar.href}${encodeURIComponent(uid)}.ics`
  const body = buildIcsEvent({
    uid,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
  })
  // Yandex (and some other servers) do not return an ETag on PUT, so a
  // provider-backed event may have href but no etag yet: read it first and
  // fall back to a create-only write only when the resource is really absent.
  let etag = event.source?.etag ?? null
  if (!etag && event.source?.href) {
    etag = await fetchEtag({ baseUrl: account.baseUrl, username: account.username, password, href })
  }
  const write = await putResource({
    baseUrl: account.baseUrl,
    username: account.username,
    password,
    href,
    body,
    etag,
  })
  const finalEtag = write.etag ?? await fetchEtag({ baseUrl: account.baseUrl, username: account.username, password, href })
  const { state: nextState } = await taskStore.mutate(draft => {
    const target = draft.events.find(item => item.id === id)
    target.source = {
      accountId,
      calendarId: calendar.href,
      calendarTitle: calendar.title,
      href,
      etag: finalEtag,
      uid,
    }
    target.color = calendar.color || target.color
    target.updatedAt = new Date().toISOString()
    return target
  })
  return { state: nextState, event: nextState.events.find(item => item.id === id) }
}

/** Delete one event locally, and on the provider when it came from there. */
export async function deleteEventRemote({ accountsStore, taskStore, id }) {
  const state = await taskStore.read()
  const event = state.events.find(item => item.id === id)
  if (!event) throw new Error(`unknown event: ${id}`)
  if (event.source?.accountId) {
    const account = await accountsStore.get(event.source.accountId)
    const password = account ? await accountsStore.password(account.id) : null
    if (account && password) {
      await deleteResource({
        baseUrl: account.baseUrl,
        username: account.username,
        password,
        href: event.source.href,
        etag: event.source.etag,
      })
    }
  }
  const { state: nextState } = await taskStore.mutate(draft => {
    draft.events = draft.events.filter(item => item.id !== id)
    return null
  })
  return { state: nextState }
}

export { PROVIDERS }
