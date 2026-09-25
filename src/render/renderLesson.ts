import type { Connector, Frame, Text } from '@mirohq/websdk-types'
import { titleFor, type AnswersBlock, type Block, type Lesson } from '../lesson/schema'
import { renderBlock } from './blocks'
import { Canvas, bold, escapeHtml, paragraphs, type Box, type CanvasItem } from './canvas'
import { card, section } from './composition'
import { saveExercises, saveLessonSnapshot, type BlockAnchor } from './metadata'
import {
  ANSWERS_OFFSET_X,
  CONTENT_WIDTH,
  FRAME_PADDING,
  applyStyle,
  color,
  font,
  gap,
} from './theme'

export interface RenderResult {
  /** Null, если урок оказался слишком велик для одного фрейма Miro. */
  frame: Frame | null
  answersFrame: Frame | null
  itemCount: number
  /** Некритичные проблемы финальных шагов: фрейм, указатель проверки. */
  warnings: string[]
}

export interface RenderOptions {
  /**
   * Выносить ли ответы отдельным фреймом на доску. По умолчанию нет:
   * ученику для интерактивов нужны права редактирования, а с ними он может
   * доскроллить до любого угла доски — включая фрейм с ответами. Панель
   * репетитора ученику не видна, поэтому ответы безопаснее показывать там.
   */
  answersOnBoard?: boolean
  /**
   * Прогресс для панели. Большой урок рисуется минутами, и без этих
   * сообщений «медленно работает» неотличимо от «зависло».
   */
  onProgress?: (message: string) => void
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
  let decorations: Text[] = []

  // Вертикальные границы секций. Нужны экспорту: по ним картинки, которые
  // репетитор потом положит на урок руками, попадут в файл под своей секцией.
  const anchors: BlockAnchor[] = []

  // Фаза 1: содержимое. Падение здесь оставило бы на доске бессмысленную
  // россыпь объектов — прибираем за собой и отдаём ошибку дальше.
  const progress = options.onProgress ?? (() => undefined)
  const drawable = lesson.blocks.filter((block) => block.type !== 'answers')

  try {
    progress('Заголовок урока…')
    await renderHeader(canvas, lesson)

    for (const [index, block] of drawable.entries()) {
      progress(`Блок ${index + 1} из ${drawable.length}: ${titleFor(block, lesson.meta.language)}`)
      const top = canvas.top
      const before = canvas.items.length
      await renderBlock(canvas, block, lesson)
      anchors.push({
        index,
        top,
        bottom: canvas.top,
        ids: canvas.items.slice(before).map((item) => item.id),
      })
    }

    // Декорации рассыпаются по площади урока и уходят под карточки — видно их
    // в просветах между секциями. Появляются только если репетитор сам вписал
    // эмодзи в meta.styleEmoji: оформление — авторская часть работы, и класть
    // на доску незваные картинки значит делать её за автора.
    const decorEmoji = lesson.meta.styleEmoji ?? []
    if (decorEmoji.length > 0 && !canvas.isEmpty) {
      progress('Декорации…')
      decorations = await scatterDecor(canvas.bbox(), decorEmoji)
    }

    const answersBlock = options.answersOnBoard
      ? lesson.blocks.find((block): block is AnswersBlock => block.type === 'answers')
      : undefined
    if (answersBlock) {
      progress('Фрейм с ответами…')
      answersCanvas = await renderAnswersAside(answersBlock, lesson, {
        left: origin.left + ANSWERS_OFFSET_X,
        top: origin.top + FRAME_PADDING,
      })
    }
  } catch (error) {
    await discard([...canvas.items, ...canvas.connectors, ...decorations, ...(answersCanvas?.items ?? [])])
    throw error
  }

  // Фаза 2: фрейм, указатель проверки, зум. Урок уже нарисован, и удалять
  // его из-за сбоя на этих шагах нельзя — большой юнит однажды был снесён
  // ровно так: контент удался, финальный шаг упёрся в лимит Miro, уборка
  // уничтожила готовую работу. Теперь каждый шаг деградирует отдельно.
  const warnings: string[] = []
  let frame: Frame | null = null
  let answersFrame: Frame | null = null

