import type { Connector, Frame, Text } from '@mirohq/websdk-types'
import { titleFor, type AnswersBlock, type Block, type Lesson } from '../lesson/schema'
import { renderBlock } from './blocks'
import { Canvas, bold, escapeHtml, paragraphs, type CanvasItem } from './canvas'
import { card, section } from './composition'
import { saveExercises } from './metadata'
import {
  ANSWERS_OFFSET_X,
  CONTENT_WIDTH,
  FRAME_PADDING,
  applyStyle,
  color,
  font,
  gap,
  styleDecor,
} from './theme'

export interface RenderResult {
  frame: Frame
  answersFrame: Frame | null
  itemCount: number
}

export interface RenderOptions {
  /**
   * Выносить ли ответы отдельным фреймом на доску. По умолчанию нет:
   * ученику для интерактивов нужны права редактирования, а с ними он может
   * доскроллить до любого угла доски — включая фрейм с ответами. Панель
   * репетитора ученику не видна, поэтому ответы безопаснее показывать там.
   */
  answersOnBoard?: boolean
}

/**
 * Рисует урок на доске и возвращает созданный фрейм.
 *
 * Порядок важен: сначала на доску ложится всё содержимое, и только потом
 * вокруг него создаётся фрейм. Заранее посчитать высоту нельзя — она зависит
 * от того, как Miro перенесёт строки, — поэтому фрейм создаётся последним,
 * по фактическим габаритам.
 */
export async function renderLesson(lesson: Lesson, options: RenderOptions = {}): Promise<RenderResult> {
  // Палитра подменяется до первого объекта: весь урок, включая фрейм и
  // ответы, рисуется в одном стиле. Названный в meta.style стиль пришёл
  // от репетитора через промпт.
  applyStyle(lesson.meta.style)

  const origin = await findOrigin(lesson)

  const canvas = new Canvas({
    left: origin.left + FRAME_PADDING,
    top: origin.top + FRAME_PADDING,
    width: CONTENT_WIDTH,
  })

  let answersCanvas: Canvas | null = null
  let frame: Frame | null = null
  let answersFrame: Frame | null = null
  let decorations: Text[] = []

  try {
    await renderHeader(canvas, lesson)

    for (const block of lesson.blocks) {
      if (block.type === 'answers') continue
      await renderBlock(canvas, block, lesson)
    }

    // Декорации рассыпаются по всей площади урока и уходят в самый низ
    // стопки детей фрейма — под карточки. Видны они в просветах между
    // секциями и по краям, и это ровно эффект тематической подложки.
    const decorEmoji = lesson.meta.styleEmoji?.length
      ? lesson.meta.styleEmoji
      : styleDecor(lesson.meta.style)
    if (decorEmoji.length > 0 && !canvas.isEmpty) {
      decorations = await scatterDecor(canvas.bbox(), decorEmoji)
    }

    const answersBlock = options.answersOnBoard
      ? lesson.blocks.find((block): block is AnswersBlock => block.type === 'answers')
      : undefined
    if (answersBlock) {
      answersCanvas = await renderAnswersAside(answersBlock, lesson, {
        left: origin.left + ANSWERS_OFFSET_X,
        top: origin.top + FRAME_PADDING,
      })
    }

    frame = await wrapInFrame(canvas, frameTitle(lesson), color.frameFill, decorations)

    // Указатель на интерактивные задания живёт в хранилище приложения на
    // доске: он позволяет проверке найти нужные объекты одним запросом вместо
    // перебора сотни элементов урока.
    if (canvas.exercises.length > 0) {
      await saveExercises({
        frameId: frame.id,
        topic: lesson.meta.topic,
        ...(lesson.meta.style ? { style: lesson.meta.style } : {}),
        exercises: canvas.exercises,
      })
    }

    if (answersCanvas && !answersCanvas.isEmpty) {
      answersFrame = await wrapInFrame(answersCanvas, `${frameTitle(lesson)} — ответы`, color.answersFill)
    }

    await miro.board.viewport.zoomTo(frame)

    return {
      frame,
      answersFrame,
      itemCount: canvas.items.length + decorations.length + (answersCanvas?.items.length ?? 0),
    }
  } catch (error) {
    // Урок рисуется десятками отдельных вызовов, и падение на середине
    // оставляет на доске бессмысленную россыпь объектов, которую репетитору
    // пришлось бы вычищать руками. Прибираем за собой и отдаём ошибку дальше.
    await discard([
      ...canvas.items,
      ...canvas.connectors,
      ...decorations,
      ...(answersCanvas?.items ?? []),
      frame,
      answersFrame,
    ])
    throw error
  }
}

