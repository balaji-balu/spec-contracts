## What and why

<!-- One or two sentences. Link the issue: "Closes #123". -->

Feature ID (if any): <!-- e.g. GOV-06, OBS-03 -->

## Checklist

- [ ] One logical change; CI passes
- [ ] Contract changes (if any) are in `contracts/` and noted in the README decisions table
- [ ] No edits to `examples/` or `evals/cases/` to make a tool pass
- [ ] Prompts, skills and AGENTS.md are not tuned to an eval case
- [ ] `npm run lock -w step-runner -- --update` run if an AGENTS.md, prompt or skill changed
- [ ] Feature ID cited in the title, and its row updated in `docs/platform/features.md`
- [ ] No keys or secrets added
- [ ] If agent quality is affected: suite report attached, or a maintainer asked to run it

## Notes for reviewers

<!-- Anything unusual, trade-offs, follow-ups. AI-assisted? Say which parts. -->
