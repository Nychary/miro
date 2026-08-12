import type { Frame } from '@mirohq/websdk-types'
import { loadExercises } from '../render/metadata'

/**
 * Поиск урока, который надо проверить.
 *
 * На доске ученика уроков со временем накапливается много, и спрашивать
 * каждый раз «какой именно» — лишний вопрос: во время занятия репетитор
 * смотрит ровно на то задание, которое проверяет. Поэтому берём урок,
 * попавший в центр экрана, и только если не угадали — самый свежий.
 */
export async function findLessonToCheck(): Promise<Frame | null> {
  const frames = (await miro.board.get({ type: 'frame' })) as Frame[]
  if (frames.length === 0) return null

  const checkable: Frame[] = []
  for (const frame of frames) {
    if (await loadExercises(frame)) checkable.push(frame)
  }
  if (checkable.length === 0) return null
  if (checkable.length === 1) return checkable[0] ?? null

  const viewport = await miro.board.viewport.get()
  const centerX = viewport.x + viewport.width / 2
  const centerY = viewport.y + viewport.height / 2

  const onScreen = checkable.find(
    (frame) =>
      Math.abs(centerX - frame.x) <= frame.width / 2 && Math.abs(centerY - frame.y) <= frame.height / 2,
  )

  return onScreen ?? checkable[checkable.length - 1] ?? null
}
