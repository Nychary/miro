import type { Frame, Shape } from '@mirohq/websdk-types'
import { loadExercises, type LessonExercises, type ZoneRecord } from '../render/metadata'
import { applyStyle, color } from '../render/theme'

/**
 * Проверка интерактивных заданий урока.
 *
 * Считаем не «что лежит в зоне», а «в той ли зоне лежит карточка». Это
 * единственная формулировка, которая одинаково работает для всех трёх типов
 * заданий: в сопоставлении и пропусках в зону кладут одну карточку, а в
 * сортировке — сколько угодно. Заодно это делает безболезненными повторы:
 * если одно и то же слово нужно в двух пропусках, обе карточки засчитаются.
 *
 * Оценка отделена от подсветки намеренно. В живом режиме проверка идёт по
 * несколько раз в секунду, и перекрашивать все зоны каждый раз — значит
 * гонять десятки записей на доску впустую; красим только то, что изменилось.
 */

export type ZoneState = 'correct' | 'wrong' | 'empty'

export interface ExerciseResult {
  ref: string
  title: string
  correct: number
  wrong: number
  /** Карточки, которые ученик так и не положил ни в одну зону. */
  untouched: number
  total: number
}

export interface CheckResult {
  topic: string
  exercises: ExerciseResult[]
  correct: number
  total: number
}

export interface Evaluation {
  result: CheckResult
  zoneStates: Map<string, ZoneState>
  zones: Map<string, Shape>
}

/** Минимум, который нужен от объекта для геометрии. */
interface Positioned {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  parentId: string | null
  relativeTo: string
}

/** Разовая проверка: оценить и покрасить всё. */
export async function checkLesson(frame: Frame): Promise<CheckResult> {
  const evaluation = await evaluateLesson(frame)
  await paintZones(evaluation)
  return evaluation.result
}

export async function evaluateLesson(frame: Frame, cached?: LessonExercises): Promise<Evaluation> {
  const data = cached ?? (await loadExercises(frame.id))
  if (!data || data.exercises.length === 0) {
    throw new Error('В этом уроке нет заданий с проверкой.')
  }

  // Подсветка обязана попадать в палитру урока: без этого проверка урока
  // в «Космосе» красила бы зоны цветами стандартной светлой темы.
  applyStyle(data.style)

  const ids = data.exercises.flatMap((exercise) => [
    ...exercise.zones.map((zone) => zone.id),
    ...exercise.chips.map((chip) => chip.id),
  ])

  // Один запрос по списку идентификаторов вместо перебора всех объектов урока.
  const items = (await miro.board.get({ id: ids })) as unknown as Positioned[]
  const byId = new Map(items.map((item) => [item.id, item]))

  // Координаты детей фрейма считаются от него, а карточку могли вытащить
  // наружу — поэтому всё приводим к координатам доски, а для этого нужны
  // сами фреймы.
  const parentIds = [...new Set(items.map((item) => item.parentId).filter((id): id is string => Boolean(id)))]
  const parents = parentIds.length > 0 ? ((await miro.board.get({ id: parentIds })) as unknown as Positioned[]) : []
  const parentById = new Map(parents.map((parent) => [parent.id, parent]))

  const results: ExerciseResult[] = []
  const zoneStates = new Map<string, ZoneState>()
  const zones = new Map<string, Shape>()

  for (const exercise of data.exercises) {
    const zoneEntries = exercise.zones
      .map((record) => ({ record, item: byId.get(record.id) }))
      .filter((entry): entry is { record: ZoneRecord; item: Positioned } => Boolean(entry.item))

    for (const entry of zoneEntries) {
      zoneStates.set(entry.record.id, 'empty')
      if (entry.item.type === 'shape') zones.set(entry.record.id, entry.item as unknown as Shape)
    }

    let correct = 0
    let wrong = 0
    let untouched = 0

    for (const record of exercise.chips) {
      const chip = byId.get(record.id)
      if (!chip) continue

      const host = findHostZone(chip, zoneEntries, parentById)
      if (!host) {
        untouched += 1
        continue
      }

      const isCorrect = normalize(host.record.expected) === normalize(record.value)
      if (isCorrect) correct += 1
      else wrong += 1

      // Одна неверная карточка красит зону целиком: в сортировке зона общая,
      // и «частично верно» ученику ничего не говорит.
      if (zoneStates.get(host.record.id) !== 'wrong') {
        zoneStates.set(host.record.id, isCorrect ? 'correct' : 'wrong')
      }
    }

    results.push({
      ref: exercise.ref,
      title: exercise.title,
      correct,
      wrong,
      untouched,
      total: exercise.chips.length,
    })
  }

  return {
    result: {
      topic: data.topic,
      exercises: results,
      correct: results.reduce((sum, item) => sum + item.correct, 0),
      total: results.reduce((sum, item) => sum + item.total, 0),
    },
    zoneStates,
    zones,
  }
}

