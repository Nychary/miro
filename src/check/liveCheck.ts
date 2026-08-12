import { evaluateLesson, paintZones, type CheckResult, type ZoneState } from './checkLesson'
import { findLessonToCheck } from './findLesson'
import { loadExercises, type LessonExercises } from '../render/metadata'

/**
 * Живая проверка: зона краснеет или зеленеет сразу, как только в неё легла
 * карточка, без всякой кнопки.
 *
 * Работает от двух источников, и оба нужны:
 *
 * — Событие `experimental:items:update` даёт мгновенную реакцию, но приходит
 *   от Miro как экспериментальное и, по всей видимости, только на действия
 *   в своей вкладке. Ученик обычно за своим компьютером.
 * — Поэтому под ним лежит тихий опрос раз в пару секунд. Он один запрос
 *   по списку идентификаторов, то есть дёшев, и ловит чужие перемещения.
 *
 * Перекрашиваются только зоны, у которых состояние изменилось: иначе каждый
 * тик слал бы на доску десятки бессмысленных записей.
 */

const POLL_INTERVAL_MS = 2000

/** Слияние частых событий: перетаскивание порождает их пачками. */
const DEBOUNCE_MS = 150

export interface LiveCheck {
  stop(): void
}

export interface LiveCheckOptions {
  onUpdate(result: CheckResult): void
  onError(message: string): void
}

export async function startLiveCheck(options: LiveCheckOptions): Promise<LiveCheck> {
  const frame = await findLessonToCheck()
  if (!frame) throw new Error('На доске нет уроков с интерактивными заданиями.')

  const data = await loadExercises(frame.id)
  if (!data) throw new Error('В этом уроке нет заданий с проверкой.')

  const chipIds = new Set(data.exercises.flatMap((exercise) => exercise.chips.map((chip) => chip.id)))

  let previous: Map<string, ZoneState> | undefined
  let running = true
  let inFlight = false
  let pending = false
  let debounce: number | undefined

  async function tick(): Promise<void> {
    if (!running) return
    // Опрос и событие легко накладываются друг на друга; второй проход
    // откладываем, чтобы не отправлять на доску конкурирующие записи.
    if (inFlight) {
      pending = true
      return
    }

    inFlight = true
    try {
      const evaluation = await evaluateLesson(frame!, data!)
      await paintZones(evaluation, previous)
      previous = evaluation.zoneStates
      options.onUpdate(evaluation.result)
    } catch (error) {
      options.onError(error instanceof Error ? error.message : 'Не удалось проверить задания')
    } finally {
      inFlight = false
      if (pending && running) {
        pending = false
        void tick()
      }
    }
  }

  function schedule(): void {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void tick(), DEBOUNCE_MS)
  }

  const onItemsUpdate = (event: { items: { id: string }[] }): void => {
    if (event.items.some((item) => chipIds.has(item.id))) schedule()
  }

  miro.board.ui.on('experimental:items:update', onItemsUpdate)
  const poll = window.setInterval(() => void tick(), POLL_INTERVAL_MS)

  await tick()

  return {
    stop() {
      running = false
      window.clearTimeout(debounce)
      window.clearInterval(poll)
      miro.board.ui.off('experimental:items:update', onItemsUpdate)
    },
  }
}

export type { LessonExercises }
