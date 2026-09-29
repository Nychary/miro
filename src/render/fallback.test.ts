import { describe, expect, it } from 'vitest'

import { ENGLISH_SAMPLE } from '../lesson/samples'
import { loadExercises } from './metadata'
import { renderLesson } from './renderLesson'

/**
 * Урок обязан оставаться проверяемым, когда память доски переполнена.
 *
 * Указатель на фрейме — ускоритель, а не единственный источник правды: всё
 * нужное лежит метками на самих зонах и карточках. Здесь память доски
 * намеренно ломается на записи, и проверяется, что задания всё равно
 * собираются — с теми же зонами, карточками и местами карточек.
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

function setup(storageWorks: boolean) {
  const created: FakeItem[] = []
  let n = 0
  let frameId = ''
  const children: string[] = []
  const appData = new Map<string, unknown>()

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
        id: self.id,
        x: self.x,
        y: self.y,
        type: 'frame',
        get childrenIds() {
          return children
        },
        set childrenIds(v: string[]) {
          children.splice(0, children.length, ...v)
        },
        getChildren: async () => created.filter((c) => children.includes(c.id)),
        add: async (c: FakeItem) => {
          if (!children.includes(c.id)) children.push(c.id)
        },
        sync: async () => {},
      }
    },
    getById: async (id: string) => {
      if (id !== frameId) return created.find((c) => c.id === id)
      return {
        id: frameId,
        type: 'frame',
        getChildren: async () => created.filter((c) => children.includes(c.id)),
      }
    },
    getAppData: async (k?: string) => (k ? appData.get(k) : Object.fromEntries(appData)),
    setAppData: async (k: string, v: unknown) => {
      if (!storageWorks) throw new Error('The data storage limit for "appdata" has been exceeded.')
      appData.set(k, v)
    },
    findEmptySpace: async () => ({ x: 0, y: 0, width: 4000, height: 200000 }),
    viewport: { get: async () => ({ x: 0, y: 0, width: 2000, height: 1200 }), zoomTo: async () => {} },
    get: async () => [],
    remove: async () => {},
    group: async (p: any) => make('group', p),
    getLayerIndex: async () => 0,
  }

  ;(globalThis as Record<string, unknown>).miro = { board }
  return { frameId: () => frameId }
}

describe('проверка без памяти доски', () => {
  it('задания собираются с доски, когда указатель не сохранился', async () => {
    // Эталон: та же отрисовка, но память доски исправна.
    const good = setup(true)
    await renderLesson(ENGLISH_SAMPLE)
    const fromIndex = await loadExercises(good.frameId())
    expect(fromIndex, 'указатель должен был сохраниться').not.toBeNull()

    // А теперь память переполнена: ни один setAppData не проходит.
    const broken = setup(false)
    const result = await renderLesson(ENGLISH_SAMPLE)
    expect(result.warnings.join(' ')).toContain('Кнопки проверки всё равно работают')

    const fromBoard = await loadExercises(broken.frameId())
    expect(fromBoard, 'задания должны собраться с доски').not.toBeNull()

    const byRef = (data: NonNullable<typeof fromBoard>) =>
      Object.fromEntries(
        data.exercises.map((e) => [
          e.ref,
          { zones: e.zones.length, chips: e.chips.length, title: e.title },
        ]),
      )

    expect(byRef(fromBoard!)).toEqual(byRef(fromIndex!))

    // Карточки должны помнить, куда возвращаться, иначе урок одноразовый.
    const chips = fromBoard!.exercises.flatMap((e) => e.chips)
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((c) => c.homeX !== 0 || c.homeY !== 0)).toBe(true)
  })
})
