import type { BaseItem } from '@mirohq/websdk-types'
import type { Lesson } from '../lesson/schema'
import { store } from './store'

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

/**
 * Метки на объектах — второй, независимый источник правды об уроке.
 *
 * Указатель на фрейме компактнее и быстрее, но он живёт в памяти доски,
 * а она кончается. Метки же лежат на самих объектах, и пока урок есть на
 * доске, задания по ним восстановимы. Поэтому в метке хранится всё, что
 * нужно и проверке, и раскладыванию карточек обратно, — а не только
 * ожидаемый текст.
 */
export interface ZoneMeta {
  role: 'zone'
  /** `ref` упражнения из схемы урока. */
  exercise: string
  /** Заголовок секции — чтобы отчёт о проверке был понятен без указателя. */
  title?: string
  /** Текст карточки, которая должна здесь оказаться. */
  expected: string
}

export interface ChipMeta {
  role: 'chip'
  exercise: string
  title?: string
  /** Текст карточки — то, что сравнивается с `expected` зоны. */
  value: string
  /** Где карточка лежала сразу после отрисовки, в координатах доски. */
  homeX?: number
  homeY?: number
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

  // Тот же порядок, что и у снимков: сначала место, потом указатель, потом
  // данные — см. комментарий к saveLessonSnapshot.
  for (const id of evicted) {
    await miro.board.setAppData(LESSON_KEY_PREFIX + id, null)
  }
  await miro.board.setAppData(INDEX_KEY, plain(kept) as unknown as MetadataValue)
  await miro.board.setAppData(LESSON_KEY_PREFIX + data.frameId, plain(data) as unknown as MetadataValue)
}

export async function loadExercises(frameId: string): Promise<LessonExercises | null> {
  const raw = await miro.board.getAppData(LESSON_KEY_PREFIX + frameId)
  const entry = asLesson(raw)
  if (entry) return entry

  // Уроки, сохранённые до перехода на поключевое хранение.
  const legacy = (await readLegacy()).find((item) => item.frameId === frameId)
  if (legacy) return legacy

  // Указателя нет. Это не приговор: урок сам себя описывает метками на зонах
  // и карточках, и по ним задания восстановимы. Сюда попадают уроки, которым
  // не хватило места в памяти доски, — без этого пути у них не работали бы
  // ни проверка, ни раскладывание карточек обратно.
  return readExercisesFromBoard(frameId)
}

/**
 * Собрать задания урока с самой доски, по меткам на объектах.
 *
 * Медленнее указателя — приходится читать метку у каждого ребёнка фрейма, —
 * поэтому это запасной путь, а не основной. Зато он не зависит от памяти
 * доски и работает, пока урок на ней есть.
 */
export async function readExercisesFromBoard(frameId: string): Promise<LessonExercises | null> {
  let children: BaseItem[]
  try {
    const frame = await miro.board.getById(frameId)
    if (!frame || frame.type !== 'frame') return null
    children = (await (frame as unknown as { getChildren(): Promise<BaseItem[]> }).getChildren()) ?? []
  } catch {
    return null
  }

  const byRef = new Map<string, ExerciseRecord>()
  const take = (ref: string, title?: string): ExerciseRecord => {
    const found = byRef.get(ref)
    if (found) {
      if (title && !found.title) found.title = title
      return found
    }
    const fresh: ExerciseRecord = { ref, title: title ?? ref, zones: [], chips: [] }
    byRef.set(ref, fresh)
    return fresh
  }

  for (const child of children) {
    let meta: unknown
    try {
      meta = await child.getMetadata(METADATA_KEY)
    } catch {
      continue
    }
    if (!meta || typeof meta !== 'object') continue

    const tag = meta as {
      role?: unknown
      exercise?: unknown
      title?: unknown
      expected?: unknown
      value?: unknown
      homeX?: unknown
      homeY?: unknown
    }
    if (typeof tag.exercise !== 'string') continue

    if (tag.role === 'zone' && typeof tag.expected === 'string') {
      take(tag.exercise, typeof tag.title === 'string' ? tag.title : undefined).zones.push({
        id: child.id,
        expected: tag.expected,
      })
    } else if (tag.role === 'chip' && typeof tag.value === 'string') {
      take(tag.exercise, typeof tag.title === 'string' ? tag.title : undefined).chips.push({
        id: child.id,
        value: tag.value,
        // Уроки, нарисованные до того, как метка стала помнить место карточки,
        // проверятся, но разложить их обратно не выйдет — вернуть некуда.
        homeX: typeof tag.homeX === 'number' ? tag.homeX : 0,
        homeY: typeof tag.homeY === 'number' ? tag.homeY : 0,
      })
    }
  }

  const exercises = [...byRef.values()].filter((item) => item.zones.length > 0)
  if (exercises.length === 0) return null

  return { frameId, topic: '', exercises }
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
  /**
   * Объекты этой секции.
   *
   * Нужны, чтобы файл повторял доску, а не только её содержание: репетитор
   * перекрашивает карточки под тему урока, и в экспорте они должны быть
   * такими же. По этим идентификаторам экспорт читает фактические цвета
   * прямо перед сохранением.
   */
  ids?: string[]
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
  /**
   * Идентификаторы объектов, которые нарисовал конструктор.
   *
   * Нужны, чтобы отличить своё от чужого. Всё, что лежит во фрейме урока и не
   * перечислено здесь, принёс человек: подпись красивым шрифтом, наклейка,
   * стикер ученика. Раньше такое опознавалось по времени создания, но время
   * не отвечает на вопрос «чей объект» — только «когда появился».
   */
  itemIds?: string[]
}

