import { looksLikePrompt } from './prompt'
import type { Block, GapFillBlock, Lesson, TasksBlock } from './schema'
import { GAP_MARKER } from './schema'

/**
 * Разбор ответа нейросети.
 *
 * Ответ приходит через буфер обмена, а значит может прийти в любом виде:
 * в markdown-заборе, с фразой «вот ваш урок» перед JSON, с обрезанным хвостом.
 * Поэтому разбор устроен снисходительно к обёртке и строго к содержимому:
 * лишний текст вокруг JSON мы отбрасываем сами, а вот отсутствующее поле —
 * это ошибка, о которой репетитор должен узнать до того, как урок попадёт
 * на доску, а не в виде пустого места в готовом фрейме.
 *
 * Ошибки останавливают отрисовку, предупреждения — нет: урок нарисуется,
 * но репетитор увидит, на что посмотреть перед занятием.
 */

export type ParseResult =
  | { ok: true; lesson: Lesson; warnings: string[] }
  | { ok: false; errors: string[] }

export function parseLessonResponse(raw: string): ParseResult {
  if (!raw.trim()) {
    return { ok: false, errors: ['Пустой ответ — вставьте то, что выдала нейросеть.'] }
  }

  if (looksLikePrompt(raw)) {
    return {
      ok: false,
      errors: [
        'Это сам промпт, а не ответ. Вставьте его в чат с нейросетью, а сюда — то, что она ответит.',
      ],
    }
  }

  const json = extractJsonObject(raw)
  if (!json) {
    return {
      ok: false,
      errors: [
        'В ответе не нашёлся JSON-объект. Скорее всего нейросеть ответила текстом — попросите её вернуть только JSON.',
      ],
    }
  }

  let parsed: unknown
  let repairedEscapes = false
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    // Самая частая причина — одиночные обратные слэши в LaTeX-формулах:
    // «\Delta» вместо «\\Delta». JSON такой escape не признаёт. Чиним сами:
    // удваиваем каждый слэш, за которым не следует законный escape-символ.
    try {
      parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'))
      repairedEscapes = true
    } catch {
      return {
        ok: false,
        errors: [
          `JSON не разбирается: ${error instanceof Error ? error.message : 'неизвестная ошибка'}.`,
          'Часто это обрезанный ответ — попросите нейросеть выдать урок целиком.',
          'Другая частая причина — одиночные обратные слэши в формулах: попросите её удвоить их (\\\\Delta вместо \\Delta).',
        ],
      }
    }
  }

  const problems = new Problems()
  if (repairedEscapes) {
    problems.warn(
      'В ответе были неправильные экранирования (обратные слэши в формулах) — исправлено автоматически. Просмотрите формулы на доске.',
    )
  }
  const lesson = validateLesson(parsed, problems)

  if (problems.errors.length > 0 || !lesson) {
    return { ok: false, errors: problems.errors.length > 0 ? problems.errors : ['Не удалось разобрать урок.'] }
  }
  return { ok: true, lesson, warnings: problems.warnings }
}

// ---------------------------------------------------------------------------
// Вырезание JSON из произвольного текста
// ---------------------------------------------------------------------------

/**
 * Ищет первый `{` и возвращает всё до парной ему `}`. Скобки внутри строк
 * не считаются, иначе условие задачи со скобкой оборвало бы разбор.
 */
function extractJsonObject(input: string): string | null {
  const start = input.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < input.length; index += 1) {
    const char = input[index] as string

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return input.slice(start, index + 1)
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Валидация
// ---------------------------------------------------------------------------

class Problems {
  readonly errors: string[] = []
  readonly warnings: string[] = []

  error(path: string, message: string): void {
    this.errors.push(`${path} — ${message}`)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, path: string, problems: Problems): string {
  if (typeof value !== 'string' || !value.trim()) {
    problems.error(path, 'ожидалась непустая строка')
    return ''
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** Значение из закрытого списка — всё остальное трактуем как «не задано». */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value)
}

function requireStringArray(value: unknown, path: string, problems: Problems): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    problems.error(path, 'ожидался непустой список строк')
    return []
  }
  return value.map((item, index) => requireString(item, `${path}[${index}]`, problems))
}

