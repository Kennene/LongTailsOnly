## DeepSeek Harness (DSH) tool mapping

Skills speak in general actions. In DSH, execute them with these tools:

| Action requested by a skill | DSH tool |
|---|---|
| Read a file | `read` |
| Create or fully replace a file | `write` |
| Edit a file in place | `edit` (requires having read the file first) |
| Run a shell command or tests | `bash` |
| Search file contents | `grep` |
| Find files by name or glob | `glob` |
| Inspect an image or screenshot | `read_image` |
| Ask the human a clarifying question | `ask_user_question` |
| Fetch a URL / search the web | `web_fetch` / `web_search` |
| Present final deliverable files | `present` |
| Track multi-step work | `todo_write` |
| Spawn an isolated helper | `subagent` |
| Spawn a helper that inherits this conversation | `subagent_fork` |
| Message or resume a helper | `send_message` |
| Stop a helper's current turn | `interrupt_agent` |
| List helpers and their state | `list_agents` |
| Fan work out across many helpers | `workflow` |

Do not look for `Task`, `TodoWrite`, `Read`, `Glob`, or `Grep` tools — those names belong to other
harnesses. Use the DSH names above and trust the live tool list over this table when they disagree.

## Skill lookup has no namespace and no path table

DSH discovers skills from the filesystem and injects a catalog of names and descriptions before the
first request. Skill names are flat: `brainstorming`, not `superpowers:brainstorming`. Load a skill
with the `skill` tool by its exact catalog name; the human can also invoke one directly as `/name`.
Never construct a path to a `SKILL.md` yourself, and never assume a skill is unavailable because its
file path is unknown — if it is in the catalog, load it by name.

## Subagents and context hygiene

- `subagent` starts a child with **no** access to this conversation: its prompt must be fully
  self-contained. Use it for independent work and to keep bulky research out of this context.
- `subagent_fork` inherits the completed turns of this conversation. Use it only when the child
  genuinely needs this conversation's context.
- Both run **in the background by default**. The runtime notifies you when a run settles, so do not
  poll. Keep working on independent steps; collect a result only when you are actually blocked on it.
- Concurrency and total-agent caps apply. Beyond the cap, fan-out queues.
- `send_message` steers a running child at its next step boundary or starts a turn for an idle one.
  Resume a child rather than spawning a duplicate for a follow-up fix round.
- Context isolation is the default for a reason: a forked child carries this transcript and costs
  proportionally more tokens.

## Parallel fan-out and waiting

`workflow` runs a JavaScript orchestration script and is the tool for many independent units
(audits, migrations, multi-angle research). Its helpers — `agent()`, `pipeline()`, `parallel()`,
`phase()`, `log()` — keep orchestration out of this conversation. Prefer `pipeline()` when stages do
not need a barrier. A workflow call runs in the **foreground** and returns only when the whole script
finishes, so size it deliberately.

For background shell work, `bash` with `run_in_background` returns a job id immediately; read it with
`job_output` (set `wait: true` only when genuinely blocked), stop it with `job_kill`, and enumerate
with `job_list`. Collect every still-relevant job before reporting completion, and kill jobs that
stopped mattering.

## Environment and permissions

- `bash` runs each call in a fresh shell: no `cwd`, variable, or function survives between calls.
  Pass `workdir` instead of chaining `cd`, and never rely on shell state from a previous call.
- The session's file sandbox and approval policy are deployment state, not constants. File writes may
  be limited to the workspace. A denial is reported as a sandbox marker — read it rather than
  retrying another way, and never assume a wider mode is available.
- When approval prompts are disabled, an escalation cannot be granted. Do not plan work that depends
  on one.
- Children inherit the session's sandbox posture; do not assume a child has broader access than you.

## Git and worktrees on this host

The environment-detection block used by `using-git-worktrees` and `finishing-a-development-branch`
works unchanged in DSH — it is plain read-only git:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR)

## Committing

DSH has no implicit commit step. Commit only when the human asks for it, and follow the repository's
own `AGENTS.md` rules — which in this repository include updating the affected documentation in the
same commit.