/**
 * Порядок записи важнее, чем кажется.
 *
 * Сначала освобождаем место, потом обновляем указатель и только в конце пишем
 * сам урок. При обратном порядке хранилище загоняло себя в тупик: запись урока
 * упиралась в нехватку места и падала ДО очистки, а значит освободить место
 * было уже нечем — и каждый следующий урок оставался без страховки. Лишний
 * идентификатор в указателе безвреден: чтение молча пропускает ключи, по
 * которым ничего не лежит.
 */
export async function saveLessonSnapshot(snapshot: LessonSnapshot): Promise<void> {
  const index = await readSnapshotIndex()
  const updated = [...index.filter((id) => id !== snapshot.frameId), snapshot.frameId]
  const evicted = updated.slice(0, Math.max(0, updated.length - HISTORY_LIMIT))
  const kept = updated.slice(-HISTORY_LIMIT)

  const memory = store()
  for (const id of evicted) {
    await memory.write(SNAPSHOT_KEY_PREFIX + id, null)
  }
  await memory.write(SNAPSHOT_INDEX_KEY, plain(kept))
  await memory.write(SNAPSHOT_KEY_PREFIX + snapshot.frameId, plain(snapshot))
}

export async function loadLessonSnapshot(frameId: string): Promise<LessonSnapshot | null> {
  return asSnapshot(await store().read(SNAPSHOT_KEY_PREFIX + frameId))
}

/**
 * Уроки, которые доска помнит целиком. Свежие — первыми: в панели это список
 * выбора, и обычно нужен последний урок, а не первый за учебный год.
 *
 * Читаем всё хранилище одним запросом, а не по ключу на урок. Двадцать
 * последовательных обращений к доске — это заметная пауза при каждом открытии
 * панели, и чем дольше живёт доска, тем она длиннее.
 */
export async function listLessonSnapshots(): Promise<LessonSnapshot[]> {
  const all = await store().readAll()
  const index = asIndex(all[SNAPSHOT_INDEX_KEY])

  const entries: LessonSnapshot[] = []
  for (const frameId of index) {
    const entry = asSnapshot(all[SNAPSHOT_KEY_PREFIX + frameId])
    if (entry) entries.push(entry)
  }
  return entries.reverse()
}

/**
 * Перенос всех уроков доски одним файлом.
 *
 * Снимки живут в памяти доски, и это удобно ровно до того дня, когда доска
 * станет недоступна: уроки уйдут вместе с ней, а HTML-копии — это готовые
 * страницы, из них урок заново не соберёшь и на другую доску не перенесёшь.
 * Поэтому исходники должны уметь выходить наружу и возвращаться обратно.
 */
export interface LessonArchive {
  kind: 'lesson-builder-archive'
  version: 1
  savedAt: string
  lessons: LessonSnapshot[]
}

export async function exportArchive(): Promise<LessonArchive> {
  return {
    kind: 'lesson-builder-archive',
    version: 1,
    savedAt: new Date().toISOString(),
    lessons: await listLessonSnapshots(),
  }
}

/**
 * Возвращает уроки из файла в память доски.
 *
 * Идентификаторы фреймов из чужой доски здесь бессмысленны — тех фреймов тут
 * нет. Но снимок нужен не ради фрейма, а ради самого урока: панель покажет
 * его в списке, а нарисовать заново можно в любой момент, поэтому записи
 * кладём как есть и лишь помечаем, что они пришли извне.
 */
export async function importArchive(archive: LessonArchive): Promise<number> {
  if (archive?.kind !== 'lesson-builder-archive' || !Array.isArray(archive.lessons)) {
    throw new Error('Это не файл с уроками конструктора.')
  }

  let restored = 0
  for (const lesson of archive.lessons) {
    if (!lesson?.lesson?.blocks) continue
    await saveLessonSnapshot({ ...lesson, anchors: lesson.anchors ?? [] })
    restored += 1
  }
  return restored
}

async function readSnapshotIndex(): Promise<string[]> {
  return asIndex(await store().read(SNAPSHOT_INDEX_KEY))
}

function asIndex(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

function asSnapshot(raw: unknown): LessonSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = raw as LessonSnapshot
  if (typeof entry.frameId !== 'string' || !entry.lesson || !Array.isArray(entry.lesson.blocks)) return null
  return { ...entry, anchors: Array.isArray(entry.anchors) ? entry.anchors : [] }
}
