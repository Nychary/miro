import { describe, expect, it } from 'vitest'
import { buildPrompt } from './prompt'
import { ENGLISH_SAMPLE, PHYSICS_SAMPLE } from './samples'
import { parseLessonResponse } from './validate'

/**
 * Ответ приходит из буфера обмена, то есть в каком угодно виде. Тесты
 * фиксируют обе стороны сделки: что мы прощаем обёртке и чего не прощаем
 * содержимому.
 */

describe('обёртка вокруг JSON', () => {
  it('принимает чистый JSON', () => {
    const result = parseLessonResponse(JSON.stringify(PHYSICS_SAMPLE))
    expect(result.ok).toBe(true)
  })

  it('принимает оба образца целиком, без потерь', () => {
    for (const sample of [PHYSICS_SAMPLE, ENGLISH_SAMPLE]) {
      const result = parseLessonResponse(JSON.stringify(sample))
      if (!result.ok) throw new Error(result.errors.join('; '))

      expect(result.lesson.meta).toEqual(sample.meta)
      expect(result.lesson.blocks.map((block) => block.type)).toEqual(
        sample.blocks.map((block) => block.type),
      )
      expect(result.warnings).toEqual([])
    }
  })

  it('снимает markdown-забор', () => {
    const result = parseLessonResponse('```json\n' + JSON.stringify(PHYSICS_SAMPLE) + '\n```')
    expect(result.ok).toBe(true)
  })

  it('отбрасывает болтовню до и после JSON', () => {
    const raw = `Конечно! Вот урок:\n\n${JSON.stringify(PHYSICS_SAMPLE)}\n\nДайте знать, если нужно поправить.`
    expect(parseLessonResponse(raw).ok).toBe(true)
  })

  it('не обрывается на фигурной скобке внутри строки', () => {
    const lesson = {
      meta: { subject: 'physics', topic: 'Тест', level: '8 класс', durationMin: 60, language: 'ru' },
      blocks: [{ type: 'objectives', items: ['Разобрать выражение } и скобку {'] }],
    }
    const result = parseLessonResponse(JSON.stringify(lesson))
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect(result.lesson.blocks).toHaveLength(1)
  })

  it('узнаёт собственный промпт, вставленный вместо ответа', () => {
    const prompt = buildPrompt({
      subject: 'physics',
      topic: 'Закон Ома',
      level: '8 класс',
      durationMin: 60,
      language: 'ru',
    })
    const result = parseLessonResponse(prompt)
    if (result.ok) throw new Error('ожидалась ошибка')
    // Промпт содержит описание схемы в фигурных скобках, поэтому без отдельной
    // проверки разбор жалуется на синтаксис JSON и уводит не туда.
    expect(result.errors[0]).toContain('сам промпт')
  })

  it('жалуется на пустой ввод', () => {
    const result = parseLessonResponse('   ')
    expect(result.ok).toBe(false)
  })

  it('жалуется на ответ без JSON', () => {
    const result = parseLessonResponse('Извините, не могу составить такой урок.')
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors[0]).toContain('не нашёлся JSON')
  })

  it('чинит одиночные обратные слэши из LaTeX и предупреждает', () => {
    // Нейросети регулярно пишут в latex «\Delta» вместо «\\Delta» — для
    // JSON это сломанный escape, из-за него падал разбор реального урока.
    const raw = String.raw`{
      "meta": { "subject": "physics", "topic": "Импульс", "level": "9 класс", "durationMin": 60, "language": "ru" },
      "blocks": [{
        "type": "formulas",
        "items": [{ "plain": "Δp = F·Δt", "latex": "\Delta p = F \cdot \Delta t", "description": "Импульс силы." }]
      }]
    }`
    const result = parseLessonResponse(raw)
    if (!result.ok) throw new Error(result.errors.join('; '))

    expect(result.warnings.join(' ')).toContain('экранирования')
    const formulas = result.lesson.blocks[0]
    expect(formulas).toMatchObject({ type: 'formulas' })
  })

  it('жалуется на обрезанный ответ', () => {
    const truncated = JSON.stringify(PHYSICS_SAMPLE).slice(0, 400)
    const result = parseLessonResponse(truncated)
    expect(result.ok).toBe(false)
  })
})

