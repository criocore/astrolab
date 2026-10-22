# Contributing

Thanks for looking. Two kinds of contributions are welcome: the engine (TypeScript) and the packs (JSON content).

## Engine

```
npm install
npm run typecheck
npm test            # unit tests on fake agent processes and recordings, no live CLI needed
npm run dev:server  # tsx watch on :4317
npm run dev:web     # Vite on :5173, proxies /api
```

- Keep the server local-only and keyless: no cloud calls, no telemetry, no credentials in the repo.
- Agent integrations go through presets in `agents.json` and the format handlers in `server/adapter.ts`. Verify flags against the vendor's documentation and say in the pull request what was run live and what was not.
- Tests for agent output use fake processes (`hooks.spawn`); add a test when you add or change a format handler.
- Interface strings live in `web/src/i18n.ts` in both languages. Do not hardcode text in components.
- Code comments are in English. Pack texts and UI strings are bilingual (ru, en).
- CI runs typecheck, tests, the pack check and the build on Ubuntu, Windows and macOS with Node 22 and 24.

## Packs

The curriculum is data: `packs/src/<pack>/`. The format is described in `docs/pack-format.md`. Run `npm run check:pack` before sending changes; it validates the schema, criterion coverage, repeats and the consent rules for channel sources.

Rules for materials:

- Only links and the pack's own texts. No retelling of other people's content, no copies.
- Every material carries the 7 rubric fields, `source`, `terms` and `checked_at`. If you are not sure about a license, do not guess: open the page and quote its terms.
- A channel post can be linked only when the channel author gave consent; the channel must be listed in the pack's `credits`.
- Keep vendor balance: no single vendor above half of the URLs in a topic.

Dead or moved links: open an issue with the "Dead link" template, or fix the URL and update `checked_at`.

## Pull requests

One topic per pull request. Describe what you verified and how. Pack text changes are under CC BY-SA 4.0, code under MIT; by contributing you agree to those terms and to the [code of conduct](CODE_OF_CONDUCT.md).
