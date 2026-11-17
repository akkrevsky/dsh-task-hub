/**
 * Client half of dsh-task-hub — the design from docs/mockups:
 * a left navigation, grouped/tree task rows, a calendar with a right rail
 * (mini-month, connections, upcoming) and an accounts page.
 *
 * Classic browser script registered through the DSH module loader: no build
 * step, no dependency except the host React.
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
    const PROVIDER = {
      yandex: { label: 'Яндекс', letter: 'Я', color: '#FC3F1D' },
      mailru: { label: 'Mail.ru', letter: 'M', color: '#005FF9' },
      caldav: { label: 'CalDAV', letter: 'C', color: '#4D6BFE' },
      google: { label: 'Google', letter: 'G', color: '#4285F4' },
    }

    const EN = {
      title: 'Tasks',
      tabLists: 'Lists',
      tabTree: 'Tree',
      tabCalendar: 'Calendar',
      tabAccounts: 'Accounts',
      newTask: 'New task',
      newTaskTitle: 'New task',
      newEvent: 'New event',
      localOnly: 'local only',
      syncedAt: 'synced',
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
      enterHint: 'Enter',
      emptyTitle: 'Nothing here',
      emptyHint: 'Add the first task below, or pick another filter.',
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
      untitled: 'Untitled',
      confirmDelete: 'Delete this task and its subtasks?',
      calMonth: 'Month',
      calWeek: 'Week',
      calAgenda: 'Agenda',
      calToday: 'Today',
      calEmpty: 'No events in this range',
      ceTitle: 'Event',
      ceAllDay: 'All day',
      ceStart: 'Start',
      ceEnd: 'End',
      ceDate: 'Date',
      ceTask: 'Linked task',
      ceNoTask: 'Not linked',
      ceOpenTask: 'Open task',
      ceDelete: 'Delete event',
      ceSave: 'Save',
      ceFromTask: 'To calendar',
      ceLinked: 'In calendar',
      pushTo: 'Send to calendar',
      pushNow: 'Send',
      pushDone: 'Sent',
      ceImported: 'Imported from a provider — read-only here',
      connections: 'Connections',
      accountsTitle: 'Accounts',
      accountsSub: 'Connect Yandex, Mail.ru or any CalDAV server. Read-only import for now.',
      noAccounts: 'No accounts yet. Add the first one below.',
      addAccount: 'Add account',
      provider: 'Provider',
      login: 'Login / email',
      password: 'App password',
      baseUrl: 'CalDAV URL',
      connect: 'Connect',
      connecting: 'Connecting…',
      syncNow: 'Sync',
      remove: 'Remove',
      lastSync: 'Last sync',
      never: 'never',
      calendarsCount: 'calendars',
      readOnlyCal: 'read-only',
      tasksCal: 'tasks',
      upcoming: 'Upcoming',
      noUpcoming: 'Nothing planned',
      hint: 'Task ↔ event',
      hintText: 'Create an event from a task, or link an existing event to a task.',
      connectLink: 'Connect',
      confirmRemove: 'Remove this account? Imported events will be deleted.',
      hoursShort: 'h',
      mailTitle: 'Mail',
      mailInbox: 'Inbox',
      mailFolders: 'Folders',
      mailNoMail: 'Mail is not connected',
      mailNoMailHint: 'Connect an IMAP mailbox to read messages and turn them into tasks.',
      mailConnect: 'Connect mail',
      mailAccount: 'Account',
      mailProvider: 'Provider',
      mailLogin: 'Login / email',
      mailPassword: 'App password',
      mailHost: 'IMAP host',
      mailConnectBtn: 'Connect',
      mailConnecting: 'Connecting…',
      mailRefresh: 'Refresh',
      mailEmpty: 'No messages',
      mailPick: 'Pick a message',
      mailLoading: 'Loading…',
      mailToTask: 'To task',
      mailTaskCreated: 'Task created',
      mailAttachments: 'Attachments',
      mailFrom: 'From',
      mailNoAccounts: 'Connect an account on the Accounts tab first.',
      mailFailed: 'Mail request failed',
      reply: 'Reply',
      compose: 'Write',
      send: 'Send',
      sending: 'Sending…',
      sent: 'Sent',
      cancel: 'Cancel',
      mailTo: 'To',
      mailSubject: 'Subject',
      confirmSend: 'Send this message?',
      googleConnect: 'Google Calendar',
      googleHint: 'Sign in to Google, then paste the address you were redirected to. The page itself will not open — that is expected.',
      googleGetLink: 'Get sign-in link',
      googleOpen: 'Open Google',
      googlePaste: 'Paste the redirect address',
      googleFinish: 'Finish connection',
    }

    const RU = {
      title: 'Задачи',
      tabLists: 'Списки',
      tabTree: 'Дерево',
      tabCalendar: 'Календарь',
      tabAccounts: 'Аккаунты',
      newTask: 'Новая задача',
      newTaskTitle: 'Новая задача',
      newEvent: 'Новое событие',
      localOnly: 'локально',
      syncedAt: 'синхронизировано',
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
      enterHint: 'Enter',
      emptyTitle: 'Здесь пусто',
      emptyHint: 'Добавьте первую задачу ниже или выберите другой фильтр.',
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
      untitled: 'Без названия',
      confirmDelete: 'Удалить задачу вместе с подзадачами?',
      calMonth: 'Месяц',
      calWeek: 'Неделя',
      calAgenda: 'Повестка',
      calToday: 'Сегодня',
      calEmpty: 'В этом диапазоне событий нет',
      ceTitle: 'Событие',
      ceAllDay: 'Весь день',
      ceStart: 'Начало',
      ceEnd: 'Конец',
      ceDate: 'Дата',
      ceTask: 'Связанная задача',
      ceNoTask: 'Без связи',
      ceOpenTask: 'Открыть задачу',
      ceDelete: 'Удалить событие',
      ceSave: 'Сохранить',
      ceFromTask: 'В календарь',
      ceLinked: 'В календаре',
      pushTo: 'Отправить в календарь',
      pushNow: 'Отправить',
      pushDone: 'Отправлено',
      ceImported: 'Импортировано из провайдера — здесь только чтение',
      connections: 'Подключения',
      accountsTitle: 'Аккаунты',
      accountsSub: 'Подключите Яндекс, Mail.ru или любой CalDAV. Пока только импорт (чтение).',
      noAccounts: 'Пока нет аккаунтов. Добавьте первый ниже.',
      addAccount: 'Добавить аккаунт',
      provider: 'Провайдер',
      login: 'Логин / email',
      password: 'Пароль приложения',
      baseUrl: 'Адрес CalDAV',
      connect: 'Подключить',
      connecting: 'Подключаю…',
      syncNow: 'Синхронизировать',
      remove: 'Удалить',
      lastSync: 'Последняя синхронизация',
      never: 'никогда',
      calendarsCount: 'календарей',
      readOnlyCal: 'только чтение',
      tasksCal: 'задачи',
      upcoming: 'Дальше',
      noUpcoming: 'Ничего не запланировано',
      hint: 'Задача ↔ событие',
      hintText: 'Создайте событие из задачи или привяжите существующее событие к задаче.',
      connectLink: 'Подключить',
      confirmRemove: 'Удалить аккаунт? Импортированные события будут удалены.',
      hoursShort: 'ч',
      mailTitle: 'Почта',
      mailInbox: 'Входящие',
      mailFolders: 'Папки',
      mailNoMail: 'Почта не подключена',
      mailNoMailHint: 'Подключите IMAP-ящик, чтобы читать письма и превращать их в задачи.',
      mailConnect: 'Подключить почту',
      mailAccount: 'Аккаунт',
      mailProvider: 'Провайдер',
      mailLogin: 'Логин / email',
      mailPassword: 'Пароль приложения',
      mailHost: 'IMAP-сервер',
      mailConnectBtn: 'Подключить',
      mailConnecting: 'Подключаю…',
      mailRefresh: 'Обновить',
      mailEmpty: 'Писем нет',
      mailPick: 'Выберите письмо',
      mailLoading: 'Загрузка…',
      mailToTask: 'В задачу',
      mailTaskCreated: 'Задача создана',
      mailAttachments: 'Вложения',
      mailFrom: 'От',
      mailNoAccounts: 'Сначала подключите аккаунт на вкладке «Аккаунты».',
      mailFailed: 'Запрос к почте не удался',
      reply: 'Ответить',
      compose: 'Написать',
      send: 'Отправить',
      sending: 'Отправляю…',
      sent: 'Отправлено',
      cancel: 'Отмена',
      mailTo: 'Кому',
      mailSubject: 'Тема',
      confirmSend: 'Отправить письмо?',
      googleConnect: 'Google Calendar',
      googleHint: 'Войдите в Google, затем вставьте адрес, на который вас перенаправило. Страница по этому адресу не откроется — так и должно быть.',
      googleGetLink: 'Получить ссылку',
      googleOpen: 'Открыть Google',
      googlePaste: 'Вставьте адрес редиректа',
      googleFinish: 'Завершить подключение',
    }

    /* ------------------------------------------------------------- helpers */

    const pad = n => String(n).padStart(2, '0')

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
      return addDays(base, -((base.getDay() + 6) % 7))
    }

    function startOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    function dayKey(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function sameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    }

    function hhmm(iso) {
      const date = new Date(iso)
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function toLocalInput(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function fromLocalInput(value) {
      if (!value) return null
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date.toISOString()
    }

    function formatDue(iso, t) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const now = new Date()
      const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
      if (sameDay(date, now)) return `${t('gToday').toLowerCase()}, ${time}`
      const tomorrow = addDays(now, 1)
      if (sameDay(date, tomorrow)) return `+1 · ${time}`
      return `${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)}, ${time}`
    }

    function humanMonth(date) {
      return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
    }

    function humanDayLong(date) {
      return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
    }

    function taskOrder(a, b) {
      const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER
      const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      if (a.priority !== b.priority) return b.priority - a.priority
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    }

    function eventColor(event) {
      return event.color || 'var(--dsw-alias-brand-primary)'
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
        padding: '11px 20px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flex: '0 0 auto',
      },
      title: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
      tabs: {
        display: 'flex',
        gap: 3,
        marginLeft: 10,
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 10,
        padding: 3,
      },
      tab: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        fontFamily: 'inherit',
        padding: '7px 11px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      tabActive: {
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
        boxShadow: '0 1px 2px rgba(22,22,26,0.08)',
      },
      headerRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
      sync: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      dot: { width: 6, height: 6, borderRadius: 999, background: 'var(--dsw-alias-state-success-primary)' },
      providerChip: {
        width: 18,
        height: 18,
        borderRadius: 5,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        display: 'grid',
        placeItems: 'center',
      },
      primaryBtn: {
        border: 0,
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        lineHeight: 1,
        padding: '10px 14px',
        borderRadius: 9,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      },
      ghostBtn: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: 'inherit',
        lineHeight: 1,
        padding: '8px 11px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      dangerBtn: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: 'inherit',
        lineHeight: 1,
        padding: '8px 11px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      body: { flex: 1, display: 'flex', minHeight: 0 },
      nav: {
        width: 208,
        flex: '0 0 auto',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        padding: '10px 10px 16px',
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
        gap: 9,
        width: '100%',
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5,
        fontWeight: 500,
        fontFamily: 'inherit',
        lineHeight: 1,
        padding: '9px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
      },
      navItemActive: {
        background: 'var(--dsw-alias-bg-layer-1)',
        fontWeight: 600,
        boxShadow: '0 1px 2px rgba(22,22,26,0.06)',
      },
      navCount: { marginLeft: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      navDot: { width: 9, height: 9, borderRadius: 999, flex: '0 0 auto' },
      listAdd: { display: 'flex', gap: 6, padding: '6px 2px' },
      input: {
        flex: 1,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5,
        fontFamily: 'inherit',
        lineHeight: 1.3,
        padding: '8px 10px',
        borderRadius: 8,
        outline: 'none',
        minWidth: 0,
      },
      main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
      scroll: { flex: 1, overflowY: 'auto', padding: '2px 20px 12px' },
      group: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        padding: '16px 4px 6px',
      },
      groupLine: { flex: 1, height: 1, background: '#F0F0F4' },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 8px',
        borderRadius: 9,
        cursor: 'pointer',
        border: '1px solid transparent',
      },
      rowSelected: {
        background: 'var(--dsw-alias-bg-layer-2)',
        borderColor: 'var(--dsw-alias-border-l1)',
      },
      checkbox: {
        width: 17,
        height: 17,
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
      checkboxDone: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
      },
      rowTitle: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      rowTitleDone: { textDecoration: 'line-through', color: 'var(--dsw-alias-label-secondary)', fontWeight: 400 },
      rowSide: { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' },
      dueChip: {
        fontSize: 10.5,
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      },
      dueOverdue: {
        color: 'var(--dsw-alias-state-error-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)',
      },
      tagChip: {
        fontSize: 10,
        color: 'var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
        borderRadius: 4,
        padding: '2px 6px',
      },
      chevron: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        padding: 0,
        width: 12,
        flex: '0 0 auto',
        fontSize: 10,
        lineHeight: 1,
      },
      progress: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)' },
      dock: { padding: '10px 20px 16px', flex: '0 0 auto' },
      dockBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 13,
        padding: '12px 14px',
      },
      dockInput: {
        flex: 1,
        border: 0,
        outline: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5,
        fontFamily: 'inherit',
      },
      dockHint: {
        fontSize: 9.5,
        color: 'var(--dsw-alias-label-secondary)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 4,
        padding: '2px 5px',
      },
      empty: { padding: '56px 24px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' },
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
      drawerTitle: {
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
      },
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
      label: {
        display: 'block',
        fontSize: 10.5,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        marginBottom: 4,
      },
      fieldInput: {
        width: '100%',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5,
        fontFamily: 'inherit',
        lineHeight: 1.4,
        padding: '8px 10px',
        borderRadius: 8,
        outline: 'none',
      },
      textarea: { minHeight: 84, resize: 'vertical' },
      row2: { display: 'flex', gap: 8 },
      // calendar
      calToolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flex: '0 0 auto',
        flexWrap: 'wrap',
      },
      calTitle: { fontSize: 13.5, fontWeight: 600, minWidth: 150 },
      monthHead: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        padding: '0 20px',
        marginTop: 6,
        flex: '0 0 auto',
      },
      monthHeadCell: {
        fontSize: 10.5,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '4px 6px',
      },
      monthScroll: { flex: 1, overflowY: 'auto', padding: '0 20px 20px' },
      monthGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        borderLeft: '1px solid var(--dsw-alias-border-l1)',
      },
      rail: {
        width: 256,
        flex: '0 0 auto',
        borderLeft: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        padding: '14px 16px 20px',
        overflowY: 'auto',
      },
      railSection: {
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        margin: '18px 0 8px',
      },
      railRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 },
      railMuted: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)' },
      railCard: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 10,
        padding: '10px 12px',
        marginTop: 16,
      },
      agendaItem: { display: 'flex', gap: 10, padding: '7px 0' },
      datePill: {
        width: 32,
        flex: '0 0 auto',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-2)',
        textAlign: 'center',
        padding: '3px 0',
      },
      datePillDay: { fontSize: 11.5, fontWeight: 600, lineHeight: 1.1 },
      datePillDow: { fontSize: 8.5, color: 'var(--dsw-alias-label-secondary)' },
      // accounts page
      page: { flex: 1, overflowY: 'auto', padding: '22px 28px 28px' },
      pageTitle: { fontSize: 18, fontWeight: 600, marginBottom: 4 },
      pageSub: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 18, maxWidth: 560 },
      accountCard: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 12,
        maxWidth: 680,
      },
      accountHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
      accountName: { fontSize: 13, fontWeight: 600 },
      accountMeta: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      calRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 },
      formCard: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 14,
        padding: '16px',
        maxWidth: 520,
      },
      formTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
      segmented: { display: 'flex', gap: 3, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 9, padding: 3, marginBottom: 12 },
    }

    /* ---------------------------------------------------------------- icons */

    function Glyph(props) {
      const { name, size = 16, color = 'currentColor' } = props
      const common = { fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
      const paths = {
        all: [
          h('rect', { key: 'r', x: 2.5, y: 4, width: 13, height: 10, rx: 2.5, ...common }),
          h('path', { key: 'p', d: 'M5.5 8.5h7M5.5 11h4.5', ...common }),
        ],
        today: [
          h('circle', { key: 'c', cx: 9, cy: 9, r: 6.2, ...common }),
          h('circle', { key: 'd', cx: 9, cy: 9, r: 1.6, fill: color, stroke: 'none' }),
        ],
        upcoming: [
          h('rect', { key: 'r', x: 2.5, y: 4, width: 13, height: 11, rx: 2.5, ...common }),
          h('path', { key: 'p', d: 'M2.5 7.5h13M6 2.5v3M12 2.5v3', ...common }),
        ],
        someday: [
          h('path', { key: 'p', d: 'M3 5.5h12M3 9h12M3 12.5h7.5', ...common }),
        ],
        done: [
          h('circle', { key: 'c', cx: 9, cy: 9, r: 6.2, ...common }),
          h('path', { key: 'p', d: 'M6 9.2l2 2 4-4.2', ...common }),
        ],
        plus: [h('path', { key: 'p', d: 'M9 3.5v11M3.5 9h11', ...common })],
        chevron: [h('path', { key: 'p', d: 'M6 4.5L11 9l-5 4.5', ...common })],
        calendar: [
          h('rect', { key: 'r', x: 2.5, y: 4, width: 13, height: 11, rx: 2.5, ...common }),
          h('path', { key: 'p', d: 'M2.5 7.5h13', ...common }),
        ],
        link: [h('path', { key: 'p', d: 'M7.5 10.5l3-3M6.5 12.5l-1.5 1.5a2.1 2.1 0 01-3-3L3.5 9.5M11.5 5.5L13 4a2.1 2.1 0 013 3l-1.5 1.5', ...common })],
        mail: [
          h('rect', { key: 'r', x: 2, y: 4, width: 14, height: 10, rx: 2.4, ...common }),
          h('path', { key: 'p', d: 'M2.6 5.4L9 10l6.4-4.6', ...common }),
        ],
      }
      return h('svg', { width: size, height: size, viewBox: '0 0 18 18', 'aria-hidden': true, style: { flex: '0 0 auto' } },
        paths[name] || paths.all)
    }

    /* ----------------------------------------------------------- primitives */

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
      return h('span', { style: props.overdue ? { ...S.dueChip, ...S.dueOverdue } : S.dueChip }, props.label)
    }

    function PriorityDot(props) {
      if (!props.priority) return null
      return h('span', {
        title: props.title,
        style: { width: 7, height: 7, borderRadius: 999, background: PRIORITY_COLORS[props.priority], flex: '0 0 auto' },
      })
    }

    function ProviderBadge(props) {
      const meta = PROVIDER[props.provider] || PROVIDER.caldav
      return h('span', {
        style: { ...S.providerChip, width: props.size || 18, height: props.size || 18, background: meta.color },
        title: meta.label,
      }, meta.letter)
    }

    function NavItem(props) {
      return h('button', {
        type: 'button',
        style: props.active ? { ...S.navItem, ...S.navItemActive } : S.navItem,
        onClick: props.onClick,
        'aria-current': props.active ? 'true' : undefined,
      },
      props.dot
        ? h('span', { style: { ...S.navDot, background: props.dot } })
        : props.icon
          ? h(Glyph, { name: props.icon, size: 16, color: props.active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)' })
          : null,
      h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.label),
      props.count === undefined || props.count === null
        ? null
        : h('span', { style: S.navCount }, String(props.count)))
    }

    function TaskRow(props) {
      const { task, t, depth, selected, hasChildren, expanded, onToggleExpand, onSelect, onToggleDone, doneCount, totalCount } = props
      const overdue = task.dueAt && task.status !== 'done' && Date.parse(task.dueAt) < Date.now()
      return h('div', {
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
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
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
          : h('span', { style: { width: 12, flex: '0 0 auto' } }),
        h(Checkbox, { done: task.status === 'done', label: task.title, onToggle: () => onToggleDone(task) })),
      h('span', { style: task.status === 'done' ? { ...S.rowTitle, ...S.rowTitleDone } : S.rowTitle }, task.title || t('untitled')),
      h('span', { style: S.rowSide },
        hasChildren ? h('span', { style: S.progress }, `${doneCount}/${totalCount}`) : null,
        task.tags.map(tag => h('span', { key: tag, style: S.tagChip }, `#${tag}`)),
        task.dueAt ? h(DueChip, { label: formatDue(task.dueAt, t), overdue }) : null,
        task.priority ? h(PriorityDot, { priority: task.priority, title: t(`p${task.priority}`) }) : null))
    }

    function EventChip(props) {
      const { event, compact, onClick } = props
      const color = eventColor(event)
      return h('div', {
        title: `${hhmm(event.startAt)} ${event.title}`,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: compact ? '2px 4px' : '4px 8px',
          marginBottom: 3,
          borderRadius: 5,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          cursor: 'pointer',
          overflow: 'hidden',
          minWidth: 0,
        },
        onClick: event_ => {
          event_.stopPropagation()
          onClick(event.id)
        },
      },
      h('span', { style: { width: 2.5, alignSelf: 'stretch', minHeight: 12, background: color, borderRadius: 2, flex: '0 0 auto' } }),
      event.allDay ? null : h('span', { style: { fontSize: compact ? 9 : 10, color: 'var(--dsw-alias-label-secondary)' } }, hhmm(event.startAt)),
      h('span', {
        style: {
          fontSize: compact ? 9.5 : 10.5,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }, event.title))
    }

    function TaskChip(props) {
      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px',
          marginBottom: 3,
          fontSize: 9.5,
          borderRadius: 4,
          border: '1px dashed var(--dsw-alias-border-l2)',
          color: 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer',
          overflow: 'hidden',
        },
        title: props.task.title,
        onClick: event => {
          event.stopPropagation()
          props.onClick(props.task.id)
        },
      },
      h('span', { style: { width: 7, height: 7, borderRadius: 2, border: '1px solid var(--dsw-alias-border-l2)', flex: '0 0 auto' } }),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.task.title))
    }

    /* -------------------------------------------------------------- drawers */

    function TaskDrawer(props) {
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
      const mark = setter => event => {
        setter(event.target.value)
        setDirty(true)
      }
      const save = () => onSave({ title, notes, dueAt: fromLocalInput(due), priority, listId, tags })

      return h('aside', { style: S.drawer, 'aria-label': t('editor') },
        h('div', { style: S.drawerHead },
          h('span', { style: S.drawerTitle }, t('editor')),
          h('button', { type: 'button', style: S.closeBtn, onClick: onClose, 'aria-label': t('close') }, '×')),
        h('div', { style: S.field },
          h('label', { style: S.label }, t('title')),
          h('input', {
            style: S.fieldInput,
            value: title,
            onChange: mark(setTitle),
            onKeyDown: event => {
              if (event.key === 'Enter') save()
            },
          })),
        h('div', { style: { ...S.field, ...S.row2 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: S.label }, t('due')),
            h('input', { type: 'datetime-local', style: S.fieldInput, value: due, onChange: mark(setDue) })),
          h('div', { style: { width: 108 } },
            h('label', { style: S.label }, t('priority')),
            h('select', {
              style: S.fieldInput,
              value: priority,
              onChange: event => {
                setPriority(Number(event.target.value))
                setDirty(true)
              },
            }, [0, 1, 2, 3].map(level => h('option', { key: level, value: level }, t(`p${level}`)))))),
        h('div', { style: S.field },
          h('label', { style: S.label }, t('list')),
          h('select', {
            style: S.fieldInput,
            value: listId,
            onChange: event => {
              setListId(event.target.value)
              setDirty(true)
            },
          }, lists.map(list => h('option', { key: list.id, value: list.id }, list.title)))),
        h('div', { style: S.field },
          h('label', { style: S.label }, `${t('tags')} · ${t('tagsHint')}`),
          h('input', { style: S.fieldInput, value: tags, onChange: mark(setTags) })),
        linkedEvent
          ? h('div', { style: { ...S.label, marginBottom: 6 } }, `${t('ceLinked')}: ${hhmm(linkedEvent.startAt)} · ${linkedEvent.title}`)
          : null,
        h('button', { type: 'button', style: { ...S.ghostBtn, marginBottom: 12 }, onClick: () => onToCalendar(task) }, t('ceFromTask')),
        h('div', { style: S.field },
          h('label', { style: S.label }, t('notes')),
          h('textarea', { style: { ...S.fieldInput, ...S.textarea }, value: notes, onChange: mark(setNotes) })),
        h('div', { style: { ...S.row2, marginBottom: 16 } },
          h('button', { type: 'button', style: S.primaryBtn, onClick: save }, dirty ? t('save') : t('saved')),
          h('button', {
            type: 'button',
            style: S.dangerBtn,
            onClick: () => {
              if (window.confirm(t('confirmDelete'))) onDelete(task.id)
            },
          }, t('del'))),
        h('div', { style: S.label }, t('subtasks')),
        children.length === 0
          ? h('div', { style: { ...S.accountMeta, paddingBottom: 6 } }, '—')
          : children.map(child => h('div', { key: child.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 } },
            h(Checkbox, { done: child.status === 'done', label: child.title, onToggle: () => onToggleTask(child) }),
            h('span', { style: child.status === 'done' ? { color: 'var(--dsw-alias-label-secondary)', textDecoration: 'line-through' } : undefined }, child.title))),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
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
            style: S.ghostBtn,
            onClick: () => {
              if (subtask.trim()) {
                onCreateSubtask(task.id, subtask.trim())
                setSubtask('')
              }
            },
          }, t('add'))))
    }

    function EventDrawer(props) {
      const { event, tasks, accounts, t, onClose, onSave, onDelete, onOpenTask, onPush } = props
      const readOnly = Boolean(event.source)
      const targets = (accounts ?? []).flatMap(account => (account.calendars ?? [])
        .filter(calendar => (calendar.components?.length === 0 || calendar.components?.includes('VEVENT')))
        .map(calendar => ({
          value: `${account.id}|${calendar.href}`,
          label: `${(PROVIDER[account.provider] || PROVIDER.caldav).label} · ${calendar.title}`,
        })))
      const [pushTarget, setPushTarget] = useState(targets[0]?.value ?? '')
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

      return h('aside', { style: S.drawer, 'aria-label': t('ceTitle') },
        h('div', { style: S.drawerHead },
          h('span', { style: S.drawerTitle }, t('ceTitle')),
          h('button', { type: 'button', style: S.closeBtn, onClick: onClose, 'aria-label': t('close') }, '×')),
        readOnly
          ? h('div', {
            style: {
              ...S.accountMeta,
              marginBottom: 10,
              padding: '6px 8px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)',
            },
          }, `${event.source.calendarTitle || 'CalDAV'} · ${t('ceImported')}`)
          : null,
        h('div', { style: S.field },
          h('label', { style: S.label }, t('title')),
          h('input', { style: S.fieldInput, value: title, disabled: readOnly, onChange: e => setTitle(e.target.value) })),
        h('div', { style: S.field },
          h('label', { style: S.label }, t('ceDate')),
          h('input', { type: 'date', style: S.fieldInput, value: date, disabled: readOnly, onChange: e => setDate(e.target.value) })),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 10px', cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: allDay, disabled: readOnly, onChange: e => setAllDay(e.target.checked) }),
          h('span', { style: { fontSize: 12.5 } }, t('ceAllDay'))),
        allDay || readOnly
          ? null
          : h('div', { style: { ...S.field, ...S.row2 } },
            h('div', { style: { flex: 1 } },
              h('label', { style: S.label }, t('ceStart')),
              h('input', { type: 'time', style: S.fieldInput, value: start, onChange: e => setStart(e.target.value) })),
            h('div', { style: { flex: 1 } },
              h('label', { style: S.label }, t('ceEnd')),
              h('input', { type: 'time', style: S.fieldInput, value: end, onChange: e => setEnd(e.target.value) }))),
        h('div', { style: S.field },
          h('label', { style: S.label }, t('ceTask')),
          h('select', {
            style: S.fieldInput,
            value: taskId,
            disabled: readOnly,
            onChange: e => setTaskId(e.target.value),
          }, [h('option', { key: '', value: '' }, t('ceNoTask'))].concat(
            tasks.map(task => h('option', { key: task.id, value: task.id }, task.title))))),
        taskId
          ? h('button', { type: 'button', style: { ...S.ghostBtn, marginBottom: 10 }, onClick: () => onOpenTask(taskId) }, t('ceOpenTask'))
          : null,
        h('div', { style: S.field },
          h('label', { style: S.label }, t('notes')),
          h('textarea', { style: { ...S.fieldInput, ...S.textarea }, value: notes, disabled: readOnly, onChange: e => setNotes(e.target.value) })),
        readOnly || targets.length === 0
          ? null
          : h('div', { style: { ...S.field, paddingTop: 4 } },
            h('label', { style: S.label }, t('pushTo')),
            h('select', {
              style: S.fieldInput,
              value: pushTarget,
              onChange: e => setPushTarget(e.target.value),
            }, targets.map(target => h('option', { key: target.value, value: target.value }, target.label))),
            h('button', {
              type: 'button',
              style: { ...S.ghostBtn, marginTop: 8 },
              disabled: !pushTarget,
              onClick: () => onPush(event.id, pushTarget),
            }, t('pushNow'))),
        h('div', { style: { ...S.row2, marginBottom: 12 } },
          readOnly
            ? null
            : h('button', { type: 'button', style: S.primaryBtn, onClick: save }, t('ceSave')),
          h('button', {
            type: 'button',
            style: S.dangerBtn,
            onClick: () => {
              if (window.confirm(t('ceDelete') + '?')) onDelete(event.id)
            },
          }, t('ceDelete'))))
    }

    /* ------------------------------------------------------------- calendar */

    function MiniMonth(props) {
      const { date, onPick, t } = props
      const cells = useMemo(() => {
        const start = startOfWeek(startOfMonth(date))
        return Array.from({ length: 42 }, (_, index) => addDays(start, index))
      }, [date])
      const today = new Date()
      const headers = [0, 1, 2, 3, 4, 5, 6].map(index =>
        new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(addDays(startOfWeek(today), index)))
      return h('div', null,
        h('div', { style: { fontSize: 11.5, fontWeight: 600, marginBottom: 6 } }, humanMonth(date)),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 } },
          headers.map((label, index) => h('div', {
            key: `h${index}`,
            style: { fontSize: 8.5, color: 'var(--dsw-alias-label-secondary)', textAlign: 'center', padding: '2px 0' },
          }, label)),
          cells.map(cell => {
            const isToday = sameDay(cell, today)
            const inMonth = cell.getMonth() === date.getMonth()
            return h('button', {
              key: dayKey(cell) + cell.getMonth(),
              type: 'button',
              onClick: () => onPick(cell),
              style: {
                border: 0,
                background: isToday ? 'var(--dsw-alias-brand-primary)' : 'transparent',
                color: isToday ? '#fff' : inMonth ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                fontSize: 9.5,
                fontFamily: 'inherit',
                width: 24,
                height: 22,
                borderRadius: 999,
                cursor: 'pointer',
              },
            }, String(cell.getDate()))
          })))
    }

    function CalendarPanel(props) {
      const {
        events, tasks, accounts, t, calView, onCalView, anchor, onAnchor,
        onOpenEvent, onNewEvent, onOpenTask, onOpenAccounts, drawer,
      } = props
      const today = new Date()
      const weekScrollRef = useRef(null)

      const monthCells = useMemo(() => {
        const start = startOfWeek(startOfMonth(anchor))
        return Array.from({ length: 42 }, (_, index) => addDays(start, index))
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
        if (calView === 'week' && weekScrollRef.current) weekScrollRef.current.scrollTop = 8 * 44
      }, [calView])

      const shift = direction => {
        if (calView === 'month') onAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1))
        else onAnchor(addDays(anchor, direction * 7))
      }

      const upcoming = useMemo(() => {
        const from = startOfDay(today).getTime()
        return events
          .filter(event => Date.parse(event.endAt) >= from)
          .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
          .slice(0, 4)
      }, [events])

      const rail = h('aside', { style: S.rail },
        h(MiniMonth, { date: anchor, onPick: date => onAnchor(date), t }),
        h('div', { style: S.railSection }, t('connections')),
        accounts.length === 0
          ? h('div', null,
            h('div', { style: S.railMuted }, t('noAccounts')),
            h('button', { type: 'button', style: { ...S.ghostBtn, marginTop: 8 }, onClick: onOpenAccounts }, t('connectLink')))
          : accounts.map(account => h('div', { key: account.id, style: S.railRow },
            h(ProviderBadge, { provider: account.provider, size: 16 }),
            h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, account.username),
            h('span', {
              style: {
                ...S.railMuted,
                color: account.lastSyncAt ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
              },
            }, account.lastSyncAt ? `✓ ${hhmm(account.lastSyncAt)}` : '—'))),
        h('div', { style: S.railSection }, t('upcoming')),
        upcoming.length === 0
          ? h('div', { style: S.railMuted }, t('noUpcoming'))
          : upcoming.map(event => h('div', { key: event.id, style: S.agendaItem },
            h('div', { style: S.datePill },
              h('div', { style: S.datePillDay }, String(new Date(event.startAt).getDate())),
              h('div', { style: S.datePillDow }, new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(event.startAt)))),
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontSize: 11.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, event.title),
              h('div', { style: S.railMuted }, `${event.allDay ? '' : hhmm(event.startAt)}${event.source ? ` · ${event.source.calendarTitle}` : ''}`)))),
        h('div', { style: S.railCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
            h(Glyph, { name: 'link', size: 16, color: 'var(--dsw-alias-brand-primary)' }),
            h('span', { style: { fontSize: 10.5, fontWeight: 600 } }, t('hint'))),
          h('div', { style: S.railMuted }, t('hintText'))))

      const toolbar = h('div', { style: S.calToolbar },
        h('button', { type: 'button', style: S.ghostBtn, onClick: () => shift(-1), 'aria-label': 'previous' }, '‹'),
        h('span', { style: S.calTitle },
          calView === 'week'
            ? `${humanDayLong(weekDays[0])} — ${humanDayLong(weekDays[6])}`
            : calView === 'agenda'
              ? `${humanDayLong(today)} +30`
              : humanMonth(anchor)),
        h('button', { type: 'button', style: S.ghostBtn, onClick: () => shift(1), 'aria-label': 'next' }, '›'),
        h('button', { type: 'button', style: S.ghostBtn, onClick: () => onAnchor(new Date()) }, t('calToday')),
        h('div', { style: { ...S.segmented, marginBottom: 0, marginLeft: 6 } },
          [['month', 'calMonth'], ['week', 'calWeek'], ['agenda', 'calAgenda']].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            style: calView === id ? { ...S.tab, ...S.tabActive } : S.tab,
            onClick: () => onCalView(id),
          }, t(label)))),
        h('button', { type: 'button', style: { ...S.primaryBtn, marginLeft: 'auto' }, onClick: () => onNewEvent(new Date(), 10) },
          h(Glyph, { name: 'plus', size: 14, color: '#fff' }), t('newEvent')))

      let content
      if (calView === 'month') {
        const headers = weekDays.map(day => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day))
        content = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          toolbar,
          h('div', { style: S.monthHead },
            headers.map((label, index) => h('div', { key: index, style: S.monthHeadCell }, label))),
          h('div', { style: S.monthScroll },
            h('div', { style: S.monthGrid },
              monthCells.map(cell => {
                const key = dayKey(cell)
                const dayEvents = eventsByDay.get(key) ?? []
                const dayTasks = tasksByDay.get(key) ?? []
                const isToday = sameDay(cell, today)
                const sameMonth = cell.getMonth() === anchor.getMonth()
                const overflow = Math.max(0, dayEvents.length - 2) + Math.max(0, dayTasks.length - (dayEvents.length >= 2 ? 0 : 1))
                return h('div', {
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
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                  h('span', {
                    style: {
                      fontSize: 11.5,
                      fontWeight: isToday ? 600 : 500,
                      color: isToday ? 'var(--dsw-alias-brand-primary)' : sameMonth ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                    },
                  }, String(cell.getDate())),
                  isToday ? h('span', { style: { fontSize: 9, color: 'var(--dsw-alias-brand-primary)' } }, t('calToday')) : null),
                dayEvents.slice(0, 2).map(event => h(EventChip, { key: event.id, event, compact: true, onClick: onOpenEvent })),
                dayEvents.length < 2
                  ? dayTasks.slice(0, 1).map(task => h(TaskChip, { key: task.id, task, onClick: onOpenTask }))
                  : null,
                overflow > 0
                  ? h('div', { style: { fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 4 } }, `+${overflow}`)
                  : null)
              }))))
      } else if (calView === 'week') {
        const hours = Array.from({ length: 24 }, (_, index) => index)
        content = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          toolbar,
          h('div', { style: { display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
            h('div', { style: { width: 52, flex: '0 0 auto' } }),
            weekDays.map(day => h('div', {
              key: dayKey(day),
              style: {
                flex: 1,
                padding: '6px 4px',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: sameDay(day, today) ? 600 : 500,
                color: sameDay(day, today) ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-primary)',
              },
            }, `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)} ${day.getDate()}`))),
          h('div', { ref: weekScrollRef, style: { flex: 1, overflowY: 'auto', padding: '0 20px 20px' } },
            h('div', { style: { display: 'flex', position: 'relative' } },
              h('div', { style: { width: 52, flex: '0 0 auto' } },
                hours.map(hour => h('div', {
                  key: hour,
                  style: { height: 44, fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right', paddingRight: 6 },
                }, hour === 0 ? '' : `${pad(hour)}:00`))),
              weekDays.map(day => {
                const key = dayKey(day)
                const dayEvents = (eventsByDay.get(key) ?? []).filter(event => !event.allDay)
                return h('div', {
                  key,
                  style: {
                    flex: 1,
                    position: 'relative',
                    borderLeft: '1px solid var(--dsw-alias-border-l1)',
                    background: sameDay(day, today) ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 3%, transparent)' : 'transparent',
                    cursor: 'pointer',
                  },
                  onClick: event => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    const hour = Math.min(23, Math.max(0, Math.floor((event.clientY - rect.top) / 44)))
                    onNewEvent(day, hour)
                  },
                },
                hours.map(hour => h('div', {
                  key: hour,
                  style: { height: 44, borderTop: hour === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1)', opacity: 0.7 },
                })),
                dayEvents.map(event => {
                  const startDate = new Date(event.startAt)
                  const endDate = new Date(event.endAt)
                  const top = (startDate.getHours() + startDate.getMinutes() / 60) * 44
                  const height = Math.max(20, ((endDate - startDate) / 3600000) * 44)
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
                    onClick: event_ => {
                      event_.stopPropagation()
                      onOpenEvent(event.id)
                    },
                  }, `${hhmm(event.startAt)} ${event.title}`)
                }))
              }))))
      } else {
        const agenda = []
        const base = startOfDay(today)
        for (let index = 0; index < 30; index += 1) {
          const day = addDays(base, index)
          const key = dayKey(day)
          const dayEvents = eventsByDay.get(key) ?? []
          const dayTasks = tasksByDay.get(key) ?? []
          if (dayEvents.length > 0 || dayTasks.length > 0) agenda.push({ day, events: dayEvents, tasks: dayTasks })
        }
        content = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          toolbar,
          h('div', { style: { flex: 1, overflowY: 'auto', padding: '6px 20px 24px' } },
            agenda.length === 0
              ? h('div', { style: S.empty }, t('calEmpty'))
              : agenda.map(({ day, events: dayEvents, tasks: dayTasks }) => h('div', { key: dayKey(day) },
                h('div', { style: S.group }, humanDayLong(day), h('div', { style: S.groupLine })),
                dayEvents.map(event => h(EventChip, { key: event.id, event, onClick: onOpenEvent })),
                dayTasks.map(task => h(TaskChip, { key: task.id, task, onClick: onOpenTask }))))))
      }

      return h('div', { style: { display: 'flex', flex: 1, minWidth: 0, minHeight: 0 } },
        h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } }, content),
        drawer || rail)
    }

    /* ------------------------------------------------------------- accounts */

    function AccountsPage(props) {
      const { accounts, form, setForm, error, busy, t, onConnect, onSync, onRemove, onToggleCalendar, onReload } = props
      const [gUrl, setGUrl] = useState('')
      const [gPaste, setGPaste] = useState('')
      const [gBusy, setGBusy] = useState(false)
      const [gError, setGError] = useState(null)

      const startGoogle = async () => {
        setGBusy(true)
        setGError(null)
        try {
          const payload = await api('/google/start', { method: 'POST' })
          setGUrl(payload.url)
          window.open(payload.url, '_blank', 'noopener,noreferrer')
        } catch (cause) {
          setGError(cause.message)
        } finally {
          setGBusy(false)
        }
      }

      const finishGoogle = async () => {
        setGBusy(true)
        setGError(null)
        try {
          await api('/google/finish', { method: 'POST', body: JSON.stringify({ value: gPaste }) })
          setGUrl('')
          setGPaste('')
          onReload?.()
        } catch (cause) {
          setGError(cause.message)
        } finally {
          setGBusy(false)
        }
      }
      return h('div', { style: S.page },
        h('div', { style: S.pageTitle }, t('accountsTitle')),
        h('div', { style: S.pageSub }, t('accountsSub')),
        accounts.length === 0
          ? h('div', { style: { ...S.accountMeta, marginBottom: 16 } }, t('noAccounts'))
          : accounts.map(account => h('div', { key: account.id, style: S.accountCard },
            h('div', { style: S.accountHead },
              h(ProviderBadge, { provider: account.provider, size: 24 }),
              h('div', null,
                h('div', { style: S.accountName }, account.username),
                h('div', { style: S.accountMeta }, `${(PROVIDER[account.provider] || PROVIDER.caldav).label} · ${account.calendars.length} ${t('calendarsCount')} · ${t('lastSync')}: ${account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : t('never')}`))),
            account.calendars.map(calendar => h('label', { key: calendar.href, style: { ...S.calRow, cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: calendar.selected !== false,
                onChange: () => onToggleCalendar(account, calendar),
              }),
              h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, calendar.title),
              h('span', { style: S.accountMeta }, (calendar.components || []).includes('VTODO') ? t('tasksCal') : t('readOnlyCal')))),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
              h('button', { type: 'button', style: S.ghostBtn, disabled: busy, onClick: () => onSync(account.id) }, t('syncNow')),
              h('button', { type: 'button', style: S.dangerBtn, disabled: busy, onClick: () => onRemove(account.id) }, t('remove'))))),
        h('div', { style: S.formCard },
          h('div', { style: S.formTitle }, t('googleConnect')),
          h('div', { style: S.pageSub }, t('googleHint')),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h('button', { type: 'button', style: S.primaryBtn, disabled: gBusy, onClick: startGoogle }, t('googleGetLink')),
            gUrl
              ? h('button', { type: 'button', style: S.ghostBtn, onClick: () => window.open(gUrl, '_blank', 'noopener,noreferrer') }, t('googleOpen'))
              : null),
          gUrl
            ? h('div', { style: { ...S.accountMeta, marginTop: 8, wordBreak: 'break-all' } }, gUrl)
            : null,
          gUrl
            ? h('div', { style: { ...S.field, marginTop: 12 } },
              h('label', { style: S.label }, t('googlePaste')),
              h('textarea', {
                style: { ...S.fieldInput, ...S.textarea, minHeight: 60 },
                value: gPaste,
                onChange: event => setGPaste(event.target.value),
              }),
              h('button', { type: 'button', style: S.primaryBtn, disabled: gBusy || !gPaste.trim(), onClick: finishGoogle },
                gBusy ? t('connecting') : t('googleFinish')))
            : null,
          gError ? h('div', { style: { ...S.accountMeta, color: 'var(--dsw-alias-state-error-primary)', marginTop: 8 } }, gError) : null),
        h('div', { style: S.formCard },
          h('div', { style: S.formTitle }, t('addAccount')),
          h('div', { style: S.segmented },
            [['yandex', 'Yandex'], ['mailru', 'Mail.ru'], ['caldav', 'CalDAV']].map(([id, label]) => h('button', {
              key: id,
              type: 'button',
              style: form.provider === id ? { ...S.tab, ...S.tabActive } : S.tab,
              onClick: () => setForm({ ...form, provider: id }),
            }, label))),
          h('div', { style: S.field },
            h('label', { style: S.label }, t('login')),
            h('input', { style: S.fieldInput, value: form.username, onChange: e => setForm({ ...form, username: e.target.value }) })),
          h('div', { style: S.field },
            h('label', { style: S.label }, t('password')),
            h('input', {
              type: 'password',
              style: S.fieldInput,
              value: form.password,
              onChange: e => setForm({ ...form, password: e.target.value }),
            })),
          form.provider === 'yandex'
            ? null
            : h('div', { style: S.field },
              h('label', { style: S.label }, t('baseUrl')),
              h('input', {
                style: S.fieldInput,
                value: form.baseUrl,
                placeholder: 'https://calendar.mail.ru/…',
                onChange: e => setForm({ ...form, baseUrl: e.target.value }),
              })),
          error ? h('div', { style: { ...S.accountMeta, color: 'var(--dsw-alias-state-error-primary)', marginBottom: 8 } }, error) : null,
          h('button', { type: 'button', style: S.primaryBtn, disabled: busy, onClick: onConnect }, busy ? t('connecting') : t('connect'))))
    }

    /* ----------------------------------------------------------------- panel */

    function Panel(props) {
      const t = key => props.t?.(key) ?? EN[key] ?? key
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [view, setView] = useState('lists')
      const [filter, setFilter] = useState({ kind: 'smart', id: 'all' })
      const [selectedId, setSelectedId] = useState(null)
      const [selectedEventId, setSelectedEventId] = useState(null)
      const [expanded, setExpanded] = useState({})
      const [draft, setDraft] = useState('')
      const [addingList, setAddingList] = useState(false)
      const [listName, setListName] = useState('')
      const [calView, setCalView] = useState('month')
      const [anchor, setAnchor] = useState(new Date())
      const [accounts, setAccounts] = useState([])
      const [accountForm, setAccountForm] = useState({ provider: 'yandex', username: '', password: '', baseUrl: '' })
      const [accountError, setAccountError] = useState(null)
      const [accountBusy, setAccountBusy] = useState(false)
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

      const loadAccounts = useCallback(async () => {
        try {
          const payload = await api('/accounts')
          setAccounts(payload.accounts ?? [])
        } catch (cause) {
          setAccountError(cause.message)
        }
      }, [])

      useEffect(() => {
        load()
        loadAccounts()
      }, [load, loadAccounts])

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

      const isOverdue = task => task.status !== 'done' && task.dueAt && Date.parse(task.dueAt) < startOfDay(new Date()).getTime()
      const isToday = task => task.dueAt && sameDay(new Date(task.dueAt), new Date())

      const filterTasks = useMemo(() => {
        const open = tasks.filter(task => task.status === 'open')
        if (filter.kind === 'list') return tasks.filter(task => task.listId === filter.id)
        switch (filter.id) {
          case 'today': return open.filter(task => isToday(task) || isOverdue(task))
          case 'upcoming': return open.filter(task => task.dueAt && Date.parse(task.dueAt) >= startOfDay(new Date()).getTime() + 86400000)
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
        const buckets = { overdue: [], today: [], later: [], none: [], done: [] }
        for (const task of filterTasks) {
          if (task.status === 'done') buckets.done.push(task)
          else if (!task.dueAt) buckets.none.push(task)
          else if (Date.parse(task.dueAt) < startOfDay(now).getTime()) buckets.overdue.push(task)
          else if (sameDay(new Date(task.dueAt), now)) buckets.today.push(task)
          else buckets.later.push(task)
        }
        return [
          { key: 'gOverdue', rows: buckets.overdue.sort(taskOrder) },
          { key: 'gToday', rows: buckets.today.sort(taskOrder) },
          { key: 'gLater', rows: buckets.later.sort(taskOrder) },
          { key: 'gNone', rows: buckets.none.sort(taskOrder) },
          { key: 'gDone', rows: buckets.done.sort(taskOrder) },
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

      const progressOf = id => {
        const children = childrenOf.get(id) ?? []
        return { done: children.filter(child => child.status === 'done').length, total: children.length }
      }

      const addTask = async value => {
        const title = value.trim()
        if (!title) return
        const listId = filter.kind === 'list' ? filter.id : (lists[0]?.id ?? 'inbox')
        await mutate('/tasks', 'POST', { title, listId })
        setDraft('')
        inputRef.current?.focus()
      }

      const createTaskAndOpen = async () => {
        const listId = filter.kind === 'list' ? filter.id : (lists[0]?.id ?? 'inbox')
        const payload = await mutate('/tasks', 'POST', { title: t('newTaskTitle'), listId })
        if (payload?.task) {
          setView('lists')
          setSelectedEventId(null)
          setSelectedId(payload.task.id)
        }
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
        const payload = await mutate('/events', 'POST', { title: t('newEvent'), startAt: start.toISOString(), endAt: end.toISOString() })
        if (payload?.event) {
          setSelectedId(null)
          setSelectedEventId(payload.event.id)
        }
      }

      const saveEvent = async (id, patch) => mutate(`/events/${id}`, 'PATCH', patch)

      const pushEventToCalendar = async (id, target) => {
        if (!target) return
        const separator = target.indexOf('|')
        const accountId = target.slice(0, separator)
        const calendarHref = target.slice(separator + 1)
        const payload = await mutate(`/events/${id}/push`, 'POST', { accountId, calendarHref })
        if (payload?.event) setSelectedEventId(payload.event.id)
      }

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
        setView('lists')
      }

      const connectAccount = async () => {
        setAccountBusy(true)
        setAccountError(null)
        try {
          const payload = await api('/accounts', { method: 'POST', body: JSON.stringify(accountForm) })
          setAccounts(payload.accounts ?? [])
          if (payload.state) setData(payload.state)
          setAccountForm({ ...accountForm, password: '' })
        } catch (cause) {
          setAccountError(cause.message)
        } finally {
          setAccountBusy(false)
        }
      }

      const syncNow = async id => {
        setAccountBusy(true)
        setAccountError(null)
        try {
          const payload = await api(`/accounts/${id}/sync`, { method: 'POST' })
          if (payload.state) setData(payload.state)
          await loadAccounts()
        } catch (cause) {
          setAccountError(cause.message)
        } finally {
          setAccountBusy(false)
        }
      }

      const removeAccount = async id => {
        if (!window.confirm(t('confirmRemove'))) return
        setAccountBusy(true)
        setAccountError(null)
        try {
          const payload = await api(`/accounts/${id}`, { method: 'DELETE' })
          if (payload.state) setData(payload.state)
          await loadAccounts()
        } catch (cause) {
          setAccountError(cause.message)
        } finally {
          setAccountBusy(false)
        }
      }

      const toggleCalendar = async (account, calendar) => {
        const selectedHrefs = account.calendars
          .filter(item => (item.href === calendar.href ? item.selected === false : item.selected !== false))
          .map(item => item.href)
        try {
          const payload = await api(`/accounts/${account.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ calendars: selectedHrefs }),
          })
          setAccounts(payload.accounts ?? [])
        } catch (cause) {
          setAccountError(cause.message)
        }
      }

      if (!data && !error) {
        return h('div', { style: S.page }, h('div', { style: S.empty }, t('loading')))
      }

      const lastSync = accounts.map(account => account.lastSyncAt).filter(Boolean).sort().pop()
      const providers = [...new Set(accounts.map(account => account.provider))]
      const tabs = [
        ['lists', 'tabLists'],
        ['tree', 'tabTree'],
        ['calendar', 'tabCalendar'],
        ['accounts', 'tabAccounts'],
      ]

      const startReply = () => {
        if (!message) return
        const address = /<([^>]+)>/.exec(message.from || '')?.[1] || (message.from || '').trim()
        setCompose({
          to: address,
          subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
          text: '',
          inReplyTo: message.messageId || undefined,
        })
      }

      const startCompose = () => setCompose({ to: '', subject: '', text: '' })

      const sendMessage = async () => {
        if (!compose) return
        if (!window.confirm(`${t('confirmSend')}\n${t('mailTo')}: ${compose.to}\n${t('mailSubject')}: ${compose.subject}`)) return
        setSending(true)
        setError(null)
        try {
          await api('/mail/send', {
            method: 'POST',
            body: JSON.stringify({
              accountId,
              to: compose.to,
              subject: compose.subject,
              text: compose.text,
              inReplyTo: compose.inReplyTo,
            }),
          })
          setToast(t('sent'))
          setTimeout(() => setToast(null), 3000)
          setCompose(null)
        } catch (cause) {
          setError(cause.message)
        } finally {
          setSending(false)
        }
      }

      const header = h('header', { style: S.header },
        h('span', { style: S.title }, t('title')),
        h('div', { style: S.tabs, role: 'tablist', 'aria-label': t('title') },
          tabs.map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            role: 'tab',
            'aria-selected': view === id,
            style: view === id ? { ...S.tab, ...S.tabActive } : S.tab,
            onClick: () => {
              setView(id)
              if (id !== 'lists' && id !== 'tree') setSelectedId(null)
            },
          }, t(label)))),
        h('div', { style: S.headerRight },
          h('span', { style: S.sync },
            h('span', { style: { ...S.dot, background: lastSync ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)' } }),
            lastSync ? `${t('syncedAt')} ${hhmm(lastSync)}` : t('localOnly')),
          providers.map(provider => h(ProviderBadge, { key: provider, provider, size: 18 })),
          view === 'accounts'
            ? null
            : h('button', {
              type: 'button',
              style: S.primaryBtn,
              onClick: view === 'calendar' ? () => createEventAt(new Date(), 10) : createTaskAndOpen,
            },
            h(Glyph, { name: 'plus', size: 14, color: '#fff' }),
            view === 'calendar' ? t('newEvent') : t('newTask'))))

      const nav = h('nav', { style: S.nav },
        h('div', { style: S.navSection }, t('fAll')),
        [
          ['all', 'fAll', 'all', counts.all],
          ['today', 'fToday', 'today', counts.today],
          ['upcoming', 'fUpcoming', 'upcoming', null],
          ['someday', 'fSomeday', 'someday', null],
          ['done', 'fDone', 'done', counts.done],
        ].map(([id, label, icon, count]) => h(NavItem, {
          key: id,
          label: t(label),
          icon,
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
          ? h('div', { style: S.listAdd },
            h('input', {
              style: S.input,
              autoFocus: true,
              placeholder: t('listPlaceholder'),
              value: listName,
              onChange: event => setListName(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter') addList()
                if (event.key === 'Escape') {
                  setAddingList(false)
                  setListName('')
                }
              },
              onBlur: () => {
                if (!listName.trim()) setAddingList(false)
              },
            }),
            h('button', { type: 'button', style: S.ghostBtn, onMouseDown: event => event.preventDefault(), onClick: addList }, t('add')))
          : h(NavItem, { label: `＋ ${t('newList')}`, icon: 'plus', onClick: () => setAddingList(true) }))

      const taskList = view === 'tree'
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
        : groups.map(group => h('div', { key: group.key },
          h('div', { style: S.group }, `${t(group.key)} · ${group.rows.length}`, h('div', { style: S.groupLine })),
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
          })))

      const errorBanner = error
        ? h('div', { style: S.banner, role: 'alert' },
          h('span', null, `${t('error')}: ${error}`),
          h('button', { type: 'button', style: S.ghostBtn, onClick: load }, t('retry')))
        : null

      const drawer = view === 'calendar'
        ? (selectedEvent
          ? h(EventDrawer, {
            event: selectedEvent,
            tasks,
            accounts,
            t,
            onClose: () => setSelectedEventId(null),
            onSave: saveEvent,
            onDelete: removeEvent,
            onOpenTask: openTaskFromCalendar,
            onPush: pushEventToCalendar,
          })
          : selected
            ? h(TaskDrawer, {
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
            : null)
        : (selected
          ? h(TaskDrawer, {
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
          : null)

      if (view === 'accounts') {
        return h('div', { style: S.page },
          header,
          errorBanner,
          h(AccountsPage, {
            accounts,
            form: accountForm,
            setForm: setAccountForm,
            error: accountError,
            busy: accountBusy,
            t,
            onConnect: connectAccount,
            onSync: syncNow,
            onRemove: removeAccount,
            onToggleCalendar: toggleCalendar,
            onReload: loadAccounts,
          }))
      }

      if (view === 'calendar') {
        return h('div', { style: S.page },
          header,
          errorBanner,
          h('div', { style: S.body },
            h(CalendarPanel, {
              events,
              tasks,
              accounts,
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
              onOpenAccounts: () => setView('accounts'),
              drawer,
            })))
      }

      return h('div', { style: S.page },
        header,
        errorBanner,
        h('div', { style: S.body },
          nav,
          h('div', { style: S.main },
            h('div', { style: S.scroll },
              filterTasks.length === 0
                ? h('div', { style: S.empty },
                  h('div', { style: S.emptyTitle }, t('emptyTitle')),
                  h('div', null, t('emptyHint')))
                : taskList),
            h('div', { style: S.dock },
              h('div', { style: S.dockBox },
                h(Glyph, { name: 'plus', size: 16, color: 'var(--dsw-alias-brand-primary)' }),
                h('input', {
                  ref: inputRef,
                  style: S.dockInput,
                  placeholder: t('quickAdd'),
                  value: draft,
                  onChange: event => setDraft(event.target.value),
                  onKeyDown: event => {
                    if (event.key === 'Enter') addTask(draft)
                    if (event.key === 'Escape') setDraft('')
                  },
                }),
                h('span', { style: S.dockHint }, t('enterHint')))),
          ),
          drawer))
    }


    function MailIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 18 18',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 1.9, y: 3.6, width: 14.2, height: 10.8, rx: 2.6, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M2.6 5.2L9 9.8l6.4-4.6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function MailPanel(props) {
      const t = key => props.t?.(key) ?? EN[key] ?? key
      const [accounts, setAccounts] = useState([])
      const [accountId, setAccountId] = useState('')
      const [folders, setFolders] = useState([])
      const [folder, setFolder] = useState('INBOX')
      const [messages, setMessages] = useState([])
      const [exists, setExists] = useState(0)
      const [selectedUid, setSelectedUid] = useState(null)
      const [message, setMessage] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [toast, setToast] = useState(null)
      const [compose, setCompose] = useState(null)
      const [sending, setSending] = useState(false)
      const [form, setForm] = useState({ provider: 'yandex', username: '', password: '', host: '' })

      const loadAccounts = useCallback(async () => {
        try {
          const payload = await api('/accounts')
          const list = payload.accounts ?? []
          setAccounts(list)
          const withMail = list.find(item => item.mail)
          const target = withMail ?? list[0]
          if (target) {
            setAccountId(current => current || target.id)
            setForm(current => ({ ...current, username: current.username || target.username }))
          }
          setError(null)
        } catch (cause) {
          setError(cause.message)
        }
      }, [])

      useEffect(() => {
        loadAccounts()
      }, [loadAccounts])

      const mailAccount = accounts.find(item => item.id === accountId && item.mail) ?? null

      const loadFolders = useCallback(async id => {
        try {
          const payload = await api(`/mail/folders?accountId=${encodeURIComponent(id)}`)
          const list = payload.folders ?? []
          setFolders(list)
          if (!list.some(item => item.path === 'INBOX')) list.unshift({ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' })
        } catch (cause) {
          setError(cause.message)
        }
      }, [])

      const loadMessages = useCallback(async (id, targetFolder) => {
        setBusy(true)
        try {
          const payload = await api(`/mail/messages?accountId=${encodeURIComponent(id)}&folder=${encodeURIComponent(targetFolder)}&limit=40`)
          setMessages(payload.messages ?? [])
          setExists(payload.exists ?? 0)
          setError(null)
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        if (!mailAccount) return
        loadFolders(mailAccount.id)
        loadMessages(mailAccount.id, folder)
      }, [mailAccount?.id, folder, loadFolders, loadMessages])

      const openMessage = async item => {
        setSelectedUid(item.uid)
        setMessage(null)
        setBusy(true)
        try {
          const payload = await api(`/mail/message?accountId=${encodeURIComponent(accountId)}&folder=${encodeURIComponent(folder)}&uid=${item.uid}`)
          setMessage(payload)
          setError(null)
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy(false)
        }
      }

      const connectMailbox = async () => {
        setBusy(true)
        setError(null)
        try {
          const payload = await api(`/accounts/${encodeURIComponent(accountId)}/mail`, {
            method: 'POST',
            body: JSON.stringify(form),
          })
          setAccounts(payload.accounts ?? [])
          setForm(current => ({ ...current, password: '' }))
          await loadAccounts()
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy(false)
        }
      }

      const toTask = async () => {
        if (!message) return
        const notes = [`${t('mailFrom')}: ${message.from}`, message.date ? new Date(message.date).toLocaleString() : '', '', message.text.slice(0, 2000)]
          .filter(Boolean).join('\n')
        try {
          await api('/tasks', { method: 'POST', body: JSON.stringify({ title: message.subject, notes }) })
          setToast(t('mailTaskCreated'))
          setTimeout(() => setToast(null), 2500)
        } catch (cause) {
          setError(cause.message)
        }
      }

      const startReply = () => {
        if (!message) return
        const address = /<([^>]+)>/.exec(message.from || '')?.[1] || (message.from || '').trim()
        setCompose({
          to: address,
          subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
          text: '',
          inReplyTo: message.messageId || undefined,
        })
      }

      const startCompose = () => setCompose({ to: '', subject: '', text: '' })

      const sendMessage = async () => {
        if (!compose) return
        if (!window.confirm(`${t('confirmSend')}\n${t('mailTo')}: ${compose.to}\n${t('mailSubject')}: ${compose.subject}`)) return
        setSending(true)
        setError(null)
        try {
          await api('/mail/send', {
            method: 'POST',
            body: JSON.stringify({
              accountId,
              to: compose.to,
              subject: compose.subject,
              text: compose.text,
              inReplyTo: compose.inReplyTo,
            }),
          })
          setToast(t('sent'))
          setTimeout(() => setToast(null), 3000)
          setCompose(null)
        } catch (cause) {
          setError(cause.message)
        } finally {
          setSending(false)
        }
      }

      const header = h('header', { style: S.header },
        h('span', { style: S.title }, t('mailTitle')),
        mailAccount
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 } },
            h(Glyph, { name: 'mail', size: 15, color: 'var(--dsw-alias-label-secondary)' }),
            h('select', {
              style: { ...S.fieldInput, width: 'auto', padding: '6px 8px' },
              value: accountId,
              onChange: event => {
                setAccountId(event.target.value)
                setFolder('INBOX')
                setMessage(null)
                setSelectedUid(null)
              },
            }, accounts.filter(item => item.mail).map(item => h('option', { key: item.id, value: item.id }, item.username))))
          : null,
        h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
          toast ? h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-state-success-primary)' } }, toast) : null,
          mailAccount
            ? h('button', { type: 'button', style: S.ghostBtn, onClick: () => loadMessages(mailAccount.id, folder) }, t('mailRefresh'))
            : null,
          mailAccount
            ? h('button', { type: 'button', style: S.primaryBtn, onClick: startCompose }, t('compose'))
            : null))

      if (accounts.length === 0) {
        return h('div', { style: S.page },
          header,
          h('div', { style: S.empty }, t('mailNoAccounts')))
      }

      if (!mailAccount) {
        const candidates = accounts.filter(item => !item.mail)
        return h('div', { style: S.page },
          header,
          error ? h('div', { style: S.banner, role: 'alert' }, error) : null,
          h('div', { style: { ...S.page, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' } },
            h('div', { style: { ...S.formCard, marginTop: 24 } },
              h('div', { style: S.pageTitle }, t('mailNoMail')),
              h('div', { style: S.pageSub }, t('mailNoMailHint')),
              candidates.length
                ? h('div', { style: S.field },
                  h('label', { style: S.label }, t('mailAccount')),
                  h('select', {
                    style: S.fieldInput,
                    value: accountId,
                    onChange: event => {
                      const found = accounts.find(item => item.id === event.target.value)
                      setAccountId(event.target.value)
                      setForm(current => ({ ...current, username: found?.username ?? '', provider: found?.provider ?? 'yandex' }))
                    },
                  }, candidates.map(item => h('option', { key: item.id, value: item.id }, `${item.username} (${(PROVIDER[item.provider] || PROVIDER.caldav).label})`))))
                : h('div', { style: { ...S.accountMeta, marginBottom: 12 } }, t('mailNoAccounts')),
              h('div', { style: S.field },
                h('label', { style: S.label }, t('mailProvider')),
                h('select', {
                  style: S.fieldInput,
                  value: form.provider,
                  onChange: event => setForm({ ...form, provider: event.target.value }),
                }, [['yandex', 'Яндекс'], ['mailru', 'Mail.ru'], ['gmail', 'Gmail'], ['custom', 'Другой IMAP']]
                  .map(([id, label]) => h('option', { key: id, value: id }, label)))),
              h('div', { style: S.field },
                h('label', { style: S.label }, t('mailLogin')),
                h('input', { style: S.fieldInput, value: form.username, onChange: event => setForm({ ...form, username: event.target.value }) })),
              h('div', { style: S.field },
                h('label', { style: S.label }, t('mailPassword')),
                h('input', { type: 'password', style: S.fieldInput, value: form.password, onChange: event => setForm({ ...form, password: event.target.value }) })),
              form.provider === 'custom'
                ? h('div', { style: S.field },
                  h('label', { style: S.label }, t('mailHost')),
                  h('input', { style: S.fieldInput, value: form.host, placeholder: 'imap.example.com', onChange: event => setForm({ ...form, host: event.target.value }) }))
                : null,
              h('button', {
                type: 'button',
                style: S.primaryBtn,
                disabled: busy || !candidates.length,
                onClick: connectMailbox,
              }, busy ? t('mailConnecting') : t('mailConnectBtn')))))
      }

      const folderLabel = path => (path === 'INBOX' ? t('mailInbox') : path)
      const formatWhen = value => {
        if (!value) return ''
        const date = new Date(value)
        return sameDay(date, new Date())
          ? hhmm(value)
          : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
      }

      return h('div', { style: S.page },
        header,
        error ? h('div', { style: S.banner, role: 'alert' }, error) : null,
        h('div', { style: { flex: 1, display: 'flex', minHeight: 0 } },
          h('nav', { style: { ...S.nav, width: 176 } },
            h('div', { style: S.navSection }, t('mailFolders')),
            (folders.length ? folders : [{ path: 'INBOX', name: 'INBOX' }]).map(item => h(NavItem, {
              key: item.path,
              label: folderLabel(item.path),
              icon: item.path === 'INBOX' ? 'today' : 'mail',
              active: folder === item.path,
              onClick: () => {
                setFolder(item.path)
                setMessage(null)
                setSelectedUid(null)
              },
            }))),
          h('div', { style: { width: 340, flex: '0 0 auto', borderRight: '1px solid var(--dsw-alias-border-l1)', overflowY: 'auto' } },
            h('div', { style: { padding: '10px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
              `${exists} · ${folderLabel(folder)}${busy ? ' · …' : ''}`),
            messages.length === 0
              ? h('div', { style: { ...S.empty, padding: '32px 16px' } }, t('mailEmpty'))
              : messages.map(item => h('div', {
                key: item.uid,
                onClick: () => openMessage(item),
                style: {
                  display: 'flex',
                  gap: 9,
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--dsw-alias-border-l1)',
                  cursor: 'pointer',
                  background: selectedUid === item.uid ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                },
              },
              h('span', {
                style: {
                  width: 6,
                  height: 6,
                  marginTop: 6,
                  borderRadius: 999,
                  flex: '0 0 auto',
                  background: item.seen ? 'transparent' : 'var(--dsw-alias-brand-primary)',
                },
              }),
              h('div', { style: { minWidth: 0, flex: 1 } },
                h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
                  h('span', { style: { fontSize: 12, fontWeight: item.seen ? 500 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    item.fromName || item.fromAddress || '—'),
                  h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' } }, formatWhen(item.date))),
                h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  item.subject))))),
          h('div', { style: { flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 22px' } },
            message
              ? h('div', null,
                h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 6 } }, message.subject),
                h('div', { style: { ...S.accountMeta, marginBottom: 4 } }, `${t('mailFrom')}: ${message.from}`),
                h('div', { style: { ...S.accountMeta, marginBottom: 14 } }, message.date ? new Date(message.date).toLocaleString() : ''),
                h('div', { style: { fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, message.text || '—'),
                message.attachments?.length
                  ? h('div', { style: { marginTop: 16 } },
                    h('div', { style: S.label }, t('mailAttachments')),
                    message.attachments.map(item => h('div', { key: item.filename, style: S.railRow },
                      h(Glyph, { name: 'mail', size: 14, color: 'var(--dsw-alias-label-secondary)' }),
                      h('span', null, item.filename),
                      h('span', { style: S.railMuted }, `${Math.round((item.size || 0) / 1024)} КБ`))))
                  : null,
                h('div', { style: { display: 'flex', gap: 8, marginTop: 18 } },
                  h('button', { type: 'button', style: S.primaryBtn, onClick: startReply }, t('reply')),
                  h('button', { type: 'button', style: S.ghostBtn, onClick: toTask }, t('mailToTask'))))
              : h('div', { style: S.empty }, busy ? t('mailLoading') : t('mailPick')),
            compose
              ? h('div', { style: { ...S.formCard, marginTop: 18, maxWidth: 620 } },
                h('div', { style: S.formTitle }, t('compose')),
                h('div', { style: S.field },
                  h('label', { style: S.label }, t('mailTo')),
                  h('input', { style: S.fieldInput, value: compose.to, onChange: e => setCompose({ ...compose, to: e.target.value }) })),
                h('div', { style: S.field },
                  h('label', { style: S.label }, t('mailSubject')),
                  h('input', { style: S.fieldInput, value: compose.subject, onChange: e => setCompose({ ...compose, subject: e.target.value }) })),
                h('div', { style: S.field },
                  h('textarea', {
                    style: { ...S.fieldInput, ...S.textarea, minHeight: 140 },
                    value: compose.text,
                    onChange: e => setCompose({ ...compose, text: e.target.value }),
                  })),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { type: 'button', style: S.primaryBtn, disabled: sending, onClick: sendMessage }, sending ? t('sending') : t('send')),
                  h('button', { type: 'button', style: S.ghostBtn, onClick: () => setCompose(null) }, t('cancel'))))
              : null)))
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 18 18',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 1.9, y: 3.1, width: 14.2, height: 11.8, rx: 2.8, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M4.6 6.9l1.4 1.4L8.4 5.9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M10.6 7.1h2.8M10.6 10.6h2.8M5 10.6h2.8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
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
        const t = key => {
          try {
            return translate?.(key) ?? EN[key] ?? key
          } catch {
            return EN[key] ?? key
          }
        }

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Panel))
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'dsh-task-hub-mail', locale: NS }, MailPanel))
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 15,
            label: () => t('title'),
            locale: NS,
          }, PanelIcon))
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'dsh-task-hub-mail',
            order: 16,
            label: () => t('mailTitle'),
            locale: NS,
          }, MailIcon))
      },
    }
  },
})
