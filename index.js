/**
 * Host half of dsh-task-hub.
 *
 * M1: a JSON task store with HTTP routes for the panel and three agent tools.
 * Calendars, providers and mail are not implemented yet.
 *
 * Storage: `$DSH_HOME/plugin-data/dsh-task-hub/tasks.json` (DSH_HOME defaults to
 * `~/.dsh`, override with `DSH_TASK_HUB_STORE`). Writes are serialized, written
 * to a temporary file and renamed into place, so a crash cannot leave a
 * half-written store.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  AccountsStore,
  connectAccount,
  deleteEventRemote,
  pushEvent,
  removeAccount,
  syncAccount,
  updateAccount,
} from './accounts.js'

const API_PREFIX = '/dsh-task-hub/api'
const STORE_VERSION = 1
const MAX_TITLE = 300
const MAX_NOTES = 20000
const MAX_TASKS = 5000
const PRIORITIES = [0, 1, 2, 3]

const DEFAULT_LISTS = [
  { id: 'inbox', title: 'Входящие', color: '#4D6BFE', order: 0 },
  { id: 'work', title: 'Работа', color: '#8E5BF0', order: 1 },
]

const LIST_COLORS = ['#4D6BFE', '#8E5BF0', '#2F9E63', '#F59E0B', '#DC3B3B', '#0EA5B7']

/* ------------------------------------------------------------------ store */

function storeFile() {
  if (process.env.DSH_TASK_HUB_STORE) return process.env.DSH_TASK_HUB_STORE
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'plugin-data', 'dsh-task-hub', 'tasks.json')
}

function emptyState() {
  const now = new Date().toISOString()
  return {
    version: STORE_VERSION,
    lists: DEFAULT_LISTS.map(list => ({ ...list })),
    tasks: [],
    events: [],
    updatedAt: now,
  }
}

function normalize(raw) {
  const state = emptyState()
  if (!raw || typeof raw !== 'object') return state
  if (Array.isArray(raw.lists)) {
    state.lists = raw.lists.filter(isPlainObject).map(list => ({
      id: String(list.id ?? randomUUID()),
      title: clampText(list.title, 120) || 'Список',
      color: typeof list.color === 'string' ? list.color : LIST_COLORS[0],
      order: Number.isFinite(list.order) ? Number(list.order) : 0,
    }))
  }
  if (state.lists.length === 0) state.lists = DEFAULT_LISTS.map(list => ({ ...list }))
  if (Array.isArray(raw.tasks)) {
    state.tasks = raw.tasks.filter(isPlainObject).slice(0, MAX_TASKS).map(task => ({
      id: String(task.id ?? randomUUID()),
      listId: typeof task.listId === 'string' ? task.listId : state.lists[0].id,
      parentId: typeof task.parentId === 'string' ? task.parentId : null,
      title: clampText(task.title, MAX_TITLE) || 'Без названия',
      notes: clampText(task.notes, MAX_NOTES),
      status: task.status === 'done' ? 'done' : 'open',
      priority: PRIORITIES.includes(task.priority) ? task.priority : 0,
      dueAt: isIsoDate(task.dueAt) ? task.dueAt : null,
      tags: Array.isArray(task.tags)
        ? task.tags.filter(tag => typeof tag === 'string').slice(0, 12).map(tag => tag.slice(0, 40))
        : [],
      order: Number.isFinite(task.order) ? Number(task.order) : 0,
      createdAt: isIsoDate(task.createdAt) ? task.createdAt : new Date().toISOString(),
      updatedAt: isIsoDate(task.updatedAt) ? task.updatedAt : new Date().toISOString(),
      completedAt: isIsoDate(task.completedAt) ? task.completedAt : null,
    }))
    // Drop parent references that point at a missing task.
    const ids = new Set(state.tasks.map(task => task.id))
    for (const task of state.tasks) if (task.parentId !== null && !ids.has(task.parentId)) task.parentId = null
  }
  if (Array.isArray(raw.events)) {
    const taskIds = new Set(state.tasks.map(task => task.id))
    state.events = raw.events.filter(isPlainObject).slice(0, MAX_TASKS).map(event => {
      const startAt = isIsoDate(event.startAt) ? event.startAt : new Date().toISOString()
      const endAt = isIsoDate(event.endAt) ? event.endAt : startAt
      return {
        id: String(event.id ?? randomUUID()),
        title: clampText(event.title, MAX_TITLE) || 'Событие',
        notes: clampText(event.notes, MAX_NOTES),
        startAt,
        endAt: Date.parse(endAt) >= Date.parse(startAt) ? endAt : new Date(Date.parse(startAt) + 3600000).toISOString(),
        allDay: event.allDay === true,
        color: typeof event.color === 'string' ? event.color : '#4D6BFE',
        taskId: typeof event.taskId === 'string' && taskIds.has(event.taskId) ? event.taskId : null,
        createdAt: isIsoDate(event.createdAt) ? event.createdAt : new Date().toISOString(),
        updatedAt: isIsoDate(event.updatedAt) ? event.updatedAt : new Date().toISOString(),
        ...(isPlainObject(event.source)
          ? {
            source: {
              accountId: String(event.source.accountId ?? ''),
              calendarId: String(event.source.calendarId ?? ''),
              calendarTitle: typeof event.source.calendarTitle === 'string' ? event.source.calendarTitle : '',
              href: String(event.source.href ?? ''),
              etag: typeof event.source.etag === 'string' ? event.source.etag : null,
              uid: typeof event.source.uid === 'string' ? event.source.uid : null,
            },
          }
          : {}),
      }
    })
  }
  state.updatedAt = isIsoDate(raw.updatedAt) ? raw.updatedAt : new Date().toISOString()
  return state
}

