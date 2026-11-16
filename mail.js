/**
 * IMAP access for Task Hub's mail panel.
 *
 * Every operation runs in a short-lived child process (`mail-cli.mjs`): an
 * imapflow connection drop can produce an unhandled rejection, and inside the
 * Host that would end `dsh web`. In a child it only fails one request.
 *
 * The payload (including the app password) travels over stdin, never argv, and
 * the child prints exactly one JSON line. The browser never sees either.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAIL_PRESETS = {
  yandex: { host: 'imap.yandex.ru', port: 993, secure: true, label: 'Яндекс' },
  mailru: { host: 'imap.mail.ru', port: 993, secure: true, label: 'Mail.ru' },
  gmail: { host: 'imap.gmail.com', port: 993, secure: true, label: 'Gmail' },
  custom: { host: '', port: 993, secure: true, label: 'Другой IMAP' },
}

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'mail-cli.mjs')
const OPERATION_TIMEOUT_MS = 45000

function runMailOp(op, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, op], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new Error('IMAP не ответил за 45 секунд'))
    }, OPERATION_TIMEOUT_MS)

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', error => finish(error))
    child.on('close', code => {
      const line = stdout.trim().split('\n').filter(Boolean).pop()
      let payloadOut = null
      try {
        payloadOut = line ? JSON.parse(line) : null
      } catch {
        payloadOut = null
      }
      if (payloadOut?.ok) return finish(null, payloadOut.result)
      let reason = payloadOut?.error
        || stderr.trim().split('\n').filter(Boolean).pop()
        || `IMAP-процесс завершился с кодом ${code}`
      // imapflow can surface a bare TypeError when the socket dies before
      // connect() settles; keep the UI message useful.
      if (/Cannot read properties|reading 'catch'|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(reason)) {
        reason = 'IMAP: не удалось подключиться к серверу'
      }
      finish(new Error(reason))
    })

    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(payload ?? {}))
  })
}

export function verifyMail(config, password) {
  return runMailOp('verify', { config, password })
}

export function listFolders(config, password) {
  return runMailOp('folders', { config, password })
}

export function listMessages({ config, password, folder = 'INBOX', limit = 40 }) {
  return runMailOp('messages', { config, password, folder, limit })
}

export function readMessage({ config, password, folder = 'INBOX', uid }) {
  return runMailOp('message', { config, password, folder, uid })
}
