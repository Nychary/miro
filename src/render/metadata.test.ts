import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLessonResponse } from '../lesson/validate'
import { saveLessonSnapshot } from './metadata'

/**
 * Урок уходит в хранилище доски ровно так, как его разобрал валидатор, —
 * а он оставляет в блоках поля со значением `undefined` (необязательный
 * заголовок, подсказка к задаче). Miro такие поля отвергает целиком, и урок
 * остаётся без снимка: на доске он есть, а скачать файлом уже нечем.
 */

const setAppData = vi.fn()

beforeEach(() => {
  setAppData.mockReset()
  vi.stubGlobal('miro', {
    board: {
      setAppData,
      getAppData: vi.fn().mockResolvedValue([]),
    },
  })
})

describe('снимок урока', () => {
  it('уходит на доску без полей со значением undefined', async () => {
    const parsed = parseLessonResponse(
      JSON.stringify({
        meta: { subject: 'english', topic: 'Present Simple', level: 'A2', durationMin: 60, language: 'ru' },
        // У блока нет ни title, ни say — валидатор положит туда undefined.
        blocks: [{ type: 'objectives', items: ['Цель'] }],
      }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    await saveLessonSnapshot({
      frameId: 'frame-1',
      lesson: parsed.lesson,
      anchors: [{ index: 0, top: 0, bottom: 100 }],
      savedAt: '2026-08-26T10:00:00.000Z',
    })

    const [, value] = setAppData.mock.calls[0] ?? []
    expect(value).toBeDefined()
    expect(hasUndefined(value)).toBe(false)
  })
})

/** Miro проверяет значение по схеме до сериализации, поэтому ищем в глубину. */
function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.some(hasUndefined)
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasUndefined)
  }
  return false
}
