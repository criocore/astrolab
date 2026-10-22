# Brag Plan: Astrolabe

## What is this app?
Astrolabe is a local study hub: a map of learning steps (eras) drawn as a star sky, where the learner's own coding agent (Claude Code, Codex CLI or Gemini CLI) asks questions on each topic, grades answers with a quote from the learner's own words, and checks a real project folder at each era gate, with the hub itself verifying every quote in the files.

## The angle
Speak to the person who has just finished Era I (installed Node, git and an AI helper) and wants to keep learning. No jargon: no "agent", "repository", "quotes verified in files", "presets", "127.0.0.1", "keyless". The feeling: you are not alone, there is a map, your first step is already lit, and someone honest checks what you understood and what you built.

## Hook (first 2-3 seconds)
An empty, slowly drifting star sky. Then one line: "Learning AI alone? Nobody checks you."

## Key moments (the middle)
- The map of eight eras, the first one lit, the rest dark: a path, not a pile of courses.
- Era I lighting itself: four lines get check marks one by one (the computer is ready), the gate pulses open, "The first step is done".
- A topic check: a plain question, the learner's answer typed in their own words, "accepted", and the exact words that earned it highlighted inside the answer.
- The era gate: a folder name, a five-item checklist, four green, one red "cost calculation is missing", "not passed yet". Built something, checked for real.

## Outro / punchline
"Free. Open. Yours." then the astrolabe emblem and github.com/criocore/astrolab.

## User flow worth showing
1. Start the hub → Era I is already mostly lit (probes: terminal, Node, git, AI helper) → gate open.
2. Open a topic → "Check" → question → answer in own words → verdict with the quote highlighted.
3. Open a gate → name the project folder → checklist with file+quote per item, one gap → not passed yet, here is what is missing.

## Tone
- Preset: cinematic
- Creative direction: quiet night-sky film for a beginner; calm, warm, honest. Big type, long holds, nothing flashes.
- Interpretation: slow drifting sky under everything, each scene fades in over 0.4 s, holds fully static for at least 3.5 s, fades out over 0.4 s; cuts land on beats of the track; captions are short declarative sentences of at most 8 words; audio-reactivity only on the sky glow, never on text.

## Format: landscape — 1920x1080
## Duration: 45 s (the user explicitly asked for 45 s instead of the 15–25 s default: the video explains a system, and their earlier 22–25 s cuts were rejected as too fast to read)

## Visual identity (from the project)
- Background: #090c17 (body), panels #121a33 / #1a2444
- Accent: gold #e2b955, brass #b08d57, teal #2fbf9a (done/ok), ember #e0674f (gap)
- Text: #ece6d6, muted #a8adbd
- Display font: Cinzel (600/700), as in the app header and era titles
- Body font: Inter
- Strongest visual element: the drifting star sky with constellations (one star per topic, lit stars for learned topics) and the gold era cards with the emblem in a double ring; the pulsing open gate of Era I.

## Share copy (draft)
Astrolabe. A map for learning AI with the AI helper you already have: it asks, you answer in your own words, it checks what you built. Free and open.

## Audio direction
- Role: cinematic support, calm bed
- Music: assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (110 BPM, steady and clean, 1:58). License of the ende.app "Happy Beats / Business Moves" series is unverified: confirm before public posting or swap the track.
- Music treatment: start at 0 s at 0.32, fade in over 1 s, fade out over the last 2.5 s under the address.
- Music cue guidance: preset read from assets/music/…music-cues.json (tempo 109.96 BPM, beat grid ~0.546 s). Strong cues in the first window: 8.74, 13.11, 17.47, 18.56, 22.93 s. Scene cuts snap to the nearest beat; major moments: Era I gate open near 13.11 s, "accepted" near 18.56 s. Sequential text rows (the four probe lines, the five checklist rows) reveal every other beat (~1.1 s apart), then hold.
- Audio-reactive treatment: subtle; music RMS drives only the sky glow/vignette warmth. No waveform, no text pulsing.
- SFX posture: sparse. A soft glass clink when a star or check mark lights, one bell on the gate opening, one bell on the final emblem. Nothing on captions.
- Audio-coupled moments: scene 3 four check marks (glass clink each), scene 4 typed answer (keyboard keypresses, randomized, low volume), scene 5 checklist rows (clink per green, soft error for the red one), scene 8 emblem landing (bell).
- Restraint rule: no sound on captions, no SFX closer than 0.5 s apart except typing, music never above 0.35.

## Storyboard

### Scene 1 — Alone — 5 s (0.0–5.0)
Full-bleed star sky from the app (random stars + faint constellation lines), drifting slowly down-right. Nothing else for the first second. Caption fades in at 1.0 s, centred, Cinzel: "Learning AI alone? Nobody checks you." Holds until 4.6 s, fades out.
Sequential/interaction: none
Audio intent: quiet, a little lonely
Audio-coupled idea: none
Music: fades in from 0
Transition mood: soft crossfade → Scene 2

