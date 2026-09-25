import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseLessonResponse } from '../lesson/validate'
import { renderLesson } from './renderLesson'

/**
 * Раскладка урока на поддельном SDK.
 *
 * Настоящую доску здесь не поднять, но геометрия считается целиком у нас,
 * а поведение Miro, из-за которого объекты уезжали, известно и описуемо:
 * координаты ребёнка фрейма отсчитываются от центра фрейма, а не от доски.
 * Второй сценарий ниже именно его и воспроизводит.
 */

interface FakeItem {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  /** Прикреплён ли к фрейму: у ребёнка x и y считаются от центра фрейма. */
  framed?: boolean
  sync(): Promise<void>
}

interface Board {
  created: FakeItem[]
  frame: () => FakeItem | undefined
  /** Фактическое положение центра на доске, с поправкой на фрейм. */
  center: (item: FakeItem) => { x: number; y: number }
}

/** Высота текста: Miro переносит строки, мы грубо считаем по длине. */
function textHeight(content: string, width: number, fontSize: number): number {
  const chars = content.replace(/<[^>]+>/g, '').length
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  const breaks = (content.match(/<p>/g) ?? []).length
  return Math.max(1, Math.ceil(chars / perLine) + breaks) * fontSize * 1.4
}

/**
 * @param attachOnCreate Прикрепляет ли `createFrame` детей по `childrenIds`.
 *   false — быстрый путь не срабатывает, и в дело вступает `frame.add`.
 */
function setupBoard(attachOnCreate: boolean): Board {
  const created: FakeItem[] = []
  let nextId = 0
  let frameItem: FakeItem | undefined

  const make = (type: string, props: Record<string, unknown>): FakeItem => {
    const item = {
      id: `${type}-${(nextId += 1)}`,
      type,
      x: Number(props.x ?? 0),
      y: Number(props.y ?? 0),
      width: Number(props.width ?? 0),
      height: Number(props.height ?? 0),
      sync: async () => {},
      setMetadata: async () => {},
      getMetadata: async () => undefined,
    } as FakeItem
    created.push(item)
    return item
  }

  /**
   * Прикрепление к фрейму. У ребёнка отсчёт идёт от центра фрейма.
   *
   * `createFrame` по `childrenIds` пересчитывает координаты и объект остаётся
   * на месте, а `frame.add` — нет: x и y он оставляет как есть, и объект
   * уезжает ровно на положение фрейма. Эта асимметрия и есть гипотеза о баге.
   */
  const attach = (child: FakeItem, frame: FakeItem, compensate: boolean): void => {
    if (child.framed) return
    child.framed = true
    if (compensate) {
      child.x -= frame.x
      child.y -= frame.y
    }
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
      const self = make('frame', props)
      frameItem = self
      const ids: string[] = []
      if (attachOnCreate) {
        for (const id of (props.childrenIds as string[]) ?? []) {
          const child = created.find((c) => c.id === id)
          if (child) {
            attach(child, self, true)
            ids.push(id)
          }
        }
      }
      return {
        get id() {
          return self.id
        },
        get x() {
          return self.x
        },
        get y() {
          return self.y
        },
        get childrenIds() {
          return ids
        },
        set childrenIds(value: string[]) {
          ids.splice(0, ids.length, ...value)
        },
        getChildren: async () => created.filter((c) => ids.includes(c.id)),
        add: async (child: FakeItem) => {
          attach(child, self, false)
          if (!ids.includes(child.id)) ids.push(child.id)
        },
        sync: async () => {},
      }
    },
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
  }

  ;(globalThis as Record<string, unknown>).miro = { board }

  return {
    created,
    frame: () => frameItem,
    center: (item) =>
      item.framed && frameItem
        ? { x: frameItem.x + item.x, y: frameItem.y + item.y }
        : { x: item.x, y: item.y },
  }
}

function loadLesson(file: string) {
  const parsed = parseLessonResponse(readFileSync(file, 'utf8'))
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
  return parsed.lesson
}

const LESSON = 'materials/lessons/ef-int-unit1/1b-modern-families.json'

async function straysAfterRender(attachOnCreate: boolean): Promise<string[]> {
  const board = setupBoard(attachOnCreate)
  await renderLesson(loadLesson(LESSON))

  const frame = board.frame()
  if (!frame) throw new Error('фрейм урока не создан')

  const left = frame.x - frame.width / 2
  const right = frame.x + frame.width / 2
  const top = frame.y - frame.height / 2
  const bottom = frame.y + frame.height / 2

  return board.created
    .filter((item) => item.type !== 'frame')
    .filter((item) => {
      const { x, y } = board.center(item)
      return (
        x - item.width / 2 < left - 1 ||
        x + item.width / 2 > right + 1 ||
        y - item.height / 2 < top - 1 ||
        y + item.height / 2 > bottom + 1
      )
    })
    .map((item) => `${item.type} ${item.id} @ ${Math.round(board.center(item).x)}`)
}

describe('раскладка урока', () => {
  it('всё лежит внутри фрейма, когда childrenIds срабатывает', async () => {
    expect(await straysAfterRender(true)).toEqual([])
  })

  it('всё лежит внутри фрейма, когда объекты досоединяются через frame.add', async () => {
    expect(await straysAfterRender(false)).toEqual([])
  })
})
