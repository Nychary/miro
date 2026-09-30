import { Canvas, bold } from './canvas'
import { color, font, gap, size } from './theme'

/** Приёмы компоновки, общие для всех блоков урока. */

/** Разделитель, заголовок секции и отступ под ним. */
export async function section(canvas: Canvas, title: string): Promise<void> {
  canvas.advance(gap.lg)
  await canvas.divider(size.dividerHeight)
  canvas.advance(gap.md)
  await canvas.text(bold(title), { size: font.sectionTitle, gapAfter: gap.md })
}

export interface CardStyle {
  fillColor: string
  borderColor?: string
}

/**
 * Содержимое на цветной подложке. Подложка рисуется после содержимого —
 * только так известна её высота, — и уводится назад, чтобы не перекрыть текст.
 */
export async function card(
  canvas: Canvas,
  style: CardStyle,
  draw: (inner: { left: number; width: number }) => Promise<void>,
  options: { padding?: number; gapAfter?: number } = {},
): Promise<void> {
  const padding = options.padding ?? 28
  const top = canvas.top

  canvas.advance(padding)
  await draw({ left: canvas.left + padding, width: canvas.width - padding * 2 })
  canvas.advance(padding)

  const bottom = canvas.top
  await canvas.backdrop({ left: canvas.left, top, width: canvas.width, height: bottom - top }, style)
  canvas.top = bottom + (options.gapAfter ?? gap.sm)
}

/**
 * Сетка одинаковых по ширине ячеек. Высота строки — максимум по её ячейкам,
 * поэтому ячейки одной строки рисуются параллельно, а строки — последовательно.
 *
 * `draw` возвращает фактическую высоту ячейки.
 */
export async function grid(
  canvas: Canvas,
  count: number,
  options: { columns: number; cellWidth: number; gapX?: number; gapY?: number },
  draw: (index: number, left: number, top: number) => Promise<number>,
): Promise<void> {
  if (count === 0) return

  const gapX = options.gapX ?? gap.sm
  const gapY = options.gapY ?? gap.sm

  for (let start = 0; start < count; start += options.columns) {
    const rowTop = canvas.top
    const rowSize = Math.min(options.columns, count - start)

    const heights = await Promise.all(
      Array.from({ length: rowSize }, (_, offset) => {
        const left = canvas.left + offset * (options.cellWidth + gapX)
        return draw(start + offset, left, rowTop)
      }),
    )

    canvas.top = rowTop + Math.max(...heights) + gapY
  }

  // Последняя строка не должна тянуть за собой лишний отступ.
  canvas.advance(-gapY)
}

/**
 * Колонки равной ширины, каждая со своим курсором.
 * Курсор родителя опускается под самую длинную колонку.
 */
export async function columns(
  canvas: Canvas,
  count: number,
  options: { gapX?: number },
  draw: (index: number, column: Canvas) => Promise<void>,
): Promise<void> {
  if (count === 0) return

  const gapX = options.gapX ?? gap.sm
  const columnWidth = (canvas.width - gapX * (count - 1)) / count
  const top = canvas.top

  const cells = Array.from({ length: count }, (_, index) =>
    canvas.sub({
      left: canvas.left + index * (columnWidth + gapX),
      top,
      width: columnWidth,
    }),
  )

  await Promise.all(cells.map((cell, index) => draw(index, cell)))
  for (const cell of cells) canvas.absorb(cell, true)
}

/**
 * Строки из `perRow` колонок. Ширина колонок одинакова во всех строках,
 * включая последнюю неполную, — иначе одинокая карточка внизу растянулась бы
 * на всю ширину и выбилась бы из ритма сетки.
 */
export async function rows(
  canvas: Canvas,
  count: number,
  perRow: number,
  draw: (index: number, column: Canvas) => Promise<void>,
  options: { gapX?: number; gapY?: number } = {},
): Promise<void> {
  for (let start = 0; start < count; start += perRow) {
    await columns(canvas, perRow, { gapX: options.gapX }, async (offset, column) => {
      const index = start + offset
      if (index < count) await draw(index, column)
    })
    if (start + perRow < count) canvas.advance(options.gapY ?? gap.sm)
  }
}

/** Ширина ячейки, чтобы `columns` штук ровно заполнили колонку урока. */
export function cellWidth(canvas: Canvas, columnCount: number, gapX = gap.sm): number {
  return (canvas.width - gapX * (columnCount - 1)) / columnCount
}

/** Перемешивание — чтобы карточки в интерактивных заданиях не лежали по порядку. */
export function shuffle<T>(input: readonly T[]): T[] {
  const result = [...input]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = result[i] as T
    const b = result[j] as T
    result[i] = b
    result[j] = a
  }
  return result
}

/** Пустая зона с пунктирной рамкой, куда ученик кладёт карточку. */
export async function dropZone(
  canvas: Canvas,
  options: { left: number; top: number; width: number; height: number; label?: string },
): Promise<import('@mirohq/websdk-types').Shape> {
  return canvas.shape({
    left: options.left,
    top: options.top,
    width: options.width,
    height: options.height,
    shape: 'round_rectangle',
    content: options.label ? `<p>${options.label}</p>` : '',
    fillColor: color.dropZoneFill,
    borderColor: color.dropZoneBorder,
    borderWidth: 2,
    borderStyle: 'dashed',
    fontSize: font.small,
    textColor: color.muted,
    flow: false,
  })
}
