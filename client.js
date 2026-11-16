/**
 * Client half of dsh-task-hub — a classic browser script registered through the
 * DSH module loader. No build step, no runtime dependency except the React the
 * loader already provides.
 *
 * M0 registers two extension points and nothing else:
 *   - `sidebar.panellist` — the "Задачи" row in the left rail;
 *   - `main` keyed by `dsh-task-hub` — the workspace panel it opens.
 * Data, views and provider sync arrive in M1+.
 */
window.__ModuleLoader__.load({
  id: 'dsh-task-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dshTaskHub'
    const PANEL_ID = 'dsh-task-hub'

    const EN = {
      title: 'Tasks',
      pill: 'M0 · scaffold',
      tabLists: 'Lists',
      tabTree: 'Tree',
      tabCalendar: 'Calendar',
      tabHint: 'Arrives in M1',
      offline: 'Local only · no sync yet',
      emptyTitle: 'Panel is wired up',
      emptyText:
        'The left-rail entry and this workspace are registered through the DSH slot system. '
        + 'Task lists and the tree are the next step (M1); calendars and mail follow.',
      statusTitle: 'Status',
      stMain: 'Slot main → panel',
      stRail: 'Slot sidebar.panellist → rail entry',
      stStore: 'Task store (M1)',
      stCalendar: 'Calendars: Google / Yandex / Mail.ru (M2–M4)',
      stMail: 'Mail: Gmail / Yandex / Mail.ru (M5)',
      stateReady: 'ready',
      statePlanned: 'planned',
      docs: 'Plan and mockups live in the repository under docs/.',
    }

    const RU = {
      title: 'Задачи',
      pill: 'M0 · каркас',
      tabLists: 'Списки',
      tabTree: 'Дерево',
      tabCalendar: 'Календарь',
      tabHint: 'Появится в M1',
      offline: 'Локально · синхронизации пока нет',
      emptyTitle: 'Панель подключена',
      emptyText:
        'Запись в левой навигации и эта панель зарегистрированы штатными слотами DSH. '
        + 'Следующий шаг — локальные списки и дерево (M1), затем календари и почта.',
      statusTitle: 'Состояние',
      stMain: 'Слот main → панель',
      stRail: 'Слот sidebar.panellist → запись в навигации',
      stStore: 'Хранилище задач (M1)',
      stCalendar: 'Календари: Google / Яндекс / Mail.ru (M2–M4)',
      stMail: 'Почта: Gmail / Яндекс / Mail.ru (M5)',
      stateReady: 'готово',
      statePlanned: 'в плане',
      docs: 'План и макеты лежат в репозитории в docs/.',
    }

    const S = {
      page: {
        height: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily:
          'var(--dsh-font-family-body, Inter, -apple-system, "Segoe UI", Roboto, sans-serif)',
        fontSize: 14,
        lineHeight: 1.5,
      },
      bar: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 24px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flexWrap: 'wrap',
      },
      title: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
      pill: {
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
        borderRadius: 999,
        padding: '3px 8px',
      },
      tabs: {
        display: 'flex',
        gap: 4,
        marginLeft: 12,
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 10,
        padding: 3,
      },
      tab: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        font: '500 12.5px/1 inherit',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'not-allowed',
        opacity: 0.55,
      },
      tabActive: {
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
      },
      offline: {
        marginLeft: 'auto',
        fontSize: 11.5,
        color: 'var(--dsw-alias-label-secondary)',
      },
      body: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      },
      card: {
        width: '100%',
        maxWidth: 560,
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 16,
        padding: '28px 28px 22px',
      },
      glyph: {
        width: 40,
        height: 40,
        borderRadius: 12,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
        marginBottom: 14,
      },
      emptyTitle: { fontSize: 15.5, fontWeight: 600, marginBottom: 6 },
      emptyText: {
        fontSize: 13,
        color: 'var(--dsw-alias-label-secondary)',
        marginBottom: 18,
      },
      statusTitle: {
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        margin: '18px 0 8px',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 12.5,
      },
      dotOk: {
        width: 16,
        height: 16,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        fontSize: 9,
        color: '#fff',
        background: 'var(--dsw-alias-state-success-primary)',
        flex: '0 0 auto',
      },
      dotPlanned: {
        width: 16,
        height: 16,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        fontSize: 9,
        color: 'var(--dsw-alias-label-secondary)',
        border: '1px solid var(--dsw-alias-border-l2)',
        flex: '0 0 auto',
      },
      state: { marginLeft: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      docs: { marginTop: 16, fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
    }

    function Glyph(props) {
      const size = props.size || 22
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 22 22',
          fill: 'none',
          'aria-hidden': true,
        },
        h('rect', {
          x: 2.6,
          y: 4.2,
          width: 16.8,
          height: 13.6,
          rx: 3.2,
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
        h('path', {
          d: 'M6 8.4l1.6 1.6L10.4 7',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M13 8.6h3M13 12.4h3M6 12.4h4',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      )
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 18 18',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', {
          x: 1.9,
          y: 3.1,
          width: 14.2,
          height: 11.8,
          rx: 2.8,
          stroke: 'currentColor',
          strokeWidth: 1.5,
        }),
        h('path', {
          d: 'M4.6 6.9l1.4 1.4L8.4 5.9',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M10.6 7.1h2.8M10.6 10.6h2.8M5 10.6h2.8',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )
    }

    function StatusRow(props) {
      const ready = props.state === 'ready'
      return h(
        'div',
        { style: S.row },
        h('span', { style: ready ? S.dotOk : S.dotPlanned }, ready ? '✓' : '•'),
        h('span', null, props.label),
        h('span', { style: S.state }, ready ? props.readyText : props.plannedText),
      )
    }

    function Panel(props) {
      const t = props.t
      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.bar },
          h('span', { style: S.title }, t('title')),
          h('span', { style: S.pill }, t('pill')),
          h(
            'div',
            { style: S.tabs, role: 'tablist', 'aria-label': t('title') },
            h('button', { type: 'button', style: S.tabActive, role: 'tab', 'aria-selected': true }, t('tabLists')),
            h(
              'button',
              {
                type: 'button',
                style: S.tab,
                role: 'tab',
                'aria-selected': false,
                disabled: true,
                title: t('tabHint'),
              },
              t('tabTree'),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.tab,
                role: 'tab',
                'aria-selected': false,
                disabled: true,
                title: t('tabHint'),
              },
              t('tabCalendar'),
            ),
          ),
          h('span', { style: S.offline }, t('offline')),
        ),
        h(
          'div',
          { style: S.body },
          h(
            'div',
            { style: S.card },
            h('div', { style: S.glyph }, h(Glyph, { size: 22 })),
            h('div', { style: S.emptyTitle }, t('emptyTitle')),
            h('div', { style: S.emptyText }, t('emptyText')),
            h('div', { style: S.statusTitle }, t('statusTitle')),
            h(StatusRow, {
              state: 'ready',
              label: t('stMain'),
              readyText: t('stateReady'),
              plannedText: t('statePlanned'),
            }),
            h(StatusRow, {
              state: 'ready',
              label: t('stRail'),
              readyText: t('stateReady'),
              plannedText: t('statePlanned'),
            }),
            h(StatusRow, {
              state: 'planned',
              label: t('stStore'),
              readyText: t('stateReady'),
              plannedText: t('statePlanned'),
            }),
            h(StatusRow, {
              state: 'planned',
              label: t('stCalendar'),
              readyText: t('stateReady'),
              plannedText: t('statePlanned'),
            }),
            h(StatusRow, {
              state: 'planned',
              label: t('stMail'),
              readyText: t('stateReady'),
              plannedText: t('statePlanned'),
            }),
            h('div', { style: S.docs }, t('docs')),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.locale.register(NS, 'en', EN)
        ctx.locale.register(NS, 'ru', RU)
        const t = ctx.locale.bind(NS)

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Panel),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 15,
              label: () => t('title'),
              locale: NS,
            },
            PanelIcon,
          ),
        )
      },
    }
  },
})