/**
 * Заголовки таблицы сравнения.
 *
 * Первая ячейка шапки — угловая: слева в ней идут названия строк, сверху
 * названия колонок, и писать в самом углу нечего. Пустой угол — правильная
 * вёрстка таблицы, а не недоделка урока, поэтому только он и разрешён:
 * пустой заголовок в середине по-прежнему ошибка, из-за него колонка
 * останется без имени.
 */
function requireTableHeaders(value: unknown, path: string, problems: Problems): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    problems.error(path, 'ожидался непустой список строк')
    return []
  }
  return value.map((item, index) => {
    if (index === 0 && typeof item === 'string') return item.trim()
    return requireString(item, `${path}[${index}]`, problems)
  })
}

function requireArray(value: unknown, path: string, problems: Problems): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    problems.error(path, 'ожидался непустой список')
    return []
  }
  return value
}

function validateLesson(input: unknown, problems: Problems): Lesson | null {
  if (!isRecord(input)) {
    problems.error('корень', 'ожидался объект')
    return null
  }

  const meta = validateMeta(input.meta, problems)
  const rawBlocks = requireArray(input.blocks, 'blocks', problems)

  const blocks = rawBlocks
    .map((raw, index) => {
      const block = validateBlock(raw, `blocks[${index}]`, problems)
      // Поле «say» общее для всех типов, поэтому вешается здесь, а не в
      // пятнадцати ветках validateBlock по отдельности.
      if (block && isRecord(raw)) {
        const say = optionalString(raw.say)
        if (say) block.say = say
      }
      return block
    })
    .filter((block): block is Block => block !== null)

  if (!meta || blocks.length === 0) return null

  crossCheck(blocks, problems)
  return { meta, blocks }
}

function validateMeta(input: unknown, problems: Problems): Lesson['meta'] | null {
  if (!isRecord(input)) {
    problems.error('meta', 'блок отсутствует или не является объектом')
    return null
  }

  const subject = input.subject
  if (subject !== 'physics' && subject !== 'english') {
    problems.error('meta.subject', 'ожидалось "physics" или "english"')
    return null
  }

  const duration = typeof input.durationMin === 'number' && input.durationMin > 0 ? input.durationMin : 60
  if (typeof input.durationMin !== 'number') {
    problems.warn('meta.durationMin не задан числом — подставил 60 минут.')
  }

  const language = input.language === 'en' ? 'en' : 'ru'

  return {
    subject,
    topic: requireString(input.topic, 'meta.topic', problems),
    level: requireString(input.level, 'meta.level', problems),
    durationMin: duration,
    ...(optionalString(input.student) ? { student: optionalString(input.student) as string } : {}),
    ...(optionalString(input.style) ? { style: optionalString(input.style) as string } : {}),
    ...(shortStrings(input.styleEmoji, 8) ? { styleEmoji: shortStrings(input.styleEmoji, 8) as string[] } : {}),
    ...(shortStrings(input.imageIdeas, 80) ? { imageIdeas: shortStrings(input.imageIdeas, 80) as string[] } : {}),
    language,
  }
}

/** До восьми коротких строк заданной длины; мусор молча отбрасывается. */
function shortStrings(value: unknown, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, 8)
  return strings.length > 0 ? strings : undefined
}

