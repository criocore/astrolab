# Changelog

## Unreleased

- The mentor panel goes through the same pipeline as topic checks and exams: each call is a line in `data/logs/mentor.jsonl`, `MENTOR_MODE=record` records it, and replay (the demo) answers from recordings without starting a CLI. The "Check the agent call" button follows the same rule.
- Fixed: a panel request with a preset that has no chat mode crashed the server.
- "Stop" in the panel now stops the agent process on the server; the answer written so far is kept and marked as stopped, so "Explain" asks again instead of opening the cut answer; the same holds for an answer cut by an error (limit, login, timeout). Closing the panel still lets the agent finish.
- Call log: tool targets are kept for exams only; in the panel a search query or a command can repeat the learner's question.
- Recordings keep only the machine-independent part of the request (no workspace path, no session id).
- Demo recordings: "Explain" for "How an LLM works" in English and Russian, and the agent call check.
- Deleting a panel chat while it answers stops its agent, and nothing of the chat stays in the database.
- Demo: "Check the agent call" says the answer comes from a recording instead of showing a working agent.
- Record mode: a follow-up question that continues the conversation is recorded per topic, so the same question on two topics no longer shares one recording.

## 0.1.0 (2026-10-23)

First public cut.

- Local study hub: a tree of eras drawn as a star sky, topic checks by your own coding agent with a quote from your answer, era gates on a project folder with every quote verified in the file by the hub.
- Era I "CLI user": six setup topics lit by the hub's own probes (terminal, Node, git, agent), no exam.
- Agent presets for Claude Code (run live), Codex CLI and Gemini CLI (set up from vendor docs); model and effort chosen on the first run and in settings.
- Pack "AI Engineer": 8 eras, 13 adjacent areas, 172 topics, 660 open materials with terms of use and check dates; CC BY-SA 4.0.
- Interface and pack texts in English and Russian; first-run screen for language and agent.
- Demo mode on recorded answers; export and import of progress with a format version; database schema version.
- Checked on Windows; macOS and Linux start scripts are written but not yet run.
