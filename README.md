# dsh-worktree-branch

Codex-style **Location / Branch** switchers on the New Session screen of
[DeepSeek Harness](https://github.com/deepseek-ai/dsh), for workspaces that are
git repositories.

在 DSH「新建会话」页给 git 工作区加一块 Codex 风格的「工作位置 / 分支」chip：
直接切 worktree、切分支、新建分支，git 事实与副作用全部由 Host 半执行
（写操作走该会话的沙箱策略）。

## What it does

- Detects whether the session's working directory is inside a git repository;
  renders nothing when it is not.
- Shows the current branch (or the short hash when HEAD is detached), every
  local branch, and every linked worktree.
- Actions: create a worktree, switch to another worktree, switch branch,
  create-and-switch branch.
- Names are validated twice: a cheap local whitelist plus `git check-ref-format`.
- Every git call strips inherited `GIT_*` selectors (`GIT_DIR`, `GIT_WORK_TREE`,
  `GIT_INDEX_FILE`, …) so a user shell cannot redirect the command to another
  repository; write operations (`switch`, `switch -c`, `worktree add`) are
  wrapped in the session's sandbox policy.

## Install

From GitHub:

```powershell
dsh plugin --profile desktop add github:Qcsj777/dsh-worktree-branch
```

As a local link during development:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
"dependencies": {
  "dsh-worktree-branch": "link:D:/path/to/worktree-branch"
}
```

The package ships its own Cordis patch (`cordis.patch.yml`) that inserts the
host half with id `worktree-branch`. `git` must be on `PATH`.

## How it works

Third-party bundles cannot add Remote namespaces, and a installed bundle's
client half cannot call its own host half through `host.call`, so the two halves
talk over same-origin HTTP:

```
GET  /worktree-branch/state?session=<id>&cwd=<path>
POST /worktree-branch/action  { sessionId, cwd, action, name?, path? }
```

`action` is one of `create-worktree`, `use-worktree`, `switch-branch`,
`create-branch`. The state payload is
`{ repo, cwd, repoRoot, currentBranch, head, branches[], worktrees[], mainPath, atMain }`.

- Client half (`client.js`): registers the chip on
  `conversation.hero.options`, only on the New Session screen.
- Host half (`index.js`): injects `webServer`, `subprocess`, `sandbox`,
  `sandboxPolicy`, `worktrees`, `sessionController`, `sessions`,
  `workingDirectory`; owns the routes above.

## Non-goals

- No network operations (no fetch/pull/push), no deletes, no merge/rebase.
- Switching to another worktree changes that session's working directory —
  that is the feature, not a side effect. The switch itself does not move any
  files.

## Development

```powershell
node check.mjs   # self-check for git-parse.mjs
```

## License

MIT