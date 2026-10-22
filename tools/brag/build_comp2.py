# Astrolabe brag, v2: fast fill, long static hold. Usage: python tools/brag/build_comp2.py <lang en|ru> <output-dir> [short]
# <output-dir>/composition must hold assets/ (music + sfx, see brag-plan.md) and the scaffold files from "npx hyperframes init".
# Every scene: 0.4 s in, all content on screen within ~1.5-2.5 s (quarter/half-beat steps), then fully static until 0.4 s before the cut.
import json, sys, os, shutil
lang, OUT = sys.argv[1], sys.argv[2]
MODE = sys.argv[3] if len(sys.argv) > 3 else 'full'  # full | short (scenes 3 and 5 only)
KEEP = [3, 5] if MODE == 'short' else list(range(1, 9))
COMP = os.path.join(OUT, 'composition')
SCRATCH = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(os.path.join(COMP, 'assets', 'music', 'happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json'), encoding='utf-8'))
beats = [round(b['time'] if isinstance(b, dict) else b, 3) for b in cues['beats']]
beats = [b for b in beats if b < 46]
BEAT = 60 / cues.get('tempo', 109.96)

def nearest(t): return min(beats, key=lambda b: abs(b - t))
def beat_after(t): return min(b for b in beats if b >= t - 0.02)
def seq(t0, n, frac):
    """n moments starting at the first beat >= t0, spaced by frac of a beat (0.25 / 0.5 / 1)"""
    b0 = beat_after(t0); step = BEAT * frac
    return [round(b0 + i * step, 3) for i in range(n)]

if MODE == 'short':
    targets = [0.0, 0.0, 0.0, 5.8, 5.8, 12.6, 12.6, 12.6, 12.6]
    B = [0.0] + [(0.0 if t == 0 else nearest(t)) for t in targets[1:-1]] + [None]
    TOTAL = B[5]; B = [min(b, TOTAL) if b is not None else TOTAL for b in B]
else:
    TOTAL = 45.0
    targets = [0.0, 4.0, 9.9, 16.3, 23.5, 30.6, 35.9, 40.4, TOTAL]
    B = [0.0] + [nearest(t) for t in targets[1:-1]] + [TOTAL]
S = {i + 1: (B[i], B[i + 1]) for i in range(8)}

M = {}
M['s2_cards'] = seq(S[2][0] + 0.45, 8, 0.25)
M['s3_checks'] = seq(S[3][0] + 0.5, 4, 0.5)
M['s3_gate'] = beat_after(M['s3_checks'][-1] + 0.35)
M['s4_type_start'] = round(S[4][0] + 0.7, 3); M['s4_type_dur'] = 1.4
M['s4_accept'] = beat_after(M['s4_type_start'] + M['s4_type_dur'] + 0.35)
M['s5_rows'] = seq(S[5][0] + 0.7, 5, 0.5)
M['s5_verdict'] = beat_after(M['s5_rows'][-1] + 0.4)
M['s6_plates'] = seq(S[6][0] + 0.5, 3, 0.25)
M['s6_small'] = round(M['s6_plates'][-1] + 0.35, 3)
M['s7_lines'] = seq(S[7][0] + 0.4, 3, 0.25)
M['s8_emblem'] = round(S[8][0] + 0.4, 3); M['s8_name'] = round(S[8][0] + 0.9, 3); M['s8_addr'] = round(S[8][0] + 1.3, 3)

