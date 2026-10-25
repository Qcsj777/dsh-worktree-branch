/**
 * 自检：`node check.mjs`。只覆盖 git-parse.mjs 的纯解析逻辑，
 * 真正的 git 调用在 Host 半里，靠安装后的 HTTP 冒烟验证。
 */
import assert from 'node:assert/strict'
import { parseBranches, parseWorktrees, looksLikeBranchName, samePath, baseName } from './git-parse.mjs'

const WORKTREE_LIST = `worktree D:/repo
HEAD 8f2c1ad4e5f60718293a4b5c6d7e8f90a1b2c3d4
branch refs/heads/master

worktree D:/repo/.agents/worktrees/feature-x
HEAD 1122334455667788990011223344556677889900
branch refs/heads/feature-x

worktree D:/repo/.agents/worktrees/detached
HEAD abcdefabcdefabcdefabcdefabcdefabcdefabcd
detached
`

const trees = parseWorktrees(WORKTREE_LIST)
assert.equal(trees.length, 3)
assert.deepEqual(trees[0], {
  path: 'D:/repo',
  head: '8f2c1ad4e5f60718293a4b5c6d7e8f90a1b2c3d4',
  branch: 'master',
  detached: false,
  bare: false,
})
assert.equal(trees[1].branch, 'feature-x')
assert.equal(trees[2].detached, true)
assert.equal(trees[2].branch, null)

const branches = parseBranches('master\nfeature-x\nrelease/1.0\n')
assert.deepEqual(branches, ['feature-x', 'master', 'release/1.0'])

assert.equal(samePath('D:\\repo\\', 'D:/repo'), true)
assert.equal(samePath('D:\\repo', 'D:\\repo-2'), false)
assert.equal(baseName('D:\\repo\\'), 'repo')

assert.equal(looksLikeBranchName('feature-x'), true)
assert.equal(looksLikeBranchName('release/1.0'), true)
assert.equal(looksLikeBranchName('-oops'), false)
assert.equal(looksLikeBranchName('has space'), false)
assert.equal(looksLikeBranchName('bad:name'), false)
assert.equal(looksLikeBranchName('ends.lock'), false)
assert.equal(looksLikeBranchName(''), false)

console.log('git-parse self-check passed')