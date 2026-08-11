import type { BaseItem } from '@mirohq/websdk-types'

/**
 * Метаданные, которые рендерер вешает на объекты интерактивных заданий.
 *
 * Благодаря им кнопка «Проверить» работает единообразно для всех типов
 * упражнений: она берёт каждую зону, ищет лежащую в ней карточку и сравнивает
 * `chip.value` с `zone.expected`. Сравнение идёт по тексту, а не по номеру
 * ячейки, поэтому повторяющиеся варианты ответа не ломают проверку.
 */

export const METADATA_KEY = 'lessonBuilder'

export interface ZoneMeta {
  role: 'zone'
  /** `ref` упражнения из схемы урока. */
  exercise: string
  /** Текст карточки, которая должна здесь оказаться. */
  expected: string
}

export interface ChipMeta {
  role: 'chip'
  exercise: string
  /** Текст карточки — то, что сравнивается с `expected` зоны. */
  value: string
}

export type ItemMeta = ZoneMeta | ChipMeta

export async function tagItem(item: BaseItem, meta: ItemMeta): Promise<void> {
  await item.setMetadata(METADATA_KEY, meta as unknown as Parameters<BaseItem['setMetadata']>[1])
}

export async function readItemMeta(item: BaseItem): Promise<ItemMeta | null> {
  const raw = await item.getMetadata(METADATA_KEY)
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as unknown as ItemMeta
  return meta.role === 'zone' || meta.role === 'chip' ? meta : null
}
