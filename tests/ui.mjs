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

console.log('ok: lists, month/week/agenda render, day click creates an event, event drawer opens, task → calendar links')
console.log('calls:', calls.map(c => `${c.method} ${String(c.url).replace('http://127.0.0.1:3080', '')}`).join(', '))
