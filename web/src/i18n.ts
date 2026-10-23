// UI dictionary. Package texts (topics, criteria, exams) come from the package in both languages; only hub strings live here.
// Key = short English name. Value: a string with {x} substitutions, or a function of a number for plurals.
export type Lang = 'ru' | 'en';
type Entry = string | ((n: number) => string);

// Russian plurals: 1 тема, 2 темы, 5 тем. English: 1 topic, 2 topics.
export const ruPl = (n: number, one: string, few: string, many: string) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
export const enPl = (n: number, one: string, other: string) => (n === 1 ? one : other);

const en = {
  'app.name': 'Astrolabe',
  'tab.chronicle': 'Chronicle', 'tab.rutter': 'Rutter',
  'brand.home': 'Back to the tree of eras',
  'menu.title': 'Settings', 'menu.open': 'Search and settings', 'menu.search': 'Search the program', 'menu.search.ph': 'topic, criterion, material',
  'menu.track': 'Track', 'menu.lang': 'Language', 'menu.export': 'Export', 'menu.export.t': 'Download progress as JSON', 'menu.import': 'Import', 'menu.import.t': 'Load progress from JSON',
  'menu.setup': 'Setup: language, agent, model',
  'load.fail': 'Could not load: {e}', 'loading': 'Loading…', 'error.hide': '(click to hide)',
  'import.confirm': 'Import will replace all current progress with “{name}”.', 'import.replace': 'Replace', 'cancel': 'Cancel',

  'status.in_progress': 'in progress', 'status.gap': 'gap', 'status.learned': 'learned',
  'err.locked': 'The grade is locked: pass the previous exam first.', 'err.limit': 'The agent’s usage limit is exhausted. Wait and retry.',
  'err.not_found': 'Agent not found: the CLI is not in PATH. Open Setup in the menu.', 'err.auth': 'The agent is not signed in. Sign in to the CLI and retry.',
  'err.timeout': 'The agent did not answer in time.', 'err.schema_invalid': 'The agent’s answer failed the format check, try again.',
  'err.quote_not_in_answer': 'The agent could not quote your answer, try again.', 'err.no_recording': 'Replay mode: there is no recording for this request.',
  'err.bad_folder': 'Folder not found. Give an absolute path to the artifact folder.', 'err.agent_failed': 'The agent failed, try again.',
  'err.stopped': 'Stopped.', 'err.exit_code': 'The agent exited with an error.', 'err.bad_output': 'The agent returned no result.',
  'err.mode_not_supported': 'This agent preset does not support this mode.', 'err.pack_mismatch': 'The file belongs to another pack.',
  'err.bad_material': 'The agent named a material that is not in this topic, try again.', 'err.internal_error': 'The hub failed while checking the answer. Try again.',
  'err.unknown_preset': 'There is no such agent preset.', 'err.bad_option': 'This value is not accepted: one word, no spaces or quotes.',
  'err.bad_request': 'The hub could not read this request.', 'err.answer_too_long': 'The answer is too long: up to 4000 characters.',

  'agent.saved.t': 'Saved answer, the agent is not called', 'agent.panel.t': 'Answer in the panel on the right',
  'agent.prep': 'Prepare for the exam', 'agent.explain': 'Explain', 'agent.task': 'Task', 'agent.ask': 'Ask…',
  'agent.chats': 'Chats ({n})', 'agent.chats.t': 'Last saved chat', 'agent.terminal': '⌨ In terminal', 'agent.terminal.t': 'Interactive agent session in a terminal',
  'agent.q.ph': 'Your own question on the topic', 'agent.send': 'Ask',
  'mat.classic': 'classic', 'mat.checked': 'checked {d}', 'kind.do': 'do', 'kind.understand': 'understand', 'min.n': '~{n} min',
  'mat.repeat': 'you already covered this in “{t}”, worth a refresher',
  'topic.more': 'details', 'topic.take': 'Start working', 'topic.minutes.t': 'minutes of materials', 'topic.hours.t': 'hours spent', 'hours.n': '{n} h',
  'own.text': 'pack’s own text, {terms}', 'ref.topic': 'topic {k}', 'note.ph': 'Note on the topic, goes to the Chronicle', 'hours.label': 'h',
  'topic.locked': 'The topic is locked: pass the previous grade’s exam first. Materials are open, the check is not.',
  'check.new': 'New check', 'check.start': 'Check the topic', 'check.history': 'History', 'check.writing': 'the mentor is writing questions…',
  'check.off': 'agent not found, the check is unavailable', 'check.answer.ph': 'Answer in your own words', 'check.reading': 'the mentor is reading…', 'check.send': 'Submit',
  'verdict.pass': 'accepted', 'verdict.gap': 'gap', 'check.close': 'Close the gap:', 'check.learned': 'Topic learned: all questions accepted.', 'check.none': 'No checks yet.',
  'check.row': (n: number) => `${n} ${enPl(n, 'question', 'questions')}`, 'check.attempts': 'attempts {a} · accepted {p}',
  'exam.title': 'Exam', 'level.check': 'Level check', 'exam.passed': 'passed', 'exam.locked': 'Locked until the previous grade’s exam is passed.',
  'exam.folder.ph': 'Absolute path to the artifact folder (repository, report)', 'exam.stop': 'Stop', 'exam.submit': 'Submit for review',
  'exam.note': 'The agent reads only this folder (Read, Grep, Glob), writes nothing and runs nothing. A verdict per criterion with a file and a quote.',
  'exam.opening': 'the agent is opening the folder…', 'exam.failed': 'not passed', 'src.record': 'recording', 'src.live': 'live agent',
  'chk.pass': 'yes', 'chk.gap': 'no', 'chk.unclear': 'unclear', 'chk.unverified': 'not verified', 'exam.ctx': 'Exam {t}',
  'panel.title': 'Mentor ({p})', 'panel.stop': '■ Stop', 'panel.stop.t': 'Stop the agent', 'panel.redo': '↻ Again', 'panel.redo.t': 'New agent call, spends tokens',
  'panel.terminal.t': 'continue the session in a terminal', 'panel.close.t': 'Hide the panel; the answer is saved', 'panel.thinking': 'thinking…',
  'panel.busy.ph': 'The agent is answering…', 'panel.ask.ph': 'Follow-up question',
  'panel.foot': 'Answers are saved: a repeated “Explain” opens the saved one, “Again” calls the agent anew. In the panel the agent only reads and searches.',
  'tpl.explain': 'Explain the topic', 'tpl.task': 'Give a mini task', 'tpl.exam': 'Prepare for the exam',

  'j.minutes.t': 'minutes', 'j.min': 'min', 'j.notopic': 'no topic', 'j.text.ph': 'What you studied, what you understood, where the agent was wrong', 'j.add': 'Log', 'j.notes': 'Notes from topics',
  'ring.adopt': 'adopt', 'ring.trial': 'trial', 'ring.assess': 'assess', 'ring.hold': 'hold', 'radar.title': 'Technology radar', 'radar.tech.ph': 'Technology', 'radar.why.ph': 'Why', 'add': 'Add',
  'adr.title': 'ADR: technology decisions', 'adr.title.ph': 'Decision: what we choose', 'adr.ctx.ph': 'Context and what matters in the decision',
  'adr.opt.ph': 'Options (at least three) with pros and cons', 'adr.dec.ph': 'Decision and consequences', 'adr.save': 'Save ADR',
  'adr.proposed': 'proposed', 'adr.accepted': 'accepted', 'adr.superseded': 'superseded', 'adr.ctx': 'Context:', 'adr.opts': 'Options:', 'adr.dec': 'Decision:',
  'search.title': 'Search: “{q}”', 'search.core': 'core',

  'tech.meta': '{n} min · practice {d}', 'tech.gap': ' · gap', 'tech.progress': ' · in progress',
  'gate.head': 'Gate of era {e}', 'gate.done': 'passed, the next era is open', 'gate.open': 'submitted as an artifact folder', 'gate.locked': 'closed until the previous era’s evolution is passed',
  'level.passed': 'passed', 'level.btn': 'check',
  'era.label': 'Era {e}', 'topics.n': (n: number) => `${n} ${enPl(n, 'topic', 'topics')}`, 'era.meta': '{h} h · {l}/{t} topics',
  'lane.pick.t': '{l}: {a}/{b} topics. You can pick several', 'lane.core': 'AI core',
  'lane.tools': 'Tools', 'lane.data': 'Data', 'lane.arch': 'Architecture and operations', 'lane.quality': 'Quality and security', 'lane.product': 'Product and writing', 'lane.choice': 'Choosing technology',
  'working': 'In progress:', 'agent.missing': 'agent not found',
  'tip.exam': 'Gate of era {e}', 'tip.level': 'Level check {k}', 'tip.taken': 'taken', 'tip.gates': 'to this node: {g} gates', 'tip.path': 'to this node: {t} topics, {g} gates, ~{h} h of materials',

  'mag.not_started': 'faint star', 'mag.in_progress': 'bright star', 'mag.gap': 'variable star', 'mag.learned': 'first magnitude',
  'ss.gate': 'Era gate', 'ss.level': 'Level check', 'ss.era': 'Era {e}', 'ss.star': 'Star of era {e}', 'close': 'Close', 'ss.open.log': 'Open the log',
  'gate.free.head': 'Gate open', 'gate.free.text': 'No exam here: the hub lights these stars itself when it sees your workstation.', 'gate.free.done': 'the first step is done', 'gate.free.left': '{n} still to set up',
  'first.title': 'The first step is done',
  'first.body': 'You opened a terminal, started the hub and it already sees your workstation. That is the step most people never take.\n\nAhead are the eras: from a user of models to the one who builds agents and leads a team. Each star is one skill you can prove, each gate is a real artifact of yours. One topic a day is enough: the sky fills up on its own.',
  'probe.title': 'Workstation log', 'probe.ok': 'found', 'probe.missing': 'not yet', 'probe.manual.tick': 'I read this', 'probe.recheck': 'Check again', 'probe.hub.note': 'checked by the hub, not by the mentor',
  'probe.call': 'Check the agent call', 'probe.call.note': 'One short call of your agent, spends a little quota.', 'probe.call.ok': 'agent answers · {ms} ms', 'probe.call.err': 'no answer: {e}', 'probe.call.rec': 'answer from a recording (demo): no agent was called',
  'probe.agent.answers': 'agent signed in and answers', 'probe.agent.unknown': 'not checked yet: press the button below, or it lights after the first topic check', 'probe.call.via': 'answered {d}', 'probe.left': 'Still worth setting up',
  'err.format_unsupported': 'This export comes from a newer hub version. Update the hub, then import.', 'err.no_gate': 'This era has no exam.', 'err.probe_topic': 'This topic is checked by the hub itself, not by the mentor.',
  'ss.mag': 'Magnitude', 'ss.lane': 'Lane', 'ss.minutes': 'Minutes', 'ss.criteria': 'Criteria',
  'era.hours': '{t} h · core {c} · adjacent {a}', 'era.progress': '{l}/{t} topics learned', 'era.gate.passed': 'gate passed', 'era.open': 'era is open',
  'era.locked': 'locked until the previous exam is passed', 'ss.open.gate': 'Open the gate',

  'sky.show': 'Show the sky', 'sky.period': 'Sky revolution', 'sec.n': '{n} s', 'sky.angle': 'Drift direction', 'sky.flashes': 'Star flashes', 'sky.flash': 'Flash duration',
  'sky.concurrent': 'Lit at once', 'sky.reset': 'Reset the sky', 'sky.done': 'Done', 'sky.title': 'Sky', 'sky.settings': 'Sky settings',

  'ob.title': 'Welcome to Astrolabe', 'ob.lead': 'A local study hub: a ladder of grades, your own coding agent as the mentor, and an exam on your artifact folder where every quote is verified in the file.',
  'ob.lang': 'Language', 'ob.agent': 'Your coding agent',
  'ob.agent.note': 'The mentor and the examiner is a CLI that is already installed and signed in on this machine. The hub keeps no keys and never calls a model itself. Only `--version` is run to detect agents.',
  'ob.found': 'found · {v}', 'ob.notfound': 'not found in PATH', 'ob.install': 'how to install',
  'scope.restricted': 'exam: reads only inside the artifact folder', 'scope.sandbox': 'exam: no writes; can read the whole file system', 'scope.plan': 'exam: read-only mode',
  'ob.demo': 'Demo mode: the mentor’s answers come from recordings, no agent is needed.', 'ob.continue': 'Continue', 'ob.later': 'You can change the agent later in the settings menu.',
  'ob.checking': 'looking for agents…', 'ob.chosen': 'Selected',
  'opt.model': 'Model', 'opt.effort': 'Effort', 'opt.default': 'CLI default', 'opt.custom': 'other…', 'opt.custom.ph': 'model name as the CLI expects it',
  'opt.note': 'Passed to the CLI as flags on every call: topic checks, exams, the mentor panel and the terminal tab. Empty means the CLI’s own default.',
  'opt.effort.none': 'This CLI has no effort flag; thinking depth is set in its own settings.',
  'menu.agent': 'Agent', 'menu.saved': 'saved',
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;

const ru: Record<Key, Entry> = {
  'app.name': 'Астролябия',
  'tab.chronicle': 'Хроника', 'tab.rutter': 'Лоция',
  'brand.home': 'На дерево эпох',
  'menu.title': 'Настройки', 'menu.open': 'Поиск и настройки', 'menu.search': 'Поиск по программе', 'menu.search.ph': 'тема, критерий, материал',
  'menu.track': 'Трек', 'menu.lang': 'Язык', 'menu.export': 'Экспорт', 'menu.export.t': 'Скачать прогресс в JSON', 'menu.import': 'Импорт', 'menu.import.t': 'Загрузить прогресс из JSON',
  'menu.setup': 'Настройка: язык, агент, модель',
  'load.fail': 'Не удалось загрузить: {e}', 'loading': 'Загрузка…', 'error.hide': '(нажми, чтобы скрыть)',
  'import.confirm': 'Импорт заменит весь текущий прогресс файлом «{name}».', 'import.replace': 'Заменить', 'cancel': 'Отмена',

  'status.in_progress': 'в работе', 'status.gap': 'пробел', 'status.learned': 'изучено',
  'err.locked': 'Грейд закрыт: сначала экзамен предыдущего.', 'err.limit': 'Лимит подписки агента исчерпан. Подождите и повторите.',
  'err.not_found': 'Агент не найден: CLI нет в PATH. Откройте «Настройка» в меню.', 'err.auth': 'Агент не залогинен. Войдите в CLI и повторите.',
  'err.timeout': 'Агент не ответил вовремя.', 'err.schema_invalid': 'Ответ агента не прошёл проверку формы, попробуйте ещё раз.',
  'err.quote_not_in_answer': 'Агент не смог процитировать ваш ответ, попробуйте ещё раз.', 'err.no_recording': 'Режим воспроизведения: записи для этого запроса нет.',
  'err.bad_folder': 'Папка не найдена. Укажите абсолютный путь к папке с артефактом.', 'err.agent_failed': 'Агент не справился, попробуйте ещё раз.',
  'err.stopped': 'Остановлено.', 'err.exit_code': 'Агент завершился с ошибкой.', 'err.bad_output': 'Агент не вернул результат.',
  'err.mode_not_supported': 'Этот пресет агента не умеет такой режим.', 'err.pack_mismatch': 'Файл от другого пакета.',
  'err.bad_material': 'Агент назвал материал не из этой темы, попробуйте ещё раз.', 'err.internal_error': 'Хаб сломался при проверке ответа. Попробуйте ещё раз.',
  'err.unknown_preset': 'Такого пресета агента нет.', 'err.bad_option': 'Такое значение не подходит: одно слово, без пробелов и кавычек.',
  'err.bad_request': 'Хаб не смог разобрать запрос.', 'err.answer_too_long': 'Ответ слишком длинный: не больше 4000 символов.',

  'agent.saved.t': 'Сохранённый ответ, агент не вызывается', 'agent.panel.t': 'Ответ в панели справа',
  'agent.prep': 'Подготовиться к экзамену', 'agent.explain': 'Объясни', 'agent.task': 'Задание', 'agent.ask': 'Спросить…',
  'agent.chats': 'Разговоры ({n})', 'agent.chats.t': 'Последний сохранённый разговор', 'agent.terminal': '⌨ В терминале', 'agent.terminal.t': 'Интерактивная сессия агента в терминале',
  'agent.q.ph': 'Свой вопрос по теме', 'agent.send': 'Спросить',
  'mat.classic': 'классика', 'mat.checked': 'проверено {d}', 'kind.do': 'сделать', 'kind.understand': 'понять', 'min.n': '~{n} мин',
  'mat.repeat': 'вы это уже проходили в теме «{t}», стоит повторить',
  'topic.more': 'подробнее', 'topic.take': 'Взять в работу', 'topic.minutes.t': 'минуты материалов', 'topic.hours.t': 'потрачено часов', 'hours.n': '{n} ч',
  'own.text': 'свой текст пакета, {terms}', 'ref.topic': 'тема {k}', 'note.ph': 'Заметка к теме, попадёт в Хронику', 'hours.label': 'ч',
  'topic.locked': 'Тема закрыта: сначала сдайте экзамен предыдущего грейда. Материалы открыты, проверка нет.',
  'check.new': 'Новая проверка', 'check.start': 'Проверить тему', 'check.history': 'История', 'check.writing': 'наставник пишет вопросы…',
  'check.off': 'агент не найден, проверка недоступна', 'check.answer.ph': 'Ответьте своими словами', 'check.reading': 'наставник читает…', 'check.send': 'Отправить',
  'verdict.pass': 'принято', 'verdict.gap': 'пробел', 'check.close': 'Закрыть пробел:', 'check.learned': 'Тема изучена: все вопросы приняты.', 'check.none': 'Проверок ещё не было.',
  'check.row': (n: number) => `${n} ${ruPl(n, 'вопрос', 'вопроса', 'вопросов')}`, 'check.attempts': 'попыток {a} · принято {p}',
  'exam.title': 'Экзамен', 'level.check': 'Проверка уровня', 'exam.passed': 'сдан', 'exam.locked': 'Закрыто до сдачи экзамена предыдущего грейда.',
  'exam.folder.ph': 'Абсолютный путь к папке с артефактом (репозиторий, отчёт)', 'exam.stop': 'Остановить', 'exam.submit': 'Сдать на проверку',
  'exam.note': 'Агент читает только эту папку (Read, Grep, Glob), ничего не пишет и не запускает. Вердикт по каждому критерию с файлом и цитатой.',
  'exam.opening': 'агент открывает папку…', 'exam.failed': 'не сдан', 'src.record': 'запись', 'src.live': 'живой агент',
  'chk.pass': 'есть', 'chk.gap': 'нет', 'chk.unclear': 'неясно', 'chk.unverified': 'не подтверждено', 'exam.ctx': 'Экзамен {t}',
  'panel.title': 'Наставник ({p})', 'panel.stop': '■ Остановить', 'panel.stop.t': 'Остановить агента', 'panel.redo': '↻ Заново', 'panel.redo.t': 'Новый вызов агента, потратит токены',
  'panel.terminal.t': 'продолжить сессию в терминале', 'panel.close.t': 'Скрыть панель; ответ сохранён', 'panel.thinking': 'думает…',
  'panel.busy.ph': 'Агент отвечает…', 'panel.ask.ph': 'Уточнить вопрос',
  'panel.foot': 'Ответы сохраняются: повторное «Объясни» открывает сохранённый, «Заново» зовёт агента снова. В панели агент только читает и ищет.',
  'tpl.explain': 'Объясни тему', 'tpl.task': 'Дай мини-задание', 'tpl.exam': 'Подготовь к экзамену',

  'j.minutes.t': 'минуты', 'j.min': 'мин', 'j.notopic': 'без темы', 'j.text.ph': 'Что изучил, что понял, где агент ошибся', 'j.add': 'Записать', 'j.notes': 'Заметки из тем',
  'ring.adopt': 'берём в работу', 'ring.trial': 'пробуем', 'ring.assess': 'присматриваемся', 'ring.hold': 'не трогаем', 'radar.title': 'Радар технологий', 'radar.tech.ph': 'Технология', 'radar.why.ph': 'Почему', 'add': 'Добавить',
  'adr.title': 'ADR: решения о технологиях', 'adr.title.ph': 'Решение: что выбираем', 'adr.ctx.ph': 'Контекст и что важно в решении',
  'adr.opt.ph': 'Варианты (минимум три) с плюсами и минусами', 'adr.dec.ph': 'Решение и последствия', 'adr.save': 'Сохранить ADR',
  'adr.proposed': 'предложено', 'adr.accepted': 'принято', 'adr.superseded': 'заменено', 'adr.ctx': 'Контекст:', 'adr.opts': 'Варианты:', 'adr.dec': 'Решение:',
  'search.title': 'Поиск: «{q}»', 'search.core': 'ядро',

  'tech.meta': '{n} мин · практика {d}', 'tech.gap': ' · пробел', 'tech.progress': ' · в работе',
  'gate.head': 'Эволюция эпохи {e}', 'gate.done': 'пройдена, следующая эпоха открыта', 'gate.open': 'сдаётся по папке с артефактом', 'gate.locked': 'закрыта до эволюции предыдущей эпохи',
  'level.passed': 'сдана', 'level.btn': 'проверка',
  'era.label': 'Эпоха {e}', 'topics.n': (n: number) => `${n} ${ruPl(n, 'тема', 'темы', 'тем')}`, 'era.meta': '{h} ч · {l}/{t} тем',
  'lane.pick.t': '{l}: {a}/{b} тем. Можно выбрать несколько', 'lane.core': 'Ядро ИИ',
  'lane.tools': 'Инструменты', 'lane.data': 'Данные', 'lane.arch': 'Архитектура и эксплуатация', 'lane.quality': 'Качество и безопасность', 'lane.product': 'Продукт и тексты', 'lane.choice': 'Выбор технологий',
  'working': 'В работе:', 'agent.missing': 'агент не найден',
  'tip.exam': 'Эволюция эпохи {e}', 'tip.level': 'Проверка уровня {k}', 'tip.taken': 'взято', 'tip.gates': 'до этого узла: эволюций: {g}', 'tip.path': 'до этого узла: {t} тем, эволюций: {g}, ~{h} ч материалов',

  'mag.not_started': 'слабая звезда', 'mag.in_progress': 'яркая звезда', 'mag.gap': 'переменная звезда', 'mag.learned': 'первой величины',
  'ss.gate': 'Эволюция эпохи', 'ss.level': 'Проверка уровня', 'ss.era': 'Эпоха {e}', 'ss.star': 'Звезда эпохи {e}', 'close': 'Закрыть', 'ss.open.log': 'Открыть журнал',
  'gate.free.head': 'Эволюция открыта', 'gate.free.text': 'Экзамена нет: эти звёзды зажигает сам хаб, когда видит ваше рабочее место.', 'gate.free.done': 'первый шаг сделан', 'gate.free.left': 'осталось настроить: {n}',
  'first.title': 'Первый шаг сделан',
  'first.body': 'Вы открыли терминал, запустили хаб, и он уже видит ваше рабочее место. Это шаг, до которого большинство так и не доходит.\n\nВпереди эпохи: от пользователя моделей до того, кто строит агентов и ведёт команду. Каждая звезда это навык, который вы можете доказать, каждая эволюция это ваш настоящий проект, проверенный по-честному. Одной темы в день достаточно: небо заполняется само.',
  'probe.title': 'Журнал рабочего места', 'probe.ok': 'есть', 'probe.missing': 'пока нет', 'probe.manual.tick': 'Прочитал', 'probe.recheck': 'Проверить снова', 'probe.hub.note': 'проверяет хаб, не наставник',
  'probe.call': 'Проверить вызов агента', 'probe.call.note': 'Один короткий вызов вашего агента, тратит немного лимита.', 'probe.call.ok': 'агент отвечает · {ms} мс', 'probe.call.err': 'ответа нет: {e}', 'probe.call.rec': 'ответ из записи (демо): агент не вызывался',
  'probe.agent.answers': 'агент залогинен и отвечает', 'probe.agent.unknown': 'ещё не проверено: нажмите кнопку ниже, или загорится после первой проверки темы', 'probe.call.via': 'ответил {d}', 'probe.left': 'Ещё стоит настроить',
  'err.format_unsupported': 'Этот экспорт сделан более новой версией хаба. Обновите хаб и повторите импорт.', 'err.no_gate': 'У этой эпохи нет экзамена.', 'err.probe_topic': 'Эту тему проверяет сам хаб, а не наставник.',
  'ss.mag': 'Величина', 'ss.lane': 'Направление', 'ss.minutes': 'Минут', 'ss.criteria': 'Критериев',
  'era.hours': '{t} ч · ядро {c} · смежные {a}', 'era.progress': '{l}/{t} тем изучено', 'era.gate.passed': 'эволюция пройдена', 'era.open': 'эпоха открыта',
  'era.locked': 'закрыто до эволюции предыдущей эпохи', 'ss.open.gate': 'К эволюции',

  'sky.show': 'Показывать небо', 'sky.period': 'Оборот неба', 'sec.n': '{n} с', 'sky.angle': 'Направление дрейфа', 'sky.flashes': 'Вспышки звёзд', 'sky.flash': 'Длительность вспышки',
  'sky.concurrent': 'Одновременно горят', 'sky.reset': 'Сбросить небо', 'sky.done': 'Готово', 'sky.title': 'Небо', 'sky.settings': 'Настройки неба',

  'ob.title': 'Добро пожаловать в Астролябию', 'ob.lead': 'Локальный учебный хаб: лестница грейдов, ваш собственный coding-агент как наставник и экзамен по папке с артефактом, где каждая цитата проверяется по файлу.',
  'ob.lang': 'Язык', 'ob.agent': 'Ваш coding-агент',
  'ob.agent.note': 'Наставник и экзаменатор это CLI, который уже установлен и залогинен на этой машине. Хаб не хранит ключей и сам к моделям не ходит. Для поиска агентов запускается только `--version`.',
  'ob.found': 'найден · {v}', 'ob.notfound': 'не найден в PATH', 'ob.install': 'как установить',
  'scope.restricted': 'экзамен: читает только внутри папки артефакта', 'scope.sandbox': 'экзамен: без записи; читать может всю файловую систему', 'scope.plan': 'экзамен: режим только чтения',
  'ob.demo': 'Демо: ответы наставника берутся из записей, агент не нужен.', 'ob.continue': 'Продолжить', 'ob.later': 'Агента можно поменять позже в меню настроек.',
  'ob.checking': 'ищу агентов…', 'ob.chosen': 'Выбран',
  'opt.model': 'Модель', 'opt.effort': 'Усилие', 'opt.default': 'как в CLI', 'opt.custom': 'другая…', 'opt.custom.ph': 'имя модели, как его ждёт CLI',
  'opt.note': 'Передаётся CLI флагами при каждом вызове: проверка темы, экзамен, панель наставника и вкладка терминала. Пусто = умолчание самого CLI.',
  'opt.effort.none': 'У этого CLI нет флага усилия; глубина размышления задаётся в его собственных настройках.',
  'menu.agent': 'Агент', 'menu.saved': 'сохранено',
};

export const DICT: Record<Lang, Record<Key, Entry>> = { en, ru };

// Server error code → phrase in the UI language: any code with an `err.<code>` entry; unknown text is shown as is.
export function explainError(e: string, lang: Lang) {
  const key = `err.${e.replace(/^Error:\s*/, '')}`;
  return key in en ? tr(lang, key as Key) : e;
}

export function tr(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const e = DICT[lang][key] ?? en[key];
  const s = typeof e === 'function' ? e(Number(vars?.n ?? 0)) : e;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}

// Area identifier: Р1 in the Russian UI, R1 in the English one.
export const areaLabel = (id: string, lang: Lang) => (lang === 'ru' ? id.replace('R', 'Р') : id);
