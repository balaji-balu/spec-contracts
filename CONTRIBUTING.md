# Contributing

Thanks for helping build a spec-driven, AI-native SDLC. This project is early: interfaces change, and many decisions are still open. The best contributions are small, focused and easy to review.

## Before you start

- Run the [Quickstart](README.md#quickstart). Everything in it except a real agent run works without a model key.
- Read [`CLAUDE.md`](CLAUDE.md) for where things are and the working rules. It is written for AI coding agents, but it is the most complete map of the repo for people too.
- For anything bigger than a fix, **open an issue first** so we can agree on the approach before you write code.

## Ways to contribute

| You want to… | Where | Notes |
| --- | --- | --- |
| Add or fix a lint rule | `contracts/validation-rules.md`, then `packages/spec-lint/src/rules/` | The contract changes first. Add a planted-defect fixture in `packages/spec-lint/test/cases.ts` |
| Add or improve an agent tool | `packages/pi-spec-tools/src/` (logic) and `extensions/` (registration) | Keep tools small and dependency-light. Tests use pi's faux model, so no key is needed |
| Add an eval case | `evals/cases/<layer>/`, see [`evals/README.md`](evals/README.md) | Cases drawn from real misses are the most valuable (D13) |
| Improve an agent step | `agents/<step>/`, `skills/<name>/` | Run `npm run lock -w step-runner -- --update` after editing an AGENTS.md |
| Work on a platform feature | [`docs/platform/features.md`](docs/platform/features.md) | Pick a `GOV-nn` or `OBS-nn` row and cite its ID |
| Improve docs | anywhere | Always welcome, and a good first contribution |

Issues labelled `good first issue` are a good place to start.

## Rules that keep the project honest

These come from [`CLAUDE.md`](CLAUDE.md) and apply to human and AI-assisted contributions alike.

- **Contracts lead, code follows.** If code needs a contract change, change `contracts/` first, in the same PR, and note it in the README decisions table.
- **Never edit fixtures to make a tool pass.** `examples/` and `evals/cases/` are fixtures. If you think one is wrong, say so in an issue.
- **Never tune prompts, skills or AGENTS.md to an eval case.** Keep examples in unrelated domains, or the evals stop measuring anything.
- **Features carry IDs.** Commits and PR titles cite the feature ID they touch (`GOV-06: …`), and the PR updates that row of the features register.
- **No secrets in the repo.** Model keys live only in the gitignored `gateway/litellm/.env`.

## Paid model runs

You never need to spend money to get a PR merged. CI uses pi's faux model and no keys. If a change affects agent quality, the maintainers run the paid eval suites (about $1 per run). You are welcome to run them yourself and attach the report.

## Proposals and decisions

Design decisions are tracked in the [decisions log](README.md#decisions-log), each marked *proposed* or *decided*. To propose a change to a decided item, or to decide a proposed one, open an issue with the **Proposal** template. For now the maintainer (@balaji-balu) makes the final call; this will change as the community grows.

## Pull requests

- One logical change per PR; keep it reviewable in one sitting.
- Fill in the PR template checklist.
- CI must pass: typecheck, tests, lint of the worked example, lock check and prototype parity.
- AI-assisted contributions are welcome. You are responsible for every line you submit, so review it as if you wrote it.
- By contributing, you agree that your contribution is licensed under the project's [MIT licence](LICENSE).

## Environment notes

- Node 20+ is required; CI uses Node 22.
- Python 3 (`pyyaml`, `jsonschema`) is needed only for the prototypes. On Windows, run them with `PYTHONUTF8=1`, or Python misreads the `·` separator and the linter finds no blocks. To compare the prototype with the TypeScript linter:

  ```
  PYTHONUTF8=1 python tools/spec-lint-prototype.py examples examples/specs/SPEC-0001 contracts/header.schema.json
  npm run parity:check -w spec-lint
  ```

- The worked example lints clean apart from one warning (C4 on SC-2). The spec-lint tests check parity with the prototype on every fixture and on 36 planted defects, plus the git-aware rules in temp repositories. Linter options are in `contracts/validation-rules.md` §8.
- If you use Claude Code, put notes about your own machine in `CLAUDE.local.md` (gitignored), not in `CLAUDE.md`.
