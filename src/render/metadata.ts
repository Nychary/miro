import type { BaseItem, Frame } from '@mirohq/websdk-types'

/**
 * Разметка интерактивных заданий на доске.
 *
 * Проверка устроена единообразно для всех типов упражнений: у каждой зоны есть
 * ожидаемый текст, у каждой карточки — свой, и совпадение проверяется по
 * тексту, а не по номеру ячейки. Поэтому повторяющиеся варианты ответа
 * (два пропуска с одним и тем же словом) не ломают проверку.
 *
 * Данные лежат в двух местах, и это не дублирование:
 *
 * — На самих объектах — чтобы объект оставался понятным сам по себе: если
 *   репетитор перетащит карточку в другой урок, будет видно, откуда она.
 * — На фрейме урока — как указатель: какие объекты вообще участвуют в
 *   проверке. Без него пришлось бы опрашивать метаданные у всех ста с лишним
 *   объектов урока, а так хватает одного чтения и одного запроса по списку
 *   идентификаторов.
 */

export const METADATA_KEY = 'lessonBuilder'
export const EXERCISES_KEY = 'lessonExercises'

// ---------------------------------------------------------------------------
// Метки на объектах
// ---------------------------------------------------------------------------

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

type MetadataValue = Parameters<BaseItem['setMetadata']>[1]

export async function tagItem(item: BaseItem, meta: ItemMeta): Promise<void> {
  await item.setMetadata(METADATA_KEY, meta as unknown as MetadataValue)
}

// ---------------------------------------------------------------------------
// Указатель на фрейме урока
// ---------------------------------------------------------------------------

export interface ZoneRecord {
  id: string
  expected: string
}

export interface ChipRecord {
  id: string
  value: string
}

export interface ExerciseRecord {
  ref: string
  /** Заголовок секции — чтобы отчёт о проверке был понятен без доски. */
  title: string
  zones: ZoneRecord[]
  chips: ChipRecord[]
}

export interface LessonExercises {
  topic: string
  exercises: ExerciseRecord[]
}

export async function saveExercises(frame: Frame, data: LessonExercises): Promise<void> {
  await frame.setMetadata(EXERCISES_KEY, data as unknown as MetadataValue)
}

export async function loadExercises(frame: Frame): Promise<LessonExercises | null> {
  const raw = await frame.getMetadata(EXERCISES_KEY)
  if (!raw || typeof raw !== 'object') return null

  const data = raw as unknown as LessonExercises
  return Array.isArray(data.exercises) ? data : null
}
