# Changelog

## Unreleased

- Error messages: every error code the server sends is shown as a sentence in the interface language (`bad_material`, `internal_error`, `bad_request`, `answer_too_long`, `unknown_preset` and `bad_option` were shown raw, as were import and agent settings errors); the error banner translates codes itself, and a test keeps the codes and the phrases in step.

## 0.1.0 (2026-10-23)

First public cut.

- Local study hub: a tree of eras drawn as a star sky, topic checks by your own coding agent with a quote from your answer, era gates on a project folder with every quote verified in the file by the hub.
- Era I "CLI user": six setup topics lit by the hub's own probes (terminal, Node, git, agent), no exam.
- Agent presets for Claude Code (run live), Codex CLI and Gemini CLI (set up from vendor docs); model and effort chosen on the first run and in settings.
- Pack "AI Engineer": 8 eras, 13 adjacent areas, 172 topics, 660 open materials with terms of use and check dates; CC BY-SA 4.0.
- Interface and pack texts in English and Russian; first-run screen for language and agent.
- Demo mode on recorded answers; export and import of progress with a format version; database schema version.
- Checked on Windows; macOS and Linux start scripts are written but not yet run.