function validateBlock(input: unknown, path: string, problems: Problems): Block | null {
  if (!isRecord(input)) {
    problems.error(path, 'ожидался объект')
    return null
  }

  const type = input.type
  // Условный спред (`...(title ? {title} : {})`) превратил бы каждый возвращаемый
  // объект в union и сбил бы разбор по полю `type`. Поле необязательное, а
  // exactOptionalPropertyTypes выключен, поэтому undefined здесь допустим.
  const title = optionalString(input.title)

  switch (type) {
    case 'objectives':
      return { type, title, items: requireStringArray(input.items, `${path}.items`, problems) }

    case 'warmup':
      return { type, title, prompts: requireStringArray(input.prompts, `${path}.prompts`, problems) }

    case 'speaking':
      return { type, title, prompts: requireStringArray(input.prompts, `${path}.prompts`, problems) }

    case 'summary':
      return { type, title, points: requireStringArray(input.points, `${path}.points`, problems) }

    case 'homework':
      return { type, title, items: requireStringArray(input.items, `${path}.items`, problems) }

    case 'mindmap': {
      const branches = requireArray(input.branches, `${path}.branches`, problems).map((branch, index) => {
        const at = `${path}.branches[${index}]`
        if (!isRecord(branch)) {
          problems.error(at, 'ожидался объект')
          return { label: '', children: [] }
        }
        return {
          label: requireString(branch.label, `${at}.label`, problems),
          children: requireStringArray(branch.children, `${at}.children`, problems),
        }
      })
      return { type, title, center: requireString(input.center, `${path}.center`, problems), branches }
    }

    case 'reading': {
      const paragraphs = requireArray(input.paragraphs, `${path}.paragraphs`, problems).map(
        (paragraph, index) => {
          const at = `${path}.paragraphs[${index}]`
          if (!isRecord(paragraph)) {
            problems.error(at, 'ожидался объект')
            return { text: '' }
          }
          const label = optionalString(paragraph.label)
          return {
            text: requireString(paragraph.text, `${at}.text`, problems),
            ...(label ? { label } : {}),
          }
        },
      )
      const questions = Array.isArray(input.questions)
        ? input.questions.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : undefined
      const intro = optionalString(input.intro)
      return {
        type,
        title,
        paragraphs,
        ...(intro ? { intro } : {}),
        ...(questions?.length ? { questions } : {}),
      }
    }

    case 'audio': {
      const tasks = Array.isArray(input.tasks)
        ? input.tasks.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : undefined
      return {
        type,
        title,
        track: requireString(input.track, `${path}.track`, problems),
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        ...(tasks?.length ? { tasks } : {}),
      }
    }

    case 'reflection': {
      const prompts = Array.isArray(input.prompts)
        ? input.prompts.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : undefined
      return { type, title, prompts: prompts?.length ? prompts : undefined }
    }

    case 'theory': {
      const points = requireArray(input.points, `${path}.points`, problems).map((point, index) => {
        const at = `${path}.points[${index}]`
        if (!isRecord(point)) {
          problems.error(at, 'ожидался объект')
          return { heading: '', body: '' }
        }
        return {
          heading: requireString(point.heading, `${at}.heading`, problems),
          body: requireString(point.body, `${at}.body`, problems),
        }
      })
      return { type, title, points }
    }

    case 'formulas': {
      const items = requireArray(input.items, `${path}.items`, problems).map((item, index) => {
        const at = `${path}.items[${index}]`
        if (!isRecord(item)) {
          problems.error(at, 'ожидался объект')
          return { plain: '', description: '' }
        }
        const latex = optionalString(item.latex)
        const variables = Array.isArray(item.variables)
          ? item.variables.filter((value): value is string => typeof value === 'string')
          : undefined
        return {
          plain: requireString(item.plain, `${at}.plain`, problems),
          description: requireString(item.description, `${at}.description`, problems),
          ...(latex ? { latex } : {}),
          ...(variables?.length ? { variables } : {}),
        }
      })
      return { type, title, items }
    }

    case 'example':
      return {
        type,
        title,
        statement: requireString(input.statement, `${path}.statement`, problems),
        given: requireStringArray(input.given, `${path}.given`, problems),
        steps: requireStringArray(input.steps, `${path}.steps`, problems),
        answer: requireString(input.answer, `${path}.answer`, problems),
      }

    case 'tasks': {
      const items = requireArray(input.items, `${path}.items`, problems).map((item, index) => {
        const at = `${path}.items[${index}]`
        if (!isRecord(item)) {
          problems.error(at, 'ожидался объект')
          return { ref: `t${index + 1}`, statement: '' }
        }
        const hint = optionalString(item.hint)
        const difficulty = oneOf(item.difficulty, ['easy', 'medium', 'hard'] as const)
        return {
          ref: optionalString(item.ref) ?? `t${index + 1}`,
          statement: requireString(item.statement, `${at}.statement`, problems),
          ...(hint ? { hint } : {}),
          ...(difficulty ? { difficulty } : {}),
        }
      })
      return { type, title, items }
    }

    case 'vocabulary': {
      const items = requireArray(input.items, `${path}.items`, problems).map((item, index) => {
        const at = `${path}.items[${index}]`
        if (!isRecord(item)) {
          problems.error(at, 'ожидался объект')
          return { term: '', translation: '', example: '' }
        }
        const transcription = optionalString(item.transcription)
        const partOfSpeech = optionalString(item.partOfSpeech)
        return {
          term: requireString(item.term, `${at}.term`, problems),
          translation: requireString(item.translation, `${at}.translation`, problems),
          example: requireString(item.example, `${at}.example`, problems),
          ...(transcription ? { transcription } : {}),
          ...(partOfSpeech ? { partOfSpeech } : {}),
        }
      })
      return { type, title, items }
    }

    case 'grammar': {
      const table = isRecord(input.table)
        ? {
            headers: requireTableHeaders(input.table.headers, `${path}.table.headers`, problems),
            rows: Array.isArray(input.table.rows)
              ? input.table.rows.map((row, index) =>
                  Array.isArray(row)
                    ? row.map((cell) => (typeof cell === 'string' ? cell : ''))
                    : (problems.error(`${path}.table.rows[${index}]`, 'ожидался список строк'), []),
                )
              : [],
          }
        : undefined
      const commonMistakes = Array.isArray(input.commonMistakes)
        ? input.commonMistakes.filter((value): value is string => typeof value === 'string')
        : undefined

      return {
        type,
        title,
        rule: requireString(input.rule, `${path}.rule`, problems),
        examples: requireStringArray(input.examples, `${path}.examples`, problems),
        ...(table ? { table } : {}),
        ...(commonMistakes?.length ? { commonMistakes } : {}),
      }
    }

    case 'matching': {
      const pairs = requireArray(input.pairs, `${path}.pairs`, problems).map((pair, index) => {
        const at = `${path}.pairs[${index}]`
        if (!isRecord(pair)) {
          problems.error(at, 'ожидался объект')
          return { left: '', right: '' }
        }
        return {
          left: requireString(pair.left, `${at}.left`, problems),
          right: requireString(pair.right, `${at}.right`, problems),
        }
      })
      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 'm1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        pairs,
      }
    }

    case 'sorting': {
      const groups = requireArray(input.groups, `${path}.groups`, problems).map((group, index) => {
        const at = `${path}.groups[${index}]`
        if (!isRecord(group)) {
          problems.error(at, 'ожидался объект')
          return { name: '', items: [] }
        }
        return {
          name: requireString(group.name, `${at}.name`, problems),
          items: requireStringArray(group.items, `${at}.items`, problems),
        }
      })
      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 's1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        groups,
      }
    }

    case 'gapfill': {
      const sentences = requireArray(input.sentences, `${path}.sentences`, problems).map((sentence, index) => {
        const at = `${path}.sentences[${index}]`
        if (!isRecord(sentence)) {
          problems.error(at, 'ожидался объект')
          return { text: '', answers: [] }
        }
        const text = requireString(sentence.text, `${at}.text`, problems)
        // Строка без пропуска — это реплика для связности, а не задание.
        // В диалогах учебника такие идут вперемешку с заполняемыми: «No.»,
        // «Yes, of course.» Требовать к ним ответ значит выбрасывать из
        // упражнения половину разговора и ломать его смысл.
        const hasGap = text.includes(GAP_MARKER)
        const answers = hasGap
          ? requireStringArray(sentence.answers, `${at}.answers`, problems)
          : Array.isArray(sentence.answers)
            ? sentence.answers.filter((value): value is string => typeof value === 'string')
            : []
        return { text, answers }
      })
      const distractors = Array.isArray(input.distractors)
        ? input.distractors.filter((value): value is string => typeof value === 'string')
        : undefined

      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 'g1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        sentences,
        ...(distractors?.length ? { distractors } : {}),
      }
    }

    case 'embed': {
      const url = requireString(input.url, `${path}.url`, problems)
      // Живой ссылке на доске нужен полный адрес: «wordwall.net/игра» Miro
      // не откроет, а ошибка вылезет уже во время занятия.
      if (url && !/^https?:\/\//i.test(url)) {
        problems.error(`${path}.url`, 'ожидалась ссылка целиком, вместе с https://')
      }
      const minutes = typeof input.minutes === 'number' && input.minutes > 0 ? input.minutes : undefined
      return {
        type,
        title,
        url,
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        ...(minutes ? { minutes } : {}),
      }
    }

    case 'choice': {
      const items = requireArray(input.items, `${path}.items`, problems).map((item, index) => {
        const at = `${path}.items[${index}]`
        if (!isRecord(item)) {
          problems.error(at, 'ожидался объект')
          return { text: '', options: [], correct: '' }
        }
        const options = requireStringArray(item.options, `${at}.options`, problems)
        const correct = requireString(item.correct, `${at}.correct`, problems)
        // Правильный вариант обязан быть среди предложенных, иначе задание
        // нерешаемо: карточки с таким текстом на доске просто не окажется.
        if (correct && options.length > 0 && !options.includes(correct)) {
          problems.error(`${at}.correct`, `«${correct}» нет среди вариантов`)
        }
        return { text: requireString(item.text, `${at}.text`, problems), options, correct }
      })
      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 'c1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        items,
      }
    }

    case 'mysterybox': {
      const distractors = Array.isArray(input.distractors)
        ? input.distractors.filter((value): value is string => typeof value === 'string')
        : undefined

      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 'b1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        slots: requireStringArray(input.slots, `${path}.slots`, problems),
        ...(optionalString(input.boxLabel) ? { boxLabel: optionalString(input.boxLabel) as string } : {}),
        ...(distractors?.length ? { distractors } : {}),
      }
    }

    case 'halves': {
      const pairs = requireArray(input.pairs, `${path}.pairs`, problems).map((pair, index) => {
        const at = `${path}.pairs[${index}]`
        if (!isRecord(pair)) {
          problems.error(at, 'ожидался объект')
          return { left: '', right: '' }
        }
        return {
          left: requireString(pair.left, `${at}.left`, problems),
          right: requireString(pair.right, `${at}.right`, problems),
        }
      })
      return {
        type,
        title,
        ref: optionalString(input.ref) ?? 'h1',
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        pairs,
      }
    }

    case 'pullout': {
      return {
        type,
        title,
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        questions: requireStringArray(input.questions, `${path}.questions`, problems),
        ...(optionalString(input.trayLabel) ? { trayLabel: optionalString(input.trayLabel) as string } : {}),
        ...(optionalString(input.itemEmoji) ? { itemEmoji: optionalString(input.itemEmoji) as string } : {}),
      }
    }

    case 'flashlight': {
      return {
        type,
        title,
        instruction: requireString(input.instruction, `${path}.instruction`, problems),
        words: requireStringArray(input.words, `${path}.words`, problems),
        ...(optionalString(input.hunt) ? { hunt: optionalString(input.hunt) as string } : {}),
      }
    }

    case 'answers': {
      const items = requireArray(input.items, `${path}.items`, problems).map((item, index) => {
        const at = `${path}.items[${index}]`
        if (!isRecord(item)) {
          problems.error(at, 'ожидался объект')
          return { ref: '', answer: '' }
        }
        const solution = optionalString(item.solution)
        return {
          ref: requireString(item.ref, `${at}.ref`, problems),
          answer: requireString(item.answer, `${at}.answer`, problems),
          ...(solution ? { solution } : {}),
        }
      })
      return { type, title, items }
    }

    default:
      problems.error(path, `неизвестный тип блока "${String(type)}"`)
      return null
  }
}

