# DSH prompt ports

Maintenance index for the CodeCompanion prompts ported from
`~/.config/nvim/lua/kuba/plugins/ai/prompts/` into DSH skills. This README is a
note for maintainers, not agent instructions — it is deliberately not a
`SKILL.md`, so it is not discovered as a skill.

| Skill | Source prompt | Purpose |
| ----- | ------------- | ------- |
| `brainstorm` | `brainstorm.md` | Refine a raw idea into an agreed specification before implementation. |
| `review` | `code_review.md` | Two-axis pre-PR review (Standards + Spec) with severity-labelled findings. |
| `domain` | `domain_modeling.md` | Actively build and sharpen the domain model (`CONTEXT.md` + ADRs) while designing. |
| `grill` | `grilling.md` | Relentless one-question-at-a-time interview to stress-test a plan or idea. |
| `grill-docs` | `grill_with_docs.md` | Grilling that also captures domain language and architectural decisions. |
| `implement` | `implement.md` | Implement a spec/tickets test-first at agreed seams, then self-review and commit. |
| `tdd` | `tdd.md` | Red → green in vertical slices, testing behavior through public interfaces. |
| `test-prosty` | `test.md` | Trivial smoke test that the agent answers with a simple greeting. |
| `wayfinder` | `wayfinder.md` | Chart and work a map of local decision tickets for work too big for one session. |

The four `qilo_*.md` prompts in the source directory were intentionally not ported —
they target a different project.
