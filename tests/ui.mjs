/**
 * Headless UI test for the client half: real React + jsdom, stubbed Host API.
 * Covers lists, month/week/agenda rendering, creating an event from a day cell
 * and linking a task to a new event. Run with: npm run test:ui
 */
import { readFileSync } from 'node:fs'

let JSDOM, React, createRoot
try {
  ({ JSDOM } = await import('jsdom'))
  React = (await import('react')).default
  ;({ createRoot } = await import('react-dom/client'))
} catch {
  console.log('skip: ui test needs devDependencies (npm install); run `npm run test:ui`')
  process.exit(0)
}

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:3080/' })
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = false

const today = new Date()
const iso = (d) => d.toISOString()
const at = (hour) => { const d = new Date(today); d.setHours(hour, 0, 0, 0); return d }

let state = {
  version: 1,
  lists: [
    { id: 'inbox', title: 'Входящие', color: '#4D6BFE', order: 0 },
    { id: 'work', title: 'Работа', color: '#8E5BF0', order: 1 },
  ],
  tasks: [
    { id: 't1', listId: 'inbox', parentId: null, title: 'Проверить календарь', notes: '', status: 'open', priority: 2, dueAt: iso(at(18)), tags: ['m2'], order: 0, createdAt: iso(today), updatedAt: iso(today), completedAt: null },
    { id: 't2', listId: 'work', parentId: 't1', title: 'Подзадача', notes: '', status: 'done', priority: 0, dueAt: null, tags: [], order: 0, createdAt: iso(today), updatedAt: iso(today), completedAt: iso(today) },
  ],
  events: [
    { id: 'e1', title: 'Планёрка', notes: '', startAt: iso(at(10)), endAt: iso(at(11)), allDay: false, color: '#4285F4', taskId: null, createdAt: iso(today), updatedAt: iso(today) },
  ],
  updatedAt: iso(today),
}

const sampleAccount = {
  id: 'acc-1',
  provider: 'yandex',
  username: 'me@example.com',
  baseUrl: 'https://caldav.yandex.ru/',
  calendars: [{ href: '/calendars/me/events/', title: 'Мои события', components: ['VEVENT'], selected: true }],
  status: 'ok',
  error: null,
  lastSyncAt: iso(today),
  mail: {
    provider: 'yandex',
    host: 'imap.yandex.ru',
    port: 993,
    secure: true,
    username: 'me@example.com',
    status: 'ok',
    lastCheckAt: iso(today),
  },
}

const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method ?? 'GET', body: options.body })
  const method = options.method ?? 'GET'
  if (method === 'POST' && String(url).endsWith('/events')) {
    const body = JSON.parse(options.body)
    const event = { id: 'e2', title: body.title, notes: '', startAt: body.startAt, endAt: body.endAt, allDay: false, color: '#4D6BFE', taskId: body.taskId ?? null, createdAt: iso(today), updatedAt: iso(today) }
    state = { ...state, events: [...state.events, event] }
    return { ok: true, status: 200, text: async () => JSON.stringify({ state, event }) }
  }
  if (String(url).includes('/mail/send') && method === 'POST') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, messageId: 'sent-1' }) }
  }
  if (String(url).includes('/mail/folders')) {
    return { ok: true, status: 200, text: async () => JSON.stringify({ folders: [{ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' }] }) }
  }
  if (String(url).includes('/mail/messages')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        folder: 'INBOX',
        exists: 1,
        messages: [{ uid: 7, subject: 'Привет из почты', fromName: 'Анна', fromAddress: 'a@example.com', date: iso(today), seen: false, size: 1024 }],
      }),
    }
  }
  if (String(url).includes('/mail/message')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        uid: 7,
        folder: 'INBOX',
        subject: 'Привет из почты',
        from: 'Анна <a@example.com>',
        to: 'me@example.com',
        date: iso(today),
        text: 'Тело письма',
        messageId: '<msg-7@example.com>',
        attachments: [],
      }),
    }
  }
  if (String(url).endsWith('/accounts') && method === 'GET') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: [sampleAccount] }) }
  }
  if (/\/events\/[^/]+\/push$/.test(String(url)) && method === 'POST') {
    const id = String(url).split('/events/')[1].split('/push')[0]
    const body = JSON.parse(options.body || '{}')
    const event = state.events.find(item => item.id === id)
    const updated = {
      ...event,
      source: {
        accountId: body.accountId,
        calendarId: body.calendarHref,
        calendarTitle: 'Мои события',
        href: '/calendars/me/events/x.ics',
        etag: '"e1"',
        uid: 'u1',
      },
    }
    state = { ...state, events: state.events.map(item => (item.id === id ? updated : item)) }
    return { ok: true, status: 200, text: async () => JSON.stringify({ state, event: updated }) }
  }
  if (/\/accounts\/[^/]+\/sync$/.test(String(url)) && method === 'POST') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ state, account: sampleAccount, imported: 0, removed: 0 }) }
  }
  return { ok: true, status: 200, text: async () => JSON.stringify(state) }
}
window.confirm = () => true

let loaded = null
window.__ModuleLoader__ = { load: (definition) => { loaded = definition } }
new Function('window', source)(window)

const registrations = []
const dictionaries = {}
const ctx = {
  locale: {
    register(ns, locale, dict) { dictionaries[locale] = { ...(dictionaries[locale] ?? {}), ...dict } },
    bind() { return key => dictionaries.ru?.[key] ?? dictionaries.en?.[key] ?? key },
  },
  slots: {
    inject(key, callback) { callback() },
    register(options, component) { registrations.push({ options, component }) },
  },
}
const plugin = loaded.factory(name => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
})
plugin.apply(ctx)
const panel = registrations.find(r => r.options.name === 'main').component

