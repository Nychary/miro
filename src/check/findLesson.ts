import type { Frame } from '@mirohq/websdk-types'
import { listExercises } from '../render/metadata'

/**
 * Выбор урока для проверки.
 *
 * Когда урок на доске один — выбора нет. Когда их несколько, угадывание
 * «какой из них имеет в виду репетитор» ненадёжно: эвристика по центру
 * экрана промахивалась на соседний урок. Поэтому список отдаётся панели,
 * а та показывает выпадающий выбор; автоматика осталась только как
 * значение по умолчанию — «урок, который занимает больше всего экрана».
 */

export interface CheckableLesson {
  frame: Frame
  topic: string
}

/** Все уроки доски, у которых есть задания с проверкой. Свежие — в конце. */
export async function listCheckableLessons(): Promise<CheckableLesson[]> {
  const stored = await listExercises()
  if (stored.length === 0) return []

  // Уроки могли удалить с доски, а запись о них осталась — берём только те
  // фреймы, которые Miro действительно вернула.
  const frames = (await miro.board.get({ id: stored.map((entry) => entry.frameId) })) as Frame[]
  const byId = new Map(frames.map((frame) => [frame.id, frame]))

  return stored.flatMap((entry) => {
    const frame = byId.get(entry.frameId)
    return frame ? [{ frame, topic: entry.topic || 'Урок без названия' }] : []
  })
}

/**
 * Автовыбор: урок, который занимает наибольшую площадь текущего экрана.
 * Прежняя проверка «центр экрана внутри фрейма» промахивалась, когда центр
 * попадал в зазор между уроками. Если экран не пересекается ни с одним —
 * берём самый свежий.
 */
export async function pickLessonOnScreen(lessons: CheckableLesson[]): Promise<CheckableLesson | null> {
  if (lessons.length === 0) return null
  const first = lessons[0]
  if (lessons.length === 1) return first ?? null

  const viewport = await miro.board.viewport.get()

  let best: CheckableLesson | null = null
  let bestArea = 0

  for (const lesson of lessons) {
    const { frame } = lesson
    const overlapX =
      Math.min(viewport.x + viewport.width, frame.x + frame.width / 2) -
      Math.max(viewport.x, frame.x - frame.width / 2)
    const overlapY =
      Math.min(viewport.y + viewport.height, frame.y + frame.height / 2) -
      Math.max(viewport.y, frame.y - frame.height / 2)

    const area = Math.max(0, overlapX) * Math.max(0, overlapY)
    if (area > bestArea) {
      bestArea = area
      best = lesson
    }
  }

  return best ?? lessons.at(-1) ?? null
}
