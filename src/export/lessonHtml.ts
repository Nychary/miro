import type {
  AnswersBlock,
  AudioBlock,
  Block,
  ExampleBlock,
  FlashlightBlock,
  FormulasBlock,
  GapFillBlock,
  GrammarBlock,
  HalvesBlock,
  Lesson,
  MatchingBlock,
  MindmapBlock,
  ChoiceBlock,
  EmbedBlock,
  MysteryBoxBlock,
  PullOutBlock,
  ReadingBlock,
  ReflectionBlock,
  SortingBlock,
  TasksBlock,
  TheoryBlock,
  VocabularyBlock,
} from '../lesson/schema'
import { GAP_MARKER, REFLECTION_DEFAULT_PROMPTS, titleFor } from '../lesson/schema'
import { shuffle } from '../render/composition'
import type { LessonImage, LessonNote } from './boardImages'
import type { BoardWork } from './boardWork'
import type { BoardLook } from './boardLook'

/**
 * Рендер урока в самодостаточный HTML-файл.
 *
 * Это страховка, а не украшение. Доска — арендованная площадка: бесплатный
 * доступ к Miro из России держится на отзывном решении самой Miro, и один
 * e-mail от их compliance-отдела оставит репетитора без всех досок разом.
 * Схема урока координат не содержит, поэтому тот же JSON, который рисуется
 * на доске, здесь превращается в самостоятельную страницу: файл открывается
 * в любом браузере, живёт на диске у репетитора и не зависит ни от Miro,
 * ни от GitHub, ни от нас.
 *
 * Интерактивные задания живут в двух режимах сразу. На экране карточки
 * по-настоящему перетаскиваются пальцем или мышкой, а кнопка «Проверить»
 * подсвечивает, что легло на своё место, — так файл годится и для домашки
 * без доски. На печати те же задания превращаются в рабочий лист: зоны —
 * пустыми рамками, карточки — банком слов в перемешанном порядке. Ответы
 * уходят в самый конец с разрывом страницы, чтобы их было легко отрезать
 * перед тем, как отдать распечатку ученику.
 */

export interface ExportOptions {
  /**
   * Картинки, снятые с доски. Раскладываются по секциям: оформление урока
   * делает человек, и в файле оно должно стоять там же, где стояло на доске.
   */
  images?: LessonImage[]
  /** Подписи и наклейки, дописанные на доске руками. */
  notes?: LessonNote[]
  /**
   * Работа ученика: что он разложил по клеткам и что написал на полях.
   * С ней файл перестаёт быть пустым бланком и становится памятью о занятии.
   */
  work?: BoardWork
  /**
   * Для кого файл. У преподавателя — с ключом и репликами, у ученика — без:
   * то же занятие, но его глазами. Отдать ученику файл с ответами значит
   * отдать ему решённое задание.
   */
  audience?: 'teacher' | 'student'
  /** Фактические цвета урока на доске: файл должен быть на него похож. */
  look?: BoardLook
}

export function lessonToHtml(lesson: Lesson, options: ExportOptions = {}): string {
  const images = options.images ?? []
  const notes = options.notes ?? []
  const work = options.work
  const forStudent = options.audience === 'student'

  // Подсказки «что сказать» — часть преподавательской кухни, и в ученическом
  // файле их не должно быть даже в разметке: файл открывают и листают, а не
  // только смотрят на экран.
  if (forStudent) {
    lesson = { ...lesson, blocks: lesson.blocks.map((block) => withoutScript(block)) }
  }
  const { meta } = lesson

  const details = [
    meta.subject === 'physics' ? 'Физика' : 'Английский',
    meta.level,
    `${meta.durationMin} мин`,
    meta.student ? `ученик: ${meta.student}` : null,
    meta.style ? `стиль: ${meta.style}` : null,
    new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()),
  ].filter((part): part is string => Boolean(part))

  const answers = lesson.blocks.find((block): block is AnswersBlock => block.type === 'answers')
  const body = lesson.blocks
    .filter((block) => block.type !== 'answers')
    .map((block, index) => renderBlock(block, lesson) + gallery(images, index) + handNotes(notes, index))
    .join('\n')

  // Картинки выше первой секции — это фон и шапка урока: их место сразу
  // под заголовком, как и на доске.
  const cover = gallery(images, -1) + handNotes(notes, -1)

  const language = meta.language

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.topic)}</title>
<style>${CSS}${palette(options.look)}</style>
</head>
<body>
<header>
  <h1>${esc(meta.topic)}</h1>
  <p class="meta">${esc(details.join(' · '))}</p>
  ${meta.styleEmoji?.length ? `<p class="deco">${meta.styleEmoji.map(esc).join(' ')}</p>` : ''}
</header>
${cover}
${body}
${work ? renderWork(work) : ''}
${answers && !forStudent ? renderAnswers(answers, lesson) : ''}
${inkTools(language)}
<script>${SCRIPT}</script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Блоки
// ---------------------------------------------------------------------------

