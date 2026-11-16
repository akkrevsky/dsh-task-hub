/**
 * IMAP access for Task Hub's mail panel.
 *
 * Uses `imapflow` for the protocol and `mailparser` for bodies. Read-only for
 * now: listing fetches envelopes, reading one message parses its source.
 * Passwords stay in the account registry's secret store and never reach the
 * browser.
 */
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const MAIL_PRESETS = {
  yandex: { host: 'imap.yandex.ru', port: 993, secure: true, label: 'Яндекс' },
  mailru: { host: 'imap.mail.ru', port: 993, secure: true, label: 'Mail.ru' },
  gmail: { host: 'imap.gmail.com', port: 993, secure: true, label: 'Gmail' },
  custom: { host: '', port: 993, secure: true, label: 'Другой IMAP' },
}

const TIMEOUTS = { greetingTimeout: 10000, socketTimeout: 25000 }
const MAX_BODY = 200000

function openClient(config, password) {
  if (!config?.host) throw new Error('не задан IMAP-сервер')
  if (!config?.username) throw new Error('не задан логин почты')
  if (!password) throw new Error('нет пароля почты — подключите ящик заново')
  return new ImapFlow({
    host: config.host,
    port: Number(config.port) || 993,
    secure: config.secure !== false,
    auth: { user: config.username, pass: password },
    logger: false,
    ...TIMEOUTS,
  })
}

async function withClient(config, password, run) {
  const client = openClient(config, password)
  let connected = false
  try {
    await client.connect()
    connected = true
    return await run(client)
  } catch (error) {
    const message = String(error?.message ?? error)
    if (/authentication|AUTHENTICATIONFAILED|LOGIN failed|invalid credentials/i.test(message)) {
      throw new Error('IMAP отклонил логин или пароль (проверьте пароль приложения)')
    }
    throw error
  } finally {
    if (connected) await client.logout().catch(() => {})
    else await client.close().catch(() => {})
  }
}

/** Check credentials and return the INBOX size. */
export async function verifyMail(config, password) {
  return withClient(config, password, async client => {
    const lock = await client.getMailboxLock('INBOX')
    try {
      return { exists: client.mailbox?.exists ?? 0 }
    } finally {
      lock.release()
    }
  })
}

export async function listFolders(config, password) {
  return withClient(config, password, async client => {
    const boxes = await client.list()
    return boxes
      .filter(box => box.path !== 'INBOX' ? (box.specialUse || box.subscribed) : true)
      .map(box => ({
        path: box.path,
        name: box.name || box.path,
        specialUse: box.specialUse ?? null,
      }))
      .slice(0, 40)
  })
}

function mapEnvelope(message) {
  const from = message.envelope?.from?.[0]
  return {
    uid: message.uid,
    subject: message.envelope?.subject || '(без темы)',
    fromName: from?.name || '',
    fromAddress: from?.address || '',
    date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
    seen: Array.isArray(message.flags) ? [...message.flags].map(String).includes('\\Seen') : false,
    size: message.size ?? null,
  }
}

export async function listMessages({ config, password, folder = 'INBOX', limit = 40 }) {
  const capped = Math.min(Math.max(Number(limit) || 40, 1), 100)
  return withClient(config, password, async client => {
    const lock = await client.getMailboxLock(folder)
    try {
      const exists = client.mailbox?.exists ?? 0
      if (exists === 0) return { folder, exists: 0, messages: [] }
      const from = Math.max(1, exists - capped + 1)
      const messages = []
      for await (const message of client.fetch(`${from}:*`, { envelope: true, flags: true, size: true }, { uid: true })) {
        messages.push(mapEnvelope(message))
      }
      messages.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      return { folder, exists, messages: messages.slice(0, capped) }
    } finally {
      lock.release()
    }
  })
}

function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function readMessage({ config, password, folder = 'INBOX', uid }) {
  const wanted = Number(uid)
  if (!Number.isFinite(wanted)) throw new Error('uid must be a number')
  return withClient(config, password, async client => {
    const lock = await client.getMailboxLock(folder)
    try {
      const message = await client.fetchOne(String(wanted), { source: true, envelope: true, flags: true }, { uid: true })
      if (!message?.source) throw new Error('письмо не найдено')
      const parsed = await simpleParser(message.source)
      const text = (parsed.text || htmlToText(parsed.html || '')).slice(0, MAX_BODY)
      return {
        uid: wanted,
        folder,
        subject: parsed.subject || '(без темы)',
        from: parsed.from?.text || '',
        to: parsed.to?.text || '',
        date: parsed.date ? new Date(parsed.date).toISOString() : null,
        text,
        attachments: (parsed.attachments ?? []).map(item => ({
          filename: item.filename || 'файл',
          size: item.size ?? 0,
        })).slice(0, 20),
      }
    } finally {
      lock.release()
    }
  })
}