/**
 * Проверки, которые видны только на уровне всего урока: сходятся ли ответы
 * с задачами, совпадает ли число пропусков с числом ответов. Всё это —
 * предупреждения: урок останется рабочим, просто репетитору стоит взглянуть.
 */
function crossCheck(blocks: Block[], problems: Problems): void {
  const tasks = blocks.find((block): block is TasksBlock => block.type === 'tasks')
  const answers = blocks.find((block) => block.type === 'answers')

  if (tasks && answers && answers.type === 'answers') {
    const answered = new Set(answers.items.map((item) => item.ref))
    const missing = tasks.items.filter((task) => !answered.has(task.ref)).map((task) => task.ref)
    if (missing.length > 0) {
      problems.warn(`Нет ответов к задачам: ${missing.join(', ')}.`)
    }
  }

  if (tasks && !answers) {
    problems.warn('В уроке есть задачи, но нет блока с ответами.')
  }

  for (const block of blocks) {
    if (block.type !== 'gapfill') continue
    const gapfill = block as GapFillBlock
    for (const [index, sentence] of gapfill.sentences.entries()) {
      const gaps = sentence.text.split(GAP_MARKER).length - 1
      if (gaps !== sentence.answers.length) {
        problems.warn(
          `Предложение ${index + 1} в задании «${gapfill.instruction}»: пропусков ${gaps}, ответов ${sentence.answers.length}.`,
        )
      }
    }
  }
}
