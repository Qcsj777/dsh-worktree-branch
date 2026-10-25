/**
 * dsh-worktree-branch — 欢迎页「工作位置 / 分支」chip 的 Host 半。
 *
 * 客户端半只负责画 UI，git 事实与副作用都走这里：
 *   GET  /worktree-branch/state?session=<id>&cwd=<path>
 *   POST /worktree-branch/action  { sessionId, cwd, action, name?, path? }
 *
 * 为什么是同源 HTTP：第三方插件不能新增 Remote namespace（能力集合构建期固定），
 * 已安装 bundle 的 client 半也拿不到自己 Host 半的 host.call。
 */

import { baseName, looksLikeBranchName, parseBranches, parseWorktrees, samePath } from './git-parse.mjs'

export const name = 'dsh-worktree-branch'
export const inject = [
  'webServer',
  'subprocess',
  'sandbox',
  'sandboxPolicy',
  'worktrees',
  'sessionController',
  'sessions',
  'workingDirectory',
]

const ROUTE = '/worktree-branch'
const MAX_BODY = 64 * 1024

/** 清空继承来的仓库/索引/属性选择器，避免用户 shell 里的 GIT_* 把命令指到别处。 */
const GIT_ENV = {
  ...Object.fromEntries(
    [
      'GIT_DIR',
      'GIT_WORK_TREE',
      'GIT_COMMON_DIR',
      'GIT_INDEX_FILE',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_CONFIG',
      'GIT_CONFIG_PARAMETERS',
      'GIT_CONFIG_COUNT',
      'GIT_CEILING_DIRECTORIES',
      'GIT_PREFIX',
      'GIT_SHALLOW_FILE',
      'GIT_GRAFT_FILE',
      'GIT_REPLACE_REF_BASE',
      'GIT_ATTR_SOURCE',
    ].map((key) => [key, undefined]),
  ),
  GIT_TERMINAL_PROMPT: '0',
  GIT_LFS_SKIP_SMUDGE: '1',
  GIT_NO_LAZY_FETCH: '1',
}

/** 与 dsh-experimental-worktree 相同的进程预算。 */
const SPAWN = {
  graceMs: 3000,
  stdio: {
    stdin: 'ignore',
    stdout: { maxBytes: 65536 },
    stderr: { maxBytes: 65536 },
  },
}

class HttpError extends Error {
  /**
   * @param {number} status - 响应状态码。
   * @param {string} message - 给面板显示的原文。
   */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * 跑一条 git 命令。写操作传 agent 时会套上该会话的沙箱策略。
 * @param {object} ctx - Host 上下文。
 * @param {string} cwd - 命令工作目录。
 * @param {string[]} args - git 子命令参数。
 * @param {object | undefined} agent - 写操作所属 Agent（只读命令省略）。
 * @param {number[]} allowCodes - 视为成功的退出码。
 * @returns {Promise<{stdout: string, stderr: string, code: number | null}>}
 */
async function runGit(ctx, cwd, args, agent, allowCodes = [0]) {
  let argv = [await ctx.subprocess.resolveExecutable('git'), ...args]
  if (agent !== undefined) {
    const policy = ctx.sandboxPolicy.resolve({ session: agent.session })
    if (policy.mode !== 'danger-full-access') argv = (await ctx.sandbox.confine(argv, { ...policy, mode: policy.mode })).argv
  }
  const child = ctx.subprocess.spawn({ argv, cwd, env: GIT_ENV, ...SPAWN })
  try {
    const outcome = await child.done
    const stdout = child.collected.stdout.readFrom(0).text
    const stderr = child.collected.stderr.readFrom(0).text
    if (outcome.exitCode === null || !allowCodes.includes(outcome.exitCode)) {
      const detail = stderr.trim().split(/\r?\n/).slice(-3).join('\n') || `git ${args[0]} 退出码 ${outcome.signal ?? outcome.exitCode}`
      throw new HttpError(400, detail)
    }
    return { stdout, stderr, code: outcome.exitCode }
  } finally {
    child.terminate()
    await child.waitForExit()
  }
}

/**
 * 读一次仓库状态；不是仓库就只回 `{repo:false}`。
 * @param {object} ctx - Host 上下文。
 * @param {string} cwd - 会话当前目录。
 * @returns {Promise<object>} state 载荷。
 */
async function readState(ctx, cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return { repo: false }
  let repoRoot
  try {
    repoRoot = (await runGit(ctx, cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
  } catch {
    return { repo: false }
  }
  if (repoRoot.length === 0) return { repo: false }

  const [headRef, branchesRaw, worktreesRaw] = await Promise.all([
    runGit(ctx, repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: '' })),
    runGit(ctx, repoRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']).catch(() => ({ stdout: '' })),
    runGit(ctx, repoRoot, ['worktree', 'list', '--porcelain']).catch(() => ({ stdout: '' })),
  ])

  const branch = headRef.stdout.trim()
  const detached = branch === 'HEAD' || branch.length === 0
  const listed = parseWorktrees(worktreesRaw.stdout)
  const atMain = listed.length === 0 || samePath(repoRoot, listed[0].path)
  return {
    repo: true,
    cwd,
    repoRoot,
    currentBranch: detached ? null : branch,
    head: detached ? (await runGit(ctx, repoRoot, ['rev-parse', '--short', 'HEAD']).catch(() => ({ stdout: '' }))).stdout.trim() || null : null,
    branches: parseBranches(branchesRaw.stdout),
    worktrees: listed.map((entry, index) => ({
      path: entry.path,
      name: baseName(entry.path),
      branch: entry.branch,
      isMain: index === 0,
      isCurrent: samePath(entry.path, repoRoot),
    })),
    mainPath: listed[0]?.path ?? repoRoot,
    atMain,
  }
}

/**
 * 会话当前 cwd：优先问 Host，其次用客户端带上的提示。
 * @param {object} ctx - Host 上下文。
 * @param {string} sessionId - 会话标识。
 * @param {string} hint - 客户端快照里的 cwd。
 * @returns {string}
 */
function cwdOf(ctx, sessionId, hint) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const session = ctx.sessions.get(sessionId)
    if (session !== undefined) {
      try {
        return ctx.workingDirectory.get(session)
      } catch {
        // 落到 hint
      }
    }
  }
  if (typeof hint === 'string' && hint.length > 0) return hint
  throw new HttpError(400, '会话还没有工作目录')
}