function renderBlock(block: Block, lesson: Lesson): string {
  const title = titleFor(block, lesson.meta.language)

  switch (block.type) {
    case 'objectives':
      return section(title, list(block.items))
    case 'warmup':
      return section(title, list(block.prompts))
    case 'speaking':
      return section(title, list(block.prompts))
    case 'summary':
      return section(title, list(block.points))
    case 'homework':
      return section(title, list(block.items))
    case 'theory':
      return section(title, theory(block))
    case 'mindmap':
      return section(title, mindmap(block))
    case 'reflection':
      return section(title, reflection(block))
    case 'reading':
      return section(title, reading(block))
    case 'audio':
      return section(title, audio(block))
    case 'formulas':
      return section(title, formulas(block))
    case 'example':
      return section(title, example(block))
    case 'tasks':
      return section(title, tasks(block))
    case 'vocabulary':
      return section(title, vocabulary(block))
    case 'grammar':
      return section(title, grammar(block))
    case 'matching':
      return section(title, matching(block, lesson.meta.language))
    case 'sorting':
      return section(title, sorting(block, lesson.meta.language))
    case 'gapfill':
      return section(title, gapfill(block, lesson.meta.language))
    case 'choice':
      return section(title, choice(block, lesson.meta.language))
    case 'embed':
      return section(title, embedded(block))
    case 'mysterybox':
      return section(title, mysteryBox(block, lesson.meta.language))
    case 'halves':
      return section(title, halves(block, lesson.meta.language))
    case 'pullout':
      return section(title, pullOut(block))
    case 'flashlight':
      return section(title, flashlight(block))
    case 'answers':
      return ''
  }
}

function mindmap(block: MindmapBlock): string {
  return `<div class="card center">${esc(block.center)}</div>
<div class="grid2">${block.branches
    .map((branch) => `<div class="card"><h3>${esc(branch.label)}</h3>${list(branch.children)}</div>`)
    .join('')}</div>`
}

function reflection(block: ReflectionBlock): string {
  const prompts = block.prompts?.length ? block.prompts : REFLECTION_DEFAULT_PROMPTS
  return `<table class="exercise"><tr>${prompts.map((prompt) => `<th>${esc(prompt)}</th>`).join('')}</tr>
<tr>${prompts.map(() => '<td class="blank tall"></td>').join('')}</tr></table>`
}

function reading(block: ReadingBlock): string {
  const intro = block.intro ? `<p class="muted">${esc(block.intro)}</p>` : ''
  const paragraphsHtml = block.paragraphs
    .map(
      (paragraph) =>
        `<div class="card">${paragraph.label ? `<strong>${esc(paragraph.label)}</strong> — ` : ''}${esc(paragraph.text)}</div>`,
    )
    .join('')
  const questions = block.questions?.length ? `<h4>Вопросы к тексту</h4>${list(block.questions)}` : ''
  return `${intro}${paragraphsHtml}${questions}`
}

function audio(block: AudioBlock): string {
  const tasks = block.tasks?.length ? list(block.tasks) : ''
  return `<div class="card example"><h3>Track ${esc(block.track)}</h3><p>${esc(block.instruction)}</p></div>${tasks}`
}

function theory(block: TheoryBlock): string {
  return block.points
    .map((point) => `<div class="card"><h3>${esc(point.heading)}</h3><p>${esc(point.body)}</p></div>`)
    .join('')
}

function formulas(block: FormulasBlock): string {
  return `<div class="grid2">${block.items
    .map(
      (formula) => `<div class="card formula">
  <div class="plain">${esc(formula.plain)}</div>
  <p>${esc(formula.description)}</p>
  ${formula.variables?.length ? list(formula.variables, 'small') : ''}
</div>`,
    )
    .join('')}</div>`
}

function example(block: ExampleBlock): string {
  return `<div class="card example">
  <p class="statement">${esc(block.statement)}</p>
  <h4>Дано</h4>${list(block.given)}
  <h4>Решение</h4><ol>${block.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
  <p><strong>Ответ:</strong> ${esc(block.answer)}</p>
</div>`
}

function tasks(block: TasksBlock): string {
  const cards = block.items
    .map(
      (task) => `<div class="card task ${task.difficulty ?? 'medium'}">
  <h3>${esc(task.ref.toUpperCase())}</h3>
  <p>${esc(task.statement)}</p>
</div>`,
    )
    .join('')

  const hints = block.items.filter((task) => task.hint)
  const hintsHtml = hints.length
    ? `<div class="hints"><h4>Подсказки</h4>${list(
        hints.map((task) => `${task.ref.toUpperCase()}: ${task.hint ?? ''}`),
        'small',
      )}</div>`
    : ''

  return `<div class="grid3">${cards}</div>${hintsHtml}`
}

function vocabulary(block: VocabularyBlock): string {
  return `<div class="grid3">${block.items
    .map(
      (entry) => `<div class="card vocab">
  <h3>${esc(entry.term)}${entry.transcription ? ` <span class="tr">${esc(entry.transcription)}</span>` : ''}</h3>
  <p class="muted">${esc(entry.translation)}</p>
  <p><em>${esc(entry.example)}</em></p>
</div>`,
    )
    .join('')}</div>`
}

function grammar(block: GrammarBlock): string {
  const table = block.table
    ? `<table><thead><tr>${block.table.headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
<tbody>${block.table.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : ''

  const mistakes = block.commonMistakes?.length
    ? `<div class="card warn"><h4>Типичные ошибки</h4>${list(block.commonMistakes)}</div>`
    : ''

  return `<div class="card"><p>${esc(block.rule)}</p></div>${table}${list(block.examples)}${mistakes}`
}

function matching(block: MatchingBlock, language: 'ru' | 'en'): string {
  const bank = shuffle(block.pairs.map((pair) => pair.right))
  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<table class="exercise">${block.pairs
    .map((pair) => `<tr><td>${esc(pair.left)}</td><td class="slot blank" data-answer="${esc(pair.right)}"></td></tr>`)
    .join('')}</table>
${wordBank(bank)}
${controls(language)}
</div>`
}