describe('проверка содержимого', () => {
  it('требует известный предмет', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'chemistry', topic: 'Т', level: '8', durationMin: 60, language: 'ru' },
        blocks: [{ type: 'objectives', items: ['цель'] }],
      }),
    )
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors.join(' ')).toContain('meta.subject')
  })

  it('сообщает путь к пропущенному полю', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8', durationMin: 60, language: 'ru' },
        blocks: [{ type: 'theory', points: [{ heading: 'Есть' }] }],
      }),
    )
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors.join(' ')).toContain('blocks[0].points[0].body')
  })

  it('отвергает неизвестный тип блока', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8', durationMin: 60, language: 'ru' },
        blocks: [{ type: 'crossword', items: [] }],
      }),
    )
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors.join(' ')).toContain('crossword')
  })

  it('разбирает интеллект-карту и рефлексию', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: {
          subject: 'physics',
          topic: 'Т',
          level: '8',
          durationMin: 60,
          language: 'ru',
          style: 'Космос',
          styleEmoji: ['⭐', '🪐', '', 42, 'слишком-длинная-строка-не-эмодзи'],
          imageIdeas: ['Ван Гог Звёздная ночь', '', 7],
        },
        blocks: [
          {
            type: 'mindmap',
            center: 'Закон Ома',
            say: 'Открываем карту звёздного неба темы.',
            branches: [{ label: 'Сила тока', children: ['I = U / R'] }],
          },
          { type: 'reflection', prompts: ['Освоено', 'Сложно', 'Хочу ещё'] },
          { type: 'reflection' },
        ],
      }),
    )
    if (!result.ok) throw new Error(result.errors.join('; '))

    expect(result.lesson.meta.style).toBe('Космос')
    // Мусор в styleEmoji отбрасывается молча: пустые строки, числа, длинное.
    expect(result.lesson.meta.styleEmoji).toEqual(['⭐', '🪐'])
    expect(result.lesson.meta.imageIdeas).toEqual(['Ван Гог Звёздная ночь'])
    const [mindmap, withPrompts, bare] = result.lesson.blocks
    expect(mindmap).toMatchObject({
      type: 'mindmap',
      center: 'Закон Ома',
      say: 'Открываем карту звёздного неба темы.',
    })
    expect(withPrompts).toMatchObject({ type: 'reflection', prompts: ['Освоено', 'Сложно', 'Хочу ещё'] })
    expect(bare).toMatchObject({ type: 'reflection' })
  })

  it('называет путь до сломанной ветки интеллект-карты', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8', durationMin: 60, language: 'ru' },
        blocks: [{ type: 'mindmap', center: 'X', branches: [{ label: 'Есть' }] }],
      }),
    )
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors.join(' ')).toContain('blocks[0].branches[0].children')
  })

  it('подставляет длительность, если её забыли', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8 класс', language: 'ru' },
        blocks: [{ type: 'objectives', items: ['цель'] }],
      }),
    )
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect(result.lesson.meta.durationMin).toBe(60)
    expect(result.warnings.join(' ')).toContain('durationMin')
  })
})

describe('сквозные проверки', () => {
  it('предупреждает о задачах без ответов', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8 класс', durationMin: 60, language: 'ru' },
        blocks: [
          { type: 'tasks', items: [{ ref: 't1', statement: 'Раз' }, { ref: 't2', statement: 'Два' }] },
          { type: 'answers', items: [{ ref: 't1', answer: '1' }] },
        ],
      }),
    )
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect(result.warnings.join(' ')).toContain('t2')
  })

  it('ловит расхождение числа пропусков и ответов', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'english', topic: 'Т', level: 'B1', durationMin: 60, language: 'ru' },
        blocks: [
          {
            type: 'gapfill',
            ref: 'g1',
            instruction: 'Заполни',
            sentences: [{ text: 'I ___ to school and ___ home.', answers: ['went'] }],
          },
        ],
      }),
    )
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect(result.warnings.join(' ')).toContain('пропусков 2, ответов 1')
  })

  it('молчит, когда всё сходится', () => {
    const result = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'physics', topic: 'Т', level: '8 класс', durationMin: 60, language: 'ru' },
        blocks: [
          { type: 'tasks', items: [{ ref: 't1', statement: 'Раз' }] },
          { type: 'answers', items: [{ ref: 't1', answer: '1' }] },
        ],
      }),
    )
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect(result.warnings).toEqual([])
  })
})

describe('таблица сравнения', () => {
  it('пускает пустой угол шапки, но не пустую колонку', () => {
    const make = (headers: unknown[]) =>
      parseLessonResponse(
        JSON.stringify({
          meta: { subject: 'english', topic: 'Тема', level: 'B2', durationMin: 60, language: 'ru' },
          blocks: [
            {
              type: 'grammar',
              rule: 'Правило',
              examples: ['She has broken her ski.', 'She broke her ski last winter.'],
              table: { headers, rows: [['Форма', 'has done', 'did']] },
            },
          ],
        }),
      )

    // Угловая ячейка пуста намеренно: слева названия строк, сверху колонок.
    const corner = make(['', 'Present Perfect', 'Past Simple'])
    expect(corner.ok, corner.ok ? '' : corner.errors.join(' | ')).toBe(true)

    // А вот безымянная колонка в середине — настоящая потеря смысла.
    const gap = make(['Признак', '', 'Past Simple'])
    expect(gap.ok).toBe(false)
  })
})

describe('пропуски в диалоге', () => {
  it('пускает реплики без пропусков, но требует ответ там, где пропуск есть', () => {
    const make = (sentences: unknown[]) =>
      parseLessonResponse(
        JSON.stringify({
          meta: { subject: 'english', topic: 'Тема', level: 'B1', durationMin: 60, language: 'ru' },
          blocks: [{ type: 'gapfill', instruction: 'Complete the conversation.', sentences }],
        }),
      )

    // Диалог из учебника: часть реплик заполняется, часть идёт для связности.
    const dialogue = make([
      { text: 'Denisa   Hi, Nick! ___ you been shopping?', answers: ['Have'] },
      { text: 'Miguel   No.', answers: [] },
    ])
    expect(dialogue.ok, dialogue.ok ? '' : dialogue.errors.join(' | ')).toBe(true)

    // А вот пропуск без ответа — настоящая дыра: проверять его будет нечем.
    const hole = make([{ text: 'Nick   Yes, I ___ .', answers: [] }])
    expect(hole.ok).toBe(false)
  })
})
