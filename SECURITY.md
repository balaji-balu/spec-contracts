# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**. You will get an acknowledgement within 7 days.

Useful reports include what is affected, how to reproduce it, and what an attacker could achieve.

## What is in scope

This project runs AI agents that read files, call tools and send data to model providers, so we treat these as security issues:

- An agent escaping its step's guard: writing outside its allowed files, or reading outside its workspace.
- Prompt injection through the org KB, specs, fixtures or tool output that changes an agent's behaviour.
- Anything that exposes model provider keys, including through CI or pull requests from forks.
- Tampering with pinned inputs (`pipeline.lock.yaml`, AGENTS.md, skills, prompts) that the lock check fails to detect.
- Vulnerabilities in the litellm gateway configuration shipped in `gateway/litellm/`.

Bugs in upstream projects (pi, litellm, model providers) should go to those projects; tell us too if this repo's configuration makes them worse.

## Supported versions

The project is pre-release. Only the `main` branch is supported.