/**
 * 解析写操作要用的 Agent。
 * @param {object} ctx - Host 上下文。
 * @param {string} sessionId - 会话标识。
 * @returns {Promise<object>}
 */
async function agentOf(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new HttpError(400, '缺少会话标识')
  try {
    return await ctx.sessionController.resolveAgent(sessionId)
  } catch (error) {
    throw new HttpError(400, `会话未就绪：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 分支/工作树名的双重校验：廉价白名单 + git 自己的语法判定。
 * @param {string} name - 用户输入。
 * @returns {string} 去空白后的名字。
 */
function requireName(name) {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!looksLikeBranchName(value)) throw new HttpError(400, `名字不合法：${value || '(空)'}`)
  return value
}

/**
 * 执行一个动作并回传最新状态。
 * @param {object} ctx - Host 上下文。
 * @param {object} body - 请求体。
 * @returns {Promise<object>}
 */
async function runAction(ctx, body) {
  const cwd = cwdOf(ctx, body.sessionId, body.cwd)
  switch (body.action) {
    case 'create-worktree': {
      const agent = await agentOf(ctx, body.sessionId)
      const name = body.name === undefined || body.name === null || String(body.name).trim() === '' ? undefined : requireName(body.name)
      const created = await ctx.worktrees.create(agent, name === undefined ? {} : { name })
      return { created: { path: created.path, branch: created.branch }, state: await readState(ctx, created.path) }
    }
    case 'use-worktree': {
      const state = await readState(ctx, cwd)
      if (!state.repo) throw new HttpError(400, '当前目录不是 git 仓库')
      const target = state.worktrees.find((entry) => samePath(entry.path, body.path))
      if (target === undefined) throw new HttpError(400, '未知的工作树')
      const agent = await agentOf(ctx, body.sessionId)
      await ctx.workingDirectory.set(agent, target.path)
      return { state: await readState(ctx, target.path) }
    }
    case 'switch-branch': {
      const name = requireName(body.name)
      const state = await readState(ctx, cwd)
      if (!state.repo) throw new HttpError(400, '当前目录不是 git 仓库')
      if (!state.branches.includes(name)) throw new HttpError(400, `没有这个分支：${name}`)
      const agent = await agentOf(ctx, body.sessionId)
      await runGit(ctx, cwd, ['switch', name], agent)
      return { state: await readState(ctx, cwd) }
    }
    case 'create-branch': {
      const name = requireName(body.name)
      const agent = await agentOf(ctx, body.sessionId)
      await runGit(ctx, cwd, ['check-ref-format', '--branch', name], agent)
      await runGit(ctx, cwd, ['switch', '-c', name], agent)
      return { state: await readState(ctx, cwd) }
    }
    default:
      throw new HttpError(400, `未知动作：${String(body.action)}`)
  }
}

/**
 * @param {import('node:http').IncomingMessage} req - HTTP 请求。
 * @returns {Promise<any>} 解析后的 JSON。
 */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, '请求太大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是 JSON')
  }
}

/**
 * 插件入口。
 * @param {object} ctx - Host 上下文。
 */
export function apply(ctx) {
  /**
   * @param {import('node:http').ServerResponse} res - HTTP 响应。
   * @param {number} status - 状态码。
   * @param {any} value - JSON 载荷。
   */
  const sendJson = (res, status, value) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(value))
  }

  /**
   * @param {import('node:http').IncomingMessage} req - HTTP 请求。
   * @param {import('node:http').ServerResponse} res - HTTP 响应。
   */
  const handler = (req, res) => {
    void (async () => {
      let url
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        sendJson(res, 400, { error: 'bad request' })
        return
      }
      if (url.pathname === `${ROUTE}/state` && req.method === 'GET') {
        const cwd = cwdOf(ctx, url.searchParams.get('session') ?? '', url.searchParams.get('cwd') ?? '')
        sendJson(res, 200, await readState(ctx, cwd))
        return
      }
      if (url.pathname === `${ROUTE}/action` && req.method === 'POST') {
        const body = await readJson(req)
        if (typeof body !== 'object' || body === null) throw new HttpError(400, '请求体不是对象')
        sendJson(res, 200, await runAction(ctx, body))
        return
      }
      sendJson(res, 404, { error: 'not found' })
    })().catch((error) => {
      if (res.headersSent) {
        res.end()
        return
      }
      sendJson(res, error instanceof HttpError ? error.status : 500, {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler })
    return () => disposeRoute()
  }, 'worktree-branch: git state route')
}