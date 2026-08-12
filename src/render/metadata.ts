import type { BaseItem } from '@mirohq/websdk-types'

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
 * — В хранилище приложения на доске — как указатель: какие объекты вообще
 *   участвуют в проверке. Без него пришлось бы опрашивать метаданные у всех
 *   ста с лишним объектов урока, а так хватает одного чтения и одного запроса
 *   по списку идентификаторов.
 *
 * Указатель просился на фрейм урока — он исчезал бы вместе с ним, — но Miro
 * не поддерживает метаданные у фреймов: setMetadata есть у фигур, стикеров,
 * текста и карточек, а у фрейма его нет.
 */

export const METADATA_KEY = 'lessonBuilder'
export const APP_DATA_KEY = 'lessons'

/**
 * Сколько уроков помним. Доска ученика живёт годами, а указатель нужен только
 * тем урокам, к которым ещё вернутся; без ограничения хранилище растёт вечно.
 */
const HISTORY_LIMIT = 20

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
  /**
   * Где карточка лежала сразу после отрисовки, в координатах доски.
   *
   * Нужно, чтобы разложить карточки обратно: без этого урок одноразовый —
   * после первого ученика задание уже решено, и повторить его не с чем.
   */
  homeX: number
  homeY: number
}

export interface ExerciseRecord {
  ref: string
  /** Заголовок секции — чтобы отчёт о проверке был понятен без доски. */
  title: string
  zones: ZoneRecord[]
  chips: ChipRecord[]
}

export interface LessonExercises {
  /** Фрейм урока, к которому относится запись. */
  frameId: string
  topic: string
  exercises: ExerciseRecord[]
}

export async function saveExercises(data: LessonExercises): Promise<void> {
  const stored = await readStore()
  const withoutThis = stored.filter((entry) => entry.frameId !== data.frameId)

  await miro.board.setAppData(APP_DATA_KEY, [...withoutThis, data].slice(-HISTORY_LIMIT) as unknown as MetadataValue)
}

export async function loadExercises(frameId: string): Promise<LessonExercises | null> {
  const stored = await readStore()
  return stored.find((entry) => entry.frameId === frameId) ?? null
}

/** Все уроки с заданиями, о которых знает доска. Свежие — в конце. */
export async function listExercises(): Promise<LessonExercises[]> {
  return readStore()
}

async function readStore(): Promise<LessonExercises[]> {
  const raw = await miro.board.getAppData(APP_DATA_KEY)
  if (!Array.isArray(raw)) return []

  return (raw as unknown as LessonExercises[]).filter(
    (entry) => entry && typeof entry.frameId === 'string' && Array.isArray(entry.exercises),
  )
}
