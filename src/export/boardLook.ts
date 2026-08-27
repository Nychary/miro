import type { Frame } from '@mirohq/websdk-types'
import type { BlockAnchor } from '../render/metadata'

/**
 * Как урок выглядит на доске сейчас.
 *
 * Конструктор рисует урок в своей палитре, но дальше его перекрашивает
 * человек: тёмный фрейм под ночную тему, розовые карточки под «Барби»,
 * приглушённый фон под фотографию. В файл это не попадало — он выходил в
 * заводских цветах и на доску был непохож. Здесь мы читаем фактические цвета
 * прямо перед сохранением: не догадываясь по стилю урока, а спрашивая доску.
 */

export interface BoardLook {
  /** Фон фрейма — он же фон страницы в файле. */
  page?: string
  /** Заливка карточек: берём преобладающую по всему уроку. */
  card?: string
  /** Цвет рамок карточек. */
  border?: string
  /** Цвет текста, если репетитор сделал урок тёмным. */
  ink?: string
}

interface Styled {
  id: string
  type: string
  style?: { fillColor?: string; borderColor?: string; color?: string }
}

export async function readBoardLook(frame: Frame, anchors: BlockAnchor[]): Promise<BoardLook> {
  const look: BoardLook = {}

  const framePaint = (frame as unknown as Styled).style?.fillColor
  if (isColor(framePaint)) look.page = framePaint

  const ids = anchors.flatMap((anchor) => anchor.ids ?? [])
  if (ids.length === 0) return look

  // Читаем пачкой: сотня отдельных запросов к доске превратила бы сохранение
  // файла в минутное ожидание.
  const items = (await miro.board.get({ id: ids.slice(0, 400) })) as unknown as Styled[]

  const fills = new Map<string, number>()
  const borders = new Map<string, number>()
  const inks = new Map<string, number>()

  for (const item of items) {
    if (item.type === 'shape') {
      count(fills, item.style?.fillColor)
      count(borders, item.style?.borderColor)
    }
    if (item.type === 'text') count(inks, item.style?.color)
  }

  look.card = top(fills)
  look.border = top(borders)
  look.ink = top(inks)
  return look
}

/** Прозрачные заливки и пустые значения ничего не говорят о палитре. */
function count(tally: Map<string, number>, value?: string): void {
  if (!isColor(value)) return
  tally.set(value, (tally.get(value) ?? 0) + 1)
}

function top(tally: Map<string, number>): string | undefined {
  let best: string | undefined
  let bestCount = 0
  for (const [value, times] of tally) {
    if (times > bestCount) {
      best = value
      bestCount = times
    }
  }
  return best
}

function isColor(value?: string): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)
}
