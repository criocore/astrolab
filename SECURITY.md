# Security

Astrolabe is a local tool. There is no cloud component, no account and no telemetry. What it does with your data:

- **Local server only.** The server binds to `127.0.0.1`. Every mutating request needs a per-process session token and passes a Host / Origin check, so a web page opened in the same browser cannot change your progress or start the agent.
- **Your agent, your keys.** The hub keeps no API keys. It spawns a coding-agent CLI that is already installed and signed in on your machine (Claude Code, Codex CLI, Gemini CLI). Agent detection runs only `<cli> --version` on the names listed in `agents.json`; nothing is scanned beyond PATH.
- **Prompts never go through a shell.** The prompt goes to the CLI through stdin; arguments come from `agents.json` and `data/agents.local.json`, never from user text.
- **Topic check** runs the agent without tools. The learner's answer is placed inside tags as data and escaped, so it cannot close the tag or inject instructions.
- **Exam** runs the agent in a read-only mode of the chosen CLI (`--restricted` for Claude Code, `--sandbox read-only` for Codex, `--approval-mode plan` for Gemini). The agent cannot write. Claude Code and Gemini run no commands; Codex has no file tools and reads with shell commands inside its read-only sandbox, and runs without your `~/.codex/config.toml`, your saved execpolicy rules and ChatGPT apps: their MCP servers, and commands a saved "allow" rule approves, would run outside that sandbox. What it can *read* beyond the folder differs per vendor; see the "Agents" table in the README. The hub verifies every exam quote against the named file inside the folder, and rejects paths that leave the folder, including through symlinks.
- **The exam folder is sent to the model provider.** Everything the agent reads goes to the vendor behind your CLI. Do not point the exam at a folder that contains secrets or `.env` files.
- **Logs** in `data/logs/mentor.jsonl` hold timings, token usage and tool targets (paths, hostnames), never prompt or answer text.

## Reporting a vulnerability

Open a GitHub issue with the label `security`, or, if the problem exposes other users' data, write to the maintainer through the contact in the GitHub profile first and give a few days before public disclosure. Please include the version (`git rev-parse HEAD`), the OS, the agent preset and a minimal reproduction.
