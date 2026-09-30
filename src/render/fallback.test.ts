import { describe, expect, it } from 'vitest'

import { ENGLISH_SAMPLE } from '../lesson/samples'
import { loadExercises } from './metadata'
import { renderLesson } from './renderLesson'

/**
 * Урок обязан оставаться рабочим, когда память доски переполнена.
 *
 * Указатель на фрейме — ускоритель, а не единственный источник правды: всё
 * нужное лежит метками на самих зонах и карточках. А сама память — история
 * ограниченной длины: когда места нет, старейшие снимки уступают его новым.
 */

interface FakeItem {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  meta: Record<string, unknown>
  sync(): Promise<void>
  setMetadata(key: string, value: unknown): Promise<void>
  getMetadata(key: string): Promise<unknown>
}

interface Options {
  /** false — любая запись в память отклоняется. */
  storageWorks?: boolean
  /** Сколько байт вмещает память доски. */
  quota?: number
  /** Что лежит в памяти до отрисовки. */
  preload?: Record<string, unknown>
}

const LIMIT = 'The data storage limit for "appdata" has been exceeded.'

function setup(options: Options = {}) {
  const created: FakeItem[] = []
  let n = 0
  let frameId = ''
  const children: string[] = []
  const appData = new Map<string, unknown>(Object.entries(options.preload ?? {}))

  const used = () => [...appData.values()].reduce<number>((sum, v) => sum + JSON.stringify(v).length, 0)

  const make = (type: string, p: Record<string, unknown>): FakeItem => {
    const item: FakeItem = {
      id: `${type}-${(n += 1)}`,
      type,
      x: Number(p.x ?? 0),
      y: Number(p.y ?? 0),
      width: Number(p.width ?? 0),
      height: Number(p.height ?? 0),
      meta: {},
      sync: async () => {},
      setMetadata: async (k, v) => {
        item.meta[k] = v
      },
      getMetadata: async (k) => item.meta[k],
    }
    created.push(item)
    return item
  }

  const th = (c: string, w: number, f: number) => {
    const chars = c.replace(/<[^>]+>/g, '').length
    const perLine = Math.max(1, Math.floor(w / (f * 0.55)))
    return Math.max(1, Math.ceil(chars / perLine) + (c.match(/<p>/g) ?? []).length) * f * 1.4
  }

  const frameView = () => ({
    id: frameId,
    type: 'frame',
    getChildren: async () => created.filter((c) => children.includes(c.id)),
  })

  const board = {
    createText: async (p: any) => {
      const i = make('text', p)
      i.height = th(String(p.content ?? ''), Number(p.width ?? 100), Number(p.style?.fontSize ?? 16))
      return i
    },
    createShape: async (p: any) => make('shape', p),
    createStickyNote: async (p: any) => {
      const i = make('sticky', p)
      i.height = i.width
      return i
    },
    createConnector: async (p: any) => make('connector', p),
    createFrame: async (p: any) => {
      const self = make('frame', p)
      frameId = self.id
      children.push(...((p.childrenIds as string[]) ?? []))
      return {
        ...frameView(),
        x: self.x,
        y: self.y,
        get childrenIds() {
          return children
        },
        set childrenIds(v: string[]) {
          children.splice(0, children.length, ...v)
        },
        add: async (c: FakeItem) => {
          if (!children.includes(c.id)) children.push(c.id)
        },
        sync: async () => {},
      }
    },
    getById: async (id: string) => (id === frameId ? frameView() : created.find((c) => c.id === id)),
    getAppData: async (k?: string) => (k ? appData.get(k) : Object.fromEntries(appData)),
    setAppData: async (k: string, v: unknown) => {
      if (options.storageWorks === false) throw new Error(LIMIT)
      if (v === null || v === undefined) {
        appData.delete(k)
        return
      }
      const previous = appData.get(k)
      appData.set(k, v)
      if (options.quota !== undefined && used() > options.quota) {
        if (previous === undefined) appData.delete(k)
        else appData.set(k, previous)
        throw new Error(LIMIT)
      }
    },
    findEmptySpace: async () => ({ x: 0, y: 0, width: 4000, height: 200000 }),
    viewport: { get: async () => ({ x: 0, y: 0, width: 2000, height: 1200 }), zoomTo: async () => {} },
    get: async () => [],
    remove: async () => {},
    group: async (p: any) => make('group', p),
    getLayerIndex: async () => 0,
    // Слои раскладывает сама доска; положение объектов команда не меняет.
    bringToFront: async () => {},
  }

  ;(globalThis as Record<string, unknown>).miro = { board }
  return { frameId: () => frameId, appData, used }
}