STR = {
 'en': dict(
  font_link='family=Cinzel:wght@600;700&family=Inter:wght@400;500;600', display='"Cinzel", Georgia, serif', cap_size='54px', cap_center_size='64px', line_size='84px', name_size='56px',
  cap1='Learning AI alone?<br/>Nobody checks you.', cap2='A map. One step at a time.', cap3='Your computer is ready? Step one done.', cap4='Explain it your way. Get real feedback.',
  cap5='Build something. It gets checked for real.', cap6='Uses the AI helper you already have.', cap7='Free. Open. Yours.',
  era_kicker='Era', topics='topics', h='h',
  eras=['CLI user', 'LLM user', 'Agent practitioner', 'Agent configurator', 'Junior AI Engineer', 'Middle AI Engineer', 'Senior AI Engineer', 'Lead / AI architect'],
  s3_kicker='Era I · CLI user', s3_h='The first step is done', s3_p='You opened a terminal, started the hub and it already sees your workstation.',
  log=['The terminal', 'Node.js and npm', 'The coding agent', 'Git and a project folder'], not_yet='not yet', found='found',
  gate_open='Gate open', gate_text='No exam here: the hub lights these stars itself when it sees your workstation.',
  s4_kicker='Topic check · How an LLM works', s4_q='Question 1 of 3', s4_qt='How does the model produce text? Say it in your own words.',
  answer='It guesses the next word again and again, adding each one to what it already wrote.', hl='guesses the next word again and again',
  accepted='accepted', why='the highlighted words are what counted',
  s5_kicker='Gate of era II', folder='my-first-llm-app', submit='Submit for review', yes='yes', no='no', found_file='✓ found in file',
  rows=['Calls the model with a response schema', 'Checks the answer against the schema', 'Retries invalid or cut-off answers', 'Sets a token limit and handles it', 'Shows what one request costs'],
  note='cost calculation is missing', not_passed='not passed yet', result_m='4 of 5. Add the cost calculation and submit again.',
  small='Claude Code tested live; Codex CLI and Gemini CLI set up from their docs.',
  lines=['free', 'open', 'on your computer'], name='ASTROLABE',
  share='Astrolabe.\nA map for learning AI with the AI helper you already have: it asks, you answer in your own words, and what you build gets checked for real. Free, open, on your computer.\ngithub.com/criocore/astrolab\n'),
 'ru': dict(
  font_link='family=Cormorant+SC:wght@600;700&family=Inter:wght@400;500;600', display='"Cormorant SC", Georgia, serif', cap_size='62px', cap_center_size='74px', line_size='96px', name_size='64px',
  cap1='Учишь ИИ один?<br/>Никто не проверяет.', cap2='Карта. Один шаг за раз.', cap3='Компьютер готов? Первый шаг сделан.', cap4='Объясни своими словами. Получи честный ответ.',
  cap5='Собери что-то. Это проверят по-настоящему.', cap6='Работает с ИИ-помощником, который уже есть.', cap7='Бесплатно. Открыто. Твоё.',
  era_kicker='Эпоха', topics='тем', h='ч',
  eras=['Пользователь CLI', 'Пользователь LLM', 'Практик агента', 'Настройщик агента', 'Junior AI Engineer', 'Middle AI Engineer', 'Senior AI Engineer', 'Lead / архитектор ИИ'],
  s3_kicker='Эпоха I · Пользователь CLI', s3_h='Первый шаг сделан', s3_p='Вы открыли терминал, запустили хаб, и он уже видит ваше рабочее место.',
  log=['Терминал', 'Node.js и npm', 'Coding-агент', 'Git и папка проекта'], not_yet='пока нет', found='есть',
  gate_open='Эволюция открыта', gate_text='Экзамена нет: эти звёзды зажигает сам хаб, когда видит ваше рабочее место.',
  s4_kicker='Проверка темы · Как работает LLM', s4_q='Вопрос 1 из 3', s4_qt='Как модель получает текст? Скажите своими словами.',
  answer='Она угадывает следующее слово снова и снова, добавляя каждое к тому, что уже написала.', hl='угадывает следующее слово снова и снова',
  accepted='принято', why='подсвеченные слова это то, что засчитано',
  s5_kicker='Эволюция эпохи II', folder='my-first-llm-app', submit='Сдать на проверку', yes='есть', no='нет', found_file='✓ найдено в файле',
  rows=['Вызывает модель со схемой ответа', 'Проверяет ответ по схеме', 'Повторяет запрос при битом ответе', 'Ставит лимит токенов и обрабатывает его', 'Показывает цену одного запроса'],
  note='расчёта цены нет', not_passed='не сдано', result_m='4 из 5. Добавьте расчёт цены и сдайте снова.',
  small='Claude Code проверен вживую; Codex CLI и Gemini CLI настроены по документации.',
  lines=['бесплатно', 'открыто', 'на вашем компьютере'], name='АСТРОЛЯБИЯ',
  share='Астролябия.\nКарта для изучения ИИ с тем ИИ-помощником, который у вас уже есть: он спрашивает, вы отвечаете своими словами, а то, что вы собрали, проверяется по-настоящему. Бесплатно, открыто, на вашем компьютере.\ngithub.com/criocore/astrolab\n'),
}[lang]

