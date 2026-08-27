import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLessonResponse } from '../lesson/validate'
import { exportArchive, importArchive, listLessonSnapshots, saveLessonSnapshot } from './metadata'

/**
 * Урок уходит в хранилище доски ровно так, как его разобрал валидатор, —
 * а он оставляет в блоках поля со значением `undefined` (необязательный
 * заголовок, подсказка к задаче). Miro такие поля отвергает целиком, и урок
 * остаётся без снимка: на доске он есть, а скачать файлом уже нечем.
 */

const setAppData = vi.fn()
const META = { subject: 'english', topic: 'Тема', level: 'A2', durationMin: 60, language: 'ru' } as const

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
        blocks: [
          // У блока нет ни title, ни say — валидатор положит туда undefined.
          { type: 'objectives', items: ['Цель'] },
          // У рефлексии без подписей колонок undefined окажется ещё и в prompts.
          { type: 'reflection' },
          { type: 'tasks', items: [{ ref: 't1', statement: 'Задача без подсказки' }] },
        ],
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

    // Проверяем каждую запись: снимок уходит не одним вызовом, а вместе
    // с индексом, и достаточно одного undefined в любом из них, чтобы Miro
    // отклонила запись целиком.
    expect(setAppData.mock.calls.length).toBeGreaterThan(0)
    for (const [key, value] of setAppData.mock.calls) {
      expect(hasUndefined(value), `в записи ${key} осталось undefined`).toBe(false)
    }
  })

  it('сначала освобождает место, потом пишет урок', async () => {
    // История уже полна, и новый урок вытесняет самый старый.
    const ids = Array.from({ length: 20 }, (_, i) => `old-${i}`)
    vi.stubGlobal('miro', {
      board: { setAppData, getAppData: vi.fn().mockResolvedValue(ids) },
    })

    await saveLessonSnapshot({
      frameId: 'new-frame',
      lesson: { meta: META, blocks: [] },
      anchors: [],
      savedAt: '2026-08-26T10:00:00.000Z',
    })

    const keys = setAppData.mock.calls.map(([key]) => key)
    const cleared = keys.indexOf('snapshot:old-0')
    const wrote = keys.indexOf('snapshot:new-frame')
    // Если писать урок раньше очистки, при переполнении памяти доски место
    // освободить будет уже нечем: запись упадёт до того, как дойдёт до уборки.
    expect(cleared).toBeGreaterThanOrEqual(0)
    expect(cleared).toBeLessThan(wrote)
    // Указатель обновляется тоже раньше данных: осиротевший ключ хуже лишней
    // записи в указателе — её чтение просто пропустит.
    expect(keys.indexOf('snapshots:index')).toBeLessThan(wrote)
  })

  it('список уроков читается одним обращением к доске', async () => {
    const getAppData = vi.fn().mockResolvedValue({
      'snapshots:index': ['a', 'b'],
      'snapshot:a': { frameId: 'a', lesson: { meta: META, blocks: [] }, anchors: [], savedAt: '1' },
      'snapshot:b': { frameId: 'b', lesson: { meta: META, blocks: [] }, anchors: [], savedAt: '2' },
    })
    vi.stubGlobal('miro', { board: { setAppData, getAppData } })

    const list = await listLessonSnapshots()

    expect(getAppData).toHaveBeenCalledTimes(1)
    // Свежие первыми: обычно нужен последний урок, а не первый за учебный год.
    expect(list.map((entry) => entry.frameId)).toEqual(['b', 'a'])
  })

  it('уроки выходят из доски файлом и возвращаются обратно', async () => {
    const lesson = { meta: META, blocks: [{ type: 'objectives' as const, items: ['Цель'] }] }
    const stored = {
      'snapshots:index': ['frame-1'],
      'snapshot:frame-1': {
        frameId: 'frame-1',
        lesson,
        anchors: [{ index: 0, top: 0, bottom: 10 }],
        savedAt: '2026-08-26T10:00:00.000Z',
      },
    }
    vi.stubGlobal('miro', {
      board: { setAppData, getAppData: vi.fn().mockResolvedValue(stored) },
    })

    const archive = await exportArchive()
    expect(archive.kind).toBe('lesson-builder-archive')
    expect(archive.lessons).toHaveLength(1)
    // В файле лежит сам урок, а не готовая страница: из него можно рисовать заново.
    expect(archive.lessons[0]?.lesson.blocks[0]).toMatchObject({ type: 'objectives' })

    // Файл переносится на другую доску, где ничего нет.
    setAppData.mockClear()
    vi.stubGlobal('miro', { board: { setAppData, getAppData: vi.fn().mockResolvedValue([]) } })
    const restored = await importArchive(JSON.parse(JSON.stringify(archive)))
    expect(restored).toBe(1)
    expect(setAppData.mock.calls.some(([key]) => key === 'snapshot:frame-1')).toBe(true)
  })

  it('чужой файл отклоняется с человеческим объяснением', async () => {
    await expect(importArchive({ lessons: [] } as never)).rejects.toThrow('не файл с уроками')
  })
})

describe('панель без доски', () => {
  /**
   * Панель открывается и просто ссылкой в браузере, без Miro. Уроки тогда
   * некуда класть на доску — они ложатся в память браузера, и список должен
   * читаться оттуда же. Если это сломается, репетитор потеряет всю историю
   * ровно в тот день, когда доска станет недоступна, — то есть тогда, когда
   * запасной вход и понадобится.
   */
  it('помнит уроки в памяти браузера', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('miro', undefined)
    vi.stubGlobal('window', {
      localStorage: {
        get length() {
          return memory.size
        },
        key: (index: number) => [...memory.keys()][index] ?? null,
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => void memory.set(key, value),
        removeItem: (key: string) => void memory.delete(key),
      },
    })

    const parsed = parseLessonResponse(
      JSON.stringify({ meta: META, blocks: [{ type: 'objectives', items: ['Цель'] }] }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    await saveLessonSnapshot({
      frameId: 'local-1',
      lesson: parsed.lesson,
      anchors: [],
      savedAt: '2026-08-27T10:00:00.000Z',
    })

    // Доску никто не трогал: без неё панель обязана обходиться сама.
    expect(setAppData).not.toHaveBeenCalled()

    const list = await listLessonSnapshots()
    expect(list).toHaveLength(1)
    expect(list[0]?.lesson.meta.topic).toBe('Тема')
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
