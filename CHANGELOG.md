# Changelog

## Unreleased

- Codex: every call runs without `~/.codex/config.toml` and ChatGPT apps (`--ignore-user-config --disable apps`). Their MCP servers ran outside the read-only sandbox; one of them, added by the ChatGPT desktop app, runs any JavaScript and was used by the examiner to read the folder.
- Codex exam: Codex has no file tools, so its preset tells it to read the folder with read-only shell commands inside the sandbox (new preset field `system_extra`). Codex CLI 0.162.1 was run live: topic check, exam on `fixtures/exam-g0-demo`, mentor panel.
- Codex in the mentor panel: a follow-up continues the conversation (`codex exec … resume <thread>`). Before, it reached Codex as a bare question, without the topic or the previous answer.

## 0.1.1 (2026-10-24)

Community release: fixes and tests by [@geibos](https://github.com/geibos) (13 issues, 5 pull requests on day one), reviewed and merged on Windows.

- The mentor panel goes through the same pipeline as topic checks and exams: each call is a line in `data/logs/mentor.jsonl`, `MENTOR_MODE=record` records it, and replay (the demo) answers from recordings without starting a CLI. The "Check the agent call" button follows the same rule.
- Fixed: a panel request with a preset that has no chat mode crashed the server.
- Panel failures without a sentence of their own show the error's phrase in the interface language (a timeout read "600000 ms").
- "Stop" in the panel now stops the agent process on the server; the answer written so far is kept and marked as stopped, so "Explain" asks again instead of opening the cut answer; the same holds for an answer cut by an error (limit, login, timeout). Closing the panel still lets the agent finish.
- Call log: tool targets are kept for exams only; in the panel a search query or a command can repeat the learner's question.
- Recordings keep only the machine-independent part of the request (no workspace path, no session id).
- Demo recordings: "Explain" for "How an LLM works" in English and Russian, and the agent call check.
- One default language: `STUDY_HUB_LANG` is the interface language until one is chosen on the first run, and the language of topic checks, exams and the panel for API requests without one (they defaulted to Russian, Russian and English).
- A saved panel answer is reopened only in the language it was written in; in the other language "Explain" asks the mentor again. Database schema version 2 (chats keep their language; older chats open in any language).
- Error messages: every error code the server sends is shown as a sentence in the interface language (`bad_material`, `internal_error`, `bad_request`, `answer_too_long`, `unknown_preset` and `bad_option` were shown raw, as were import and agent settings errors); the error banner translates codes itself, and a test keeps the codes and the phrases in step.
- macOS and Linux: an agent runs in its own process group, so Stop and a timeout also end the processes it started (also after the agent itself has exited), with SIGKILL for what is still alive 2 s after SIGTERM, and the call no longer waits for them; the hub stops running agents when it exits (Ctrl+C no longer reaches them directly).
- Deleting a panel chat while it answers stops its agent, and nothing of the chat stays in the database.
- Demo: "Check the agent call" says the answer comes from a recording instead of showing a working agent.
- Record mode: a follow-up question that continues the conversation is recorded per topic, so the same question on two topics no longer shares one recording.
- The English interface no longer shows a Russian line under a locked era gate; a test keeps each dictionary in its own script (no Cyrillic in English values, Cyrillic in every Russian one).

## 0.1.0 (2026-10-23)

First public cut.

- Local study hub: a tree of eras drawn as a star sky, topic checks by your own coding agent with a quote from your answer, era gates on a project folder with every quote verified in the file by the hub.
- Era I "CLI user": six setup topics lit by the hub's own probes (terminal, Node, git, agent), no exam.
- Agent presets for Claude Code (run live), Codex CLI and Gemini CLI (set up from vendor docs); model and effort chosen on the first run and in settings.
- Pack "AI Engineer": 8 eras, 13 adjacent areas, 172 topics, 660 open materials with terms of use and check dates; CC BY-SA 4.0.
- Interface and pack texts in English and Russian; first-run screen for language and agent.
- Demo mode on recorded answers; export and import of progress with a format version; database schema version.
- Checked on Windows; macOS and Linux start scripts are written but not yet run.