ERA_META = [('2', 6, 4, True), ('18', 10, 0, False), ('52', 24, 0, False), ('76', 29, 0, False), ('95', 32, 0, False), ('130', 35, 0, False), ('49', 15, 0, False), ('68', 21, 0, False)]
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
eras_js = json.dumps([[ROMAN[i], STR['eras'][i], f"{h} {STR['h']}", dots, lit, on] for i, (h, dots, lit, on) in enumerate(ERA_META)], ensure_ascii=False)

QUOTES = ['Answer only with a JSON object that matches this JSON schema', 'def validate(obj: object) -> list[str]:', 'MAX_ATTEMPTS = 3', 'if stop_reason == "max_tokens":']
rows_html = '\n'.join(
    f'            <li><span class="chip">{STR["yes"]}</span><div><div class="what">{STR["rows"][i]}</div><div class="ev">main.py · <q>{q}</q><span class="vf">{STR["found_file"]}</span></div></div></li>'
    for i, q in enumerate(QUOTES)) + f'\n            <li class="no"><span class="chip no">{STR["no"]}</span><div><div class="what">{STR["rows"][4]}</div><div class="ev">README.md · <q>Not computed yet.</q></div><div class="note">{STR["note"]}</div></div></li>'
log_html = '\n'.join(f'            <li><span class="ico"><span class="ck">✓</span></span>{t}<span class="st">{STR["not_yet"]}</span><span class="st ok">{STR["found"]}</span></li>' for t in STR['log'])
lines_html = ''.join(f'<div>{t}</div>' for t in STR['lines'])

# keypress moments: one sound every 3 characters of the typed answer
keys = [round(M['s4_type_start'] + M['s4_type_dur'] * i / len(STR['answer']), 3) for i in range(0, len(STR['answer']), 3)]
DUR = {'interface/drop_001.ogg': 0.15, 'impact/impactGlass_light_001.ogg': 0.25, 'impact/impactGlass_light_002.ogg': 0.25, 'impact/impactBell_heavy_000.ogg': 1.5,
       'impact/impactBell_heavy_003.ogg': 0.7, 'interface/error_005.ogg': 0.5, 'impact/impactSoft_medium_001.ogg': 0.2}
sfx = []
sfx.append((M['s2_cards'][0], 'interface/drop_001.ogg', 0.5, 2)); sfx.append((M['s2_cards'][-1], 'interface/drop_001.ogg', 0.5, 2))
for t in M['s3_checks']: sfx.append((t, 'impact/impactGlass_light_001.ogg', 0.45, 3))
sfx.append((M['s3_gate'], 'impact/impactBell_heavy_000.ogg', 0.55, 3))
for i, t in enumerate(keys): sfx.append((t, f'keyboard/keypress-00{(i % 8) + 1}.wav', 0.22, 4))
sfx.append((M['s4_accept'], 'impact/impactGlass_light_002.ogg', 0.5, 4))
for t in M['s5_rows'][:4]: sfx.append((t, 'impact/impactGlass_light_001.ogg', 0.4, 5))
sfx.append((M['s5_rows'][4], 'interface/error_005.ogg', 0.28, 5))
sfx.append((M['s5_verdict'], 'impact/impactSoft_medium_001.ogg', 0.45, 5))
for t in M['s6_plates']: sfx.append((t, 'interface/drop_001.ogg', 0.4, 6))
sfx.append((M['s8_emblem'], 'impact/impactBell_heavy_003.ogg', 0.6, 8))
sfx = [x for x in sfx if x[3] in KEEP]
audio_html = '\n'.join(
    f'      <audio id="sfx-{i}" class="clip" data-start="{t:.3f}" data-duration="{DUR.get(f, 0.3)}" data-track-index="{11 + i}" data-volume="{v}" src="assets/sfx/{f}"></audio>'
    for i, (t, f, v, _sc) in enumerate(sfx))

