/**
 * Client half of dsh-task-hub.
 *
 * M1: lists, a task tree, due dates, tags and an editor, backed by the Host's
 * JSON store over `/dsh-task-hub/api`. Classic browser script registered through
 * the DSH module loader — no build step, no dependency except the host React.
 *
 * Registered extension points:
 *   - `sidebar.panellist` — the "Задачи" row in the left rail;
 *   - `main` keyed by `dsh-task-hub` — the workspace panel it opens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-task-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'dshTaskHub'
    const PANEL_ID = 'dsh-task-hub'
    const API = '/dsh-task-hub/api'
    const PRIORITY_COLORS = ['#C9C9D4', '#4D6BFE', '#F59E0B', '#DC3B3B']

    const EN = {
      title: 'Tasks',
      tabLists: 'Lists',
      tabTree: 'Tree',
      tabCalendar: 'Calendar',
      tabSoon: 'Arrives in M2',
      fAll: 'All',
      fToday: 'Today',
      fUpcoming: 'Upcoming',
      fSomeday: 'Someday',
      fDone: 'Done',
      lists: 'Lists',
      newList: 'New list',
      listPlaceholder: 'List name',
      add: 'Add',
      quickAdd: 'New task…',
      emptyTitle: 'Nothing here',
      emptyHint: 'Add the first task above, or pick another filter.',
      loading: 'Loading…',
      error: 'Could not reach the task store',
      retry: 'Retry',
      refresh: 'Refresh',
      gOverdue: 'Overdue',
      gToday: 'Today',
      gLater: 'Upcoming',
      gNone: 'No date',
      gDone: 'Done',
      editor: 'Task',
      noDue: 'No due date',
      due: 'Due',
      priority: 'Priority',
      tags: 'Tags',
      tagsHint: 'comma separated',
      notes: 'Notes',
      list: 'List',
      parent: 'Parent task',
      subtasks: 'Subtasks',
      addSubtask: 'Add a subtask…',
      save: 'Save',
      saved: 'Saved',
      del: 'Delete',
      close: 'Close',
      p0: 'None',
      p1: 'Low',
      p2: 'Medium',
      p3: 'Urgent',
      countToday: 'today',
      countOverdue: 'overdue',
      doneOf: 'of',
      untitled: 'Untitled',
      confirmDelete: 'Delete this task and its subtasks?',
    }

    const RU = {
      title: 'Задачи',
      tabLists: 'Списки',
      tabTree: 'Дерево',
      tabCalendar: 'Календарь',
      tabSoon: 'Появится в M2',
      fAll: 'Все',
      fToday: 'Сегодня',
      fUpcoming: 'Скоро',
      fSomeday: 'Когда-нибудь',
      fDone: 'Выполнено',
      lists: 'Списки',
      newList: 'Новый список',
      listPlaceholder: 'Название списка',
      add: 'Добавить',
      quickAdd: 'Новая задача…',
      emptyTitle: 'Здесь пусто',
      emptyHint: 'Добавьте первую задачу выше или выберите другой фильтр.',
      loading: 'Загрузка…',
      error: 'Не удалось связаться с хранилищем задач',
      retry: 'Повторить',
      refresh: 'Обновить',
      gOverdue: 'Просрочено',
      gToday: 'Сегодня',
      gLater: 'Скоро',
      gNone: 'Без даты',
      gDone: 'Выполнено',
      editor: 'Задача',
      noDue: 'Без срока',
      due: 'Срок',
      priority: 'Приоритет',
      tags: 'Метки',
      tagsHint: 'через запятую',
      notes: 'Заметки',
      list: 'Список',
      parent: 'Родительская задача',
      subtasks: 'Подзадачи',
      addSubtask: 'Добавить подзадачу…',
      save: 'Сохранить',
      saved: 'Сохранено',
      del: 'Удалить',
      close: 'Закрыть',
      p0: 'Нет',
      p1: 'Низкий',
      p2: 'Средний',
      p3: 'Срочно',
      countToday: 'сегодня',
      countOverdue: 'просрочено',
      doneOf: 'из',
      untitled: 'Без названия',
      confirmDelete: 'Удалить задачу вместе с подзадачами?',
    }

    /* ------------------------------------------------------------- helpers */

    const pad = n => String(n).padStart(2, '0')

    function toLocalInput(iso) {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    function fromLocalInput(value) {
      if (!value) return null
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }

    function sameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    }

    function dayStart(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    }

    function formatDue(iso, t) {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const now = new Date()
      const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
      if (sameDay(d, now)) return `${t('gToday').toLowerCase()}, ${time}`
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      if (sameDay(d, tomorrow)) return `+1 · ${time}`
      const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d)
      return `${date}, ${time}`
    }

    function taskOrder(a, b) {
      const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER
      const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      if (a.priority !== b.priority) return b.priority - a.priority
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    }

    async function api(path, options = {}) {
      const response = await fetch(API + path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      const text = await response.text()
      let payload = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
      return payload
    }

    /* -------------------------------------------------------------- styles */

    const S = {
      page: {
        height: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'var(--dsh-font-family-body, Inter, -apple-system, "Segoe UI", Roboto, sans-serif)',
        fontSize: 13,
        lineHeight: 1.45,
        overflow: 'hidden',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flex: '0 0 auto',
      },
      title: { fontSize: 15.5, fontWeight: 600 },
      tabs: {
        display: 'flex',
        gap: 3,
        marginLeft: 10,
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 9,
        padding: 3,
      },
      tab: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        font: '500 12px/1 inherit',
        padding: '7px 11px',
        borderRadius: 7,
        cursor: 'pointer',
      },
      tabActive: { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontWeight: 600 },
      tabDisabled: { cursor: 'not-allowed', opacity: 0.45 },
      status: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5 },
      linkBtn: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        font: '500 11.5px/1 inherit',
        padding: '7px 10px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      body: { flex: 1, display: 'flex', minHeight: 0 },
      nav: {
        width: 208,
        flex: '0 0 auto',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        padding: '12px 10px',
        overflowY: 'auto',
      },
      navSection: {
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        margin: '14px 8px 6px',
      },
      navItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: '500 12.5px/1 inherit',
        padding: '8px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
      },
      navItemActive: { background: 'var(--dsw-alias-bg-layer-1)', fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l1)' },
      navCount: { marginLeft: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      dot: { width: 9, height: 9, borderRadius: 999, flex: '0 0 auto' },
      listAdd: { display: 'flex', gap: 6, padding: '6px 4px' },
      input: {
        flex: 1,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: '400 12.5px/1.3 inherit',
        padding: '8px 10px',
        borderRadius: 8,
        outline: 'none',
        minWidth: 0,
      },
      main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
      quickAdd: { display: 'flex', gap: 8, padding: '14px 20px 10px' },
      quickInput: {
        flex: 1,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        font: '400 13px/1.4 inherit',
        padding: '10px 12px',
        borderRadius: 10,
        outline: 'none',
      },
      primaryBtn: {
        border: 0,
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        font: '600 12px/1 inherit',
        padding: '10px 14px',
        borderRadius: 9,
        cursor: 'pointer',
      },
      scroll: { flex: 1, overflowY: 'auto', padding: '4px 20px 24px' },
      group: {
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        padding: '16px 0 6px',
      },
      row: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '9px 8px',
        borderRadius: 9,
        cursor: 'pointer',
        border: '1px solid transparent',
      },
      rowSelected: { background: 'var(--dsw-alias-bg-layer-2)', borderColor: 'var(--dsw-alias-border-l1)' },
      checkbox: {
        width: 17,
        height: 17,
        marginTop: 1,
        borderRadius: 999,
        border: '1.5px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        flex: '0 0 auto',
        padding: 0,
        color: '#fff',
        fontSize: 9,
      },
      checkboxDone: { borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)' },
      rowBody: { flex: 1, minWidth: 0 },
      rowTitle: { fontSize: 13, fontWeight: 500, wordBreak: 'break-word' },
      rowTitleDone: { textDecoration: 'line-through', color: 'var(--dsw-alias-label-secondary)', fontWeight: 400 },
      rowMeta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 },
      metaText: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)' },
      dueChip: {
        fontSize: 10.5,
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 999,
        padding: '2px 7px',
      },
      dueOverdue: { color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)' },
      tagChip: {
        fontSize: 10,
        color: 'var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
        borderRadius: 4,
        padding: '1px 6px',
      },
      chevron: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        padding: '2px 0',
        width: 14,
        flex: '0 0 auto',
        fontSize: 10,
        lineHeight: 1,
      },
      empty: { padding: '48px 24px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' },
      emptyTitle: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 4 },
      banner: {
        margin: '10px 20px 0',
        padding: '9px 12px',
        borderRadius: 9,
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent)',
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 12,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      },
      drawer: {
        width: 322,
        flex: '0 0 auto',
        borderLeft: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        padding: '16px 16px 24px',
        overflowY: 'auto',
      },
      drawerHead: { display: 'flex', alignItems: 'center', marginBottom: 10 },
      drawerTitle: { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-secondary)' },
      closeBtn: {
        marginLeft: 'auto',
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 16,
        cursor: 'pointer',
        lineHeight: 1,
      },
      field: { marginBottom: 12 },
      label: { display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 },
      fieldInput: {
        width: '100%',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: '400 12.5px/1.4 inherit',
        padding: '8px 10px',
        borderRadius: 8,
        outline: 'none',
      },
      textarea: { minHeight: 84, resize: 'vertical' },
      row2: { display: 'flex', gap: 8 },
      subtleBtn: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: '500 12px/1 inherit',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      dangerBtn: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        font: '500 12px/1 inherit',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      subRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 },
      muted: { color: 'var(--dsw-alias-label-secondary)' },
    }

    /* ---------------------------------------------------------- components */

    function Checkbox(props) {
      const done = props.done
      return h('button', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': done,
        'aria-label': props.label,
        style: done ? { ...S.checkbox, ...S.checkboxDone } : S.checkbox,
        onClick: event => {
          event.stopPropagation()
          props.onToggle()
        },
      }, done ? '✓' : '')
    }

    function DueChip(props) {
      const overdue = props.overdue
      return h('span', { style: overdue ? { ...S.dueChip, ...S.dueOverdue } : S.dueChip }, props.label)
    }

    function PriorityDot(props) {
      if (!props.priority) return null
      return h('span', {
        title: props.title,
        style: { width: 7, height: 7, borderRadius: 999, background: PRIORITY_COLORS[props.priority], flex: '0 0 auto' },
      })
    }

    function Progress(props) {
      const { done, total } = props
      return h('span', { style: S.metaText }, `${done}/${total}`)
    }

    function TaskRow(props) {
      const { task, t, depth, selected, hasChildren, expanded, onToggleExpand, onSelect, onToggleDone, doneCount, totalCount } = props
      const overdue = task.dueAt && task.status !== 'done' && Date.parse(task.dueAt) < Date.now()
      return h(
        'div',
        {
          style: selected ? { ...S.row, ...S.rowSelected, marginLeft: depth * 18 } : { ...S.row, marginLeft: depth * 18 },
          onClick: () => onSelect(task.id),
          role: 'button',
          tabIndex: 0,
          onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(task.id)
            }
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 2, paddingTop: 1 } },
          hasChildren
            ? h('button', {
              type: 'button',
              style: S.chevron,
              'aria-label': expanded ? 'collapse' : 'expand',
              'aria-expanded': expanded,
              onClick: event => {
                event.stopPropagation()
                onToggleExpand(task.id)
              },
            }, expanded ? '▾' : '▸')
            : h('span', { style: { width: 14, flex: '0 0 auto' } }),
          h(Checkbox, {
            done: task.status === 'done',
            label: task.title,
            onToggle: () => onToggleDone(task),
          }),
        ),
        h(
          'div',
          { style: S.rowBody },
          h('div', { style: task.status === 'done' ? { ...S.rowTitle, ...S.rowTitleDone } : S.rowTitle },
            task.title || t('untitled')),
          h(
            'div',
            { style: S.rowMeta },
            task.dueAt ? h(DueChip, { label: formatDue(task.dueAt, t), overdue }) : null,
            task.priority ? h(PriorityDot, { priority: task.priority, title: t(`p${task.priority}`) }) : null,
            hasChildren ? h(Progress, { done: doneCount, total: totalCount }) : null,
            task.tags.map(tag => h('span', { key: tag, style: S.tagChip }, `#${tag}`)),
          ),
        ),
      )
    }

    function NavItem(props) {
      return h(
        'button',
        {
          type: 'button',
          style: props.active ? { ...S.navItem, ...S.navItemActive } : S.navItem,
          onClick: props.onClick,
          'aria-current': props.active ? 'true' : undefined,
        },
        props.dot ? h('span', { style: { ...S.dot, background: props.dot } }) : null,
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.label),
        props.count ? h('span', { style: S.navCount }, String(props.count)) : null,
      )
    }

    function Drawer(props) {
      const { task, lists, tasks, t, onClose, onSave, onDelete, onCreateSubtask, onToggleTask } = props
      const [title, setTitle] = useState(task.title)
      const [notes, setNotes] = useState(task.notes || '')
      const [due, setDue] = useState(toLocalInput(task.dueAt))
      const [priority, setPriority] = useState(task.priority)
      const [listId, setListId] = useState(task.listId)
      const [tags, setTags] = useState(task.tags.join(', '))
      const [subtask, setSubtask] = useState('')
      const [dirty, setDirty] = useState(false)

      useEffect(() => {
        setTitle(task.title)
        setNotes(task.notes || '')
        setDue(toLocalInput(task.dueAt))
        setPriority(task.priority)
        setListId(task.listId)
        setTags(task.tags.join(', '))
        setDirty(false)
      }, [task.id, task.updatedAt])

      const children = tasks.filter(item => item.parentId === task.id)
      const mark = fn => event => {
        fn(event.target.value)
        setDirty(true)
      }

      return h(
        'aside',
        { style: S.drawer, 'aria-label': t('editor') },
        h(
          'div',
          { style: S.drawerHead },
          h('span', { style: S.drawerTitle }, t('editor')),
          h('button', { type: 'button', style: S.closeBtn, onClick: onClose, 'aria-label': t('close') }, '×'),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('title')),
          h('input', {
            style: S.fieldInput,
            value: title,
            onChange: mark(setTitle),
            onKeyDown: event => {
              if (event.key === 'Enter') onSave({ title, notes, dueAt: fromLocalInput(due), priority, listId, tags })
            },
          }),
        ),
        h(
          'div',
          { style: { ...S.field, ...S.row2 } },
          h(
            'div',
            { style: { flex: 1 } },
            h('label', { style: S.label }, t('due')),
            h('input', { type: 'datetime-local', style: S.fieldInput, value: due, onChange: mark(setDue) }),
          ),
          h(
            'div',
            { style: { width: 108 } },
            h('label', { style: S.label }, t('priority')),
            h(
              'select',
              { style: S.fieldInput, value: priority, onChange: event => { setPriority(Number(event.target.value)); setDirty(true) } },
              [0, 1, 2, 3].map(level => h('option', { key: level, value: level }, t(`p${level}`))),
            ),
          ),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('list')),
          h(
            'select',
            { style: S.fieldInput, value: listId, onChange: event => { setListId(event.target.value); setDirty(true) } },
            lists.map(list => h('option', { key: list.id, value: list.id }, list.title)),
          ),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, `${t('tags')} · ${t('tagsHint')}`),
          h('input', { style: S.fieldInput, value: tags, onChange: mark(setTags) }),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('notes')),
          h('textarea', { style: { ...S.fieldInput, ...S.textarea }, value: notes, onChange: mark(setNotes) }),
        ),
        h(
          'div',
          { style: { ...S.row2, marginBottom: 16 } },
          h('button', {
            type: 'button',
            style: S.primaryBtn,
            onClick: () => onSave({ title, notes, dueAt: fromLocalInput(due), priority, listId, tags }),
          }, dirty ? t('save') : t('saved')),
          h('button', {
            type: 'button',
            style: S.dangerBtn,
            onClick: () => {
              if (window.confirm(t('confirmDelete'))) onDelete(task.id)
            },
          }, t('del')),
        ),
        h('div', { style: S.label }, t('subtasks')),
        children.length === 0
          ? h('div', { style: { ...S.metaText, paddingBottom: 6 } }, '—')
          : children.map(child => h(
            'div',
            { key: child.id, style: S.subRow },
            h(Checkbox, { done: child.status === 'done', label: child.title, onToggle: () => onToggleTask(child) }),
            h('span', {
              style: child.status === 'done' ? { ...S.muted, textDecoration: 'line-through' } : undefined,
            }, child.title),
          )),
        h(
          'div',
          { style: { display: 'flex', gap: 6, marginTop: 8 } },
          h('input', {
            style: S.input,
            placeholder: t('addSubtask'),
            value: subtask,
            onChange: event => setSubtask(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter' && subtask.trim()) {
                onCreateSubtask(task.id, subtask.trim())
                setSubtask('')
              }
            },
          }),
          h('button', {
            type: 'button',
            style: S.subtleBtn,
            onClick: () => {
              if (subtask.trim()) {
                onCreateSubtask(task.id, subtask.trim())
                setSubtask('')
              }
            },
          }, t('add')),
        ),
      )
    }

    function Panel(props) {
      const t = key => props.t?.(key) ?? EN[key] ?? key
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [view, setView] = useState('lists')
      const [filter, setFilter] = useState({ kind: 'smart', id: 'all' })
      const [selectedId, setSelectedId] = useState(null)
      const [expanded, setExpanded] = useState({})
      const [draft, setDraft] = useState('')
      const [addingList, setAddingList] = useState(false)
      const [listName, setListName] = useState('')
      const inputRef = useRef(null)

      const load = useCallback(async () => {
        setBusy(true)
        try {
          setData(await api('/state'))
          setError(null)
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const mutate = useCallback(async (path, method, body) => {
        setBusy(true)
        try {
          const payload = await api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
          if (payload?.state) setData(payload.state)
          setError(null)
          return payload
        } catch (cause) {
          setError(cause.message)
          return null
        } finally {
          setBusy(false)
        }
      }, [])

      const lists = data?.lists ?? []
      const tasks = data?.tasks ?? []
      const listById = useMemo(() => new Map(lists.map(list => [list.id, list])), [lists])
      const byId = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])
      const childrenOf = useMemo(() => {
        const map = new Map()
        for (const task of tasks) {
          if (!task.parentId) continue
          if (!map.has(task.parentId)) map.set(task.parentId, [])
          map.get(task.parentId).push(task)
        }
        return map
      }, [tasks])

      const selected = selectedId ? byId.get(selectedId) ?? null : null

      const isOverdue = task => task.status !== 'done' && task.dueAt && Date.parse(task.dueAt) < dayStart(new Date()).getTime()
      const isToday = task => task.dueAt && sameDay(new Date(task.dueAt), new Date())

      const filterTasks = useMemo(() => {
        const open = tasks.filter(task => task.status === 'open')
        if (filter.kind === 'list') return tasks.filter(task => task.listId === filter.id)
        switch (filter.id) {
          case 'today': return open.filter(task => isToday(task) || isOverdue(task))
          case 'upcoming': return open.filter(task => task.dueAt && Date.parse(task.dueAt) >= dayStart(new Date()).getTime() + 86400000)
          case 'someday': return open.filter(task => !task.dueAt)
          case 'done': return tasks.filter(task => task.status === 'done')
          default: return open
        }
      }, [tasks, filter])

      const visibleIds = useMemo(() => new Set(filterTasks.map(task => task.id)), [filterTasks])

      const counts = useMemo(() => ({
        all: tasks.filter(task => task.status === 'open').length,
        today: tasks.filter(task => task.status === 'open' && (isToday(task) || isOverdue(task))).length,
        done: tasks.filter(task => task.status === 'done').length,
      }), [tasks])

      const groups = useMemo(() => {
        if (view === 'tree') return []
        const now = new Date()
        const overdue = []
        const today = []
        const later = []
        const none = []
        const done = []
        for (const task of filterTasks) {
          if (task.status === 'done') done.push(task)
          else if (!task.dueAt) none.push(task)
          else if (Date.parse(task.dueAt) < dayStart(now).getTime()) overdue.push(task)
          else if (sameDay(new Date(task.dueAt), now)) today.push(task)
          else later.push(task)
        }
        return [
          { key: 'gOverdue', rows: overdue.sort(taskOrder) },
          { key: 'gToday', rows: today.sort(taskOrder) },
          { key: 'gLater', rows: later.sort(taskOrder) },
          { key: 'gNone', rows: none.sort(taskOrder) },
          { key: 'gDone', rows: done.sort(taskOrder) },
        ].filter(group => group.rows.length > 0)
      }, [filterTasks, view])

      const treeRows = useMemo(() => {
        const rows = []
        const walk = (parentId, depth) => {
          const children = (parentId === null ? tasks.filter(task => task.parentId === null) : childrenOf.get(parentId) ?? [])
            .filter(task => visibleIds.has(task.id))
            .sort(taskOrder)
          for (const task of children) {
            const nested = childrenOf.get(task.id) ?? []
            rows.push({ task, depth, hasChildren: nested.length > 0 })
            if (nested.length > 0 && expanded[task.id]) walk(task.id, depth + 1)
          }
        }
        walk(null, 0)
        return rows
      }, [tasks, childrenOf, visibleIds, expanded])

      const addTask = async value => {
        const title = value.trim()
        if (!title) return
        const listId = filter.kind === 'list' ? filter.id : (lists[0]?.id ?? 'inbox')
        await mutate('/tasks', 'POST', { title, listId })
        setDraft('')
        inputRef.current?.focus()
      }

      const toggleDone = async task => {
        await mutate(`/tasks/${task.id}`, 'PATCH', { status: task.status === 'done' ? 'open' : 'done' })
      }

      const saveTask = async patch => {
        if (!selected) return
        await mutate(`/tasks/${selected.id}`, 'PATCH', patch)
      }

      const removeTask = async id => {
        await mutate(`/tasks/${id}`, 'DELETE')
        setSelectedId(null)
      }

      const addSubtask = async (parentId, title) => {
        await mutate('/tasks', 'POST', { title, parentId, listId: selected?.listId ?? lists[0]?.id })
        setExpanded(current => ({ ...current, [parentId]: true }))
      }

      const addList = async () => {
        const title = listName.trim()
        if (!title) return
        await mutate('/lists', 'POST', { title })
        setListName('')
        setAddingList(false)
      }

      const toggleExpand = id => setExpanded(current => ({ ...current, [id]: !current[id] }))

      const progressOf = id => {
        const children = childrenOf.get(id) ?? []
        return { done: children.filter(child => child.status === 'done').length, total: children.length }
      }

      if (!data && !error) {
        return h('div', { style: S.page }, h('div', { style: S.empty }, t('loading')))
      }

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.header },
          h('span', { style: S.title }, t('title')),
          h(
            'div',
            { style: S.tabs, role: 'tablist', 'aria-label': t('title') },
            h('button', {
              type: 'button', role: 'tab', 'aria-selected': view === 'lists',
              style: view === 'lists' ? { ...S.tab, ...S.tabActive } : S.tab,
              onClick: () => setView('lists'),
            }, t('tabLists')),
            h('button', {
              type: 'button', role: 'tab', 'aria-selected': view === 'tree',
              style: view === 'tree' ? { ...S.tab, ...S.tabActive } : S.tab,
              onClick: () => setView('tree'),
            }, t('tabTree')),
            h('button', {
              type: 'button', role: 'tab', 'aria-selected': false, disabled: true,
              title: t('tabSoon'), style: { ...S.tab, ...S.tabDisabled },
            }, t('tabCalendar')),
          ),
          h(
            'span',
            { style: S.status },
            h('span', null, busy ? '· · ·' : `${counts.today} ${t('countToday')}`),
            h('button', { type: 'button', style: S.linkBtn, onClick: load }, t('refresh')),
          ),
        ),
        error
          ? h(
            'div',
            { style: S.banner, role: 'alert' },
            h('span', null, `${t('error')}: ${error}`),
            h('button', { type: 'button', style: S.linkBtn, onClick: load }, t('retry')),
          )
          : null,
        h(
          'div',
          { style: S.body },
          h(
            'nav',
            { style: S.nav },
            h('div', { style: S.navSection }, t('fAll')),
            [
              ['all', 'fAll', counts.all],
              ['today', 'fToday', counts.today],
              ['upcoming', 'fUpcoming', null],
              ['someday', 'fSomeday', null],
              ['done', 'fDone', counts.done],
            ].map(([id, label, count]) => h(NavItem, {
              key: id,
              label: t(label),
              count,
              active: filter.kind === 'smart' && filter.id === id,
              onClick: () => setFilter({ kind: 'smart', id }),
            })),
            h('div', { style: S.navSection }, t('lists')),
            lists.map(list => h(NavItem, {
              key: list.id,
              label: list.title,
              dot: list.color,
              count: tasks.filter(task => task.listId === list.id && task.status === 'open').length,
              active: filter.kind === 'list' && filter.id === list.id,
              onClick: () => setFilter({ kind: 'list', id: list.id }),
            })),
            addingList
              ? h(
                'div',
                { style: S.listAdd },
                h('input', {
                  style: S.input,
                  autoFocus: true,
                  placeholder: t('listPlaceholder'),
                  value: listName,
                  onChange: event => setListName(event.target.value),
                  onKeyDown: event => {
                    if (event.key === 'Enter') addList()
                    if (event.key === 'Escape') { setAddingList(false); setListName('') }
                  },
                  onBlur: () => { if (!listName.trim()) setAddingList(false) },
                }),
                h('button', { type: 'button', style: S.subtleBtn, onMouseDown: event => event.preventDefault(), onClick: addList }, t('add')),
              )
              : h(NavItem, { label: `＋ ${t('newList')}`, onClick: () => setAddingList(true) }),
          ),
          h(
            'div',
            { style: S.main },
            h(
              'div',
              { style: S.quickAdd },
              h('input', {
                ref: inputRef,
                style: S.quickInput,
                placeholder: t('quickAdd'),
                value: draft,
                onChange: event => setDraft(event.target.value),
                onKeyDown: event => {
                  if (event.key === 'Enter') addTask(draft)
                  if (event.key === 'Escape') setDraft('')
                },
              }),
              h('button', { type: 'button', style: S.primaryBtn, onClick: () => addTask(draft) }, t('add')),
            ),
            h(
              'div',
              { style: S.scroll },
              filterTasks.length === 0
                ? h(
                  'div',
                  { style: S.empty },
                  h('div', { style: S.emptyTitle }, t('emptyTitle')),
                  h('div', null, t('emptyHint')),
                )
                : view === 'tree'
                  ? treeRows.map(({ task, depth, hasChildren }) => {
                    const progress = progressOf(task.id)
                    return h(TaskRow, {
                      key: task.id,
                      task,
                      t,
                      depth,
                      selected: selectedId === task.id,
                      hasChildren,
                      expanded: Boolean(expanded[task.id]),
                      onToggleExpand: toggleExpand,
                      onSelect: setSelectedId,
                      onToggleDone: toggleDone,
                      doneCount: progress.done,
                      totalCount: progress.total,
                    })
                  })
                  : groups.map(group => h(
                    'div',
                    { key: group.key },
                    h('div', { style: S.group }, `${t(group.key)} · ${group.rows.length}`),
                    group.rows.map(task => {
                      const children = childrenOf.get(task.id) ?? []
                      const progress = progressOf(task.id)
                      return h(TaskRow, {
                        key: task.id,
                        task,
                        t,
                        depth: 0,
                        selected: selectedId === task.id,
                        hasChildren: children.length > 0,
                        expanded: Boolean(expanded[task.id]),
                        onToggleExpand: toggleExpand,
                        onSelect: setSelectedId,
                        onToggleDone: toggleDone,
                        doneCount: progress.done,
                        totalCount: progress.total,
                      })
                    }),
                  )),
            ),
          ),
          selected
            ? h(Drawer, {
              task: selected,
              lists,
              tasks,
              t,
              onClose: () => setSelectedId(null),
              onSave: saveTask,
              onDelete: removeTask,
              onCreateSubtask: addSubtask,
              onToggleTask: toggleDone,
            })
            : null,
        ),
      )
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 1.9, y: 3.1, width: 14.2, height: 11.8, rx: 2.8, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M4.6 6.9l1.4 1.4L8.4 5.9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M10.6 7.1h2.8M10.6 10.6h2.8M5 10.6h2.8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.locale.register(NS, 'en', EN)
          ctx.locale.register(NS, 'ru', RU)
        } catch (error) {
          console.warn('[dsh-task-hub] locale registration failed', error)
        }
        let translate = null
        try {
          translate = ctx.locale.bind(NS)
        } catch (error) {
          console.warn('[dsh-task-hub] locale bind failed', error)
        }
        const t = (key) => {
          try {
            return translate?.(key) ?? EN[key] ?? key
          } catch {
            return EN[key] ?? key
          }
        }

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Panel),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 15,
            label: () => t('title'),
            locale: NS,
          }, PanelIcon),
        )
      },
    }
  },
})