function sorting(block: SortingBlock, language: 'ru' | 'en'): string {
  const bank = shuffle(
    block.groups.flatMap((group) => group.items.map((item) => ({ item, group: group.name }))),
  )
  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<table class="exercise"><tr>${block.groups.map((group) => `<th>${esc(group.name)}</th>`).join('')}</tr>
<tr>${block.groups.map((group) => `<td class="zone blank tall" data-group="${esc(group.name)}"></td>`).join('')}</tr></table>
<div class="bank">${bank.map((entry) => chip(entry.item, entry.group)).join('')}</div>
${controls(language)}
</div>`
}

function gapfill(block: GapFillBlock, language: 'ru' | 'en'): string {
  const bank = shuffle([
    ...block.sentences.flatMap((sentence) => sentence.answers),
    ...(block.distractors ?? []),
  ])
  const sentences = block.sentences
    .map((sentence) => {
      const parts = sentence.text.split(GAP_MARKER)
      const withSlots = parts
        .map(
          (part, index) =>
            esc(part) +
            (index < parts.length - 1
              ? `<span class="slot" data-answer="${esc(sentence.answers[index] ?? '')}"></span>`
              : ''),
        )
        .join('')
      return `<li>${withSlots}</li>`
    })
    .join('')
  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<ol>${sentences}</ol>
${wordBank(bank)}
${controls(language)}
</div>`
}

/**
 * Приёмы в файле остаются собой настолько, насколько это возможно на бумаге
 * и в одном HTML: коробка рисуется коробкой, половинки — сходящейся парой,
 * фонарик — тёмным полем, по которому водят светлым пятном. Перетаскивание
 * и проверка у первых двух работают тем же кодом, что и у обычных заданий.
 */
/**
 * Слой для рисования поверх урока.
 *
 * Файл — не общая доска: одновременно работать в нём вдвоём нельзя. Но урок
 * часто идёт с демонстрацией экрана, а домашку ученик делает один, и в обоих
 * случаях нужно то же, что и на доске: подчеркнуть, дописать, соединить
 * стрелкой. Холст лежит поверх страницы и включается кнопкой, чтобы не мешать
 * перетаскивать карточки.
 */
/**
 * Палитра доски поверх заводской.
 *
 * Переопределяем только переменные, а не сами правила: так остальная вёрстка
 * файла — рамки заданий, подсветка проверки, печать — продолжает работать,
 * какой бы тёмной ни оказалась доска.
 */
function palette(look?: BoardLook): string {
  if (!look) return ''

  const rules = [
    look.page ? `--page:${look.page}` : '',
    look.ink ? `--ink:${look.ink}` : '',
    look.card ? `--card:${look.card}` : '',
    look.border ? `--card-line:${look.border}` : '',
  ].filter(Boolean)

  return rules.length > 0 ? `:root{${rules.join(';')}}` : ''
}

function inkTools(language: 'ru' | 'en'): string {
  const t =
    language === 'en'
      ? { draw: 'Draw', erase: 'Erase', clear: 'Clear', hint: 'Draw over the lesson' }
      : { draw: 'Рисовать', erase: 'Ластик', clear: 'Стереть всё', hint: 'Рисовать поверх урока' }

  const save = language === 'en' ? 'Save my work' : 'Сохранить работу'
  const load = language === 'en' ? 'Open work' : 'Открыть работу'

  return `<canvas id="ink"></canvas>
<div class="ink-tools" title="${t.hint}">
  <button type="button" class="ink-btn" data-work="save" title="${save}">${save}</button>
  <label class="ink-btn" title="${load}">${load}<input type="file" id="work-file" accept="application/json" hidden></label>
  <span class="ink-sep"></span>
  <button type="button" class="ink-btn" data-ink="draw">${t.draw}</button>
  <button type="button" class="ink-swatch" data-color="#d64545" style="background:#d64545"></button>
  <button type="button" class="ink-swatch" data-color="#2f6fed" style="background:#2f6fed"></button>
  <button type="button" class="ink-swatch" data-color="#2f9e63" style="background:#2f9e63"></button>
  <button type="button" class="ink-btn" data-ink="erase">${t.erase}</button>
  <button type="button" class="ink-btn" data-ink="clear">${t.clear}</button>
</div>`
}

/**
 * Игра или ролик в файле.
 *
 * Живой страницей её здесь не сделать: файл обязан открываться без интернета,
 * а игра без него всё равно мертва. Поэтому в файле остаётся крупная карточка
 * со ссылкой — ученик открывает её одним нажатием, а на печати видит адрес.
 */
function embedded(block: EmbedBlock): string {
  const time = block.minutes ? ` · примерно ${block.minutes} мин` : ''
  return `<p class="muted">${esc(block.instruction)}${time}</p>
<a class="game" href="${esc(block.url)}" target="_blank" rel="noopener">
  <strong>Открыть игру</strong><span>${esc(block.url)}</span>
</a>`
}

