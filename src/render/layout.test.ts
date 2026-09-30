import { describe, expect, it } from 'vitest'

import { ENGLISH_SAMPLE } from '../lesson/samples'
import { renderLesson } from './renderLesson'

/**
 * Упаковка урока во фрейм не должна ничего двигать.
 *
 * Модель доски здесь списана с живой, а не придумана. На настоящем Miro
 * выяснилось три вещи, и все три заложены в подделку:
 *
 * 1. Координаты ребёнка фрейма отсчитываются от левого верхнего угла фрейма
 *    (`relativeTo: 'parent_top_left'`), а не от его центра.
 * 2. `frame.add` сам пересчитывает координаты: объект остаётся там, где стоял.
 * 3. Запись ребёнку отрицательных координат доска отклоняет.
 *
 * Прежняя версия этого теста исходила из обратного — что `frame.add` объект
 * сдвигает и его надо возвращать. «Возврат» писал координаты от центра, доска
 * принимала их как отсчёт от угла, и нижняя правая часть урока уезжала на
 * полфрейма влево и вверх. Тест при этом был зелёным: он проверял согласие
 * кода с выдуманной моделью. Поэтому теперь проверяется не «всё внутри
 * фрейма», а сам инвариант: где объект стоял до упаковки, там он и после.
 */

interface FakeItem {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  framed: boolean
  /** Последние координаты, которые доска приняла. */
  saved: { x: number; y: number }
  sync(): Promise<void>
  setMetadata(): Promise<void>
  getMetadata(): Promise<unknown>
}

interface Board {
  created: FakeItem[]
  /** Центры объектов на доске в момент, когда фрейм вот-вот появится. */
  before: Map<string, { x: number; y: number }>
  center(item: FakeItem): { x: number; y: number }
}

function textHeight(content: string, width: number, fontSize: number): number {
  const chars = content.replace(/<[^>]+>/g, '').length
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  const breaks = (content.match(/<p>/g) ?? []).length
  return Math.max(1, Math.ceil(chars / perLine) + breaks) * fontSize * 1.4
}

/**
 * @param attachOnCreate Прикрепляет ли `createFrame` детей по `childrenIds`.
 *   У репетитора на живой доске — нет: все объекты идут через `frame.add`.
 */
function setupBoard(attachOnCreate: boolean): Board {
  const created: FakeItem[] = []
  const before = new Map<string, { x: number; y: number }>()
  let nextId = 0
  let frame: FakeItem | undefined

  const corner = () => {
    if (!frame) throw new Error('фрейма ещё нет')
    return { left: frame.x - frame.width / 2, top: frame.y - frame.height / 2 }
  }

  const make = (type: string, props: Record<string, unknown>): FakeItem => {
    const item: FakeItem = {
      id: `${type}-${(nextId += 1)}`,
      type,
      x: Number(props.x ?? 0),
      y: Number(props.y ?? 0),
      width: Number(props.width ?? 0),
      height: Number(props.height ?? 0),
      framed: false,
      saved: { x: Number(props.x ?? 0), y: Number(props.y ?? 0) },
      sync: async () => {
        if (item.framed && (item.x < 0 || item.y < 0)) {
          item.x = item.saved.x
          item.y = item.saved.y
          throw new Error('Position is outside of the parent frame')
        }
        item.saved = { x: item.x, y: item.y }
      },
      setMetadata: async () => {},
      getMetadata: async () => undefined,
    }
    created.push(item)
    return item
  }

  /** Прикрепление: место на доске прежнее, отсчёт — от угла фрейма. */
  const attach = (child: FakeItem): void => {
    if (child.framed) return
    const { left, top } = corner()
    child.x -= left
    child.y -= top
    child.saved = { x: child.x, y: child.y }
    child.framed = true
  }

  const board = {
    createText: async (props: Record<string, unknown>) => {
      const width = Number(props.width ?? 100)
      const size = Number((props.style as Record<string, unknown>)?.fontSize ?? 16)
      const item = make('text', props)
      item.height = textHeight(String(props.content ?? ''), width, size)
      return item
    },
    createShape: async (props: Record<string, unknown>) => make('shape', props),
    createStickyNote: async (props: Record<string, unknown>) => {
      const item = make('sticky', props)
      item.height = item.width
      return item
    },
    createConnector: async (props: Record<string, unknown>) => make('connector', props),
    createFrame: async (props: Record<string, unknown>) => {
      for (const item of created) before.set(item.id, { x: item.x, y: item.y })

      const self = make('frame', props)
      frame = self
      const ids: string[] = []
      if (attachOnCreate) {
        for (const id of (props.childrenIds as string[]) ?? []) {
          const child = created.find((c) => c.id === id)
          if (child) {
            attach(child)
            ids.push(id)
          }
        }
      }
      return {
        id: self.id,
        type: 'frame',
        x: self.x,
        y: self.y,
        width: self.width,
        height: self.height,
        get childrenIds() {
          return ids
        },
        set childrenIds(value: string[]) {
          ids.splice(0, ids.length, ...value)
        },
        getChildren: async () => created.filter((c) => ids.includes(c.id)),
        add: async (child: FakeItem) => {
          attach(child)
          if (!ids.includes(child.id)) ids.push(child.id)
        },
        sync: async () => {},
      }
    },
    getById: async (id: string) => created.find((c) => c.id === id),
    findEmptySpace: async () => ({ x: 0, y: 0, width: 4000, height: 20000 }),
    viewport: {
      get: async () => ({ x: 0, y: 0, width: 2000, height: 1200 }),
      zoomTo: async () => {},
    },
    getAppData: async () => ({}),
    setAppData: async () => {},
    get: async () => [],
    remove: async () => {},
    group: async (props: Record<string, unknown>) => make('group', props),
    getLayerIndex: async () => 0,
    // Слои раскладывает сама доска; положение объектов команда не меняет.
    bringToFront: async () => {},
  }

  ;(globalThis as Record<string, unknown>).miro = { board }

  return {
    created,
    before,
    center: (item) => {
      if (!item.framed) return { x: item.x, y: item.y }
      const { left, top } = corner()
      return { x: left + item.x, y: top + item.y }
    },
  }
}

/** Объекты, которые после упаковки оказались не там, где стояли до неё. */
async function movedByFraming(attachOnCreate: boolean): Promise<string[]> {
  const board = setupBoard(attachOnCreate)
  await renderLesson(ENGLISH_SAMPLE)

  expect(board.before.size, 'урок должен был лечь на доску').toBeGreaterThan(20)

  return board.created
    .filter((item) => board.before.has(item.id))
    .filter((item) => {
      const was = board.before.get(item.id)
      const now = board.center(item)
      return !was || Math.abs(now.x - was.x) > 1 || Math.abs(now.y - was.y) > 1
    })
    .map((item) => {
      const was = board.before.get(item.id)
      const now = board.center(item)
      return `${item.id}: было ${Math.round(was?.x ?? 0)},${Math.round(was?.y ?? 0)} → стало ${Math.round(now.x)},${Math.round(now.y)}`
    })
}

describe('упаковка во фрейм ничего не двигает', () => {
  it('когда дети прикрепляются сразу, по childrenIds', async () => {
    expect(await movedByFraming(true)).toEqual([])
  })

  it('когда все объекты досоединяются через frame.add — как на живой доске', async () => {
    expect(await movedByFraming(false)).toEqual([])
  })
})