  try {
    progress(`Собираю ${canvas.items.length} объектов во фрейм…`)
    const wrapped = await wrapInFrame(canvas, frameTitle(lesson), color.frameFill, decorations)
    frame = wrapped.frame
    if (wrapped.reattached > 0) {
      // Диагностика: быстрый путь не сработал и объекты пришлось прикреплять
      // поштучно. Раньше они при этом уезжали от своего места — теперь
      // возвращаются, но знать, что путь задействован, полезно.
      warnings.push(
        `${wrapped.reattached} из ${canvas.items.length} объектов не прикрепились к фрейму сразу — досоединил вручную и вернул на место.`,
      )
    }
  } catch (error) {
    warnings.push(
      `Урок нарисован, но не поместился в один фрейм Miro (${reason(error)}). Он лежит на доске без рамки — работать можно, двигать урок целиком придётся выделением.`,
    )
  }

  // Снимок урока живёт на доске рядом с фреймом: панель можно перезагрузить,
  // закрыть, открыть с другого компьютера — файл-страховку всё равно соберём.
  if (frame) {
    try {
      await saveLessonSnapshot({
        frameId: frame.id,
        lesson,
        anchors,
        savedAt: new Date().toISOString(),
        itemIds: [...canvas.items, ...decorations].map((item) => item.id),
      })
    } catch (error) {
      warnings.push(
        `Урок на доске, но сохранить его в память доски не удалось (${reason(error)}) — скачать файлом получится только до перезагрузки панели.`,
      )
    }
  }

  if (canvas.exercises.length > 0) {
    if (frame) {
      try {
        await saveExercises({
          frameId: frame.id,
          topic: lesson.meta.topic,
          ...(lesson.meta.style ? { style: lesson.meta.style } : {}),
          exercises: canvas.exercises,
        })
      } catch (error) {
        warnings.push(
          `Урок на доске, но указатель для проверки сохранить не удалось (${reason(error)}) — кнопки проверки для этого урока работать не будут.`,
        )
      }
    } else {
      warnings.push('Без фрейма автопроверка недоступна: ей не к чему привязать урок.')
    }
  }

  if (answersCanvas && !answersCanvas.isEmpty) {
    try {
      answersFrame = (
        await wrapInFrame(answersCanvas, `${frameTitle(lesson)} — ответы`, color.answersFill)
      ).frame
    } catch (error) {
      warnings.push(`Ответы нарисованы, но без своего фрейма (${reason(error)}).`)
    }
  }

  try {
    if (frame) await miro.board.viewport.zoomTo(frame)
  } catch {
    // Зум — чистое удобство; его сбой не стоит даже предупреждения.
  }

