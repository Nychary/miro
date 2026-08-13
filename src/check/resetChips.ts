import type { Frame, Shape, StickyNote } from '@mirohq/websdk-types'
import { loadExercises, type ChipRecord } from '../render/metadata'
import { applyStyle, color } from '../render/theme'

/**
 * Возвращает карточки на исходные места и снимает подсветку проверки.
 *
 * Без этого урок одноразовый: после первого ученика задание уже решено,
 * зоны раскрашены, и повторить его не с чем. Заодно это лекарство от
 * случайного разгрома — запереть объекты программно Miro не позволяет.
 */
export async function resetChips(frame: Frame): Promise<number> {
  const data = await loadExercises(frame.id)
  if (!data) throw new Error('В этом уроке нет заданий с проверкой.')

  // Зоны возвращаются к виду «до проверки» в палитре своего урока.
  applyStyle(data.style)

  const chips = data.exercises.flatMap((exercise) => exercise.chips)
  const zoneIds = data.exercises.flatMap((exercise) => exercise.zones.map((zone) => zone.id))

  const items = await miro.board.get({ id: [...chips.map((chip) => chip.id), ...zoneIds] })
  const byId = new Map(items.map((item) => [item.id, item]))

  let moved = 0
  const BATCH = 10

  for (let index = 0; index < chips.length; index += BATCH) {
    const results = await Promise.all(
      chips.slice(index, index + BATCH).map((record) => restore(record, byId.get(record.id), frame)),
    )
    moved += results.filter(Boolean).length
  }

  await clearHighlights(zoneIds.map((id) => byId.get(id)))
  return moved
}

// ---------------------------------------------------------------------------

async function restore(
  record: ChipRecord,
  item: ReturnType<Map<string, unknown>['get']>,
  frame: Frame,
): Promise<boolean> {
  const chip = item as StickyNote | undefined
  if (!chip || chip.type !== 'sticky_note') return false

  const target = toItemSpace({ x: record.homeX, y: record.homeY }, chip, frame)
  chip.x = target.x
  chip.y = target.y
  await chip.sync()

  // Карточку могли вытащить за пределы фрейма — тогда она перестала быть его
  // ребёнком, и вернуть надо не только координаты, но и принадлежность уроку.
  if (chip.parentId !== frame.id) {
    await frame.add(chip)
  }

  return true
}

/**
 * Переводит точку из координат доски в ту систему, в которой объект живёт
 * сейчас: у ребёнка фрейма отсчёт идёт от фрейма, у вытащенного наружу —
 * от доски.
 */
function toItemSpace(
  point: { x: number; y: number },
  item: { parentId: string | null; relativeTo: string },
  frame: Frame,
): { x: number; y: number } {
  if (item.parentId !== frame.id) return point

  if (item.relativeTo === 'parent_top_left') {
    return { x: point.x - (frame.x - frame.width / 2), y: point.y - (frame.y - frame.height / 2) }
  }
  if (item.relativeTo === 'parent_center') {
    return { x: point.x - frame.x, y: point.y - frame.y }
  }
  return point
}

async function clearHighlights(zones: (unknown | undefined)[]): Promise<void> {
  const shapes = zones.filter((zone): zone is Shape => {
    const shape = zone as Shape | undefined
    return Boolean(shape) && shape?.type === 'shape'
  })

  const BATCH = 10
  for (let index = 0; index < shapes.length; index += BATCH) {
    await Promise.all(
      shapes.slice(index, index + BATCH).map(async (zone) => {
        zone.style.fillColor = color.dropZoneFill
        zone.style.borderColor = color.dropZoneBorder
        zone.style.borderStyle = 'dashed'
        zone.style.borderWidth = 2
        await zone.sync()
      }),
    )
  }
}
