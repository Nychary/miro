import type { Frame, Shape } from '@mirohq/websdk-types'
import { loadExercises, type ZoneRecord } from '../render/metadata'
import { color } from '../render/theme'

/**
 * Проверка интерактивных заданий урока.
 *
 * Считаем не «что лежит в зоне», а «в той ли зоне лежит карточка». Это
 * единственная формулировка, которая одинаково работает для всех трёх типов
 * заданий: в сопоставлении и пропусках в зону кладут одну карточку, а в
 * сортировке — сколько угодно. Заодно это делает безболезненными повторы:
 * если одно и то же слово нужно в двух пропусках, обе карточки засчитаются.
 */

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

export async function checkLesson(frame: Frame): Promise<CheckResult> {
  const data = await loadExercises(frame)
  if (!data || data.exercises.length === 0) {
    throw new Error('В этом уроке нет заданий с проверкой.')
  }

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
  const highlights: { zone: Positioned; state: 'correct' | 'wrong' | 'empty' }[] = []

  for (const exercise of data.exercises) {
    const zones = exercise.zones
      .map((record) => ({ record, item: byId.get(record.id) }))
      .filter((entry): entry is { record: ZoneRecord; item: Positioned } => Boolean(entry.item))

    const zoneVerdicts = new Map<string, 'correct' | 'wrong' | 'empty'>(
      zones.map((zone) => [zone.record.id, 'empty' as const]),
    )

    let correct = 0
    let wrong = 0
    let untouched = 0

    for (const record of exercise.chips) {
      const chip = byId.get(record.id)
      if (!chip) continue

      const host = findHostZone(chip, zones, parentById)
      if (!host) {
        untouched += 1
        continue
      }

      const isCorrect = normalize(host.record.expected) === normalize(record.value)
      if (isCorrect) correct += 1
      else wrong += 1

      // Одна неверная карточка красит зону целиком: в сортировке зона общая,
      // и «частично верно» ученику ничего не говорит.
      const current = zoneVerdicts.get(host.record.id)
      if (current !== 'wrong') zoneVerdicts.set(host.record.id, isCorrect ? 'correct' : 'wrong')
    }

    for (const zone of zones) {
      highlights.push({ zone: zone.item, state: zoneVerdicts.get(zone.record.id) ?? 'empty' })
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

  await paint(highlights, byId)

  return {
    topic: data.topic,
    exercises: results,
    correct: results.reduce((sum, result) => sum + result.correct, 0),
    total: results.reduce((sum, result) => sum + result.total, 0),
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

const PALETTE = {
  correct: { fillColor: color.correctFill, borderColor: color.correctBorder, borderStyle: 'normal' },
  wrong: { fillColor: color.wrongFill, borderColor: color.wrongBorder, borderStyle: 'normal' },
  empty: { fillColor: color.dropZoneFill, borderColor: color.dropZoneBorder, borderStyle: 'dashed' },
} as const

/** Красит зоны по итогам проверки. Пустые возвращаются к исходному виду. */
async function paint(
  highlights: { zone: Positioned; state: keyof typeof PALETTE }[],
  byId: Map<string, Positioned>,
): Promise<void> {
  const BATCH = 10

  for (let index = 0; index < highlights.length; index += BATCH) {
    await Promise.all(
      highlights.slice(index, index + BATCH).map(async ({ zone, state }) => {
        const item = byId.get(zone.id) as unknown as Shape | undefined
        if (!item || item.type !== 'shape') return

        const palette = PALETTE[state]
        item.style.fillColor = palette.fillColor
        item.style.borderColor = palette.borderColor
        item.style.borderStyle = palette.borderStyle
        item.style.borderWidth = state === 'empty' ? 2 : 4
        await item.sync()
      }),
    )
  }
}