class TaskStore {
  #file
  #data = null
  #chain = Promise.resolve()

  constructor(file) {
    this.#file = file
  }

  async #load() {
    if (this.#data) return this.#data
    try {
      const raw = await readFile(this.#file, 'utf8')
      this.#data = normalize(JSON.parse(raw))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.#data = emptyState()
    }
    return this.#data
  }

  async read() {
    return structuredClone(await this.#load())
  }

  /** Serialize every mutation; fn receives a draft and returns the result. */
  mutate(fn) {
    const run = async () => {
      const draft = structuredClone(await this.#load())
      const result = fn(draft)
      draft.updatedAt = new Date().toISOString()
      await this.#save(draft)
      this.#data = draft
      return { result, state: structuredClone(draft) }
    }
    this.#chain = this.#chain.then(run, run)
    return this.#chain
  }

  async #save(state) {
    await mkdir(dirname(this.#file), { recursive: true })
    const tmp = `${this.#file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, this.#file)
  }
}

/* ------------------------------------------------------------- operations */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function findTask(state, id) {
  const task = state.tasks.find(item => item.id === id)
  if (!task) throw new Error(`unknown task: ${id}`)
  return task
}

function defaultListId(state) {
  return state.lists[0]?.id ?? 'inbox'
}

function createTask(state, input) {
  const title = clampText(input.title, MAX_TITLE)
  if (!title) throw new Error('title is required')
  if (state.tasks.length >= MAX_TASKS) throw new Error(`task limit reached (${MAX_TASKS})`)
  const listId = typeof input.listId === 'string' && state.lists.some(list => list.id === input.listId)
    ? input.listId
    : defaultListId(state)
  const parentId = typeof input.parentId === 'string' && state.tasks.some(task => task.id === input.parentId)
    ? input.parentId
    : null
  const now = new Date().toISOString()
  const order = state.tasks.filter(task => task.parentId === parentId).length
  const task = {
    id: randomUUID(),
    listId,
    parentId,
    title,
    notes: clampText(input.notes, MAX_NOTES),
    status: 'open',
    priority: PRIORITIES.includes(input.priority) ? input.priority : 0,
    dueAt: isIsoDate(input.dueAt) ? input.dueAt : null,
    tags: Array.isArray(input.tags)
      ? input.tags.filter(tag => typeof tag === 'string').slice(0, 12).map(tag => tag.trim().slice(0, 40)).filter(Boolean)
      : [],
    order,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }
  state.tasks.push(task)
  return task
}

function updateTask(state, id, patch) {
  const task = findTask(state, id)
  if (patch.title !== undefined) {
    const title = clampText(patch.title, MAX_TITLE)
    if (!title) throw new Error('title cannot be empty')
    task.title = title
  }
  if (patch.notes !== undefined) task.notes = clampText(patch.notes, MAX_NOTES)
  if (patch.status !== undefined) {
    task.status = patch.status === 'done' ? 'done' : 'open'
    task.completedAt = task.status === 'done' ? new Date().toISOString() : null
    if (task.status === 'done') {
      // A finished parent finishes its open children, so progress stays honest.
      for (const child of state.tasks) {
        if (child.parentId === task.id && child.status !== 'done') {
          child.status = 'done'
          child.completedAt = task.completedAt
          child.updatedAt = task.completedAt
        }
      }
    }
  }
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority)) task.priority = patch.priority
  if (patch.dueAt !== undefined) task.dueAt = isIsoDate(patch.dueAt) ? patch.dueAt : null
  if (patch.listId !== undefined && state.lists.some(list => list.id === patch.listId)) task.listId = patch.listId
  if (patch.parentId !== undefined) {
    const next = patch.parentId === null || patch.parentId === '' ? null : String(patch.parentId)
    if (next !== null && (!state.tasks.some(item => item.id === next) || next === task.id)) throw new Error('invalid parentId')
    task.parentId = next
  }
  if (Array.isArray(patch.tags)) {
    task.tags = patch.tags.filter(tag => typeof tag === 'string').slice(0, 12).map(tag => tag.trim().slice(0, 40)).filter(Boolean)
  }
  if (Number.isFinite(patch.order)) task.order = Number(patch.order)
  task.updatedAt = new Date().toISOString()
  return task
}

function deleteTask(state, id) {
  findTask(state, id)
  const doomed = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const task of state.tasks) {
      if (!doomed.has(task.id) && task.parentId !== null && doomed.has(task.parentId)) {
        doomed.add(task.id)
        grew = true
      }
    }
  }
  state.tasks = state.tasks.filter(task => !doomed.has(task.id))
  for (const event of state.events) if (event.taskId !== null && doomed.has(event.taskId)) event.taskId = null
  return { deleted: [...doomed] }
}

function findEvent(state, id) {
  const event = state.events.find(item => item.id === id)
  if (!event) throw new Error(`unknown event: ${id}`)
  return event
}

function createEvent(state, input) {
  const title = clampText(input.title, MAX_TITLE)
  if (!title) throw new Error('event title is required')
  if (!isIsoDate(input.startAt)) throw new Error('startAt must be an ISO date-time')
  const startMs = Date.parse(input.startAt)
  const endMs = isIsoDate(input.endAt) ? Date.parse(input.endAt) : startMs + 3600000
  if (endMs < startMs) throw new Error('endAt must not be before startAt')
  if (state.events.length >= MAX_TASKS) throw new Error(`event limit reached (${MAX_TASKS})`)
  const taskId = typeof input.taskId === 'string' && state.tasks.some(task => task.id === input.taskId)
    ? input.taskId
    : null
  const now = new Date().toISOString()
  const event = {
    id: randomUUID(),
    title,
    notes: clampText(input.notes, MAX_NOTES),
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(Math.max(endMs, startMs + 60000)).toISOString(),
    allDay: input.allDay === true,
    color: typeof input.color === 'string' ? input.color : '#4D6BFE',
    taskId,
    createdAt: now,
    updatedAt: now,
  }
  state.events.push(event)
  return event
}

function updateEvent(state, id, patch) {
  const event = findEvent(state, id)
  if (patch.title !== undefined) {
    const title = clampText(patch.title, MAX_TITLE)
    if (!title) throw new Error('event title cannot be empty')
    event.title = title
  }
  if (patch.notes !== undefined) event.notes = clampText(patch.notes, MAX_NOTES)
  if (patch.startAt !== undefined) {
    if (!isIsoDate(patch.startAt)) throw new Error('startAt must be an ISO date-time')
    const previousStart = Date.parse(event.startAt)
    const previousDuration = Date.parse(event.endAt) - previousStart
    const startMs = Date.parse(patch.startAt)
    event.startAt = new Date(startMs).toISOString()
    event.endAt = new Date(startMs + Math.max(previousDuration, 60000)).toISOString()
  }
  if (patch.endAt !== undefined && patch.startAt === undefined) {
    if (!isIsoDate(patch.endAt)) throw new Error('endAt must be an ISO date-time')
    if (Date.parse(patch.endAt) < Date.parse(event.startAt)) throw new Error('endAt must not be before startAt')
    event.endAt = patch.endAt
  }
  if (patch.allDay !== undefined) event.allDay = patch.allDay === true
  if (typeof patch.color === 'string') event.color = patch.color
  if (patch.taskId !== undefined) {
    event.taskId = typeof patch.taskId === 'string' && patch.taskId !== ''
      && state.tasks.some(task => task.id === patch.taskId) ? patch.taskId : null
  }
  event.updatedAt = new Date().toISOString()
  return event
}

function deleteEvent(state, id) {
  findEvent(state, id)
  state.events = state.events.filter(event => event.id !== id)
  return { deleted: id }
}

function createList(state, input) {
  const title = clampText(input.title, 120)
  if (!title) throw new Error('list title is required')
  if (state.lists.length >= 100) throw new Error('list limit reached')
  const list = {
    id: randomUUID(),
    title,
    color: typeof input.color === 'string' ? input.color : LIST_COLORS[state.lists.length % LIST_COLORS.length],
    order: state.lists.length,
  }
  state.lists.push(list)
  return list
}

function updateList(state, id, patch) {
  const list = state.lists.find(item => item.id === id)
  if (!list) throw new Error(`unknown list: ${id}`)
  if (patch.title !== undefined) {
    const title = clampText(patch.title, 120)
    if (!title) throw new Error('list title cannot be empty')
    list.title = title
  }
  if (typeof patch.color === 'string') list.color = patch.color
  return list
}

function deleteList(state, id) {
  if (state.lists.length <= 1) throw new Error('the last list cannot be deleted')
  const list = state.lists.find(item => item.id === id)
  if (!list) throw new Error(`unknown list: ${id}`)
  const fallback = state.lists.find(item => item.id !== id).id
  for (const task of state.tasks) if (task.listId === id) task.listId = fallback
  state.lists = state.lists.filter(item => item.id !== id)
  return { movedTo: fallback }
}

/* ----------------------------------------------------------------- routes */

function send(res, status, body) {
  const payload = JSON.stringify(body === undefined ? null : body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(isPlainObject(parsed) ? parsed : {})
      } catch {
        reject(new Error('request body must be JSON'))
      }
    })
    req.on('error', reject)
  })
}

function createHandler(store, accountsStore) {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const path = url.pathname.slice(API_PREFIX.length) || '/'
      const method = req.method ?? 'GET'

      if (method === 'GET' && (path === '/state' || path === '/')) return send(res, 200, await store.read())

      if (path === '/accounts' && method === 'GET') {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        return send(res, 200, { accounts: await accountsStore.list() })
      }
      if (path === '/accounts' && method === 'POST') {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        const body = await readJson(req)
        const { account, accounts } = await connectAccount(accountsStore, body)
        return send(res, 200, { account, accounts, state: await store.read() })
      }
      if (method === 'POST' && /^\/accounts\/[^/]+\/sync$/.test(path)) {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        const id = decodeURIComponent(path.slice('/accounts/'.length, -'/sync'.length))
        const result = await syncAccount({ accountsStore, taskStore: store, id })
        return send(res, 200, result)
      }
      if (method === 'PATCH' && /^\/accounts\/[^/]+$/.test(path)) {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        const id = decodeURIComponent(path.slice('/accounts/'.length))
        const body = await readJson(req)
        const { account, accounts } = await updateAccount(accountsStore, id, body)
        return send(res, 200, { account, accounts, state: await store.read() })
      }
      if (method === 'DELETE' && /^\/accounts\/[^/]+$/.test(path)) {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        const id = decodeURIComponent(path.slice('/accounts/'.length))
        await removeAccount(accountsStore, id)
        const { state } = await store.mutate(draft => {
          draft.events = draft.events.filter(event => event.source?.accountId !== id)
          return null
        })
        return send(res, 200, { state })
      }

      if (method === 'POST' && path === '/tasks') {
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => createTask(draft, body))
        return send(res, 200, { state, task: result })
      }
      if (method === 'PATCH' && /^\/tasks\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/tasks/'.length))
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => updateTask(draft, id, body))
        return send(res, 200, { state, task: result })
      }
      if (method === 'DELETE' && /^\/tasks\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/tasks/'.length))
        const { state } = await store.mutate(draft => deleteTask(draft, id))
        return send(res, 200, { state })
      }

      if (method === 'POST' && path === '/events') {
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => createEvent(draft, body))
        return send(res, 200, { state, event: result })
      }
      if (method === 'PATCH' && /^\/events\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/events/'.length))
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => updateEvent(draft, id, body))
        return send(res, 200, { state, event: result })
      }
      if (method === 'DELETE' && /^\/events\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/events/'.length))
        if (accountsStore) {
          const { state } = await deleteEventRemote({ accountsStore, taskStore: store, id })
          return send(res, 200, { state })
        }
        const { state } = await store.mutate(draft => deleteEvent(draft, id))
        return send(res, 200, { state })
      }
      if (method === 'POST' && /^\/events\/[^/]+\/push$/.test(path)) {
        if (!accountsStore) return send(res, 501, { error: 'accounts are not configured' })
        const id = decodeURIComponent(path.slice('/events/'.length, -'/push'.length))
        const body = await readJson(req)
        const result = await pushEvent({
          accountsStore,
          taskStore: store,
          id,
          accountId: body.accountId,
          calendarHref: body.calendarHref,
        })
        return send(res, 200, result)
      }

      if (method === 'POST' && path === '/lists') {
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => createList(draft, body))
        return send(res, 200, { state, list: result })
      }
      if (method === 'PATCH' && /^\/lists\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/lists/'.length))
        const body = await readJson(req)
        const { result, state } = await store.mutate(draft => updateList(draft, id, body))
        return send(res, 200, { state, list: result })
      }
      if (method === 'DELETE' && /^\/lists\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.slice('/lists/'.length))
        const { state } = await store.mutate(draft => deleteList(draft, id))
        return send(res, 200, { state })
      }

      send(res, 404, { error: `no route for ${method} ${path}` })
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : String(error)
      send(res, message.startsWith('unknown') ? 404 : 400, { error: message })
    }
  }
}

/* ------------------------------------------------------------------ tools */

// ToolOutputDefinition.render receives (args, value); the message must come
// from the validated value, never from the arguments.
const textRender = (args, value) => [{
  type: 'text',
  text: typeof value?.message === 'string' ? value.message : JSON.stringify(value),
}]

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['ok', 'message'],
  additionalProperties: false,
}

function taskSummary(task) {
  const due = task.dueAt ? `, до ${task.dueAt}` : ''
  return `• ${task.title}${task.status === 'done' ? ' (готово)' : ''}${due}`
}

function registerTools(ctx, store) {
  const listTool = {
    name: 'tasks_list',
    description: 'List tasks from the shared Task Hub board. Returns open tasks by default; '
      + 'filter by status, list title, or a text query. Use it before updating anything.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Which tasks to return (default open).' },
        list: { type: 'string', description: 'List title to filter by, case-insensitive.' },
        query: { type: 'string', description: 'Substring match against the title.' },
        limit: { type: 'integer', description: 'Maximum rows (default 50, max 200).' },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: textRender },
    execute: async (args, exec) => {
      exec?.signal?.throwIfAborted?.()
      const state = await store.read()
      const status = args?.status === 'done' || args?.status === 'all' ? args.status : 'open'
      const listTitle = typeof args?.list === 'string' ? args.list.toLowerCase() : null
      const query = typeof args?.query === 'string' ? args.query.toLowerCase() : null
      const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200)
      const listById = new Map(state.lists.map(list => [list.id, list]))
      const rows = state.tasks
        .filter(task => status === 'all' || task.status === status)
        .filter(task => !listTitle || (listById.get(task.listId)?.title ?? '').toLowerCase().includes(listTitle))
        .filter(task => !query || task.title.toLowerCase().includes(query))
        .sort((a, b) => (a.dueAt ?? '9999') < (b.dueAt ?? '9999') ? -1 : 1)
        .slice(0, limit)
      const message = rows.length === 0
        ? 'Задач не найдено.'
        : `Задачи (${rows.length}):\n${rows.map(task => `${taskSummary(task)} [${listById.get(task.listId)?.title ?? '?'}]`).join('\n')}`
      return { ok: true, message }
    },
  }

  const createTool = {
    name: 'tasks_create',
    description: 'Create a task on the shared Task Hub board. The user sees it immediately in the left sidebar. '
      + 'Set a due date in ISO 8601 when the user named a deadline; ask nothing and do not invent dates.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Short imperative title.' },
        notes: { type: 'string', description: 'Optional details.' },
        list: { type: 'string', description: 'Existing list title; defaults to the first list.' },
        parentId: { type: 'string', description: 'Parent task id for a subtask, when known.' },
        dueAt: { type: 'string', description: 'ISO 8601 date-time, e.g. 2026-11-18T18:00:00+05:00.' },
        priority: { type: 'integer', enum: PRIORITIES, description: '0 none .. 3 urgent.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Short tags without #.' },
      },
      required: ['title'],
    },
    output: { schema: OUTPUT_SCHEMA, render: textRender },
    execute: async (args, exec) => {
      exec?.signal?.throwIfAborted?.()
      const { result } = await store.mutate(draft => {
        let listId
        if (typeof args?.list === 'string' && args.list.trim()) {
          const wanted = args.list.trim().toLowerCase()
          listId = draft.lists.find(list => list.title.toLowerCase() === wanted)?.id
          if (!listId) {
            const title = args.list.trim().slice(0, 120)
            listId = createList(draft, { title }).id
          }
        }
        return createTask(draft, { ...args, listId })
      })
      const due = result.dueAt ? `, срок ${result.dueAt}` : ''
      return { ok: true, message: `Создана задача «${result.title}» (${result.id})${due}.` }
    },
  }

  const updateTool = {
    name: 'tasks_update',
    description: 'Update one Task Hub task by id: rename, change due date, priority, notes, tags, list, parent, '
      + 'or mark it done/open. Use tasks_list first to get the id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'Task id from tasks_list.' },
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done'] },
        priority: { type: 'integer', enum: PRIORITIES },
        dueAt: { type: 'string', description: 'ISO 8601 date-time, or an empty string to clear it.' },
        list: { type: 'string', description: 'Existing list title.' },
        parentId: { type: 'string', description: 'Parent task id, or an empty string to detach.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
    output: { schema: OUTPUT_SCHEMA, render: textRender },
    execute: async (args, exec) => {
      exec?.signal?.throwIfAborted?.()
      const id = String(args?.id ?? '')
      const { result } = await store.mutate(draft => {
        const patch = { ...args }
        if (typeof args?.list === 'string' && args.list.trim()) {
          const wanted = args.list.trim().toLowerCase()
          const list = draft.lists.find(item => item.title.toLowerCase() === wanted)
          if (!list) throw new Error(`unknown list: ${args.list}`)
          patch.listId = list.id
        }
        if (args?.dueAt === '') patch.dueAt = null
        if (args?.parentId === '') patch.parentId = null
        return updateTask(draft, id, patch)
      })
      return { ok: true, message: `Задача «${result.title}» обновлена (${result.status}${result.dueAt ? `, срок ${result.dueAt}` : ''}).` }
    },
  }

  const agendaTool = {
    name: 'calendar_agenda',
    description: 'Read the Task Hub calendar for a date range: local events, events imported from CalDAV '
      + '(Yandex/Mail.ru) plus tasks whose due date falls inside the range. Defaults to the next 7 days. '
      + 'Provider events are read-only in Task Hub.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'ISO 8601 range start; defaults to now.' },
        to: { type: 'string', description: 'ISO 8601 range end; defaults to from + 7 days.' },
        limit: { type: 'integer', description: 'Maximum rows (default 50, max 200).' },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: textRender },
    execute: async (args, exec) => {
      exec?.signal?.throwIfAborted?.()
      const state = await store.read()
      const fromMs = isIsoDate(args?.from) ? Date.parse(args.from) : Date.now()
      const toMs = isIsoDate(args?.to) ? Date.parse(args.to) : fromMs + 7 * 86400000
      if (toMs <= fromMs) throw new Error('to must be after from')
      const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200)
      const events = state.events
        .filter(event => Date.parse(event.endAt) >= fromMs && Date.parse(event.startAt) <= toMs)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .slice(0, limit)
      const tasks = state.tasks
        .filter(task => task.status === 'open' && task.dueAt
          && Date.parse(task.dueAt) >= fromMs && Date.parse(task.dueAt) <= toMs)
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
        .slice(0, limit)
      if (events.length === 0 && tasks.length === 0) return { ok: true, message: 'В этом диапазоне пусто.' }
      const lines = [
        ...events.map(event => `• ${event.allDay ? 'весь день' : event.startAt.slice(0, 16).replace('T', ' ')} — ${event.title}`),
        ...tasks.map(task => `• ${task.dueAt.slice(0, 16).replace('T', ' ')} — задача «${task.title}»`),
      ]
      return { ok: true, message: `Календарь (${events.length} событий, ${tasks.length} задач):\n${lines.join('\n')}` }
    },
  }

  for (const definition of [listTool, createTool, updateTool, agendaTool]) ctx.tools.register(definition)
}

/* ------------------------------------------------------------------- apply */

export const inject = ['webServer', 'tools']

export function apply(ctx) {
  const store = new TaskStore(storeFile())
  const accountsStore = new AccountsStore(dirname(storeFile()))
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: createHandler(store, accountsStore),
  }))
  registerTools(ctx, store)
}

export { AccountsStore, TaskStore, createEvent, createHandler, createList, createTask, deleteEvent, deleteList, deleteTask, emptyState, normalize, updateEvent, updateList, updateTask }
