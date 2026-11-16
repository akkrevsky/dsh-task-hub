/**
 * Mail worker isolation test: a failed IMAP connection must surface as an
 * error in this process without killing it.
 * Run with: node tests/mail.mjs
 */
import assert from 'node:assert/strict'
import { listMessages, readMessage } from '../mail.js'

const config = { host: '127.0.0.1', port: 9, secure: false, username: 'nobody' }

await assert.rejects(
  () => listMessages({ config, password: 'x', folder: 'INBOX' }),
  /IMAP|подключ/i,
  'a refused connection is reported as an error',
)
await assert.rejects(
  () => readMessage({ config, password: 'x', folder: 'INBOX', uid: 1 }),
  /IMAP|подключ/i,
)

// Still alive: the test reaching this line is the assertion.
console.log('ok: the IMAP worker fails in isolation and the host process survives')
