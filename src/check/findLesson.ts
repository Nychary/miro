import type { Frame } from '@mirohq/websdk-types'
import { listExercises } from '../render/metadata'

/**
 * Поиск урока, который надо проверить.
 *
 * На доске ученика уроков со временем накапливается много, и спрашивать
 * каждый раз «какой именно» — лишний вопрос: во время занятия репетитор
 * смотрит ровно на то задание, которое проверяет. Поэтому берём урок,
 * попавший в центр экрана, и только если не угадали — самый свежий.
 */
export async function findLessonToCheck(): Promise<Frame | null> {
  const stored = await listExercises()
  if (stored.length === 0) return null

  // Уроки могли удалить с доски, а запись о них осталась — берём только те
  // фреймы, которые Miro действительно вернула.
  const frames = (await miro.board.get({ id: stored.map((entry) => entry.frameId) })) as Frame[]
  if (frames.length === 0) return null

  if (frames.length === 1) return frames[0] ?? null

  const viewport = await miro.board.viewport.get()
  const centerX = viewport.x + viewport.width / 2
  const centerY = viewport.y + viewport.height / 2

  const onScreen = frames.find(
    (frame) =>
      Math.abs(centerX - frame.x) <= frame.width / 2 && Math.abs(centerY - frame.y) <= frame.height / 2,
  )
  if (onScreen) return onScreen

  // Порядок в хранилище — от старых к свежим; сохраняем его и здесь.
  const order = new Map(stored.map((entry, index) => [entry.frameId, index]))
  return [...frames].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).at(-1) ?? null
}
