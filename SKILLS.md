# SKILLS.md — Narzędzia i skille dla agentów

Ten plik definiuje skille dostępne dla agentów AI w tym repozytorium.

Skille znajdują się w katalogu `.agents/skills/` (oraz są zlinkowane do `.claude/skills/`).

## Dostępne skille

| Grupa | Skill | Kiedy używać |
| --- | --- | --- |
| **Superpowers — Metodologia** | `brainstorming` | Use before writing code to explore alternatives, refine specifications, and validate designs. |
| | `writing-plans` | Use after design approval to break work into bite-sized tasks. |
| | `executing-plans` | Use when executing an approved plan in batches with checkpoints. |
| | `subagent-driven-development` | Use when executing an approved plan with a separate subagent for each task and two-stage code review. |
| | `dispatching-parallel-agents` | Use when executing multiple independent tasks concurrently using subagents. |
| | `test-driven-development` | Use when implementing features or bug fixes (RED-GREEN-REFACTOR cycle). |
| | `systematic-debugging` | Use when diagnosing and fixing bugs or test failures (4-phase root cause process). |
| | `verification-before-completion` | Use before claiming a bug fix or feature is complete. Evidence over claims. |
| | `requesting-code-review` | Use between tasks or before finalizing changes to review diff against plan. |
| | `receiving-code-review` | Use when responding to code review feedback. |
| | `using-git-worktrees` | Use when starting work requiring an isolated branch/worktree. |
| | `finishing-a-development-branch` | Use when development tasks are complete; decide whether to merge, PR, or discard. |
| | `using-superpowers` | Core introduction to skills, rationalization checks, and red flags. |
| | `diagnosing-superpowers` | Diagnose superpowers session issues and bug reporting. |
| | `writing-skills` | Use when creating, editing, or testing skills. |
| **Wskazówki i Prompty** | `karpathy-guidelines` | Zasady pisania kodu minimalizujące typowe błędy LLM. |
| | `brainstorm` | Refine a raw idea into an agreed specification before implementation. |
| | `review` | Two-axis pre-PR review (Standards + Spec) with severity-labelled findings. |
| | `domain` | Actively build and sharpen the domain model while designing. |
| | `grill` / `grill-docs` | Relentless one-question-at-a-time interview to stress-test a plan or idea. |
| | `implement` | Implement a spec/tickets test-first at agreed seams, then self-review and commit. |
| | `tdd` | Red → green in vertical slices, testing behavior through public interfaces. |
| | `wayfinder` | Chart and work a map of local decision tickets for larger tasks. |
