**What this changes**

**How it was verified** (what ran live, what ran on recordings, which OS)

**Pack changes** (if any): one topic per pull request, `npm run check:pack` passes, every new material has `terms` and `checked_at`, channel sources have consent in `credits`.

**Checklist**
- [ ] `npm run typecheck`, `npm test`, `npm run check:pack` pass
- [ ] Interface strings are in `web/src/i18n.ts` in both languages
- [ ] No keys, tokens or personal paths in the diff
