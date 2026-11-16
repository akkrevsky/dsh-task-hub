/**
 * Host half tests: the JSON store, its operations and the HTTP routes.
 * Run with: node tests/store.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  TaskStore,
  apply,
  createEvent,
  createHandler,
  createList,
  createTask,
  deleteEvent,
  deleteList,
  deleteTask,
  updateEvent,
  updateList,
  updateTask,
} from '../index.js'

const dir = await mkdtemp(join(tmpdir(), 'dsh-task-hub-'))
const file = join(dir, 'tasks.json')

function fakeRequest(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  return req
}

async function call(handler, method, url, body) {
  const chunks = []
  const res = {
    status: 0,
    headers: {},
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(payload) {
      if (payload !== undefined && payload !== null) chunks.push(Buffer.from(payload))
    },
  }
  await handler(fakeRequest(method, url, body), res)
  const text = Buffer.concat(chunks).toString('utf8')
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

try {
  // --- seed + create -------------------------------------------------------
  const store = new TaskStore(file)
  const initial = await store.read()
  assert.equal(initial.lists.length >= 1, true, 'store seeds at least one list')
  assert.deepEqual(initial.tasks, [], 'a fresh store has no tasks')

  const created = await store.mutate(draft => createTask(draft, { title: '  First task  ', priority: 2, tags: ['#x', ' y '] }))
  assert.equal(created.result.title, 'First task', 'title is trimmed')
  assert.equal(created.result.priority, 2)
  assert.deepEqual(created.result.tags, ['#x', 'y'], 'tags are trimmed')
  assert.equal(created.state.tasks.length, 1)

  // --- persistence ---------------------------------------------------------
  const reopened = await new TaskStore(file).read()
  assert.equal(reopened.tasks.length, 1, 'state survives a reload')
  assert.equal(reopened.tasks[0].title, 'First task')
  assert.ok(reopened.updatedAt, 'updatedAt is stamped')
  const onDisk = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(onDisk.tasks.length, 1, 'the file itself holds the task')

  // --- update + cascade ----------------------------------------------------
  const parentId = created.result.id
  const child = await store.mutate(draft => createTask(draft, { title: 'Child', parentId }))
  assert.equal(child.result.parentId, parentId)

  const done = await store.mutate(draft => updateTask(draft, parentId, { status: 'done' }))
  assert.equal(done.result.status, 'done')
  assert.equal(done.state.tasks.find(task => task.id === child.result.id).status, 'done',
    'finishing a parent finishes its open children')
  assert.ok(done.result.completedAt, 'completedAt is set')

  const reopenedDone = await store.mutate(draft => updateTask(draft, parentId, { status: 'open' }))
  assert.equal(reopenedDone.result.completedAt, null, 'reopening clears completedAt')

  // --- validation ----------------------------------------------------------
  await assert.rejects(() => store.mutate(draft => createTask(draft, { title: '   ' })), /title is required/)
  await assert.rejects(() => store.mutate(draft => updateTask(draft, 'missing', { title: 'x' })), /unknown task/)
  await assert.rejects(() => store.mutate(draft => updateTask(draft, parentId, { parentId: 'missing' })), /invalid parentId/)
  await assert.rejects(
    () => store.mutate(draft => updateTask(draft, parentId, { parentId: parentId })),
    /invalid parentId/,
    'a task cannot be its own parent',
  )

  // --- delete cascades ------------------------------------------------------
  const deleted = await store.mutate(draft => deleteTask(draft, parentId))
  assert.deepEqual(new Set(deleted.result.deleted), new Set([parentId, child.result.id]))
  assert.equal(deleted.state.tasks.length, 0)

  // --- lists ---------------------------------------------------------------
  const list = await store.mutate(draft => createList(draft, { title: 'Work' }))
  const withTask = await store.mutate(draft => createTask(draft, { title: 'On list', listId: list.result.id }))
  assert.equal(withTask.result.listId, list.result.id)
  const renamed = await store.mutate(draft => updateList(draft, list.result.id, { title: 'Work 2' }))
  assert.equal(renamed.result.title, 'Work 2')
  const removed = await store.mutate(draft => deleteList(draft, list.result.id))
  assert.notEqual(removed.result.movedTo, list.result.id, 'tasks move to a surviving list')
  assert.equal(removed.state.tasks[0].listId, removed.result.movedTo)
  const remaining = (await store.read()).lists
  assert.equal(remaining.length, 2, 'two lists survive')
  const trimmed = await store.mutate(draft => deleteList(draft, remaining[1].id))
  assert.equal(trimmed.state.lists.length, 1)
  await assert.rejects(() => store.mutate(draft => deleteList(draft, draft.lists[0].id)), /last list/)

  // --- events --------------------------------------------------------------
  const eventCreated = await store.mutate(draft => createEvent(draft, {
    title: 'Standup',
    startAt: '2026-11-17T09:00:00+05:00',
    endAt: '2026-11-17T09:30:00+05:00',
  }))
  assert.equal(eventCreated.result.title, 'Standup')
  assert.equal(eventCreated.state.events.length, 1)

  const defaultEnd = await store.mutate(draft => createEvent(draft, { title: 'Call', startAt: '2026-11-17T12:00:00+05:00' }))
  assert.equal(Date.parse(defaultEnd.result.endAt) - Date.parse(defaultEnd.result.startAt), 3600000,
    'a missing end defaults to one hour')

  await assert.rejects(() => store.mutate(draft => createEvent(draft, { title: 'X', startAt: 'nope' })), /ISO date-time/)
  await assert.rejects(
    () => store.mutate(draft => createEvent(draft, { title: 'X', startAt: '2026-11-17T12:00:00Z', endAt: '2026-11-17T11:00:00Z' })),
    /before startAt/,
  )
  await assert.rejects(() => store.mutate(draft => createEvent(draft, { title: '', startAt: '2026-11-17T12:00:00Z' })), /title is required/)
  await assert.rejects(() => store.mutate(draft => updateEvent(draft, 'missing', { title: 'x' })), /unknown event/)

  const linkTarget = (await store.read()).tasks[0].id
  const linked = await store.mutate(draft => updateEvent(draft, eventCreated.result.id, { taskId: linkTarget }))
  assert.equal(linked.result.taskId, linkTarget, 'an event links to a task')

  const moved = await store.mutate(draft => updateEvent(draft, eventCreated.result.id, { startAt: '2026-11-18T10:00:00+05:00' }))
  assert.equal(Date.parse(moved.result.endAt) - Date.parse(moved.result.startAt), 30 * 60000,
    'moving an event keeps its duration')

  const unlinked = await store.mutate(draft => updateEvent(draft, eventCreated.result.id, { taskId: '' }))
  assert.equal(unlinked.result.taskId, null, 'an empty taskId detaches the event')

  await store.mutate(draft => updateEvent(draft, eventCreated.result.id, { taskId: linkTarget }))
  await store.mutate(draft => deleteTask(draft, linkTarget))
  assert.equal((await store.read()).events.find(event => event.id === eventCreated.result.id).taskId, null,
    'deleting a task detaches its events')

  const removedEvent = await store.mutate(draft => deleteEvent(draft, defaultEnd.result.id))
  assert.equal(removedEvent.state.events.length, 1)
  assert.equal(removedEvent.result.deleted, defaultEnd.result.id)

  // --- routes --------------------------------------------------------------
  const handler = createHandler(store)
  const state = await call(handler, 'GET', '/dsh-task-hub/api/state')
  assert.equal(state.status, 200)
  assert.ok(Array.isArray(state.body.tasks), 'state route returns tasks')

  const before = (await store.read()).tasks.length
  const post = await call(handler, 'POST', '/dsh-task-hub/api/tasks', { title: 'From HTTP' })
  assert.equal(post.status, 200)
  const httpTaskId = post.body.task.id
  assert.equal(post.body.state.tasks.length, before + 1, 'POST returns the fresh state')

  const patch = await call(handler, 'PATCH', `/dsh-task-hub/api/tasks/${httpTaskId}`, { status: 'done' })
  assert.equal(patch.status, 200)
  assert.equal(patch.body.task.status, 'done')

  const badBody = await call(handler, 'POST', '/dsh-task-hub/api/tasks', { title: '' })
  assert.equal(badBody.status, 400, 'validation failure is a 400')
  assert.match(badBody.body.error, /title is required/)

  const missing = await call(handler, 'GET', '/dsh-task-hub/api/nope')
  assert.equal(missing.status, 404)

  const del = await call(handler, 'DELETE', `/dsh-task-hub/api/tasks/${httpTaskId}`)
  assert.equal(del.status, 200)
  assert.equal(del.body.state.tasks.length, before, 'DELETE removes exactly the created task')

  const eventPost = await call(handler, 'POST', '/dsh-task-hub/api/events', {
    title: 'From HTTP',
    startAt: '2026-11-20T10:00:00+05:00',
  })
  assert.equal(eventPost.status, 200)
  assert.equal(eventPost.body.event.title, 'From HTTP')
  const eventId = eventPost.body.event.id

  const eventPatch = await call(handler, 'PATCH', `/dsh-task-hub/api/events/${eventId}`, { title: 'Renamed' })
  assert.equal(eventPatch.status, 200)
  assert.equal(eventPatch.body.event.title, 'Renamed')

  const badEvent = await call(handler, 'POST', '/dsh-task-hub/api/events', { title: 'Broken', startAt: 'no' })
  assert.equal(badEvent.status, 400)

  const eventDel = await call(handler, 'DELETE', `/dsh-task-hub/api/events/${eventId}`)
  assert.equal(eventDel.status, 200)
  assert.equal(eventDel.body.state.events.length, 1, 'only the created event is removed')

  // --- tool definitions -----------------------------------------------------
  const definitions = []
  apply({
    effect(fn) {
      fn()
    },
    webServer: { register: () => () => {} },
    tools: {
      register(definition) {
        definitions.push(definition)
      },
    },
  })
  assert.deepEqual(
    definitions.map(definition => definition.name).sort(),
    ['calendar_agenda', 'tasks_create', 'tasks_list', 'tasks_update'],
    'all four tools are registered',
  )
  const agenda = definitions.find(definition => definition.name === 'calendar_agenda')
  assert.deepEqual(agenda.output.render({}, { ok: true, message: 'hello' }), [{ type: 'text', text: 'hello' }],
    'render projects the value message, not the arguments')
  assert.deepEqual(agenda.parameters.required, undefined, 'range arguments stay optional')

  console.log('ok: store, persistence, cascade, events, validation, routes and tools')
} finally {
  await rm(dir, { recursive: true, force: true })
}
