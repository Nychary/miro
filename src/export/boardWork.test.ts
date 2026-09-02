import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectBoardWork, normalizeText } from './boardWork'

/**
 * Работа ученика теряется тише всего.
 *
 * Конструктор рисует пустые заготовки — стикеры рефлексии, клетки таблиц, —
 * и ученик пишет прямо в них. Объект остаётся ровесником урока, поэтому по
 * времени создания он выглядит «нашим», и всё, что ученик написал, уезжало
 * мимо файла: на доске ответ есть, в скачанном уроке его нет.
 */

const FRAME = { id: 'frame-1', x: 0, y: 0, width: 1000, height: 2000 }
const DRAWN_AT = '2026-08-28T10:00:00.000Z'

function child(overrides: Record<string, unknown>) {
  return {
    type: 'sticky_note',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    parentId: 'frame-1',
    relativeTo: 'canvas',
    ...overrides,
  }
}

function stubBoard(children: unknown[]) {
  vi.stubGlobal('miro', {
    board: {
      get: vi.fn().mockResolvedValue([{ ...FRAME, getChildren: vi.fn().mockResolvedValue(children) }]),
      getAppData: vi.fn().mockResolvedValue(null),
    },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('заметки ученика', () => {
  it('берёт то, что ученик вписал в заготовку конструктора', async () => {
    stubBoard([
      // Наша подпись: ровесник урока, текст из самого урока.
      child({ content: 'Что было понятно', createdAt: DRAWN_AT, y: 100 }),
      // Заготовка рефлексии: создана вместе с уроком, а текст в ней чужой.
      child({ content: 'Понял, когда ставить артикль', createdAt: DRAWN_AT, y: 200 }),
      // Обычный стикер, принесённый учеником уже во время занятия.
      child({ content: 'a или the?', createdAt: '2026-08-28T10:40:00.000Z', y: 300 }),
    ])

    const work = await collectBoardWork('frame-1', DRAWN_AT, new Set(['что было понятно']))

    expect(work.notes.map((note) => note.text)).toEqual([
      'Понял, когда ставить артикль',
      'a или the?',
    ])
  })

  it('без списка своих текстов ведёт себя как раньше', async () => {
    stubBoard([
      child({ content: 'Что было понятно', createdAt: DRAWN_AT, y: 100 }),
      child({ content: 'a или the?', createdAt: '2026-08-28T10:40:00.000Z', y: 300 }),
    ])

    // Пустой список означает «своих текстов не знаем»: тогда ровесник урока
    // всё равно попадёт в работу. Это лучше, чем молча потерять ответ.
    const work = await collectBoardWork('frame-1', DRAWN_AT)
    expect(work.notes.map((note) => note.text)).toContain('a или the?')
  })

  it('считает рисунки пером, не пытаясь их прочитать', async () => {
    stubBoard([
      child({ type: 'unsupported', content: '', createdAt: DRAWN_AT }),
      child({ type: 'image', content: '', createdAt: DRAWN_AT }),
    ])

    const work = await collectBoardWork('frame-1', DRAWN_AT, new Set())
    expect(work.drawings).toBe(1)
  })
})

describe('сравнение текстов', () => {
  it('не считает разными строки, отличающиеся пробелами и регистром', () => {
    expect(normalizeText('  Что   было ПОНЯТНО ')).toBe('что было понятно')
  })
})