/** Выбор варианта: у каждой строки свои карточки и своя зона под ответ. */
function choice(block: ChoiceBlock, language: 'ru' | 'en'): string {
  const rows = block.items
    .map(
      (item) => `<li>
  <div class="choice-line">${esc(item.text)}<span class="slot" data-answer="${esc(item.correct)}"></span></div>
  <div class="bank">${shuffle(item.options).map((option) => chip(option)).join('')}</div>
</li>`,
    )
    .join('')

  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<ol class="choice">${rows}</ol>
${controls(language)}
</div>`
}

function mysteryBox(block: MysteryBoxBlock, language: 'ru' | 'en'): string {
  const words = shuffle([...block.slots, ...(block.distractors ?? [])])
  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<div class="box"><div class="lid">${esc(block.boxLabel ?? 'коробка')}</div>
${words.map((word) => chip(word)).join('')}</div>
<div class="slots">${block.slots
    .map((expected) => `<span class="slot" data-answer="${esc(expected)}"></span>`)
    .join('')}</div>
${controls(language)}
</div>`
}

function halves(block: HalvesBlock, language: 'ru' | 'en'): string {
  const bank = shuffle(block.pairs.map((pair) => pair.right))
  return `<div class="interactive" data-lang="${language}">
<p class="muted">${esc(block.instruction)}</p>
<table class="exercise halves">${block.pairs
    .map(
      (pair) =>
        `<tr><td>${esc(pair.left)}<span class="half"></span></td><td class="slot blank" data-answer="${esc(
          pair.right,
        )}"></td></tr>`,
    )
    .join('')}</table>
${wordBank(bank)}
${controls(language)}
</div>`
}

function pullOut(block: PullOutBlock): string {
  return `<p class="muted">${esc(block.instruction)}</p>
<div class="tray">${block.trayLabel ? `<span class="tray-label">${esc(block.trayLabel)}</span>` : ''}
${block.questions
    .map(
      (question, index) =>
        `<details class="pull"><summary><span class="pull-item">${
          block.itemEmoji ? esc(block.itemEmoji) : index + 1
        }</span></summary>${esc(question)}</details>`,
    )
    .join('')}</div>`
}

function flashlight(block: FlashlightBlock): string {
  return `<p class="muted">${esc(block.instruction)}</p>
${block.hunt ? `<p><strong>${esc(block.hunt)}</strong></p>` : ''}
<div class="dark">${shuffle(block.words)
    .map((word) => `<span class="hidden-word">${esc(word)}</span>`)
    .join('')}<span class="lamp"></span></div>
<p class="small muted">Наведи фонарик на слова — они проявятся. На печати слова видны сразу.</p>`
}

/**
 * Как ученик прошёл урок.
 *
 * Раскладывать его карточки по исходным клеткам в файле мы не беремся —
 * задание в файле живое, и подставленные ответы отняли бы у него смысл.
 * Зато рядом остаётся честная запись занятия: что он ответил, где ошибся
 * и что дописал от себя.
 */
function renderWork(work: BoardWork): string {
  if (work.answers.length === 0 && work.notes.length === 0 && work.drawings === 0) return ''

  const filled = work.answers.filter((answer) => answer.given)
  const right = filled.filter((answer) => answer.correct).length

  const rows = filled
    .map(
      (answer) =>
        `<tr class="${answer.correct ? 'ok' : 'bad'}"><td>${esc(answer.expected)}</td><td>${esc(
          answer.given,
        )}</td><td>${answer.correct ? 'верно' : 'не сюда'}</td></tr>`,
    )
    .join('')

  const table = filled.length
    ? `<p class="muted">Верно ${right} из ${filled.length}.</p>
<table class="work"><tr><th>Ждали здесь</th><th>Ученик положил</th><th></th></tr>${rows}</table>`
    : ''

  const notes = work.notes.length
    ? `<h4>Заметки с доски</h4>${list(work.notes.map((note) => note.text))}`
    : ''

  const drawings = work.drawings
    ? `<p class="small muted">На доске осталось рисунков от руки: ${work.drawings}. Их содержимое Miro в файл не отдаёт — сохраните доску картинкой, если рисунки важны.</p>`
    : ''

  return `<section class="student-work"><h2>Как прошло занятие</h2>${table}${notes}${drawings}</section>`
}

function renderAnswers(block: AnswersBlock, lesson: Lesson): string {
  const imageIdeas = lesson.meta.imageIdeas?.length
    ? `<p class="muted">Картинки к оформлению: ${lesson.meta.imageIdeas.map(esc).join(' · ')}</p>`
    : ''

  const script = lesson.blocks.filter((item) => item.say)
  const scriptHtml = script.length
    ? `<h3>Сценарий</h3><ul>${script
        .map((item) => `<li><strong>${esc(titleFor(item, lesson.meta.language))}:</strong> ${esc(item.say ?? '')}</li>`)
        .join('')}</ul>`
    : ''

  return `<section class="answers">
<h2>${esc(titleFor(block, lesson.meta.language))}</h2>
<p class="muted">Перед печатью для ученика отрежьте эту часть.</p>
${imageIdeas}
${scriptHtml}
${block.items
  .map(
    (entry) => `<div class="card"><h3>${esc(entry.ref.toUpperCase())} — ${esc(entry.answer)}</h3>${
      entry.solution ? `<p class="muted">${esc(entry.solution)}</p>` : ''
    }</div>`,
  )
  .join('')}
