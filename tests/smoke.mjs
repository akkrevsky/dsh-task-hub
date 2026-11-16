/**
 * Smoke test for the M0 Client half: no browser, no DSH host.
 *
 * It stubs the module loader, React and the Client context, runs the bundle's
 * apply() and asserts the two extension points it is supposed to register. It
 * also renders the panel once, so a broken component fails here rather than in
 * the sidebar.
 *
 * Run with: node tests/smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

let loaded = null
const fakeWindow = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
}

// Minimal React surface: the bundle only needs createElement.
const React = {
  createElement(type, props, ...children) {
    const resolved = children.length > 1 ? children : children[0]
    return { type, props: props ?? {}, children: resolved }
  },
}

const registrations = []
const dictionaries = {}

const ctx = {
  locale: {
    register(ns, locale, dict) {
      dictionaries[locale] = { ...(dictionaries[locale] ?? {}), ...dict }
      return () => {}
    },
    bind(ns) {
      return key => dictionaries.ru?.[key] ?? dictionaries.en?.[key] ?? key
    },
  },
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

// eslint-disable-next-line no-new-func
new Function('window', source)(fakeWindow)

assert.ok(loaded, 'client.js must register a module through window.__ModuleLoader__')
assert.equal(loaded.id, 'dsh-task-hub', 'module id must equal the package name')

const plugin = loaded.factory(name => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
})

for (const service of ['slots', 'locale']) {
  assert.ok(plugin.inject.includes(service), `apply() must inject ${service}`)
}

plugin.apply(ctx)

const main = registrations.find(r => r.options.name === 'main')
const rail = registrations.find(r => r.options.name === 'sidebar.panellist')
assert.ok(main, 'must register a main panel')
assert.equal(main.options.key, 'dsh-task-hub', 'panel key must equal the rail entry id')
assert.ok(rail, 'must register a sidebar.panellist entry')
assert.equal(rail.options.id, 'dsh-task-hub')
assert.equal(typeof rail.options.order, 'number')
assert.equal(rail.options.label(), 'Задачи', 'label comes from the ru dictionary')

// Both halves of the rail entry must render without throwing.
const panel = main.component({ t: key => dictionaries.ru[key] ?? key })
assert.ok(panel, 'panel component must render')
const icon = rail.component({ size: 18, active: true })
assert.ok(icon, 'rail icon must render')

console.log(
  `ok: ${registrations.length} registrations, panel key "${main.options.key}", `
  + `locales ${Object.keys(dictionaries).join('/')}`,
)