  return {
    frame,
    answersFrame,
    itemCount: canvas.items.length + decorations.length + (answersCanvas?.items.length ?? 0),
    warnings,
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'неизвестная ошибка Miro'
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
): Promise<{ frame: Frame; reattached: number }> {
  const box = canvas.bbox()

  // Порядок детей — это порядок слоёв: декорации в самом низу (это фон),
  // над ними подложки карточек, затем средний слой приёмов (поднос, из-под
  // которого вытягивают вопрос; пятно фонаря), потом коннекторы, сверху
  // содержимое.
  const lowerIds = new Set([...canvas.backdrops, ...canvas.midgrounds].map((item) => item.id))
  const content = canvas.items.filter((item) => !lowerIds.has(item.id))
  const ordered = [
    ...decorations,
    ...canvas.backdrops,
    ...canvas.midgrounds,
    ...canvas.connectors,
    ...content,
  ]

  const frame = await miro.board.createFrame({
    title,
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    width: box.width + FRAME_PADDING * 2,
    height: box.height + FRAME_PADDING * 2,
    style: { fillColor },
    childrenIds: ordered.map((item) => item.id),
  })

  const reattached = await ensureChildren(frame, ordered, canvas.boxes)

  // Порядок детей фрейма — это и есть порядок слоёв внутри урока, поэтому
  // задаём его здесь, последним действием. Раньше этого не делали, а слои
  // раскладывали через miro.board.bringToFront — и именно это ломало урок:
  // команда работает на уровне доски, а не фрейма, и выдёргивала объекты из
  // него. Подложки карточек уезжали в сторону от своего текста, а фрейм
  // оказывался поверх содержимого.
  //
  // Одного `childrenIds` при создании не хватает: `ensureChildren` дописывает
  // недостающих детей в конец, то есть наверх, и порядок сбивается. Поэтому
  // переставляем в самом конце, когда все дети уже на месте.
  await reorderChildren(frame, ordered)

  return { frame, reattached }
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
 * Расставить детей фрейма в порядке слоёв: первый в списке — в самом низу.
 *
 * Нужно после того, как все дети прикреплены. Порядок, отданный при создании
 * фрейма, к этому моменту уже не тот: `ensureChildren` дописывает пропущенных
 * в конец. Переставляем список целиком — это операция внутри фрейма, поэтому,
 * в отличие от `bringToFront`, она не выдёргивает объекты из урока.
 *
 * Дети, которых мы не знаем (их мог добавить сам Miro), остаются наверху:
 * выбрасывать из фрейма чужое мы не вправе.
 */
async function reorderChildren(frame: Frame, ordered: (CanvasItem | Connector)[]): Promise<void> {
  // Читаем детей с доски, а не из `frame.childrenIds`: после `frame.add`
  // свойство у локального объекта фрейма остаётся прежним.
  const current = (await frame.getChildren()).map((child) => child.id)
  const attached = new Set(current)
  const known = new Set(ordered.map((item) => item.id))

  const next = [
    ...ordered.map((item) => item.id).filter((id) => attached.has(id)),
    ...current.filter((id) => !known.has(id)),
  ]

  if (next.length === current.length && next.every((id, index) => id === current[index])) return

  frame.childrenIds = next
  await frame.sync()
}

/**
 * `childrenIds` при создании фрейма — быстрый путь, но полагаться на него одного
 * нельзя: если объекты не прикрепились, урок рассыплется при перемещении фрейма.
 * Поэтому недостающие добавляются явно.
 *
 * И сразу возвращаются на место. Координаты ребёнка фрейма отсчитываются от
 * центра фрейма, а не от доски, поэтому объект, прикреплённый через `frame.add`,
 * уезжает ровно на положение фрейма — так подложки карточек и оказывались
 * в стороне от своего текста. Задуманное место каждого объекта холст помнит
 * в `boxes`, по нему и восстанавливаем.
 *
 * Возвращает число объектов, которые пришлось прикреплять вручную: ноль
 * означает, что быстрый путь отработал и этот код ни при чём.
 */
async function ensureChildren(
  frame: Frame,
  items: (CanvasItem | Connector)[],
  boxes: Map<string, Box>,
): Promise<number> {
  const attached = new Set((await frame.getChildren()).map((child) => child.id))
  const missing = items.filter((item) => !attached.has(item.id))
  if (missing.length === 0) return 0

  const BATCH = 10
  for (let index = 0; index < missing.length; index += BATCH) {
    const batch = missing.slice(index, index + BATCH)
    await Promise.all(batch.map((item) => frame.add(item)))
    await Promise.all(batch.map((item) => restorePosition(frame, item, boxes.get(item.id))))
  }

  return missing.length
}

/** Вернуть прикреплённый объект туда, куда его ставил холст. */
async function restorePosition(
  frame: Frame,
  item: CanvasItem | Connector,
  box: Box | undefined,
): Promise<void> {
  // У коннектора своей геометрии нет — его держат концы, двигать нечего.
  if (!box || item.type === 'connector') return

  const target = item as CanvasItem
  target.x = box.left + box.width / 2 - frame.x
  target.y = box.top + box.height / 2 - frame.y
  await target.sync().catch(() => undefined)
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
    case 'reading':
      return sectionOverhead + block.paragraphs.length * 320 + Math.ceil((block.questions?.length ?? 0) / 2) * 220
    case 'audio':
      return sectionOverhead + 260 + Math.ceil((block.tasks?.length ?? 0) / 2) * 220
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
    case 'embed':
      return sectionOverhead + 720
    case 'choice':
      return sectionOverhead + block.items.length * 190
    case 'mysterybox':
      return sectionOverhead + 400 + Math.ceil((block.slots.length + (block.distractors?.length ?? 0)) / 4) * 120
    case 'halves':
      return sectionOverhead + block.pairs.length * 160 + 300
    case 'pullout':
      return sectionOverhead + 300 + Math.ceil(block.questions.length / 4) * 200
    case 'flashlight':
      return sectionOverhead + 300 + Math.ceil(block.words.length / 4) * 130
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
