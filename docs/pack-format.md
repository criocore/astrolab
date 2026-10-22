# Astrolabe pack format (schema v2)

> Русская версия: [pack-format.ru.md](pack-format.ru.md)

A pack is data, the hub is the engine. Anyone can build their own pack from sources in this format.

## Sources: `packs/src/<pack>/`

```
pack.json            metadata: id, version, title, description, license, grades[], credits[]
G0/<topic>.json      core topics of a grade (one topic = one file)
S0/<topic>.json      topics of an era without a gate (gate: none), each with a probe
R1/levels.json       an adjacent area: id, title, levels[{level, hours, to_grade, check}]
R1/<L>-<topic>.json  topics of an area level (A, B, C, PII)
```

Topic: `id`, `order`, `title{ru,en}`, `goal{ru,en}`, `criteria{ru[],en[]}`, `materials[]`, optionally `own_texts[]`, `refs[]`, `minutes_by_track{}`, `minutes_total`. A core topic carries `grade`; an area topic carries `area`, `level`, `to_grade`.

A grade with `gate: "none"` has no exam and no `checks`: it never locks the next grade, and every one of its topics carries a `probe` that the hub runs itself instead of a mentor check: `hub` (the hub is running), `node` (Node 22.13+), `git` (`git --version` in PATH), `agent` (the chosen CLI is found) or `manual` (a checkbox). The bundled pack uses this for Era I, workstation setup. The interface never shows grade ids (`S0`, `G0`): eras are numbered by `order`.

Material: the 7 mandatory rubric fields plus provenance: `kind` (understand | do), `type` (docs | course | video | paper | repo | book | article | notebook | report | tool), `access` (free | freemium | paid), `date` (YYYY-MM, YYYY or null) and `classic`, `minutes`, `lang`, `checked_at`, `closes{ru,en}` and `criteria[]`, `source` (web | channel:<channel>/<post> | catalog), `terms` (license or terms of use). Optional `track` (python | typescript | k6 | locust and so on).

Rules checked by `npm run check:pack`:
- a topic has at least one `understand` and one `do` (a material or an own text);
- every criterion is closed by at least one material, own text or `refs`;
- `refs` point to an existing topic and its criterion;
- `order` is unique inside a grade or a level, every level has topics, every grade has a core;
- a `probe` is allowed only in a `gate: none` grade, and every topic of such a grade has one; such a grade has no `checks`;
- `minutes_total` equals the sum of minutes (or the maximum across tracks);
- the sources contain no roadmap.sh and no YouTube;
- a channel in `source` must be listed in the pack's `credits` (the author's consent).

## Build: `npm run build:pack`

`tools/build-pack.ts` walks topics in study order: the G0 core, then the area levels with `to_grade: G0` (by area number, then level), then G1 and so on. Each topic gets a `key` (`G0/tokens-context`, `R1/A-git-basics`) and a running `seq`.

Repeats: the first occurrence of a URL is studied; in later topics the material gets `repeat_of: {topic, title}` and the hub shows the note "you already covered this, worth a refresher". `refs` get the `title` of the target topic. Grade hours = `hours_core` + the hours of the attached levels.

Output: `packs/<pack>.json` (validated against `packs/schema/pack.schema.json`) and `packs/<pack>.credits.md` (channels with consent and source domains).

## Exam checks: `checks`

Every grade in `pack.json` has `checks: {ru: [...], en: [...]}`: 5 to 8 short statements, the same count and order in both languages. This is the grade exam rubric: the examiner must confirm each statement with one file path and one exact quote from the learner's folder. The check id in the exam is `G0#1`, `G0#2` and so on in order. The exam is passed only when every check has a `pass` verdict and the hub has mechanically found the quote in the file. The `exam` sentence remains the task statement for the learner. `tools/check-pack.ts` checks presence, count (5–8) and matching lengths of ru and en.

## Languages

All pack texts are objects `{ru, en}`. The interface shows the text of the chosen language and falls back to the other one, so a single-language pack works too, but `check:pack` requires both keys.

## License

Pack texts (topics, criteria, own texts) are CC BY-SA 4.0. Other people's materials stay with their authors under their terms; the pack holds only links and the `terms` field.