def fmt(xs): return '[' + ', '.join(f'{x:.3f}' for x in xs) + ']'
timing_js = f"""
    const B = {fmt(B)};  // scene cuts, snapped to the beat grid
    const BEATS = {fmt(beats)};
    const M = {{ s2_cards: {fmt(M['s2_cards'])}, s3_checks: {fmt(M['s3_checks'])}, s3_gate: {M['s3_gate']:.3f},
      s4_type_start: {M['s4_type_start']:.3f}, s4_type_dur: {M['s4_type_dur']:.3f}, s4_accept: {M['s4_accept']:.3f},
      s5_rows: {fmt(M['s5_rows'])}, s5_verdict: {M['s5_verdict']:.3f}, s6_plates: {fmt(M['s6_plates'])}, s6_small: {M['s6_small']:.3f},
      s7_lines: {fmt(M['s7_lines'])}, s8_emblem: {M['s8_emblem']:.3f}, s8_name: {M['s8_name']:.3f}, s8_addr: {M['s8_addr']:.3f} }};
    const ERAS = {eras_js};
    const ANSWER = {json.dumps(STR['answer'], ensure_ascii=False)};
    const HL = {json.dumps(STR['hl'], ensure_ascii=False)};
"""

html = open(os.path.join(SCRATCH, 'comp_template2.html'), encoding='utf-8').read()
for i in range(1, 9):
    a, b = S[i]
    html = html.replace(f'__S{i}_START__', f'{a:.3f}').replace(f'__S{i}_DUR__', f'{b - a:.3f}')
subs = dict(STR); subs.update(dict(plate_size='34px' if lang == 'en' else '42px', rows_html=rows_html, log_html=log_html, lines_html=lines_html, timing_js=timing_js, audio_sfx=audio_html, lang=lang))
for k, v in subs.items():
    if isinstance(v, str): html = html.replace('{{' + k + '}}', v)
assert '{{' not in html, [l for l in html.split('\n') if '{{' in l][:3]
if MODE == 'short':
    import re as _re
    for i in range(1, 9):
        if i not in KEEP: html = _re.sub(r'\n      <!-- Scene %d:.*?</section>\n' % i, '\n', html, flags=_re.S)
    html = html.replace('data-duration="45"', 'data-duration="%.3f"' % TOTAL)
    html = html.replace("tl.to(skyState, { t: 45, duration: 45,", "tl.to(skyState, { t: %.3f, duration: %.3f," % (TOTAL, TOTAL))
open(os.path.join(COMP, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(OUT, 'share-copy.txt'), 'w', encoding='utf-8').write(STR['share'])
hold = lambda i, full: round(S[i][1] - 0.4 - full, 2)
print(lang, 'scenes', [(i, round(S[i][0], 2), round(S[i][1] - S[i][0], 2)) for i in S])
print('static hold after full content:', {2: hold(2, M['s2_cards'][-1] + 0.45), 3: hold(3, M['s3_gate'] + 0.5), 4: hold(4, M['s4_accept'] + 0.6), 5: hold(5, M['s5_verdict'] + 0.45), 6: hold(6, M['s6_small'] + 0.5), 7: hold(7, M['s7_lines'][-1] + 0.45), 8: hold(8, M['s8_addr'] + 0.5)})
