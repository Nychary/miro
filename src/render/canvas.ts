import type {
  Connector,
  FontFamily,
  Shape,
  StickyNote,
  StickyNoteColorType,
  StrokeStyle,
  Text,
} from '@mirohq/websdk-types'
import type { ExerciseRecord } from './metadata'
import { FONT_FAMILY, color, font } from './theme'

/**
 * Прослойка между рендерерами блоков и Web SDK.
 *
 * Miro позиционирует объекты по центру, а вёрстка удобнее в терминах
 * «левый верхний угол». Canvas переводит одно в другое, ведёт вертикальный
 * курсор и копит габариты, чтобы в конце обвести урок фреймом нужного размера.
 *
 * Высоту текста заранее посчитать нельзя — её решает сам Miro при переносе
 * строк. Поэтому текст сначала создаётся, потом у него читается фактическая
 * высота, и только после этого он ставится на место. Отсюда два обращения
 * к SDK на каждый текстовый элемент; лимиты Web SDK это выдерживают с запасом.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Всё, что Canvas умеет создавать. Конкретные классы, а не общий BaseItem:
 * методы работы со слоями и удалением принимают именно их, и без этого
 * каждый вызов пришлось бы сопровождать приведением типа.
 */
export type CanvasItem = Shape | Text | StickyNote

export interface TextOptions {
  /** Левый край. По умолчанию — левый край колонки. */
  left?: number
  /** Верхний край. По умолчанию — текущий курсор. */
  top?: number
  width?: number
  size?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  fontFamily?: FontFamily
  /** Сдвинуть курсор вниз после размещения. По умолчанию да. */
  flow?: boolean
  /** Дополнительный отступ под элементом, если он участвует в потоке. */
  gapAfter?: number
}

export interface ShapeOptions {
  left?: number
  top?: number
  width: number
  height: number
  content?: string
  shape?: 'rectangle' | 'round_rectangle' | 'circle'
  fillColor?: string
  borderColor?: string
  borderWidth?: number
  borderStyle?: StrokeStyle
  fontSize?: number
  fontFamily?: FontFamily
  textColor?: string
  align?: 'left' | 'center' | 'right'
  alignVertical?: 'top' | 'middle' | 'bottom'
  flow?: boolean
  gapAfter?: number
}

export interface StickyOptions {
  left?: number
  top?: number
  width: number
  content: string
  fillColor: StickyNoteColorType
  align?: 'left' | 'center' | 'right'
  alignVertical?: 'top' | 'middle' | 'bottom'
  shape?: 'square' | 'rectangle'
}

export class Canvas {
  /** Всё созданное — в порядке создания. Нужно, чтобы потом сложить во фрейм. */
  readonly items: CanvasItem[] = []

  /**
   * Подложки карточек — отдельно от остального.
   *
   * Подложка создаётся после своего содержимого, потому что до этого неизвестна
   * её высота, и потому оказывается поверх текста. Разложить слои один раз при
   * создании не выйдет: когда объекты складываются во фрейм, порядок слоёв
   * восстанавливается по порядку детей. Поэтому подложки приходится помнить и
   * опускать вниз уже после упаковки во фрейм.
   */
  readonly backdrops: Shape[] = []

  /**
   * Интерактивные задания, попавшие на холст: какие зоны и какие карточки
   * в них участвуют. Отсюда собирается указатель, который ложится в
   * метаданные фрейма урока и позволяет проверке не опрашивать всё подряд.
   */
  readonly exercises: ExerciseRecord[] = []

  /**
   * Соединительные линии интеллект-карт. Хранятся отдельно от items:
   * в габариты урока они не входят (геометрию линии определяют её концы),
   * но во фрейм сложить их нужно, иначе при переносе урока линии отстанут.
   */
  readonly connectors: Connector[] = []

  private readonly columnLeft: number
  private readonly columnWidth: number
  private cursor: number

  private minX = Number.POSITIVE_INFINITY
  private minY = Number.POSITIVE_INFINITY
  private maxX = Number.NEGATIVE_INFINITY
  private maxY = Number.NEGATIVE_INFINITY

  constructor(opts: { left: number; top: number; width: number }) {
    this.columnLeft = opts.left
    this.columnWidth = opts.width
    this.cursor = opts.top
  }

  get left(): number {
    return this.columnLeft
  }

  get width(): number {
    return this.columnWidth
  }

  get top(): number {
    return this.cursor
  }

  set top(value: number) {
    this.cursor = value
  }

  advance(dy: number): void {
    this.cursor += dy
  }

  get isEmpty(): boolean {
    return this.items.length === 0
  }

  /** Габариты всего, что было размещено. Бросает, если не размещено ничего. */
  bbox(): Box {
    if (this.isEmpty) {
      throw new Error('Canvas пуст: нечего обводить фреймом')
    }
    return {
      left: this.minX,
      top: this.minY,
      width: this.maxX - this.minX,
      height: this.maxY - this.minY,
    }
  }

  /**
   * Вложенная область со своим курсором — так делаются колонки и ячейки сетки.
   * После отрисовки её нужно вернуть в родителя через `absorb`, иначе объекты
   * не попадут во фрейм урока.
   */
  sub(opts: { left: number; top: number; width: number }): Canvas {
    return new Canvas(opts)
  }

  /**
   * Забирает у вложенной области объекты и габариты.
   * При `flow = true` курсор родителя опускается под содержимое вложенной области.
   */
  absorb(child: Canvas, flow = false): void {
    if (child.isEmpty) return
    const box = child.bbox()

    this.items.push(...child.items)
    this.backdrops.push(...child.backdrops)
    this.exercises.push(...child.exercises)
    this.connectors.push(...child.connectors)
    this.minX = Math.min(this.minX, box.left)
    this.minY = Math.min(this.minY, box.top)
    this.maxX = Math.max(this.maxX, box.left + box.width)
    this.maxY = Math.max(this.maxY, box.top + box.height)

    if (flow) {
      this.cursor = Math.max(this.cursor, box.top + box.height)
    }
  }