### Scene 2 — The map — 6 s (5.0–11.0)
Rebuilt from the app's tree: a row of eight era cards (emblem in double gold ring, "Era I" … "Era VIII", era title small under it). Era I card is gold and lit with 4/6 stars on its progress bar; the other seven are dim. Under the cards, the dot rows of each era. A faint constellation line links the cards. Caption: "A map. One step at a time." in at 5.4 s, hold, out at 10.6 s.
Sequential/interaction: the eight cards arrive left to right on consecutive beats (accents only, no text to read), then hold.
Audio intent: things fall into place
Audio-coupled idea: card arrivals on the beat grid, soft drop sounds on the first and last only
Transition mood: clean crossfade → Scene 3

### Scene 3 — Step one — 5 s (11.0–16.0)
The Era I panel from the app: the heading "The first step is done" (the app's own text), then the workstation log with four lines: The terminal, Node.js and npm, The coding agent, Git and a project folder. Each line gets a teal check mark one by one (every other beat). The open gate card ("Gate open") below pulses gold→teal once all four are lit (around 13.1 s, strong cue). Caption: "Your computer is ready? Step one done." in at 11.4 s, out at 15.6 s.
Sequential/interaction: yes, four check marks one by one
Audio intent: small wins
Audio-coupled idea: glass clink per check mark; bell when the gate turns teal
Transition mood: clean crossfade → Scene 4

### Scene 4 — Explain it your way — 7 s (16.0–23.0)
The topic check from the app, rebuilt: a question card "How does the model produce text, in your own words?" (plain question on the real topic "How an LLM works"), an answer box where this answer types out: "It guesses the next word again and again, adding each one to what it already wrote." Then a verdict chip "accepted" appears (around 18.56 s strong cue is too early for typing to finish; lock the verdict to the beat nearest 20.2 s) and the words "guesses the next word again and again" get a gold highlight inside the answer. Caption: "Explain it your way. Get real feedback." in at 16.4 s, out at 22.6 s.
Sequential/interaction: yes, typed answer, then verdict, then highlight
Audio intent: typing, then relief
Audio-coupled idea: randomized keypresses at low volume while typing; one soft clink on "accepted"
Transition mood: clean crossfade → Scene 5

### Scene 5 — Checked for real — 8 s (23.0–31.0)
The gate card from the app: folder field with "my-first-llm-app" (a plausible learner folder name, not a real path), then a five-row checklist, each row with a file name and a short quote: four rows turn teal "yes" one by one, the fifth turns ember "no" with the note "cost calculation is missing". Below: "not passed yet". Rows reveal every other beat; the red one lands last and holds ≥2 s. Caption: "Build something. It gets checked for real." in at 23.4 s, out at 30.6 s.
Sequential/interaction: yes, five rows one by one
Audio intent: tension then honesty
Audio-coupled idea: clink per teal row; soft error buzz (low) on the red row
Transition mood: soft crossfade → Scene 6

### Scene 6 — Your helper — 5 s (31.0–36.0)
Three name plates on the sky: Claude Code · Codex CLI · Gemini CLI, in the app's brass/gold card style. Small print under them: "Claude Code tested live; Codex CLI and Gemini CLI set up from their docs." Caption: "Uses the AI helper you already have." in at 31.4 s, out at 35.6 s.
Sequential/interaction: three plates arrive one by one on beats, then hold
Audio intent: reassurance
Audio-coupled idea: soft drop per plate
Transition mood: clean crossfade → Scene 7

### Scene 7 — Yours — 4 s (36.0–40.0)
A single card with three words in Cinzel on separate lines, gold: "free", "open", "on your computer". Caption: "Free. Open. Yours." in at 36.4 s, out at 39.6 s.
Sequential/interaction: three lines on beats
Audio intent: calm confidence
Audio-coupled idea: none beyond the beat-aligned lines
Transition mood: soft crossfade → Scene 8

### Scene 8 — Address — 5 s (40.0–45.0)
The astrolabe emblem from the app header (rete, alidade, ticks) lands centred with a soft bell at 40.4 s; under it "Astrolabe" in Cinzel and the address "github.com/criocore/astrolab". Music fades out over the last 2.5 s. Caption: "github.com/criocore/astrolab" (the address itself is the caption).
Sequential/interaction: emblem lands, then two text lines
Audio intent: landing
Audio-coupled idea: bell on the emblem, music fade
Transition mood: hold to black

**Music mood for this video:** cinematic, calm
**Audio summary:** a steady bed fades in under the lonely sky, small glass clinks mark every star and check mark, one bell opens the gate and one bell lands the emblem, the bed fades out under the address.

## Grounding of on-screen claims
- "The first step is done", "Gate open", the four log lines, "accepted", "not passed yet", "cost calculation is missing": all are the app's own UI text or its demo exam (fixtures/exam-g0-demo, where the cost calculation is deliberately missing).
- "Claude Code tested live; Codex CLI and Gemini CLI set up from their docs": README "Agents" section.
- "free", "open", "on your computer": MIT license, open pack, server on the local machine only.
- The question and answer in scene 4 are a plausible example on the real topic "How an LLM works" (criterion 1 of that topic), not a recorded transcript.