/** Удаляет всё созданное. Ошибки удаления гасим: на уборке они уже не важны. */
async function discard(items: (CanvasItem | Connector | Frame | null)[]): Promise<void> {
  const present = items.filter((item): item is CanvasItem | Connector | Frame => item !== null)

  const BATCH = 10
  for (let index = 0; index < present.length; index += BATCH) {
    await Promise.all(
      present.slice(index, index + BATCH).map((item) => miro.board.remove(item).catch(() => undefined)),
    )
  }
}

// ---------------------------------------------------------------------------

async function renderHeader(canvas: Canvas, lesson: Lesson): Promise<void> {
  const { meta } = lesson

  await canvas.text(bold(meta.topic), { size: font.lessonTitle, gapAfter: gap.xs })

  const details = [
    meta.subject === 'physics' ? 'Физика' : 'Английский',
    meta.level,
    `${meta.durationMin} мин`,
    meta.student ? `ученик: ${meta.student}` : null,
    formatDate(new Date()),
  ].filter((part): part is string => Boolean(part))

  await canvas.text(escapeHtml(details.join('  ·  ')), {
    size: font.lessonSubtitle,
    color: color.muted,
  })
}

/**
 * Ответы уезжают вправо от урока отдельным фреймом: у Miro нет скрытых слоёв,
 * поэтому единственный способ не показать ответы ученику — держать их там,
 * куда не попадает экран во время занятия.
 */
async function renderAnswersAside(
  block: AnswersBlock,
  lesson: Lesson,
  origin: { left: number; top: number },
): Promise<Canvas> {
  const canvas = new Canvas({ left: origin.left, top: origin.top, width: CONTENT_WIDTH * 0.6 })

  await canvas.text(bold('Ответы'), { size: font.lessonTitle, gapAfter: gap.xs })
  await canvas.text('Только для преподавателя', { size: font.lessonSubtitle, color: color.muted })

  await section(canvas, 'Ключ')

  for (const entry of block.items) {
    await card(canvas, { fillColor: color.answersFill, borderColor: color.answersBorder }, async (inner) => {
      await canvas.text(`${bold(entry.ref.toUpperCase())} — ${escapeHtml(entry.answer)}`, {
        ...inner,
        size: font.cardTitle,
      })
      if (entry.solution) {
        canvas.advance(gap.xs)
        await canvas.text(paragraphs(escapeHtml(entry.solution)), {
          ...inner,
          size: font.small,
          color: color.muted,
        })
      }
    })
  }

  // Опорный сценарий — фразы, которыми учитель вводит блоки. Живёт рядом
  // с ключом: это одна шпаргалка преподавателя, а не два разных места.
  const script = lesson.blocks.filter((item) => item.say)
  if (script.length > 0) {
    await section(canvas, 'Сценарий')
    for (const item of script) {
      await card(canvas, { fillColor: color.theoryFill, borderColor: color.theoryBorder }, async (inner) => {
        await canvas.text(bold(titleFor(item, lesson.meta.language)), {
          ...inner,
          size: font.small,
          gapAfter: gap.xs,
        })
        await canvas.text(paragraphs(escapeHtml(item.say ?? '')), { ...inner, size: font.body })
      })
    }
  }

  return canvas
}

/** Обводит всё содержимое канвы фреймом и складывает объекты внутрь. */
async function wrapInFrame(
  canvas: Canvas,
  title: string,
  fillColor: string,
  decorations: Text[] = [],
): Promise<Frame> {
  const box = canvas.bbox()

  // Порядок детей — это порядок слоёв: декорации в самом низу (это фон),
  // над ними подложки карточек, потом коннекторы, сверху содержимое.
  const backdropIds = new Set(canvas.backdrops.map((item) => item.id))
  const content = canvas.items.filter((item) => !backdropIds.has(item.id))
  const ordered = [...decorations, ...canvas.backdrops, ...canvas.connectors, ...content]

  const frame = await miro.board.createFrame({
    title,
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    width: box.width + FRAME_PADDING * 2,
    height: box.height + FRAME_PADDING * 2,
    style: { fillColor },
    childrenIds: ordered.map((item) => item.id),
  })

  // Уводить фрейм назад не нужно и нельзя: Miro запрещает менять слой фреймов,
  // потому что фрейм и так всегда лежит под своим содержимым.
  await ensureChildren(frame, ordered)

  // Поднимаем содержимое, а не опускаем подложки. Опускать нельзя: sendToBack
  // отправляет в самый низ доски, то есть под заливку фрейма, и подложка
  // становится невидимой. Поднятое содержимое оказывается над своей подложкой,
  // а обе остаются над фреймом.
  if ((canvas.backdrops.length > 0 || decorations.length > 0) && content.length > 0) {
    if (canvas.backdrops.length > 0) {
      await miro.board.bringToFront(canvas.backdrops)
    }
    await miro.board.bringToFront(content)
  }

  return frame
}

/**
 * Тематический фон: эмодзи, случайно рассыпанные по площади урока.
 * Они уходят в самый низ стопки, поэтому видны только в просветах между
 * карточками и по краям — содержанию не мешают.
 */
