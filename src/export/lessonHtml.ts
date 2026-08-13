import type {
  AnswersBlock,
  Block,
  ExampleBlock,
  FormulasBlock,
  GapFillBlock,
  GrammarBlock,
  Lesson,
  MatchingBlock,
  MindmapBlock,
  ReflectionBlock,
  SortingBlock,
  TasksBlock,
  TheoryBlock,
  VocabularyBlock,
} from '../lesson/schema'
import { REFLECTION_DEFAULT_PROMPTS, titleFor } from '../lesson/schema'
import { shuffle } from '../render/composition'

/**
 * Рендер урока в самодостаточный HTML-файл.
 *
 * Это страховка, а не украшение. Доска — арендованная площадка: бесплатный
 * доступ к Miro из России держится на отзывном решении самой Miro, и один
 * e-mail от их compliance-отдела оставит репетитора без всех досок разом.
 * Схема урока координат не содержит, поэтому тот же JSON, который рисуется
 * на доске, здесь превращается в печатаемую страницу: файл открывается в
 * любом браузере, живёт на диске у репетитора и не зависит ни от Miro,
 * ни от GitHub, ни от нас.
 *
 * Интерактивные задания рендерятся как печатные упражнения: зоны — пустыми
 * рамками, карточки — банком слов в перемешанном порядке. Ответы уходят в
 * самый конец с разрывом страницы, чтобы их было легко отрезать перед тем,
 * как отдать распечатку ученику.
 */

export function lessonToHtml(lesson: Lesson): string {
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
    .map((block) => renderBlock(block, lesson))
    .join('\n')

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.topic)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${esc(meta.topic)}</h1>
  <p class="meta">${esc(details.join(' · '))}</p>
  ${meta.styleEmoji?.length ? `<p class="deco">${meta.styleEmoji.map(esc).join(' ')}</p>` : ''}
</header>
${body}
${answers ? renderAnswers(answers, lesson) : ''}
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
      return section(title, matching(block))
    case 'sorting':
      return section(title, sorting(block))
    case 'gapfill':
      return section(title, gapfill(block))
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

function matching(block: MatchingBlock): string {
  const bank = shuffle(block.pairs.map((pair) => pair.right))
  return `<p class="muted">${esc(block.instruction)}</p>
<table class="exercise">${block.pairs
    .map((pair) => `<tr><td>${esc(pair.left)}</td><td class="blank"></td></tr>`)
    .join('')}</table>
${wordBank(bank)}`
}

function sorting(block: SortingBlock): string {
  const bank = shuffle(block.groups.flatMap((group) => group.items))
  return `<p class="muted">${esc(block.instruction)}</p>
<table class="exercise"><tr>${block.groups.map((group) => `<th>${esc(group.name)}</th>`).join('')}</tr>
<tr>${block.groups.map(() => '<td class="blank tall"></td>').join('')}</tr></table>
${wordBank(bank)}`
}

function gapfill(block: GapFillBlock): string {
  const bank = shuffle([
    ...block.sentences.flatMap((sentence) => sentence.answers),
    ...(block.distractors ?? []),
  ])
  return `<p class="muted">${esc(block.instruction)}</p>
<ol>${block.sentences.map((sentence) => `<li>${esc(sentence.text)}</li>`).join('')}</ol>
${wordBank(bank)}`
}

function renderAnswers(block: AnswersBlock, lesson: Lesson): string {
  return `<section class="answers">
<h2>${esc(titleFor(block, lesson.meta.language))}</h2>
<p class="muted">Перед печатью для ученика отрежьте эту часть.</p>
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

function section(title: string, inner: string): string {
  return `<section><h2>${esc(title)}</h2>\n${inner}</section>`
}

function list(items: string[], className = ''): string {
  return `<ul${className ? ` class="${className}"` : ''}>${items
    .map((item) => `<li>${esc(item)}</li>`)
    .join('')}</ul>`
}

function wordBank(values: string[]): string {
  return `<div class="bank">${values.map((value) => `<span>${esc(value)}</span>`).join('')}</div>`
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CSS = `
:root { color-scheme: light; }
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
.bank { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.bank span { padding: 6px 12px; border: 1px solid #e0c840; border-radius: 8px; background: #fdf3ba; }
.hints { margin-top: 8px; }
.answers { break-before: page; margin-top: 40px; padding-top: 8px; border-top: 3px dashed #d64545; }
.answers h2 { border-top: none; color: #a11; }
@media (max-width: 640px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
@media print { body { padding: 0; font-size: 12px; } .card { border-radius: 4px; } }
`
