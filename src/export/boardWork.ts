import type { Frame } from '@mirohq/websdk-types'
import { absoluteCenter, loadParents, type Positioned } from '../render/geometry'
import { loadExercises, type ZoneRecord } from '../render/metadata'

/**
 * Работа ученика на доске.
 *
 * Урок на память — это не тот урок, который вы нарисовали, а тот, который
 * ученик прошёл: с его ответами в клетках и его заметками на полях. Из доски
 * это достаётся двумя способами. Карточки помечены при отрисовке, поэтому про
 * каждую известно, в какой зоне она лежит и та ли это зона. Всё остальное —
 * стикеры и подписи, которых при отрисовке не было, — узнаётся по времени
 * создания: старше урока значит наше, моложе значит ученика.
 *
 * Чего здесь принципиально нет: линий, нарисованных пером. Miro отдаёт их
 * панели как объект без содержимого, и восстановить росчерк неоткуда —
 * их придётся сохранять картинкой средствами самой доски.
 */

export interface StudentAnswer {
  /** Задание, к которому относится ответ. */
  exercise: string
  /** Что ждали в этой зоне. */
  expected: string
  /** Что ученик в неё положил; пусто — зона осталась незаполненной. */
  given: string
  correct: boolean
}

export interface StudentNote {
  text: string
  /** Вертикаль на доске — по ней заметка встаёт рядом со своей секцией. */
  y: number
}

export interface BoardWork {
  answers: StudentAnswer[]
  notes: StudentNote[]
  /** Сколько объектов ученик нарисовал пером: их содержимое доска не отдаёт. */
  drawings: number
}

interface Timed extends Positioned {
  createdAt?: string
  content?: string
  title?: string
}

export async function collectBoardWork(frameId: string, drawnAt: string): Promise<BoardWork> {
  const [frame] = (await miro.board.get({ id: [frameId] })) as Frame[]
  if (!frame) return { answers: [], notes: [], drawings: 0 }

  const [answers, extras] = await Promise.all([collectAnswers(frameId), collectExtras(frame, drawnAt)])
  return { answers, ...extras }
}

/** Что и куда ученик разложил в интерактивных заданиях. */
async function collectAnswers(frameId: string): Promise<StudentAnswer[]> {
  const data = await loadExercises(frameId)
  if (!data || data.exercises.length === 0) return []

  const ids = data.exercises.flatMap((exercise) => [
    ...exercise.zones.map((zone) => zone.id),
    ...exercise.chips.map((chip) => chip.id),
  ])
  if (ids.length === 0) return []

  const items = (await miro.board.get({ id: ids })) as unknown as Positioned[]
  const byId = new Map(items.map((item) => [item.id, item]))
  const parents = await loadParents(items)

  const answers: StudentAnswer[] = []

  for (const exercise of data.exercises) {
    const zones = exercise.zones
      .map((record) => ({ record, item: byId.get(record.id) }))
      .filter((entry): entry is { record: ZoneRecord; item: Positioned } => Boolean(entry.item))

    // Зона помнит, что в неё положили: в сортировке это несколько карточек,
    // в остальных заданиях одна.
    const inZone = new Map<string, string[]>()

    for (const record of exercise.chips) {
      const chip = byId.get(record.id)
      if (!chip) continue

      const host = hostZone(chip, zones, parents)
      if (!host) continue
      inZone.set(host.record.id, [...(inZone.get(host.record.id) ?? []), record.value])
    }

    for (const zone of zones) {
      const given = inZone.get(zone.record.id) ?? []
      answers.push({
        exercise: exercise.ref,
        expected: zone.record.expected,
        given: given.join(', '),
        correct: given.length > 0 && given.every((value) => same(value, zone.record.expected)),
      })
    }
  }

  return answers
}

/** Стикеры и подписи, появившиеся на уроке уже после его отрисовки. */
async function collectExtras(
  frame: Frame,
  drawnAt: string,
): Promise<{ notes: StudentNote[]; drawings: number }> {
  const born = Date.parse(drawnAt)
  const children = (await frame.getChildren()) as unknown as Timed[]
  const parents = new Map<string, Positioned>([[frame.id, frame as unknown as Positioned]])

  const notes: StudentNote[] = []
  let drawings = 0

  for (const child of children) {
    // Рисунки пером приходят типом, который SDK не разбирает: посчитать их
    // можно, прочитать — нет.
    if (child.type !== 'sticky_note' && child.type !== 'text' && child.type !== 'shape') {
      if (child.type !== 'image' && child.type !== 'frame') drawings += 1
      continue
    }

    const createdAt = child.createdAt ? Date.parse(child.createdAt) : Number.NaN
    // Секунда запаса: объекты урока создаются пачкой, и часть из них
    // получает отметку времени чуть позже записи снимка.
    if (!Number.isFinite(createdAt) || createdAt <= born + 1000) continue

    const text = stripTags(child.content ?? '')
    if (!text) continue

    notes.push({ text, y: absoluteCenter(child, parents).y })
  }

  notes.sort((a, b) => a.y - b.y)
  return { notes, drawings }
}

function hostZone(
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

function same(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
}

/** Содержимое объектов Miro — размеченный текст; в файл идёт чистый. */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
