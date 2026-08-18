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

/**
 * Устаревший ключ: раньше все уроки лежали одним массивом. На большом юните
 * такой массив упирается в лимит размера значения appData, поэтому теперь
 * каждый урок хранится под своим ключом, а под этим — только их список.
 */
export const LEGACY_APP_DATA_KEY = 'lessons'
const INDEX_KEY = 'lessons:index'
const LESSON_KEY_PREFIX = 'lesson:'

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
  /**
   * Стиль оформления урока. Нужен проверке и сбросу: они перекрашивают зоны
   * и обязаны попадать в палитру урока, даже если панель перезагружали.
   */
  style?: string
  exercises: ExerciseRecord[]
}

export async function saveExercises(data: LessonExercises): Promise<void> {
  const index = await readIndex()
  const updated = [...index.filter((id) => id !== data.frameId), data.frameId]

  // Вытесненным из истории урокам затираем и данные, чтобы хранилище не росло.
  const evicted = updated.slice(0, Math.max(0, updated.length - HISTORY_LIMIT))
  const kept = updated.slice(-HISTORY_LIMIT)

  await miro.board.setAppData(LESSON_KEY_PREFIX + data.frameId, data as unknown as MetadataValue)
  await miro.board.setAppData(INDEX_KEY, kept as unknown as MetadataValue)
  for (const id of evicted) {
    await miro.board.setAppData(LESSON_KEY_PREFIX + id, null)
  }
}

export async function loadExercises(frameId: string): Promise<LessonExercises | null> {
  const raw = await miro.board.getAppData(LESSON_KEY_PREFIX + frameId)
  const entry = asLesson(raw)
  if (entry) return entry

  // Уроки, сохранённые до перехода на поключевое хранение.
  return (await readLegacy()).find((item) => item.frameId === frameId) ?? null
}

/** Все уроки с заданиями, о которых знает доска. Свежие — в конце. */
export async function listExercises(): Promise<LessonExercises[]> {
  const index = await readIndex()
  const entries: LessonExercises[] = []
  for (const frameId of index) {
    const entry = asLesson(await miro.board.getAppData(LESSON_KEY_PREFIX + frameId))
    if (entry) entries.push(entry)
  }

  const known = new Set(entries.map((entry) => entry.frameId))
  const legacy = (await readLegacy()).filter((entry) => !known.has(entry.frameId))
  return [...legacy, ...entries]
}

async function readIndex(): Promise<string[]> {
  const raw = await miro.board.getAppData(INDEX_KEY)
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

async function readLegacy(): Promise<LessonExercises[]> {
  const raw = await miro.board.getAppData(LEGACY_APP_DATA_KEY)
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).map(asLesson).filter((entry): entry is LessonExercises => entry !== null)
}

function asLesson(raw: unknown): LessonExercises | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = raw as LessonExercises
  return typeof entry.frameId === 'string' && Array.isArray(entry.exercises) ? entry : null
}
