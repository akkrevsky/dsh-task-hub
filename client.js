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
      calMonth: 'Month',
      calWeek: 'Week',
      calAgenda: 'Agenda',
      calToday: 'Today',
      calNew: 'New event',
      calEmpty: 'No events in this range',
      ceTitle: 'Event',
      ceAllDay: 'All day',
      ceStart: 'Start',
      ceEnd: 'End',
      ceDate: 'Date',
      ceTask: 'Linked task',
      ceNoTask: 'Not linked',
      ceOpenTask: 'Open task',
      ceCreateTask: 'Create a task',
      ceDelete: 'Delete event',
      ceSave: 'Save',
      ceMore: '+{n}',
      ceFromTask: 'To calendar',
      ceLinked: 'In calendar',
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
      calMonth: 'Месяц',
      calWeek: 'Неделя',
      calAgenda: 'Повестка',
      calToday: 'Сегодня',
      calNew: 'Новое событие',
      calEmpty: 'В этом диапазоне событий нет',
      ceTitle: 'Событие',
      ceAllDay: 'Весь день',
      ceStart: 'Начало',
      ceEnd: 'Конец',
      ceDate: 'Дата',
      ceTask: 'Связанная задача',
      ceNoTask: 'Без связи',
      ceOpenTask: 'Открыть задачу',
      ceCreateTask: 'Создать задачу',
      ceDelete: 'Удалить событие',
      ceSave: 'Сохранить',
      ceMore: '+{n}',
      ceFromTask: 'В календарь',
      ceLinked: 'В календаре',
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

    function addDays(date, count) {
      const next = new Date(date)
      next.setDate(next.getDate() + count)
      return next
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }

    function startOfWeek(date) {
      const base = startOfDay(date)
      const shift = (base.getDay() + 6) % 7
      return addDays(base, -shift)
    }

    function startOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    function dayKey(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function hhmm(iso) {
      const date = new Date(iso)
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function humanMonth(date) {
      return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
    }

    function humanDayLong(date) {
      return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
    }

    function eventColor(event) {
      return typeof event.color === 'string' && event.color ? event.color : 'var(--dsw-alias-brand-primary)'
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
        fontSize: 12, fontWeight: 500, lineHeight: 1, fontFamily: 'inherit',
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
        fontSize: 11.5, fontWeight: 500, lineHeight: 1, fontFamily: 'inherit',
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
        fontSize: 12.5, fontWeight: 500, lineHeight: 1, fontFamily: 'inherit',
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
        fontSize: 12.5, fontWeight: 400, lineHeight: 1.3, fontFamily: 'inherit',
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
        fontSize: 13, fontWeight: 400, lineHeight: 1.4, fontFamily: 'inherit',
        padding: '10px 12px',
        borderRadius: 10,
        outline: 'none',
      },
      primaryBtn: {
        border: 0,
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        fontSize: 12, fontWeight: 600, lineHeight: 1, fontFamily: 'inherit',
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
        fontSize: 12.5, fontWeight: 400, lineHeight: 1.4, fontFamily: 'inherit',
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
        fontSize: 12, fontWeight: 500, lineHeight: 1, fontFamily: 'inherit',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      dangerBtn: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 12, fontWeight: 500, lineHeight: 1, fontFamily: 'inherit',
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
      const { task, lists, tasks, t, onClose, onSave, onDelete, onCreateSubtask, onToggleTask, linkedEvent, onToCalendar } = props
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
        linkedEvent
          ? h('div', { style: { ...S.metaText, marginBottom: 8 } }, `${t('ceLinked')}: ${hhmm(linkedEvent.startAt)} · ${linkedEvent.title}`)
          : null,
        h('button', {
          type: 'button',
          style: { ...S.subtleBtn, marginBottom: 12 },
          onClick: () => onToCalendar(task),
        }, t('ceFromTask')),
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


    function EventChip(props) {
      const { event, t, compact, onClick } = props
      const color = eventColor(event)
      return h(
        'div',
        {
          title: `${hhmm(event.startAt)} ${event.title}`,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: compact ? '1px 4px' : '3px 7px',
            marginBottom: 2,
            borderRadius: 5,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            cursor: 'pointer',
            overflow: 'hidden',
            minWidth: 0,
          },
          onClick: e => {
            e.stopPropagation()
            onClick(event.id)
          },
        },
        h('span', { style: { width: 2.5, alignSelf: 'stretch', minHeight: 12, background: color, borderRadius: 2, flex: '0 0 auto' } }),
        event.allDay
          ? null
          : h('span', { style: { fontSize: compact ? 9 : 10, color: 'var(--dsw-alias-label-secondary)', flex: '0 0 auto' } }, hhmm(event.startAt)),
        h('span', {
          style: {
            fontSize: compact ? 9.5 : 10.5,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, event.title),
      )
    }

    function TaskChip(props) {
      const { task, onClick } = props
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 4px',
            marginBottom: 2,
            fontSize: 9.5,
            borderRadius: 4,
            border: '1px dashed var(--dsw-alias-border-l2)',
            color: 'var(--dsw-alias-label-secondary)',
            cursor: 'pointer',
            overflow: 'hidden',
          },
          title: task.title,
          onClick: e => {
            e.stopPropagation()
            onClick(task.id)
          },
        },
        h('span', { style: { width: 7, height: 7, borderRadius: 2, border: '1px solid var(--dsw-alias-border-l2)', flex: '0 0 auto' } }),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, task.title),
      )
    }

    function CalendarPanel(props) {
      const { events, tasks, t, calView, onCalView, anchor, onAnchor, onOpenEvent, onNewEvent, onOpenTask } = props
      const today = new Date()
      const weekStartRef = useRef(null)

      const monthCells = useMemo(() => {
        const gridStart = startOfWeek(startOfMonth(anchor))
        return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
      }, [anchor])

      const weekDays = useMemo(() => {
        const start = startOfWeek(anchor)
        return Array.from({ length: 7 }, (_, index) => addDays(start, index))
      }, [anchor])

      const eventsByDay = useMemo(() => {
        const map = new Map()
        for (const event of events) {
          let cursor = startOfDay(new Date(event.startAt))
          const last = startOfDay(new Date(event.endAt))
          let guard = 0
          while (cursor <= last && guard < 14) {
            const key = dayKey(cursor)
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(event)
            cursor = addDays(cursor, 1)
            guard += 1
          }
        }
        for (const list of map.values()) list.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        return map
      }, [events])

      const tasksByDay = useMemo(() => {
        const map = new Map()
        for (const task of tasks) {
          if (!task.dueAt) continue
          const key = dayKey(new Date(task.dueAt))
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(task)
        }
        return map
      }, [tasks])

      useEffect(() => {
        if (calView === 'week' && weekStartRef.current) weekStartRef.current.scrollTop = 8 * 44
      }, [calView])

      const shift = direction => {
        if (calView === 'month') onAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1))
        else onAnchor(addDays(anchor, direction * 7))
      }

      const toolbar = h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderBottom: '1px solid var(--dsw-alias-border-l1)',
            flex: '0 0 auto',
            flexWrap: 'wrap',
          },
        },
        h('button', { type: 'button', style: S.linkBtn, onClick: () => shift(-1), 'aria-label': 'previous' }, '‹'),
        h('span', { style: { fontSize: 13.5, fontWeight: 600, minWidth: 150 } },
          calView === 'week'
            ? `${humanDayLong(weekDays[0])} — ${humanDayLong(weekDays[6])}`
            : calView === 'agenda'
              ? `${humanDayLong(today)} +30`
              : humanMonth(anchor)),
        h('button', { type: 'button', style: S.linkBtn, onClick: () => shift(1), 'aria-label': 'next' }, '›'),
        h('button', { type: 'button', style: S.linkBtn, onClick: () => onAnchor(new Date()) }, t('calToday')),
        h(
          'div',
          { style: { ...S.tabs, marginLeft: 8 } },
          [['month', 'calMonth'], ['week', 'calWeek'], ['agenda', 'calAgenda']].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            style: calView === id ? { ...S.tab, ...S.tabActive } : S.tab,
            onClick: () => onCalView(id),
          }, t(label))),
        ),
        h('button', {
          type: 'button',
          style: { ...S.primaryBtn, marginLeft: 'auto' },
          onClick: () => onNewEvent(anchor, 10),
        }, `＋ ${t('calNew')}`),
      )

      if (calView === 'month') {
        const headers = weekDays.map(day => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day))
        return h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          toolbar,
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', flex: '0 0 auto', padding: '0 20px', marginTop: 6 } },
            headers.map((label, index) => h('div', {
              key: index,
              style: {
                fontSize: 10.5,
                fontWeight: 600,
                color: index >= 5 ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '4px 6px',
              },
            }, label)),
          ),
          h(
            'div',
            { style: { flex: 1, overflowY: 'auto', padding: '0 20px 20px' } },
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderTop: '1px solid var(--dsw-alias-border-l1)', borderLeft: '1px solid var(--dsw-alias-border-l1)' } },
              monthCells.map(cell => {
                const key = dayKey(cell)
                const dayEvents = eventsByDay.get(key) ?? []
                const dayTasks = tasksByDay.get(key) ?? []
                const isToday = sameDay(cell, today)
                const sameMonth = cell.getMonth() === anchor.getMonth()
                const overflow = Math.max(0, dayEvents.length - 2) + Math.max(0, dayTasks.length - (dayEvents.length >= 2 ? 0 : 1))
                return h(
                  'div',
                  {
                    key,
                    style: {
                      minHeight: 104,
                      padding: '6px 6px 4px',
                      borderRight: '1px solid var(--dsw-alias-border-l1)',
                      borderBottom: '1px solid var(--dsw-alias-border-l1)',
                      background: isToday ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                      cursor: 'pointer',
                      overflow: 'hidden',
                    },
                    onClick: () => onNewEvent(cell, 10),
                  },
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                    h('span', {
                      style: {
                        fontSize: 11.5,
                        fontWeight: isToday ? 600 : 500,
                        color: isToday ? 'var(--dsw-alias-brand-primary)' : sameMonth ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                      },
                    }, String(cell.getDate())),
                    isToday ? h('span', { style: { fontSize: 9, color: 'var(--dsw-alias-brand-primary)' } }, t('calToday')) : null,
                  ),
                  dayEvents.slice(0, 2).map(event => h(EventChip, {
                    key: event.id,
                    event,
                    t,
                    compact: true,
                    onClick: onOpenEvent,
                  })),
                  dayEvents.length < 2
                    ? dayTasks.slice(0, 1).map(task => h(TaskChip, { key: task.id, task, onClick: onOpenTask }))
                    : null,
                  overflow > 0
                    ? h('div', { style: { fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 4 } }, `+${overflow}`)
                    : null,
                )
              }),
            ),
          ),
        )
      }

      if (calView === 'week') {
        const hours = Array.from({ length: 24 }, (_, index) => index)
        return h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          toolbar,
          h(
            'div',
            { style: { display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
            h('div', { style: { width: 52, flex: '0 0 auto' } }),
            weekDays.map(day => h('div', {
              key: dayKey(day),
              style: {
                flex: 1,
                padding: '6px 6px',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: sameDay(day, today) ? 600 : 500,
                color: sameDay(day, today) ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-primary)',
              },
            }, `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)} ${day.getDate()}`)),
          ),
          h(
            'div',
            { ref: weekStartRef, style: { flex: 1, overflowY: 'auto', padding: '0 20px 20px' } },
            h(
              'div',
              { style: { display: 'flex', position: 'relative' } },
              h(
                'div',
                { style: { width: 52, flex: '0 0 auto' } },
                hours.map(hour => h('div', {
                  key: hour,
                  style: { height: 44, fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right', paddingRight: 6 },
                }, hour === 0 ? '' : `${pad(hour)}:00`)),
              ),
              weekDays.map(day => {
                const key = dayKey(day)
                const dayEvents = (eventsByDay.get(key) ?? []).filter(event => !event.allDay)
                return h(
                  'div',
                  {
                    key,
                    style: {
                      flex: 1,
                      position: 'relative',
                      borderLeft: '1px solid var(--dsw-alias-border-l1)',
                      background: sameDay(day, today) ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 3%, transparent)' : 'transparent',
                      cursor: 'pointer',
                    },
                    onClick: clickEvent => {
                      const rect = clickEvent.currentTarget.getBoundingClientRect()
                      const hour = Math.min(23, Math.max(0, Math.floor((clickEvent.clientY - rect.top) / 44)))
                      onNewEvent(day, hour)
                    },
                  },
                  hours.map(hour => h('div', {
                    key: hour,
                    style: { height: 44, borderTop: hour === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1)', opacity: 0.7 },
                  })),
                  dayEvents.map(event => {
                    const start = new Date(event.startAt)
                    const end = new Date(event.endAt)
                    const top = (start.getHours() + start.getMinutes() / 60) * 44
                    const height = Math.max(20, ((end - start) / 3600000) * 44)
                    const color = eventColor(event)
                    return h('div', {
                      key: event.id,
                      title: `${hhmm(event.startAt)}–${hhmm(event.endAt)} ${event.title}`,
                      style: {
                        position: 'absolute',
                        left: 2,
                        right: 2,
                        top,
                        height,
                        borderRadius: 4,
                        padding: '2px 4px',
                        background: `color-mix(in srgb, ${color} 16%, transparent)`,
                        borderLeft: `3px solid ${color}`,
                        overflow: 'hidden',
                        fontSize: 9.5,
                        cursor: 'pointer',
                      },
                      onClick: e => {
                        e.stopPropagation()
                        onOpenEvent(event.id)
                      },
                    }, `${hhmm(event.startAt)} ${event.title}`)
                  }),
                )
              }),
            ),
          ),
        )
      }

      const agenda = []
      const base = startOfDay(today)
      for (let index = 0; index < 30; index += 1) {
        const day = addDays(base, index)
        const key = dayKey(day)
        const dayEvents = eventsByDay.get(key) ?? []
        const dayTasks = tasksByDay.get(key) ?? []
        if (dayEvents.length > 0 || dayTasks.length > 0) agenda.push({ day, events: dayEvents, tasks: dayTasks })
      }

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        toolbar,
        h(
          'div',
          { style: { flex: 1, overflowY: 'auto', padding: '8px 20px 24px' } },
          agenda.length === 0
            ? h('div', { style: S.empty }, t('calEmpty'))
            : agenda.map(({ day, events: dayEvents, tasks: dayTasks }) => h(
              'div',
              { key: dayKey(day) },
              h('div', { style: S.group }, humanDayLong(day)),
              dayEvents.map(event => h(EventChip, { key: event.id, event, t, onClick: onOpenEvent })),
              dayTasks.map(task => h(TaskChip, { key: task.id, task, onClick: onOpenTask })),
            )),
        ),
      )
    }

    function EventDrawer(props) {
      const { event, tasks, t, onClose, onSave, onDelete, onOpenTask } = props
      const [title, setTitle] = useState(event.title)
      const [date, setDate] = useState(dayKey(new Date(event.startAt)))
      const [start, setStart] = useState(hhmm(event.startAt))
      const [end, setEnd] = useState(hhmm(event.endAt))
      const [allDay, setAllDay] = useState(event.allDay)
      const [notes, setNotes] = useState(event.notes || '')
      const [taskId, setTaskId] = useState(event.taskId || '')

      useEffect(() => {
        setTitle(event.title)
        setDate(dayKey(new Date(event.startAt)))
        setStart(hhmm(event.startAt))
        setEnd(hhmm(event.endAt))
        setAllDay(event.allDay)
        setNotes(event.notes || '')
        setTaskId(event.taskId || '')
      }, [event.id, event.updatedAt])

      const save = () => {
        const startAt = new Date(`${date}T${allDay ? '00:00' : start}`)
        let endAt = new Date(`${date}T${allDay ? '23:59' : end}`)
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return
        if (endAt <= startAt) endAt = new Date(startAt.getTime() + 3600000)
        onSave(event.id, {
          title,
          notes,
          allDay,
          taskId: taskId || '',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        })
      }

      return h(
        'aside',
        { style: S.drawer, 'aria-label': t('ceTitle') },
        h(
          'div',
          { style: S.drawerHead },
          h('span', { style: S.drawerTitle }, t('ceTitle')),
          h('button', { type: 'button', style: S.closeBtn, onClick: onClose, 'aria-label': t('close') }, '×'),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('title')),
          h('input', { style: S.fieldInput, value: title, onChange: e => setTitle(e.target.value) }),
        ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('ceDate')),
          h('input', { type: 'date', style: S.fieldInput, value: date, onChange: e => setDate(e.target.value) }),
        ),
        h(
          'label',
          { style: { ...S.row, padding: '0 0 10px', cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: allDay, onChange: e => setAllDay(e.target.checked) }),
          h('span', { style: { fontSize: 12.5 } }, t('ceAllDay')),
        ),
        allDay
          ? null
          : h(
            'div',
            { style: { ...S.field, ...S.row2 } },
            h(
              'div',
              { style: { flex: 1 } },
              h('label', { style: S.label }, t('ceStart')),
              h('input', { type: 'time', style: S.fieldInput, value: start, onChange: e => setStart(e.target.value) }),
            ),
            h(
              'div',
              { style: { flex: 1 } },
              h('label', { style: S.label }, t('ceEnd')),
              h('input', { type: 'time', style: S.fieldInput, value: end, onChange: e => setEnd(e.target.value) }),
            ),
          ),
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('ceTask')),
          h(
            'select',
            { style: S.fieldInput, value: taskId, onChange: e => setTaskId(e.target.value) },
            [h('option', { key: '', value: '' }, t('ceNoTask'))].concat(
              tasks.map(task => h('option', { key: task.id, value: task.id }, task.title)),
            ),
          ),
        ),
        taskId
          ? h(
            'button',
            {
              type: 'button',
              style: { ...S.subtleBtn, marginBottom: 10 },
              onClick: () => onOpenTask(taskId),
            },
            t('ceOpenTask'),
          )
          : null,
        h(
          'div',
          { style: S.field },
          h('label', { style: S.label }, t('notes')),
          h('textarea', { style: { ...S.fieldInput, ...S.textarea }, value: notes, onChange: e => setNotes(e.target.value) }),
        ),
        h(
          'div',
          { style: { ...S.row2, marginBottom: 12 } },
          h('button', { type: 'button', style: S.primaryBtn, onClick: save }, t('ceSave')),
          h('button', {
            type: 'button',
            style: S.dangerBtn,
            onClick: () => {
              if (window.confirm(t('ceDelete') + '?')) onDelete(event.id)
            },
          }, t('ceDelete')),
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
      const [calView, setCalView] = useState('month')
      const [anchor, setAnchor] = useState(new Date())
      const [selectedEventId, setSelectedEventId] = useState(null)
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
      const events = data?.events ?? []
      const isCalendar = view === 'calendar'
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
      const selectedEvent = selectedEventId ? events.find(event => event.id === selectedEventId) ?? null : null
      const linkedEvent = selected ? events.find(event => event.taskId === selected.id) ?? null : null

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

      const createEventAt = async (date, hour = 10) => {
        const start = new Date(date)
        start.setHours(hour, 0, 0, 0)
        const end = new Date(start.getTime() + 3600000)
        const payload = await mutate('/events', 'POST', { title: t('calNew'), startAt: start.toISOString(), endAt: end.toISOString() })
        if (payload?.event) {
          setSelectedId(null)
          setSelectedEventId(payload.event.id)
        }
      }

      const saveEvent = async (id, patch) => mutate(`/events/${id}`, 'PATCH', patch)

      const removeEvent = async id => {
        await mutate(`/events/${id}`, 'DELETE')
        setSelectedEventId(null)
      }

      const taskToCalendar = async task => {
        const start = task.dueAt ? new Date(task.dueAt) : new Date(Date.now() + 3600000)
        const end = new Date(start.getTime() + 3600000)
        await mutate('/events', 'POST', {
          title: task.title,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          taskId: task.id,
        })
      }

      const openTaskFromCalendar = id => {
        setSelectedEventId(null)
        setSelectedId(id)
      }

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
              type: 'button', role: 'tab', 'aria-selected': view === 'calendar',
              style: view === 'calendar' ? { ...S.tab, ...S.tabActive } : S.tab,
              onClick: () => setView('calendar'),
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
          isCalendar
            ? null
            : h(
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
            isCalendar
              ? h(CalendarPanel, {
                events,
                tasks,
                lists,
                t,
                calView,
                onCalView: setCalView,
                anchor,
                onAnchor: setAnchor,
                onOpenEvent: id => {
                  setSelectedId(null)
                  setSelectedEventId(id)
                },
                onNewEvent: createEventAt,
                onOpenTask: openTaskFromCalendar,
              })
              : null,
            isCalendar
              ? null
              : h(
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
            isCalendar
              ? null
              : h(
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
          selectedEvent
            ? h(EventDrawer, {
              event: selectedEvent,
              tasks,
              t,
              onClose: () => setSelectedEventId(null),
              onSave: saveEvent,
              onDelete: removeEvent,
              onOpenTask: openTaskFromCalendar,
            })
            : selected
            ? h(Drawer, {
              task: selected,
              lists,
              tasks,
              t,
              linkedEvent,
              onToCalendar: taskToCalendar,
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
