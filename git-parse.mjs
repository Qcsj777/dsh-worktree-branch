/**
 * dsh-worktree-branch — 纯文本解析与名字校验。
 *
 * 这里只放不碰 ctx 的纯函数，好让 check.mjs 直接断言。
 */

/**
 * 解析 `git worktree list --porcelain`（空行分段）。
 * @param {string} stdout - 命令原始输出。
 * @returns {Array<{path: string, branch: string | null, head: string | null, bare: boolean, detached: boolean}>}
 */
export function parseWorktrees(stdout) {
  const blocks = String(stdout ?? '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
  const entries = []
  for (const block of blocks) {
    const entry = { path: '', branch: null, head: null, bare: false, detached: false }
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
      else if (line === 'bare') entry.bare = true
      else if (line === 'detached') entry.detached = true
    }
    if (entry.path.length > 0) entries.push(entry)
  }
  return entries
}

/**
 * 解析 `git for-each-ref --format=%(refname:short) refs/heads/`。
 * @param {string} stdout - 命令原始输出。
 * @returns {string[]} 去空行、按名字排序的本地分支。
 */
export function parseBranches(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * 比较两个路径是否指向同一目录（Windows 忽略大小写与结尾分隔符）。
 * @param {string} a - 绝对路径。
 * @param {string} b - 绝对路径。
 * @returns {boolean}
 */
export function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length === 0 || b.length === 0) return false
  const key = (value) => {
    const trimmed = value.replace(/[\\/]+$/, '').replace(/\//g, '\\')
    return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
  }
  return key(a) === key(b)
}

/**
 * 取路径最后一段，用于 chip 与工作树行标签。
 * @param {string} path - 绝对路径。
 * @returns {string}
 */
export function baseName(path) {
  const parts = String(path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

/**
 * 提交给 git 前的廉价名字检查；真正的语法判定由 `git check-ref-format --branch` 负责。
 * @param {string} name - 用户输入的分支/工作树名。
 * @returns {boolean}
 */
export function looksLikeBranchName(name) {
  if (typeof name !== 'string') return false
  if (name.length === 0 || name.length > 200) return false
  if (/[\s~^:?*[\\]/.test(name)) return false
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/')) return false
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false
  if (name.endsWith('.') || name.endsWith('.lock')) return false
  return true
}