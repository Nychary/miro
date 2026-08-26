import type { BaseItem } from '@mirohq/websdk-types'
import type { Lesson } from '../lesson/schema'

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

const SNAPSHOT_KEY_PREFIX = 'snapshot:'
const SNAPSHOT_INDEX_KEY = 'snapshots:index'

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

/**
 * Значение, пригодное для хранилища доски.
 *
 * Разбор ответа нейросети оставляет в уроке поля со значением `undefined` —
 * необязательный `title` блока, необязательный `hint` задачи. JSON такие поля
 * молча выбрасывает, а Miro сверяет объект по схеме до сериализации и отвечает
 * «Invalid type. Expected: null | string | number | boolean | array | object,
 * received undefined». Урок при этом уже на доске, а снимок не сохраняется —
 * и скачать файлом его потом нечем. Прогон через JSON убирает такие поля.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function tagItem(item: BaseItem, meta: ItemMeta): Promise<void> {
  await item.setMetadata(METADATA_KEY, plain(meta) as unknown as MetadataValue)
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

  await miro.board.setAppData(LESSON_KEY_PREFIX + data.frameId, plain(data) as unknown as MetadataValue)
  await miro.board.setAppData(INDEX_KEY, plain(kept) as unknown as MetadataValue)
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

// ---------------------------------------------------------------------------
// Снимок урока: сам JSON, из которого урок был нарисован
//
// Панель — обычная веб-страница внутри Miro, и любое обновление вкладки стирает
// её состояние. Без снимка это значило, что скачать урок файлом можно было
// ровно до первого F5, а потом — только нарисовав его заново. Теперь урок
// живёт на доске рядом со своим фреймом: панель перезагрузили, репетитор
// вернулся через неделю, села за другой компьютер — файл всё ещё можно забрать.
// ---------------------------------------------------------------------------

export interface BlockAnchor {
  /** Позиция блока в `lesson.blocks`. */
  index: number
  /** Вертикальные границы секции в координатах доски. */
  top: number
  bottom: number
}

export interface LessonSnapshot {
  frameId: string
  lesson: Lesson
  /**
   * Где какая секция оказалась на доске. Нужно экспорту: картинки, которые
   * репетитор вручную положил на урок, раскладываются по секциям по своей
   * вертикали, а не сваливаются кучей в конец файла.
   */
  anchors: BlockAnchor[]
  /** ISO-дата отрисовки — по ней панель показывает свежие уроки первыми. */
  savedAt: string
}

export async function saveLessonSnapshot(snapshot: LessonSnapshot): Promise<void> {
  const index = await readSnapshotIndex()
  const updated = [...index.filter((id) => id !== snapshot.frameId), snapshot.frameId]
  const evicted = updated.slice(0, Math.max(0, updated.length - HISTORY_LIMIT))
  const kept = updated.slice(-HISTORY_LIMIT)

  await miro.board.setAppData(
    SNAPSHOT_KEY_PREFIX + snapshot.frameId,
    plain(snapshot) as unknown as MetadataValue,
  )
  await miro.board.setAppData(SNAPSHOT_INDEX_KEY, plain(kept) as unknown as MetadataValue)
  for (const id of evicted) {
    await miro.board.setAppData(SNAPSHOT_KEY_PREFIX + id, null)
  }
}

export async function loadLessonSnapshot(frameId: string): Promise<LessonSnapshot | null> {
  return asSnapshot(await miro.board.getAppData(SNAPSHOT_KEY_PREFIX + frameId))
}

/**
 * Уроки, которые доска помнит целиком. Свежие — первыми: в панели это список
 * выбора, и обычно нужен последний урок, а не первый за учебный год.
 */
export async function listLessonSnapshots(): Promise<LessonSnapshot[]> {
  const index = await readSnapshotIndex()
  const entries: LessonSnapshot[] = []
  for (const frameId of index) {
    const entry = asSnapshot(await miro.board.getAppData(SNAPSHOT_KEY_PREFIX + frameId))
    if (entry) entries.push(entry)
  }
  return entries.reverse()
}

async function readSnapshotIndex(): Promise<string[]> {
  const raw = await miro.board.getAppData(SNAPSHOT_INDEX_KEY)
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

function asSnapshot(raw: unknown): LessonSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = raw as LessonSnapshot
  if (typeof entry.frameId !== 'string' || !entry.lesson || !Array.isArray(entry.lesson.blocks)) return null
  return { ...entry, anchors: Array.isArray(entry.anchors) ? entry.anchors : [] }
}