  // -------------------------------------------------------------------------
  // Примитивы
  // -------------------------------------------------------------------------

  async text(html: string, options: TextOptions = {}): Promise<Text> {
    const left = options.left ?? this.columnLeft
    const top = options.top ?? this.cursor
    const width = options.width ?? this.columnWidth

    const item = await miro.board.createText({
      content: html,
      x: left + width / 2,
      // Высота ещё неизвестна, поэтому первая позиция заведомо неточная —
      // поправим её сразу после того, как Miro посчитает перенос строк.
      y: top,
      width,
      style: {
        color: options.color ?? color.ink,
        fontFamily: options.fontFamily ?? FONT_FAMILY,
        fontSize: options.size ?? font.body,
        textAlign: options.align ?? 'left',
      },
    })

    item.y = top + item.height / 2
    await item.sync()

    this.register(item, { left, top, width, height: item.height }, options.flow !== false, options.gapAfter)
    return item
  }

  async shape(options: ShapeOptions): Promise<Shape> {
    const left = options.left ?? this.columnLeft
    const top = options.top ?? this.cursor

    const item = await miro.board.createShape({
      shape: options.shape ?? 'round_rectangle',
      content: options.content ?? '',
      x: left + options.width / 2,
      y: top + options.height / 2,
      width: options.width,
      height: options.height,
      style: {
        fillColor: options.fillColor ?? 'transparent',
        borderColor: options.borderColor ?? 'transparent',
        borderWidth: options.borderWidth ?? (options.borderColor ? 2 : 0),
        borderStyle: options.borderStyle ?? 'normal',
        color: options.textColor ?? color.ink,
        fontFamily: options.fontFamily ?? FONT_FAMILY,
        fontSize: options.fontSize ?? font.body,
        textAlign: options.align ?? 'center',
        textAlignVertical: options.alignVertical ?? 'middle',
      },
    })

    this.register(
      item,
      { left, top, width: options.width, height: options.height },
      options.flow !== false,
      options.gapAfter,
    )
    return item
  }

  async sticky(options: StickyOptions): Promise<StickyNote> {
    const left = options.left ?? this.columnLeft
    const top = options.top ?? this.cursor

    // Стикеру задаётся только ширина: высоту Miro подбирает сам под форму.
    const item = await miro.board.createStickyNote({
      content: options.content,
      shape: options.shape ?? 'square',
      x: left + options.width / 2,
      y: top,
      width: options.width,
      style: {
        fillColor: options.fillColor,
        textAlign: options.align ?? 'center',
        textAlignVertical: options.alignVertical ?? 'middle',
      },
    })

    item.y = top + item.height / 2
    await item.sync()

    // Стикеры всегда расставляются сеткой вручную, поэтому в поток не идут.
    this.register(item, { left, top, width: item.width, height: item.height }, false)
    return item
  }

  /** Соединительная линия между двумя объектами — для интеллект-карт. */
  async connect(from: CanvasItem, to: CanvasItem): Promise<Connector> {
    const connector = await miro.board.createConnector({
      start: { item: from.id },
      end: { item: to.id },
      shape: 'curved',
      style: {
        strokeColor: color.muted,
        strokeWidth: 3,
        startStrokeCap: 'none',
        endStrokeCap: 'none',
      },
    })
    this.connectors.push(connector)
    return connector
  }

  /**
   * Горизонтальная линия-разделитель во всю ширину колонки.
   * Рисуется прямоугольником: у Miro нет отдельного примитива «линия».
   */
  async divider(height: number): Promise<Shape> {
    return this.shape({
      width: this.columnWidth,
      height,
      shape: 'rectangle',
      fillColor: color.divider,
      borderWidth: 0,
    })
  }

  /**
   * Подложка под уже размещённые элементы: создаётся последней, чтобы знать
   * их фактические габариты, и уводится назад, чтобы не перекрыть содержимое.
   */
  async backdrop(box: Box, style: { fillColor: string; borderColor?: string }): Promise<Shape> {
    const item = await this.shape({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      shape: 'round_rectangle',
      fillColor: style.fillColor,
      borderColor: style.borderColor,
      flow: false,
    })
    this.backdrops.push(item)
    return item
  }

  // -------------------------------------------------------------------------

  private register(item: CanvasItem, box: Box, flow: boolean, gapAfter = 0): void {
    this.items.push(item)

    this.minX = Math.min(this.minX, box.left)
    this.minY = Math.min(this.minY, box.top)
    this.maxX = Math.max(this.maxX, box.left + box.width)
    this.maxY = Math.max(this.maxY, box.top + box.height)

    if (flow) {
      this.cursor = box.top + box.height + gapAfter
    }
  }
}

/**
 * Экранирование для текста, который уходит в `content`: Miro трактует его
 * как HTML, поэтому «5 < 7» или «a & b» из условия задачи сломали бы разметку.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function bold(value: string): string {
  return `<strong>${escapeHtml(value)}</strong>`
}

/** Абзацы: Miro переносит строки только по тегам, а не по \n. */
export function paragraphs(...lines: string[]): string {
  return lines.map((line) => `<p>${line}</p>`).join('')
}

/** Маркированный список одним текстовым элементом. */
export function bullets(items: string[]): string {
  return paragraphs(...items.map((item) => `• ${escapeHtml(item)}`))
}

/** Нумерованный список одним текстовым элементом. */
export function numbered(items: string[]): string {
  return paragraphs(...items.map((item, index) => `${index + 1}. ${escapeHtml(item)}`))
}
