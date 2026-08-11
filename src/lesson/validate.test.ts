import { describe, expect, it } from 'vitest'
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

  it('жалуется на пустой ввод', () => {
    const result = parseLessonResponse('   ')
    expect(result.ok).toBe(false)
  })

  it('жалуется на ответ без JSON', () => {
    const result = parseLessonResponse('Извините, не могу составить такой урок.')
    if (result.ok) throw new Error('ожидалась ошибка')
    expect(result.errors[0]).toContain('не нашёлся JSON')
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
