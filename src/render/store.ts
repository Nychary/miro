import type { BaseItem } from '@mirohq/websdk-types'

/**
 * Где панель хранит уроки.
 *
 * Панель умеет жить в двух местах: внутри Miro отдельной колонкой и просто
 * страницей в браузере. Внутри доски память — appData: уроки лежат рядом с
 * доской, и репетитор видит их с любого компьютера. Снаружи доски никакого
 * appData нет, но и терять уроки нельзя, поэтому память — localStorage
 * браузера.
 *
 * Разница спрятана здесь намеренно. Всё остальное — список уроков, снимки,
 * выгрузка архивом — написано один раз и не знает, где именно оно работает:
 * иначе каждый переезд на другую доску означал бы правку в десяти местах.
 */

type MetadataValue = Parameters<BaseItem['setMetadata']>[1]

/**
 * Есть ли рядом доска Miro.
 *
 * Признак — сам факт того, что на странице объявлен `miro`. Проверять глубже
 * (например, что `miro.board` уже отвечает) нельзя: панель решает этот вопрос
 * один раз при загрузке, а SDK доводит себя до готовности чуть позже. Ответь
 * мы в этот момент «доски нет» — панель внутри Miro превратилась бы в
 * автономную и перестала рисовать. Страница без доски скрипт Miro не грузит
 * вовсе, так что перепутать их нечем.
 */
export function onBoard(): boolean {
  return typeof miro !== 'undefined' && miro !== null
}

export interface Store {
  read(key: string): Promise<unknown>
  readAll(): Promise<Record<string, unknown>>
  write(key: string, value: unknown): Promise<void>
}

const boardStore: Store = {
  read: (key) => miro.board.getAppData(key),
  readAll: async () => (await miro.board.getAppData()) as Record<string, unknown>,
  write: async (key, value) => {
    await miro.board.setAppData(key, value as MetadataValue)
  },
}

const PREFIX = 'lesson-builder:'

/**
 * Память браузера.
 *
 * Каждое обращение обёрнуто в try: в режиме инкогнито и при запрете на данные
 * сайтов localStorage бросает исключение на ровном месте. Панель без памяти
 * всё ещё делает уроки и скачивает их файлом — это хуже, но это работает,
 * а падение с ошибкой не работало бы вовсе.
 */
const localStore: Store = {
  read: async (key) => {
    try {
      const raw = window.localStorage.getItem(PREFIX + key)
      return raw === null ? undefined : JSON.parse(raw)
    } catch {
      return undefined
    }
  },
  readAll: async () => {
    const all: Record<string, unknown> = {}
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (!key || !key.startsWith(PREFIX)) continue
        const raw = window.localStorage.getItem(key)
        if (raw !== null) all[key.slice(PREFIX.length)] = JSON.parse(raw)
      }
    } catch {
      // Ничего не прочиталось — считаем, что уроков нет.
    }
    return all
  },
  write: async (key, value) => {
    try {
      if (value === null || value === undefined) window.localStorage.removeItem(PREFIX + key)
      else window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // Память переполнена или запрещена. Молчим: урок уже нарисован, и
      // единственное, чего лишается репетитор, — списка на будущее.
    }
  },
}

export function store(): Store {
  return onBoard() ? boardStore : localStore
}
