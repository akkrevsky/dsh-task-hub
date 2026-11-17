/**
 * IMAP worker process for Task Hub.
 *
 * Runs one mail operation per `node mail-cli.mjs <op>` invocation, receives the
 * payload as JSON on stdin (so the password never appears in argv) and prints
 * one JSON line on stdout:
 *   { ok: true, result } | { ok: false, error }
 *
 * Why a separate process: imapflow 1.7.8 can emit an unhandled rejection when a
 * server drops the connection mid-command. Inside the Host process that ends
 * `dsh web` (fail-loud); here it only kills this worker, and the Host reports
 * the mail error without losing the portal.
 */
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

const TIMEOUTS = { greetingTimeout: 10000, socketTimeout: 25000 }
const MAX_BODY = 200000

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

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
    if (/authentication|AUTHENTICATIONFAILED|LOGIN failed|invalid credentials|Already logged out/i.test(message)) {
      throw new Error('IMAP отклонил логин или пароль (проверьте пароль приложения)')
    }
    throw new Error(message)
  } finally {
    if (connected) await client.logout().catch(() => {})
    else await client.close().catch(() => {})
  }
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

const operations = {
  async verify({ config, password }) {
    return withClient(config, password, async client => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        return { exists: client.mailbox?.exists ?? 0 }
      } finally {
        lock.release()
      }
    })
  },

  async folders({ config, password }) {
    return withClient(config, password, async client => {
      const boxes = await client.list()
      return boxes
        .filter(box => (box.path !== 'INBOX' ? (box.specialUse || box.subscribed) : true))
        .map(box => ({ path: box.path, name: box.name || box.path, specialUse: box.specialUse ?? null }))
        .slice(0, 40)
    })
  },

  async messages({ config, password, folder = 'INBOX', limit = 40 }) {
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
  },

  async send({ smtp, username, password, message }) {
    if (!smtp?.host) throw new Error('не задан SMTP-сервер')
    if (!username) throw new Error('не задан логин почты')
    if (!password) throw new Error('нет пароля почты — подключите ящик заново')
    const to = String(message?.to ?? '').trim()
    const subject = String(message?.subject ?? '').trim().slice(0, 300)
    const text = String(message?.text ?? '')
    if (!/^[^@\s]+@[^@\s]+$/.test(to)) throw new Error('укажите корректный адрес получателя')
    if (!subject) throw new Error('тема письма не может быть пустой')
    if (text.length > 100000) throw new Error('письмо слишком длинное (макс. 100 000 символов)')

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 465,
      secure: smtp.secure !== false,
      auth: { user: username, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    })
    try {
      const info = await transport.sendMail({
        from: username,
        to,
        cc: typeof message?.cc === 'string' && message.cc.trim() ? message.cc.trim() : undefined,
        subject,
        text,
        inReplyTo: message?.inReplyTo || undefined,
        references: message?.references || undefined,
      })
      return { messageId: info.messageId ?? null, accepted: info.accepted ?? [] }
    } finally {
      transport.close()
    }
  },

  async message({ config, password, folder = 'INBOX', uid }) {
    const wanted = Number(uid)
    if (!Number.isFinite(wanted)) throw new Error('uid must be a number')
    return withClient(config, password, async client => {
      const lock = await client.getMailboxLock(folder)
      try {
        const fetched = await client.fetchOne(String(wanted), { source: true, envelope: true, flags: true }, { uid: true })
        if (!fetched?.source) throw new Error(`письмо uid=${wanted} не найдено`)
        let parsed
        try {
          parsed = await simpleParser(fetched.source)
        } catch (error) {
          throw new Error(`не удалось разобрать письмо uid=${wanted}: ${error.message}`)
        }
        return {
          uid: wanted,
          folder,
          subject: parsed.subject || '(без темы)',
          messageId: parsed.messageId || null,
          from: parsed.from?.text || '',
          to: parsed.to?.text || '',
          date: parsed.date ? new Date(parsed.date).toISOString() : null,
          text: (parsed.text || htmlToText(parsed.html || '')).slice(0, MAX_BODY),
          attachments: (parsed.attachments ?? []).map(item => ({
            filename: item.filename || 'файл',
            size: item.size ?? 0,
          })).slice(0, 20),
        }
      } finally {
        lock.release()
      }
    })
  },
}

const op = process.argv[2]
const handler = operations[op]
if (!handler) {
  process.stdout.write(JSON.stringify({ ok: false, error: `unknown mail operation: ${op}` }) + '\n')
  process.exit(2)
}

let input = {}
try {
  const raw = await readStdin()
  input = raw ? JSON.parse(raw) : {}
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: `bad payload: ${error.message}` }) + '\n')
  process.exit(2)
}

handler(input)
  .then(result => {
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
  })
  .catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message ?? error) }) + '\n')
    process.exitCode = 1
  })