/** Красит зоны. Если передано прошлое состояние — только изменившиеся. */
export async function paintZones(
  evaluation: Evaluation,
  previous?: Map<string, ZoneState>,
): Promise<void> {
  const pending = [...evaluation.zoneStates.entries()].filter(
    ([id, state]) => !previous || previous.get(id) !== state,
  )
  if (pending.length === 0) return

  const BATCH = 10
  for (let index = 0; index < pending.length; index += BATCH) {
    await Promise.all(
      pending.slice(index, index + BATCH).map(async ([id, state]) => {
        const zone = evaluation.zones.get(id)
        if (!zone) return

        const palette = paletteFor(state)
        zone.style.fillColor = palette.fillColor
        zone.style.borderColor = palette.borderColor
        zone.style.borderStyle = palette.borderStyle
        zone.style.borderWidth = state === 'empty' ? 2 : 4
        await zone.sync()
      }),
    )
  }
}

/**
 * Функция, а не константа: значения палитры читаются в момент покраски,
 * уже после applyStyle. Константа зафиксировала бы стандартные цвета
 * при загрузке модуля, и стилизованные уроки красились бы невпопад.
 */
function paletteFor(state: ZoneState): { fillColor: string; borderColor: string; borderStyle: 'normal' | 'dashed' } {
  switch (state) {
    case 'correct':
      return { fillColor: color.correctFill, borderColor: color.correctBorder, borderStyle: 'normal' }
    case 'wrong':
      return { fillColor: color.wrongFill, borderColor: color.wrongBorder, borderStyle: 'normal' }
    case 'empty':
      return { fillColor: color.dropZoneFill, borderColor: color.dropZoneBorder, borderStyle: 'dashed' }
  }
}

// ---------------------------------------------------------------------------

/** Зона, внутрь которой попадает центр карточки. Если их несколько — ближайшая. */
function findHostZone(
  chip: Positioned,
  zones: { record: ZoneRecord; item: Positioned }[],
  parents: Map<string, Positioned>,
): { record: ZoneRecord; item: Positioned } | null {
  const point = absoluteCenter(chip, parents)

  let best: { record: ZoneRecord; item: Positioned } | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const zone of zones) {
    const center = absoluteCenter(zone.item, parents)
    const dx = Math.abs(point.x - center.x)
    const dy = Math.abs(point.y - center.y)
    if (dx > zone.item.width / 2 || dy > zone.item.height / 2) continue

    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = zone
    }
  }

  return best
}

/**
 * Координаты объекта в системе доски.
 *
 * У ребёнка фрейма координаты отсчитываются от фрейма, а не от доски, поэтому
 * сравнивать напрямую положение карточки и зоны нельзя: карточку могли
 * вытащить за пределы фрейма, и тогда она уже в координатах доски.
 */
function absoluteCenter(item: Positioned, parents: Map<string, Positioned>): { x: number; y: number } {
  const parent = item.parentId ? parents.get(item.parentId) : undefined
  if (!parent) return { x: item.x, y: item.y }

  if (item.relativeTo === 'parent_top_left') {
    return { x: parent.x - parent.width / 2 + item.x, y: parent.y - parent.height / 2 + item.y }
  }
  if (item.relativeTo === 'parent_center') {
    return { x: parent.x + item.x, y: parent.y + item.y }
  }
  return { x: item.x, y: item.y }
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
}
