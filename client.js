/**
 * dsh-worktree-branch — 欢迎页「工作位置 / 分支」chip 的 Client 半。
 *
 * 挂在 `conversation.hero.options`：工作区 chip、创造模式 chip 之后。
 * 只有当会话 cwd 是 git 仓库时才渲染；数据全部来自 Host 半的同源路由。
 */

window.__ModuleLoader__.load({
  id: 'dsh-worktree-branch',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React
    const h = React.createElement

    const NS = 'worktree-branch'
    const ROUTE = '/worktree-branch'
    const CHIP_ATTR = 'data-dsh-wb-chip'

    const ZH = {
      'worktree.title': '工作位置',
      'worktree.local': '本地',
      'worktree.create': '新建本地工作树',
      'worktree.namePlaceholder': '工作树名称',
      'branch.title': '分支',
      'branch.search': '搜索{repo}分支',
      'branch.create': '创建并检出新分支...',
      'branch.namePlaceholder': '新分支名称',
      'branch.empty': '没有匹配的分支',
      'branch.detached': '游离 HEAD',
      'status.working': '处理中…',
    }

    const EN = {
      'worktree.title': 'Location',
      'worktree.local': 'Local',
      'worktree.create': 'New local worktree',
      'worktree.namePlaceholder': 'Worktree name',
      'branch.title': 'Branches',
      'branch.search': 'Search {repo} branches',
      'branch.create': 'Create and check out new branch...',
      'branch.namePlaceholder': 'New branch name',
      'branch.empty': 'No matching branches',
      'branch.detached': 'Detached HEAD',
      'status.working': 'Working…',
    }

    const CSS = `
.dshwb-row{display:inline-flex;align-items:center;gap:2px;position:relative}
/* 官方 hero 行把 options 容器推到最右；这里把它拉回工作区/模式之后。 */
*:has(> [${CHIP_ATTR}]){margin-left:0!important}
*:has(> * > [${CHIP_ATTR}]){margin-left:0!important}
.dshwb-chip{display:inline-flex;align-items:center;gap:4px;max-width:min(220px,36vw);min-height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer}
.dshwb-chip:hover:not(:disabled),.dshwb-chip[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dshwb-chip:disabled{cursor:default;color:var(--dsw-alias-label-dimmed)}
.dshwb-chip>svg{flex:none;color:var(--dsw-alias-label-caption)}
.dshwb-label{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshwb-scrim{position:fixed;inset:0;z-index:30}
.dshwb-popover{position:absolute;bottom:calc(100% + 10px);left:0;z-index:31;box-sizing:border-box;min-width:268px;max-width:min(320px,92vw);padding:8px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dshwb-popoverRight{left:auto;right:0}
.dshwb-title{padding:4px 8px 6px;color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}
.dshwb-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.dshwb-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshwb-item:disabled{cursor:default}
.dshwb-item>svg{flex:none;color:var(--dsw-alias-label-caption)}
.dshwb-check{color:var(--dsw-alias-label-primary)!important}
.dshwb-itemLabel{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshwb-hint{flex:none;color:var(--dsw-alias-label-caption);font-size:12px}
.dshwb-search{display:flex;align-items:center;gap:6px;height:32px;margin:0 0 4px;padding:0 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover)}
.dshwb-search>svg{flex:none;color:var(--dsw-alias-label-caption)}
.dshwb-search input{flex:1;min-width:0;border:0;background:none;outline:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dshwb-search input::placeholder{color:var(--dsw-alias-label-caption)}
.dshwb-list{max-height:260px;overflow:auto;overscroll-behavior:contain}
.dshwb-sep{height:1px;margin:6px 4px;background:var(--dsw-alias-border-l1)}
.dshwb-input{box-sizing:border-box;width:100%;height:30px;margin:2px 0;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:none;outline:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dshwb-input::placeholder{color:var(--dsw-alias-label-caption)}
.dshwb-error{margin:4px 8px 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;word-break:break-word}
.dshwb-muted{color:var(--dsw-alias-label-caption)}
`

    function Style() {
      return h('style', { [CHIP_ATTR]: '' }, CSS)
    }

    /**
     * 统一的 16px 线性图标。
     * @param props - svg 子节点与可选 className。
     */
    function icon(children) {
      return function Icon({ className }) {
        return h(
          'svg',
          {
            width: 16,
            height: 16,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
            className,
          },
          children,
        )
      }
    }

    const IconDesktop = icon([
      h('rect', { key: 'r', x: 2, y: 3, width: 20, height: 14, rx: 2 }),
      h('path', { key: 'l', d: 'M8 21h8M12 17v4' }),
    ])
    const IconBranch = icon([
      h('path', { key: 'a', d: 'M6 3v12' }),
      h('circle', { key: 'b', cx: 18, cy: 6, r: 3 }),
      h('circle', { key: 'c', cx: 6, cy: 18, r: 3 }),
      h('path', { key: 'd', d: 'M18 9a9 9 0 0 1-9 9' }),
    ])
    const IconCheck = icon([h('path', { key: 'p', d: 'M20 6 9 17l-5-5' })])
    const IconPlus = icon([h('path', { key: 'p', d: 'M12 5v14M5 12h14' })])
    const IconSearch = icon([
      h('circle', { key: 'c', cx: 11, cy: 11, r: 7 }),
      h('path', { key: 'l', d: 'm16.7 16.7 4.3 4.3' }),
    ])
    const IconArrow = icon([h('path', { key: 'p', d: 'M9 7h8v8M17 7 7 17' })])

    /** 取路径最后一段。 */
    function baseName(path) {
      const parts = String(path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
      return parts[parts.length - 1] ?? ''
    }

    /** 生成一个默认工作树名，用户可直接回车接受。 */
    function suggestWorktreeName() {
      return `worktree-${Date.now().toString(36).slice(-4)}`
    }

    /**
     * 面板里的一行。
     * @param props - 标签、图标、选中态与点击。
     */
    function Row({ label, hint, Icon, checked, disabled, onClick }) {
      return h(
        'button',
        { type: 'button', className: 'dshwb-item', disabled, onClick, role: 'menuitemradio', 'aria-checked': checked === true },
        Icon === undefined ? null : h(Icon),
        h('span', { className: 'dshwb-itemLabel' }, label),
        hint === undefined ? null : h('span', { className: 'dshwb-hint' }, hint),
        checked === true ? h(IconCheck, { className: 'dshwb-check' }) : null,
      )
    }

    /**
     * 就地展开的名字输入框。
     * @param props - 初始值、占位符、提交与取消。
     */
    function NameInput({ initial, placeholder, onSubmit, onCancel, busy }) {
      const [value, setValue] = useState(initial)
      const inputRef = useRef(null)
      useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, [])
      return h('input', {
        ref: inputRef,
        className: 'dshwb-input',
        value,
        disabled: busy,
        placeholder,
        spellCheck: false,
        onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            const name = value.trim()
            if (name.length > 0) onSubmit(name)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        },
      })
    }

    /**
     * 欢迎页工作区行里的两个 chip 与两个面板。
     * @param props.sessionId - 当前会话。
     * @param props.useSessions - 会话快照选择器。
     * @param props.t - 本地化函数。
     */
    function WorktreeBranchChips({ sessionId, useSessions, t }) {
      const cwd = useSessions((snapshot) => (sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd))
      const [state, setState] = useState(null)
      const [open, setOpen] = useState(null)
      const [query, setQuery] = useState('')
      const [draft, setDraft] = useState(null)
      const [busy, setBusy] = useState(null)
      const [error, setError] = useState(null)

      const load = useCallback(async () => {
        if (sessionId === undefined) return
        const search = new URLSearchParams({ session: sessionId })
        if (typeof cwd === 'string' && cwd.length > 0) search.set('cwd', cwd)
        try {
          const response = await fetch(`${ROUTE}/state?${search.toString()}`, { headers: { accept: 'application/json' } })
          if (!response.ok) {
            setState(null)
            return
          }
          setState(await response.json())
        } catch {
          setState(null)
        }
      }, [sessionId, cwd])

      useEffect(() => {
        void load()
      }, [load])

      useEffect(() => {
        if (open === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            setOpen(null)
            setDraft(null)
            setError(null)
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open])

      const act = useCallback(
        async (body) => {
          setBusy(body.action)
          setError(null)
          try {
            const response = await fetch(`${ROUTE}/action`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId, cwd, ...body }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
              setError(payload.error ?? `HTTP ${response.status}`)
              return
            }
            if (payload.state !== undefined) setState(payload.state)
            setOpen(null)
            setDraft(null)
            setQuery('')
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure))
          } finally {
            setBusy(null)
          }
        },
        [sessionId, cwd],
      )

      const repoName = useMemo(() => baseName(state?.repoRoot), [state?.repoRoot])
      const branches = useMemo(() => (state?.branches ?? []).filter((name) => name.toLowerCase().includes(query.trim().toLowerCase())), [state?.branches, query])

      if (sessionId === undefined || state === null || state.repo !== true) return null

      const current = state.worktrees.find((entry) => entry.isCurrent)
      const locationLabel = state.atMain ? t('worktree.local') : (current?.name ?? baseName(state.repoRoot))
      const branchLabel = state.currentBranch ?? (state.head ? `${state.head}` : t('branch.detached'))
      const disabled = busy !== null

      const toggle = (panel) => {
        setError(null)
        setDraft(null)
        setQuery('')
        setOpen(open === panel ? null : panel)
      }

      return h(
        'div',
        { className: 'dshwb-row', [CHIP_ATTR]: '' },
        h(Style),
        h(
          'button',
          {
            type: 'button',
            className: 'dshwb-chip',
            'aria-haspopup': 'menu',
            'aria-expanded': open === 'worktree',
            title: t('worktree.title'),
            onClick: () => toggle('worktree'),
          },
          h(IconDesktop),
          h('span', { className: 'dshwb-label' }, locationLabel),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshwb-chip',
            'aria-haspopup': 'menu',
            'aria-expanded': open === 'branch',
            title: t('branch.title'),
            onClick: () => toggle('branch'),
          },
          h(IconBranch),
          h('span', { className: 'dshwb-label' }, branchLabel),
        ),
        open === null
          ? null
          : h('div', {
              className: 'dshwb-scrim',
              onClick: () => {
                setOpen(null)
                setDraft(null)
                setError(null)
              },
            }),
        open === 'worktree'
          ? h(
              'div',
              { className: 'dshwb-popover', role: 'menu' },
              h('div', { className: 'dshwb-title' }, t('worktree.title')),
              h(Row, {
                label: t('worktree.local'),
                Icon: IconDesktop,
                checked: state.atMain,
                disabled: disabled || state.atMain,
                onClick: () => act({ action: 'use-worktree', path: state.mainPath }),
              }),
              state.worktrees
                .filter((entry) => !entry.isMain)
                .map((entry) =>
                  h(Row, {
                    key: entry.path,
                    label: entry.name,
                    hint: entry.branch ?? undefined,
                    Icon: IconArrow,
                    checked: entry.isCurrent,
                    disabled: disabled || entry.isCurrent,
                    onClick: () => act({ action: 'use-worktree', path: entry.path }),
                  }),
                ),
              h('div', { className: 'dshwb-sep' }),
              draft?.kind === 'worktree'
                ? h(NameInput, {
                    initial: draft.value,
                    placeholder: t('worktree.namePlaceholder'),
                    busy: disabled,
                    onSubmit: (name) => act({ action: 'create-worktree', name }),
                    onCancel: () => setDraft(null),
                  })
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshwb-item',
                      disabled,
                      onClick: () => setDraft({ kind: 'worktree', value: suggestWorktreeName() }),
                    },
                    h(IconPlus),
                    h('span', { className: 'dshwb-itemLabel' }, t('worktree.create')),
                  ),
              error === null ? null : h('div', { className: 'dshwb-error' }, error),
            )
          : null,
        open === 'branch'
          ? h(
              'div',
              { className: 'dshwb-popover dshwb-popoverRight', role: 'menu' },
              h(
                'div',
                { className: 'dshwb-search' },
                h(IconSearch),
                h('input', {
                  value: query,
                  placeholder: t('branch.search').replace('{repo}', repoName),
                  spellCheck: false,
                  autoFocus: true,
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              h('div', { className: 'dshwb-title' }, t('branch.title')),
              h(
                'div',
                { className: 'dshwb-list' },
                branches.map((name) =>
                  h(Row, {
                    key: name,
                    label: name,
                    Icon: IconBranch,
                    checked: name === state.currentBranch,
                    disabled: disabled || name === state.currentBranch,
                    onClick: () => act({ action: 'switch-branch', name }),
                  }),
                ),
                branches.length === 0 ? h('div', { className: 'dshwb-item dshwb-muted' }, t('branch.empty')) : null,
              ),
              h('div', { className: 'dshwb-sep' }),
              draft?.kind === 'branch'
                ? h(NameInput, {
                    initial: draft.value,
                    placeholder: t('branch.namePlaceholder'),
                    busy: disabled,
                    onSubmit: (name) => act({ action: 'create-branch', name }),
                    onCancel: () => setDraft(null),
                  })
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshwb-item',
                      disabled,
                      onClick: () => setDraft({ kind: 'branch', value: '' }),
                    },
                    h(IconPlus),
                    h('span', { className: 'dshwb-itemLabel' }, t('branch.create')),
                  ),
              disabled ? h('div', { className: 'dshwb-title' }, t('status.working')) : null,
              error === null ? null : h('div', { className: 'dshwb-error' }, error),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'worktree-branch: locale')
        ctx.slots.inject('conversation.hero.options', () =>
          ctx.slots.register(
            {
              name: 'conversation.hero.options',
              id: 'worktree-branch',
              order: 10,
              locale: NS,
            },
            WorktreeBranchChips,
          ),
        )
      },
    }
  },
})