</section>`
}

// ---------------------------------------------------------------------------
// Мелочи
// ---------------------------------------------------------------------------

/** Блок без преподавательской реплики: остальное содержание не трогаем. */
function withoutScript(block: Block): Block {
  if (!block.say) return block
  const { say, ...rest } = block
  return rest as Block
}

function section(title: string, inner: string): string {
  return `<section><h2>${esc(title)}</h2>\n${inner}</section>`
}

/**
 * Картинки, лежавшие на доске рядом с этой секцией.
 *
 * Ширина повторяет доску: маленькая наклейка остаётся наклейкой, а фон во всю
 * ширину урока — фоном. Точной раскладки не выйдет — файл верстается сверху
 * вниз, а на доске картинка могла лежать поверх карточки, — но узнаваемость
 * оформления это сохраняет.
 */
/**
 * Подписи, дописанные на доске рукой.
 *
 * Это часть урока наравне с картинками: заголовок красивым шрифтом, пометка
 * на полях, вопрос ученика на стикере. В файл они идут туда же, где стояли
 * на доске, — иначе урок теряет половину смысла.
 */
function handNotes(notes: LessonNote[], blockIndex: number): string {
  const mine = notes.filter((note) => note.blockIndex === blockIndex)
  if (mine.length === 0) return ''

  return `<div class="hand">${mine.map((note) => `<span>${esc(note.text)}</span>`).join('')}</div>`
}

function gallery(images: LessonImage[], blockIndex: number): string {
  const mine = images.filter((image) => image.blockIndex === blockIndex)
  if (mine.length === 0) return ''

  // Фон и наклейки разводим по разным полосам: у фона своя, приглушённая,
  // иначе фотография во всю ширину растолкает текст урока.
  const behind = mine.filter((image) => image.behind)
  const above = mine.filter((image) => !image.behind)
  return band(behind, 'pictures behind') + band(above, 'pictures')
}

function band(images: LessonImage[], className: string): string {
  if (images.length === 0) return ''

  return `<div class="${className}">${images
    .map(
      (image) =>
        `<img src="${image.dataUrl}" alt="${esc(image.alt)}" style="width:${Math.round(
          Math.max(12, Math.min(100, image.widthRatio * 100)),
        )}%">`,
    )
    .join('')}</div>`
}

function list(items: string[], className = ''): string {
  return `<ul${className ? ` class="${className}"` : ''}>${items
    .map((item) => `<li>${esc(item)}</li>`)
    .join('')}</ul>`
}

function wordBank(values: string[]): string {
  return `<div class="bank">${values.map((value) => chip(value)).join('')}</div>`
}

/** Перетаскиваемая карточка. Для сортировки несёт свою правильную группу. */
function chip(value: string, group?: string): string {
  return `<span class="chip" data-value="${esc(value)}"${group ? ` data-group="${esc(group)}"` : ''}>${esc(value)}</span>`
}

/** Кнопки самопроверки. На печати скрываются — рабочий лист остаётся чистым. */
function controls(language: 'ru' | 'en'): string {
  const check = language === 'en' ? 'Check' : 'Проверить'
  const reset = language === 'en' ? 'Reset cards' : 'Вернуть карточки'
  return `<div class="controls"><button type="button" class="btn check">${check}</button><button type="button" class="btn reset">${reset}</button><span class="verdict" aria-live="polite"></span></div>`
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CSS = `
:root { color-scheme: light; --page: #ffffff; --ink: #12151a; --card: #f2f5ff; --card-line: #c9d4ff; }
body { background: var(--page); color: var(--ink); }
.card { background: var(--card); border-color: var(--card-line); }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 860px; padding: 32px 24px; font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 15px; line-height: 1.55; color: #12151a; }
header { margin-bottom: 8px; }
h1 { margin: 0 0 4px; font-size: 28px; }
h2 { margin: 36px 0 12px; padding-top: 16px; border-top: 2px solid #e3e6ec; font-size: 20px; }
h3 { margin: 0 0 6px; font-size: 15px; }
h4 { margin: 12px 0 4px; font-size: 14px; }
p { margin: 0 0 8px; }
ul, ol { margin: 0 0 8px; padding-left: 22px; }
.meta, .muted { color: #6b7280; }
.deco { font-size: 20px; letter-spacing: 6px; }
.small { font-size: 13px; color: #6b7280; }
.card { margin-bottom: 10px; padding: 12px 14px; border: 1px solid #c9d4ff; border-radius: 10px; background: #f2f5ff;
  break-inside: avoid; }
.card.formula { background: #eefaf3; border-color: #a8e0c2; }
.card.formula .plain { font-family: ui-monospace, Consolas, monospace; font-size: 18px; font-weight: 600;
  text-align: center; margin-bottom: 6px; }
.card.example { background: #fff8e6; border-color: #f5d98b; }
.card.warn { background: #fdeeee; border-color: #f0b4b4; }
.card.task.easy { background: #f0f9ec; border-color: #b5dfa6; }
.card.task.hard { background: #fdeef4; border-color: #f0b4cd; }
.card.vocab { background: #eef6ff; border-color: #bcd9f7; }
.card.center { background: #4262ff; border-color: #4262ff; color: #fff; text-align: center;
  font-weight: 600; font-size: 17px; width: 60%; margin: 0 auto 12px; }
.tr { font-weight: 400; color: #6b7280; }
.grid2, .grid3 { display: grid; gap: 10px; }
.grid2 { grid-template-columns: repeat(2, 1fr); }
.grid3 { grid-template-columns: repeat(3, 1fr); }
table { width: 100%; margin-bottom: 10px; border-collapse: collapse; }
th, td { padding: 8px 10px; border: 1px solid #e3e6ec; text-align: left; }
th { background: #4262ff; color: #fff; }
table.exercise td.blank { width: 45%; height: 34px; border-style: dashed; }
table.exercise td.tall { height: 120px; }
.bank { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; min-height: 40px; }
.chip { display: inline-block; padding: 6px 12px; border: 1px solid #e0c840; border-radius: 8px;
  background: #fdf3ba; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
.chip.drag { position: fixed; z-index: 99; pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,.25);
  transform: rotate(-2deg); }
.chip.ok { background: #ddf2e4; border-color: #57ab7c; }
.chip.bad { background: #fbdcdc; border-color: #d66a6a; }
td.slot .chip, .zone .chip { margin: 2px; }
td.slot.ok, .zone .chip.ok { outline: 2px solid #57ab7c; outline-offset: -2px; }
td.slot.bad { outline: 2px solid #d66a6a; outline-offset: -2px; }
span.slot { display: inline-block; min-width: 90px; min-height: 30px; vertical-align: middle;
  border-bottom: 2px dashed #9aa3b0; padding: 0 4px; text-align: center; }
span.slot.ok { border-bottom-color: #57ab7c; }
span.slot.bad { border-bottom-color: #d66a6a; }
span.slot .chip { margin: 1px 0; }
.controls { display: flex; align-items: center; gap: 10px; margin: 10px 0 4px; }
.btn { padding: 7px 16px; border: 1px solid #4262ff; border-radius: 8px; background: #4262ff;
  color: #fff; font: inherit; cursor: pointer; }
.btn.reset { background: transparent; color: #4262ff; }
.verdict { font-weight: 600; }
.box { position: relative; display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 10px;
  padding: 26px 16px 16px; border: 3px solid #9c6a34; border-radius: 4px 4px 14px 14px; background: #c98b4b; }
.lid { position: absolute; top: -20px; left: 12px; padding: 5px 18px; border: 3px solid #9c6a34;
  border-radius: 8px; background: #e0a566; font-size: 13px; font-weight: 600; transform: rotate(-3deg); }
.slots { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
.slots .slot { min-width: 110px; }
table.halves td:first-child { position: relative; }
.half { position: absolute; right: -13px; top: 50%; width: 26px; height: 26px; margin-top: -13px;
  border: 2px solid #d97ba1; border-radius: 50%; background: #f2b3c8; }
.tray { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin: 10px 0;
  padding: 16px; border: 2px solid #a9b8d8; border-radius: 14px; background: #dfe6f5; }
.tray-label { width: 100%; font-size: 13px; font-weight: 600; color: #4b5a7a; }
details.pull { background: #fff8e6; border: 1px solid #f5d98b; border-radius: 10px; padding: 8px 12px; }
details.pull summary { cursor: pointer; list-style: none; font-size: 26px; line-height: 1; }
details.pull summary::-webkit-details-marker { display: none; }
details.pull[open] { background: #fff; }
.dark { position: relative; display: flex; flex-wrap: wrap; gap: 18px 26px; overflow: hidden;
  margin: 10px 0; padding: 26px; border-radius: 12px; background: #232a3a; }
.hidden-word { position: relative; z-index: 2; color: #232a3a; font-weight: 600; }
.lamp { position: absolute; z-index: 1; width: 150px; height: 150px; margin: -75px 0 0 -75px;
  border-radius: 50%; background: radial-gradient(circle, #ffe9a8 0%, #ffe9a8 55%, transparent 72%);
  pointer-events: none; transition: opacity .2s; opacity: 0; }
.dark:hover .lamp { opacity: 1; }
#ink { position: absolute; left: 0; top: 0; z-index: 40; pointer-events: none; }
#ink.on { pointer-events: auto; cursor: crosshair; }
.ink-tools { position: fixed; right: 16px; bottom: 16px; z-index: 50; display: flex; gap: 6px;
  align-items: center; padding: 8px 10px; border: 1px solid #d7dbe4; border-radius: 12px;
  background: rgba(255,255,255,.94); box-shadow: 0 6px 20px rgba(0,0,0,.12); }
.ink-btn { padding: 6px 12px; border: 1px solid #c3cad8; border-radius: 8px; background: #fff;
  font: inherit; font-size: 13px; cursor: pointer; }
.ink-btn.active { background: #4262ff; border-color: #4262ff; color: #fff; }
.ink-swatch { width: 26px; height: 26px; border: 2px solid #fff; border-radius: 50%;
  box-shadow: 0 0 0 1px #c3cad8; cursor: pointer; padding: 0; }
.ink-swatch.active { box-shadow: 0 0 0 2px #12151a; }
.ink-sep { width: 1px; height: 22px; background: #d7dbe4; }
.ink-btn input { display: none; }
.student-work { margin-top: 28px; padding: 16px 18px; border: 2px solid #cfd6e4; border-radius: 12px;
  background: #f8fafc; break-inside: avoid; }
.student-work h2 { margin-top: 0; border-top: none; }
table.work td, table.work th { font-size: 14px; }
table.work tr.ok td:last-child { color: #2f9e63; font-weight: 600; }
table.work tr.bad td:last-child { color: #d64545; font-weight: 600; }
ol.choice > li { margin-bottom: 16px; }
.choice-line { margin-bottom: 6px; }
ol.choice .bank { margin: 0; min-height: 0; }
.game { display: block; margin: 10px 0; padding: 18px 20px; border: 2px dashed #4262ff;
  border-radius: 12px; background: #f2f5ff; color: #12151a; text-decoration: none; }
.game strong { display: block; font-size: 17px; margin-bottom: 4px; }
.game span { font-size: 13px; color: #6b7280; word-break: break-all; }
.hand { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.hand span { padding: 8px 14px; border: 1px solid #e0c840; border-radius: 10px;
  background: #fffbe8; font-size: 15px; }
.pictures { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; margin: 10px 0; }
/* Фон урока: лежал под карточками на доске — остаётся фоном и в файле. */
.pictures.behind { opacity: .5; margin: 4px 0; }
.pictures.behind img { border-radius: 12px; }
.pictures img { max-width: 100%; height: auto; border-radius: 8px; break-inside: avoid; }
.hints { margin-top: 8px; }
.answers { break-before: page; margin-top: 40px; padding-top: 8px; border-top: 3px dashed #d64545; }
.answers h2 { border-top: none; color: #a11; }
@media (max-width: 640px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
@media print {
  body { padding: 0; font-size: 12px; }
  .card { border-radius: 4px; }
  .controls, .lamp, .ink-tools { display: none; }
  /* На бумаге прятать нечего: слова становятся видимыми, вопросы — раскрытыми. */
  .dark { background: #f2f3f6; border: 1px solid #c8cede; }
  .hidden-word { color: #12151a; }
  details.pull { display: block; }
  details.pull summary { display: none; }
}
`

/**
 * Перетаскиватель карточек. Pointer-события работают и мышью, и пальцем,
 * поэтому файл-урок годится для домашки на планшете. Без внешних зависимостей:
 * страховка обязана открываться без интернета.
 */
const SCRIPT = `
(function () {
  'use strict';
  var dragging = null;

  document.querySelectorAll('.interactive').forEach(function (root) {
    var bank = root.querySelector('.bank');
    var lang = root.getAttribute('data-lang') || 'ru';
    var verdict = root.querySelector('.verdict');

    root.querySelectorAll('.chip').forEach(function (chip) { enableDrag(chip, root, bank); });

    root.querySelector('.btn.check').addEventListener('click', function () {
      verdict.textContent = runCheck(root, lang);
    });
    root.querySelector('.btn.reset').addEventListener('click', function () {
      root.querySelectorAll('.chip').forEach(function (chip) {
        chip.classList.remove('ok', 'bad');
        bank.appendChild(chip);
      });
      root.querySelectorAll('.slot, .zone').forEach(function (el) { el.classList.remove('ok', 'bad'); });
      verdict.textContent = '';
    });
  });

  function enableDrag(chip, root, bank) {
    chip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var rect = chip.getBoundingClientRect();
      dragging = { chip: chip, root: root, bank: bank, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      // Захват не срабатывает для синтетических указателей — без него тоже работаем.
      try { chip.setPointerCapture(e.pointerId); } catch (err) {}
      chip.style.width = rect.width + 'px';
      chip.classList.add('drag');
      onMove(e);
    });
    chip.addEventListener('pointermove', onMove);
    chip.addEventListener('pointerup', function (e) {
      if (!dragging || dragging.chip !== chip) return;
      chip.classList.remove('drag', 'ok', 'bad');
      chip.style.left = chip.style.top = chip.style.width = '';
      var under = document.elementFromPoint(e.clientX, e.clientY);
      var slot = under && under.closest('.slot');
      var zone = under && under.closest('.zone');
      if (slot && dragging.root.contains(slot)) {
        var occupant = slot.querySelector('.chip');
        if (occupant && occupant !== chip) dragging.bank.appendChild(occupant);
        slot.classList.remove('ok', 'bad');
        slot.appendChild(chip);
      } else if (zone && dragging.root.contains(zone)) {
        zone.appendChild(chip);
      } else {
        dragging.bank.appendChild(chip);
      }
      dragging = null;
    });
  }

  function onMove(e) {
    if (!dragging || dragging.chip !== e.currentTarget) return;
    var chip = dragging.chip;
    chip.style.left = (e.clientX - dragging.dx) + 'px';
    chip.style.top = (e.clientY - dragging.dy) + 'px';
  }

  // Обмен работой без сервера: ученик сохраняет свои ответы и рисунок в
  // маленький файл и присылает его. Совместного редактирования это не даёт,
  // но отвечает на главный вопрос — что именно он сделал.
  (function () {
    var tools = document.querySelector('.ink-tools');
    if (!tools) return;
    var canvas = document.getElementById('ink');

    function collect() {
      var slots = [];
      document.querySelectorAll('.slot, .zone').forEach(function (slot, index) {
        var inside = [].map.call(slot.querySelectorAll('.chip'), function (c) {
          return c.getAttribute('data-value');
        });
        if (inside.length) slots.push({ i: index, chips: inside });
      });
      return {
        lesson: document.title,
        savedAt: new Date().toISOString(),
        slots: slots,
        ink: canvas && canvas.width ? canvas.toDataURL('image/png') : '',
      };
    }

    function restore(state) {
      // Сначала всё обратно в свои банки, иначе карточки задвоятся.
      document.querySelectorAll('.interactive').forEach(function (root) {
        var bank = root.querySelector('.bank');
        if (bank) root.querySelectorAll('.chip').forEach(function (c) { bank.appendChild(c); });
      });

      var slots = document.querySelectorAll('.slot, .zone');
      (state.slots || []).forEach(function (record) {
        var slot = slots[record.i];
        if (!slot) return;
        var root = slot.closest('.interactive') || document;
        record.chips.forEach(function (value) {
          var chip = [].slice.call(root.querySelectorAll('.chip')).find(function (c) {
            return c.getAttribute('data-value') === value && !c.closest('.slot') && !c.closest('.zone');
          });
          if (chip) slot.appendChild(chip);
        });
      });

      if (state.ink && canvas) {
        var img = new Image();
        img.onload = function () { canvas.getContext('2d').drawImage(img, 0, 0); };
        img.src = state.ink;
      }
    }

    tools.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-work="save"]');
      if (!btn) return;
      var blob = new Blob([JSON.stringify(collect())], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'работа-' + document.title.replace(/[^\wа-яё]+/gi, '-').toLowerCase() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });

    var input = document.getElementById('work-file');
    if (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try { restore(JSON.parse(String(reader.result))); } catch (err) {}
        };
        reader.readAsText(file);
        input.value = '';
      });
    }
  })();

  // Рисование поверх урока. Холст растянут на всю страницу и по умолчанию
  // прозрачен для мыши — иначе он перехватывал бы перетаскивание карточек.
  (function () {
    var canvas = document.getElementById('ink');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var tools = document.querySelector('.ink-tools');
    var drawing = false;
    var mode = 'off';
    var color = '#d64545';

    function fit() {
      // Пересоздание холста стирает рисунок, поэтому переносим его копией.
      var copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      if (canvas.width && canvas.height) copy.getContext('2d').drawImage(canvas, 0, 0);
      canvas.width = document.documentElement.scrollWidth;
      canvas.height = document.documentElement.scrollHeight;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
      if (copy.width && copy.height) ctx.drawImage(copy, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    fit();
    window.addEventListener('resize', fit);

    function setMode(next) {
      mode = mode === next ? 'off' : next;
      canvas.classList.toggle('on', mode !== 'off');
      tools.querySelectorAll('.ink-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-ink') === mode);
      });
    }

    tools.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var action = btn.getAttribute('data-ink');
      if (action === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (action) { setMode(action); return; }
      color = btn.getAttribute('data-color');
      tools.querySelectorAll('.ink-swatch').forEach(function (s) { s.classList.remove('active'); });
      btn.classList.add('active');
      if (mode !== 'draw') setMode('draw');
    });

    function point(e) {
      var box = canvas.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (mode === 'off') return;
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      var p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = point(e);
      ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = mode === 'erase' ? 24 : 3;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      canvas.addEventListener(name, function () { drawing = false; });
    });
  })();

  // Фонарик: пятно света едет за курсором и пальцем, слова проступают в нём.
  document.querySelectorAll('.dark').forEach(function (field) {
    var lamp = field.querySelector('.lamp');
    if (!lamp) return;
    function move(e) {
      var box = field.getBoundingClientRect();
      var point = e.touches ? e.touches[0] : e;
      lamp.style.left = (point.clientX - box.left) + 'px';
      lamp.style.top = (point.clientY - box.top) + 'px';
      lamp.style.opacity = '1';
    }
    field.addEventListener('mousemove', move);
    field.addEventListener('touchmove', move);
    field.addEventListener('mouseleave', function () { lamp.style.opacity = '0'; });
  });

  function runCheck(root, lang) {
    var total = 0;
    var good = 0;

    root.querySelectorAll('.slot').forEach(function (slot) {
      total += 1;
      // Карточек в клетке может оказаться несколько: перетаскивание вытесняет
      // прежнюю, но урок могли и распечатать, и открыть в чужом браузере.
      // Верно — только когда лежит ровно одна и та самая.
      var inside = slot.querySelectorAll('.chip');
      var chip = inside[0];
      var ok =
        inside.length === 1 && chip.getAttribute('data-value') === slot.getAttribute('data-answer');
      slot.classList.toggle('ok', ok);
      slot.classList.toggle('bad', !ok);
      if (chip) {
        chip.classList.toggle('ok', ok);
        chip.classList.toggle('bad', !ok);
      }
      if (ok) good += 1;
    });

    // Сортировка: считаем каждую карточку — и лежащие не в своей группе,
    // и оставшиеся в банке идут в знаменатель, чтобы «верно 4 из 9» не врало.
    root.querySelectorAll('.chip[data-group]').forEach(function (chip) {
      total += 1;
      var zone = chip.closest('.zone');
      var ok = Boolean(zone) && chip.getAttribute('data-group') === zone.getAttribute('data-group');
      if (zone) {
        chip.classList.toggle('ok', ok);
        chip.classList.toggle('bad', !ok);
      }
      if (ok) good += 1;
    });

    if (total === 0) return '';
    if (good === total) return lang === 'en' ? 'All correct' : 'Всё верно';
    return lang === 'en'
      ? good + ' of ' + total + ' correct — try again'
      : 'Верно ' + good + ' из ' + total + ' — попробуй ещё';
  }
})();
`