async function scatterDecor(
  box: { left: number; top: number; width: number; height: number },
  emoji: string[],
): Promise<Text[]> {
  // Плотность подобрана на глаз: примерно одна декорация на квадрат 470×470,
  // но не больше сорока штук — урок из ста объектов и так недёшев по вызовам.
  const count = Math.min(40, Math.max(10, Math.round((box.width * box.height) / 220_000)))
  const items: Text[] = []

  const BATCH = 10
  for (let start = 0; start < count; start += BATCH) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH, count - start) }, (_, offset) => {
        const glyph = emoji[(start + offset) % emoji.length] ?? '✨'
        const fontSize = Math.round(28 + Math.random() * 36)
        return miro.board.createText({
          content: glyph,
          x: box.left + Math.random() * box.width,
          y: box.top + Math.random() * box.height,
          width: fontSize * 2,
          rotation: Math.round(Math.random() * 60 - 30),
          style: { fontSize, textAlign: 'center' },
        })
      }),
    )
    items.push(...batch)
  }

  return items
}

/**
 * `childrenIds` при создании фрейма — быстрый путь, но полагаться на него одного
 * нельзя: если объекты не прикрепились, урок рассыплется при перемещении фрейма.
 * Поэтому недостающие добавляются явно.
 */
async function ensureChildren(frame: Frame, items: (CanvasItem | Connector)[]): Promise<void> {
  const attached = new Set((await frame.getChildren()).map((child) => child.id))
  const missing = items.filter((item) => !attached.has(item.id))
  if (missing.length === 0) return

  const BATCH = 10
  for (let index = 0; index < missing.length; index += BATCH) {
    const batch = missing.slice(index, index + BATCH)
    await Promise.all(batch.map((item) => frame.add(item)))
  }
}

/**
 * Свободное место под урок ищем рядом с текущим экраном репетитора,
 * чтобы новый урок не улетел в неизвестный угол доски.
 */
async function findOrigin(lesson: Lesson): Promise<{ left: number; top: number }> {
  const width = CONTENT_WIDTH + FRAME_PADDING * 2 + ANSWERS_OFFSET_X
  const height = estimateHeight(lesson)
  const viewport = await miro.board.viewport.get()

  const spot = await miro.board.findEmptySpace({
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
    width,
    height,
    offset: 200,
  })

  return { left: spot.x - spot.width / 2, top: spot.y - spot.height / 2 }
}

/**
 * Грубая оценка высоты урока — нужна только чтобы зарезервировать место.
 * Фактический размер фрейма считается после отрисовки, так что промах
 * в оценке приводит максимум к более тесному соседству с другими уроками.
 */
function estimateHeight(lesson: Lesson): number {
  const header = 260
  const body = lesson.blocks.reduce((total, block) => total + estimateBlockHeight(block), 0)
  return header + body
}

function estimateBlockHeight(block: Block): number {
  const sectionOverhead = 200

  switch (block.type) {
    case 'objectives':
      return sectionOverhead + block.items.length * 44
    case 'warmup':
      return sectionOverhead + Math.ceil(block.prompts.length / 3) * 220
    case 'theory':
      return sectionOverhead + block.points.length * 240
    case 'mindmap':
      return sectionOverhead + 200 + Math.ceil(block.branches.length / 2) * 260
    case 'reflection':
      return sectionOverhead + 700
    case 'formulas':
      return sectionOverhead + Math.ceil(block.items.length / 2) * 320
    case 'example':
      return sectionOverhead + 400 + (block.given.length + block.steps.length) * 40
    case 'tasks':
      return sectionOverhead + Math.ceil(block.items.length / 3) * 320
    case 'vocabulary':
      return sectionOverhead + Math.ceil(block.items.length / 3) * 300
    case 'grammar':
      return sectionOverhead + 300 + (block.table ? (block.table.rows.length + 1) * 68 : 0)
    case 'matching':
      return sectionOverhead + block.pairs.length * 120 + 300
    case 'sorting':
      return sectionOverhead + 400 + block.groups.length * 60
    case 'gapfill':
      return sectionOverhead + block.sentences.length * 130 + 300
    case 'speaking':
      return sectionOverhead + Math.ceil(block.prompts.length / 2) * 220
    case 'summary':
      return sectionOverhead + block.points.length * 44
    case 'homework':
      return sectionOverhead + Math.ceil(block.items.length / 2) * 220
    case 'answers':
      // Ответы рисуются в отдельной колонке справа и на высоту урока не влияют.
      return 0
  }
}

function frameTitle(lesson: Lesson): string {
  const parts = [formatDate(new Date()), lesson.meta.topic]
  if (lesson.meta.student) parts.push(lesson.meta.student)
  return parts.join(' · ')
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}