const t = key => dictionaries.ru?.[key] ?? key
const root = createRoot(document.getElementById('root'))
root.render(React.createElement(panel, { t }))
const tick = () => new Promise(resolve => setTimeout(resolve, 40))

await tick()
const text = () => document.body.textContent
const click = element => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

if (!text().includes('Входящие')) throw new Error('lists did not render: ' + text().slice(0, 200))
if (!text().includes('Проверить календарь')) throw new Error('task row missing')

// open the calendar tab
const calendarTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Календарь')
if (!calendarTab) throw new Error('calendar tab missing')
click(calendarTab)
await tick()
const monthCells0 = [...document.querySelectorAll('div')].filter(d => d.style.minHeight === '104px')
if (monthCells0.length !== 42) throw new Error(`expected 42 month cells, got ${monthCells0.length}`)
if (!text().includes('Планёрка')) throw new Error('event chip missing on the month grid')
if (!text().includes('Новое событие')) throw new Error('toolbar action missing')

// switch to week and agenda
const weekTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Неделя')
click(weekTab)
await tick()
if (!document.querySelector('[style*="overflow-y"]')) throw new Error('week grid not rendered')

const agendaTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Повестка')
click(agendaTab)
await tick()
if (!text().includes('Планёрка')) throw new Error('agenda list missing the event')

// click a month cell -> creates an event through the API
const monthTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Месяц')
click(monthTab)
await tick()
const cells = [...document.querySelectorAll('div')].filter(d => d.style.minHeight === '104px')
if (cells.length !== 42) throw new Error(`expected 42 month cells, got ${cells.length}`)
click(cells[10])
await tick()
await tick()
const post = calls.find(call => call.method === 'POST' && String(call.url).endsWith('/events'))
if (!post) throw new Error('clicking a day did not create an event')
if (!text().includes('Событие')) throw new Error('event drawer did not open')

// click the event chip -> drawer shows the linked-task field
const chips = [...document.querySelectorAll('div[title]')].filter(d => d.title.includes('Планёрка'))
if (chips.length === 0) throw new Error('event chip not clickable')
click(chips[0])
await tick()
if (!text().includes('Связанная задача')) throw new Error('event drawer fields missing')

const pushButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Отправить')
if (!pushButton) throw new Error('push-to-calendar button missing on a local event')
click(pushButton)
await tick()
await tick()
if (!calls.some(call => /\/events\/[^/]+\/push$/.test(String(call.url)))) {
  throw new Error('push did not call the API')
}

// close the event drawer, then link a task to a new event
const closeBtn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Закрыть')
click(closeBtn)
await tick()
const listsTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Списки')
click(listsTab)
await tick()
const taskRow = [...document.querySelectorAll('div[role="button"]')].find(d => d.textContent.includes('Проверить календарь'))
if (!taskRow) throw new Error('task row is not clickable')
click(taskRow)
await tick()
const toCalendar = [...document.querySelectorAll('button')].find(b => b.textContent === 'В календарь')
if (!toCalendar) throw new Error('task drawer has no calendar action')
click(toCalendar)
await tick()
await tick()
const linkedPost = calls.filter(call => call.method === 'POST').find(call => JSON.parse(call.body).taskId === 't1')
if (!linkedPost) throw new Error('task → calendar did not create a linked event')

// accounts tab
const accountsTab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Аккаунты')
if (!accountsTab) throw new Error('accounts tab missing')
click(accountsTab)
await tick()
if (!text().includes('Добавить аккаунт')) throw new Error('accounts page did not render the add form')
if (!text().includes('me@example.com')) throw new Error('connected account is not listed')
const syncButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Синхронизировать')
if (!syncButton) throw new Error('sync button missing on the account card')
click(syncButton)
await tick()
await tick()
if (!calls.some(call => /\/accounts\/[^/]+\/sync$/.test(String(call.url)))) throw new Error('sync did not call the API')

// mail panel (second registration)
const mailRegistration = registrations.find(registration => registration.options.key === 'dsh-task-hub-mail')
if (!mailRegistration) throw new Error('mail panel is not registered')
const mailHost = document.createElement('div')
document.body.appendChild(mailHost)
const mailRoot = createRoot(mailHost)
mailRoot.render(React.createElement(mailRegistration.component, { t }))
await tick()
await tick()
if (!mailHost.textContent.includes('Привет из почты')) throw new Error('mail list did not render: ' + mailHost.textContent.slice(0, 200))
const mailRow = [...mailHost.querySelectorAll('div')].find(node => node.textContent.includes('Привет из почты') && node.style.cursor === 'pointer')
if (!mailRow) throw new Error('mail row is not clickable')
click(mailRow)
await tick()
await tick()
if (!mailHost.textContent.includes('Тело письма')) throw new Error('mail body did not render')
const replyButton = [...mailHost.querySelectorAll('button')].find(b => b.textContent === 'Ответить')
if (!replyButton) throw new Error('reply button missing')
click(replyButton)
await tick()
const sendButton = [...mailHost.querySelectorAll('button')].find(b => b.textContent === 'Отправить')
if (!sendButton) throw new Error('send button missing in the composer')
click(sendButton)
await tick()
await tick()
if (!calls.some(call => String(call.url).includes('/mail/send') && call.method === 'POST')) {
  throw new Error('sending did not call the API')
}
mailRoot.unmount()

console.log('ok: lists, calendar views, day click, task → calendar, accounts, mail reader, reply/send')
console.log('calls:', calls.map(c => `${c.method} ${String(c.url).replace('http://127.0.0.1:3080', '')}`).join(', '))