describe('проверка без памяти доски', () => {
  it('задания собираются с доски, когда указатель не сохранился', async () => {
    // Эталон: та же отрисовка, но память доски исправна.
    const good = setup()
    await renderLesson(ENGLISH_SAMPLE)
    const fromIndex = await loadExercises(good.frameId())
    expect(fromIndex, 'указатель должен был сохраниться').not.toBeNull()

    // А теперь память не принимает ничего.
    const broken = setup({ storageWorks: false })
    const result = await renderLesson(ENGLISH_SAMPLE)
    expect(result.warnings.join(' ')).toContain('Кнопки проверки всё равно работают')

    const fromBoard = await loadExercises(broken.frameId())
    expect(fromBoard, 'задания должны собраться с доски').not.toBeNull()

    const byRef = (data: NonNullable<typeof fromBoard>) =>
      Object.fromEntries(
        data.exercises.map((e) => [e.ref, { zones: e.zones.length, chips: e.chips.length, title: e.title }]),
      )

    expect(byRef(fromBoard!)).toEqual(byRef(fromIndex!))

    // Карточки должны помнить, куда возвращаться, иначе урок одноразовый.
    const chips = fromBoard!.exercises.flatMap((e) => e.chips)
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((c) => c.homeX !== 0 || c.homeY !== 0)).toBe(true)
  })
})

describe('память доски забита старыми уроками', () => {
  /** Старый большой урок: сам по себе съедает заметную часть памяти. */
  const bulky = (frame: string) => ({
    frameId: frame,
    lesson: { meta: { topic: `старый ${frame}` }, blocks: [{ type: 'theory', filler: 'x'.repeat(20_000) }] },
    anchors: [],
    savedAt: '2026-09-01T00:00:00.000Z',
  })

  const oldExercises = {
    frameId: 'old-1',
    topic: 'старый урок',
    exercises: [{ ref: 'g1', title: 'старое задание', zones: [{ id: 'z', expected: 'a' }], chips: [] }],
  }

  const live = {
    'snapshots:index': ['old-1', 'old-2', 'old-3'],
    'snapshot:old-1': bulky('old-1'),
    'snapshot:old-2': bulky('old-2'),
    'snapshot:old-3': bulky('old-3'),
    'lessons:index': ['old-1'],
    'lesson:old-1': oldExercises,
  }

  /** Память, в которой места ровно под то, что уже лежит. */
  const crammed = (preload: Record<string, unknown>) => {
    const size = setup({ preload }).used()
    return setup({ preload, quota: size + 2_000 })
  }

  it('сначала уходит мёртвый груз — снимки, на которые указатель не ссылается', async () => {
    const board = crammed({ ...live, 'snapshot:lost': bulky('lost') })

    const result = await renderLesson(ENGLISH_SAMPLE)
    const id = board.frameId()

    expect(result.warnings.filter((w) => w.includes('память доски'))).toEqual([])
    expect(board.appData.has(`lesson:${id}`), 'указатель заданий нового урока').toBe(true)
    expect(board.appData.has(`snapshot:${id}`), 'снимок нового урока').toBe(true)

    expect(board.appData.has('snapshot:lost')).toBe(false)
    // Мёртвого груза хватило — живые снимки трогать было незачем.
    expect(board.appData.has('snapshot:old-1')).toBe(true)
  })

  it('мёртвого груза нет — уходит самый старый снимок, и не больше, чем нужно', async () => {
    const board = crammed(live)

    const result = await renderLesson(ENGLISH_SAMPLE)
    const id = board.frameId()

    expect(result.warnings.filter((w) => w.includes('память доски'))).toEqual([])
    expect(board.appData.has(`lesson:${id}`), 'указатель заданий нового урока').toBe(true)
    expect(board.appData.has(`snapshot:${id}`), 'снимок нового урока').toBe(true)
    expect(board.appData.get('snapshots:index')).toEqual(['old-2', 'old-3', id])

    expect(board.appData.has('snapshot:old-1')).toBe(false)
    expect(board.appData.has('snapshot:old-3')).toBe(true)

    // Чужой указатель заданий не тронут: на нём держится старый урок.
    expect(board.appData.get('lesson:old-1')).toEqual(oldExercises)
    expect(board.appData.get('lessons:index')).toContain('old-1')
  })
})
