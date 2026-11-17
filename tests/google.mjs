/**
 * Google OAuth + Calendar pull tests — no network.
 * Run with: node tests/google.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  completeConnect,
  createAuthUrl,
  extractCode,
  googleStatus,
  readTokens,
  syncGoogle,
  writeTokens,
} from '../google.js'
import { AccountsStore, connectGoogleAccount } from '../accounts.js'
import { TaskStore } from '../index.js'

const dir = await mkdtemp(join(tmpdir(), 'dsh-task-hub-google-'))
try {
  await writeFile(join(dir, 'google-client.json'), JSON.stringify({
    clientId: 'client-1',
    clientSecret: 'secret-1',
    redirectUri: 'http://127.0.0.1:42813/callback',
  }))

  assert.deepEqual(await googleStatus(dir), {
    configured: true,
    redirectUri: 'http://127.0.0.1:42813/callback',
    clientId: 'client-1',
  })

  const started = await createAuthUrl(dir)
  assert.match(started.url, /client_id=client-1/)
  assert.match(started.url, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A42813%2Fcallback/)
  assert.match(started.url, /scope=.*calendar/)
  assert.match(started.url, /access_type=offline/)
  assert.ok(started.state)

  assert.deepEqual(extractCode(`http://127.0.0.1:42813/callback?code=abc&state=${started.state}`), {
    code: 'abc',
    state: started.state,
  })
  assert.equal(extractCode('raw-code').code, 'raw-code')
  assert.throws(() => extractCode('http://127.0.0.1:42813/callback?state=x'), /code/)

  // Token exchange, profile and calendar list.
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET' })
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'calendar' }),
      }
    }
    if (String(url).includes('userinfo')) {
      return { ok: true, status: 200, json: async () => ({ email: 'me@example.com' }) }
    }
    if (String(url).includes('calendarList')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 'primary', summary: 'Мой календарь', accessRole: 'owner', backgroundColor: '#4285F4', hidden: false },
            { id: 'work', summary: 'Работа', accessRole: 'reader', backgroundColor: '#0B8043' },
            { id: 'hidden', summary: 'Скрытый', accessRole: 'reader', hidden: true },
            { id: 'gone', deleted: true },
          ],
        }),
      }
    }
    if (String(url).includes('/events')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'ev-1',
              status: 'confirmed',
              etag: '"g1"',
              summary: 'Планёрка',
              description: 'Ежедневная',
              start: { dateTime: '2026-11-20T10:00:00+05:00' },
              end: { dateTime: '2026-11-20T10:30:00+05:00' },
            },
            {
              id: 'ev-2',
              status: 'confirmed',
              summary: 'Отпуск',
              start: { date: '2026-11-21' },
              end: { date: '2026-11-22' },
            },
            { id: 'ev-3', status: 'cancelled', start: { date: '2026-11-22' } },
          ],
        }),
      }
    }
    throw new Error(`unexpected request: ${url}`)
  }

  const connected = await completeConnect(dir, 'auth-code')
  assert.equal(connected.email, 'me@example.com')
  assert.equal(connected.calendars.length, 3, 'deleted calendars are skipped')
  assert.equal(connected.tokens.refreshToken, 'rt-1')

  const accountsStore = new AccountsStore(join(dir, 'accounts'))
  const taskStore = new TaskStore(join(dir, 'tasks.json'))
  const { account } = await connectGoogleAccount(accountsStore, { email: connected.email, calendars: connected.calendars })
  assert.equal(account.provider, 'google')
  assert.equal(account.calendars.length, 3)
  assert.equal(account.calendars.find(item => item.href === 'hidden').selected, false)

  await writeTokens(dir, account.id, connected.tokens)
  assert.equal((await readTokens(dir, account.id)).refreshToken, 'rt-1')

  const first = await syncGoogle({ dir, accountsStore, taskStore, id: account.id })
  assert.equal(first.imported, 4, 'two calendars × two confirmed events; cancelled skipped')
  assert.equal(first.state.events.length, 4)
  assert.ok(first.state.events.every(event => event.source.accountId === account.id))
  const allDay = first.state.events.find(event => event.source.uid === 'ev-2' && event.source.calendarId === 'primary')
  assert.equal(allDay.allDay, true)

  const second = await syncGoogle({ dir, accountsStore, taskStore, id: account.id })
  assert.equal(second.imported, 0, 're-sync does not duplicate')
  assert.equal(second.removed, 0)

  // An expired access token is refreshed before syncing.
  await writeTokens(dir, account.id, { ...connected.tokens, expiresAt: 0 })
  const third = await syncGoogle({ dir, accountsStore, taskStore, id: account.id })
  assert.equal(third.imported, 0)
  assert.ok(calls.some(call => String(call.url).includes('oauth2.googleapis.com/token')))

  console.log('ok: google status, auth url, code parsing, token exchange, calendar list, pull sync and refresh')
} finally {
  await rm(dir, { recursive: true, force: true })
}
