import type { Shape } from '@mirohq/websdk-types'
import type {
  AudioBlock,
  Block,
  ExampleBlock,
  FlashlightBlock,
  FormulasBlock,
  GapFillBlock,
  GrammarBlock,
  HalvesBlock,
  HomeworkBlock,
  Lesson,
  MatchingBlock,
  MindmapBlock,
  MysteryBoxBlock,
  PullOutBlock,
  ObjectivesBlock,
  ReadingBlock,
  ReflectionBlock,
  SortingBlock,
  SpeakingBlock,
  SummaryBlock,
  TasksBlock,
  TheoryBlock,
  VocabularyBlock,
  WarmupBlock,
} from '../lesson/schema'
import { GAP_MARKER, REFLECTION_DEFAULT_PROMPTS, titleFor } from '../lesson/schema'
import { Canvas, bold, bullets, escapeHtml, numbered, paragraphs } from './canvas'
import { card, cellWidth, columns, dropZone, grid, rows, section, shuffle } from './composition'
import { tagItem, type ChipRecord, type ZoneRecord } from './metadata'
import { color, font, gap, size, sticky } from './theme'

/**
 * По одному рендереру на тип блока. Каждый начинается с заголовка секции
 * и оставляет курсор ровно под своим содержимым — вертикальный ритм урока
 * держит `section`, а не сами блоки.
 */

export async function renderBlock(canvas: Canvas, block: Block, lesson: Lesson): Promise<void> {
  const title = titleFor(block, lesson.meta.language)

  switch (block.type) {
    case 'objectives':
      return renderObjectives(canvas, block, title)
    case 'warmup':
      return renderWarmup(canvas, block, title)
    case 'theory':
      return renderTheory(canvas, block, title)
    case 'mindmap':
      return renderMindmap(canvas, block, title)
    case 'reflection':
      return renderReflection(canvas, block, title)
    case 'reading':
      return renderReading(canvas, block, title)
    case 'audio':
      return renderAudio(canvas, block, title)
    case 'formulas':
      return renderFormulas(canvas, block, title)
    case 'example':
      return renderExample(canvas, block, title)
    case 'tasks':
      return renderTasks(canvas, block, title)
    case 'vocabulary':
      return renderVocabulary(canvas, block, title)
    case 'grammar':
      return renderGrammar(canvas, block, title)
    case 'matching':
      return renderMatching(canvas, block, title)
    case 'sorting':
      return renderSorting(canvas, block, title)
    case 'gapfill':
      return renderGapFill(canvas, block, title)
    case 'mysterybox':
      return renderMysteryBox(canvas, block, title)
    case 'halves':
      return renderHalves(canvas, block, title)
    case 'pullout':
      return renderPullOut(canvas, block, title)
    case 'flashlight':
      return renderFlashlight(canvas, block, title)
    case 'speaking':
      return renderSpeaking(canvas, block, title)
    case 'summary':
      return renderSummary(canvas, block, title)
    case 'homework':
      return renderHomework(canvas, block, title)
    case 'answers':
      // Ответы рисуются отдельно, в стороне от урока — см. renderAnswersAside.
      return
  }
}

// ---------------------------------------------------------------------------
// Общие блоки
// ---------------------------------------------------------------------------

async function renderObjectives(canvas: Canvas, block: ObjectivesBlock, title: string): Promise<void> {
  await section(canvas, title)
  await card(canvas, { fillColor: color.theoryFill, borderColor: color.theoryBorder }, async (inner) => {
    await canvas.text(bullets(block.items), inner)
  })
}

async function renderWarmup(canvas: Canvas, block: WarmupBlock, title: string): Promise<void> {
  await section(canvas, title)
  const width = cellWidth(canvas, 3)

  await grid(canvas, block.prompts.length, { columns: 3, cellWidth: width }, async (index, left, top) => {
    const note = await canvas.sticky({
      left,
      top,
      width,
      shape: 'rectangle',
      content: escapeHtml(block.prompts[index] ?? ''),
      fillColor: sticky.speaking,
    })
    return note.height
  })
}

async function renderTheory(canvas: Canvas, block: TheoryBlock, title: string): Promise<void> {
  await section(canvas, title)

  for (const point of block.points) {
    await card(canvas, { fillColor: color.theoryFill, borderColor: color.theoryBorder }, async (inner) => {
      await canvas.text(bold(point.heading), { ...inner, size: font.cardTitle, gapAfter: gap.xs })
      await canvas.text(paragraphs(escapeHtml(point.body)), inner)
    })
  }
}

/**
 * Интеллект-карта: центральное понятие, вокруг — карточки веток,
 * соединённые с центром линиями. Ветки идут сеткой в две колонки под
 * центром: настоящая радиальная раскладка на колоночном потоке нечитаема,
 * а «центр сверху, кластеры снизу» выглядит как карта и не ломает поток.
 */
async function renderMindmap(canvas: Canvas, block: MindmapBlock, title: string): Promise<void> {
  await section(canvas, title)

  const centerWidth = canvas.width * 0.5
  const center = await canvas.shape({
    left: canvas.left + (canvas.width - centerWidth) / 2,
    width: centerWidth,
    height: 110,
    shape: 'round_rectangle',
    content: bold(block.center),
    fillColor: color.accent,
    textColor: '#ffffff',
    fontSize: font.cardTitle,
    gapAfter: gap.lg,
  })

  const branchCards: import('@mirohq/websdk-types').Shape[] = []

  await rows(canvas, block.branches.length, 2, async (index, column) => {
    const branch = block.branches[index]
    if (!branch) return

    const top = column.top
    await card(column, { fillColor: color.theoryFill, borderColor: color.theoryBorder }, async (inner) => {
      await column.text(bold(branch.label), { ...inner, size: font.cardTitle, gapAfter: gap.xs })
      await column.text(bullets(branch.children), { ...inner, size: font.small })
    })

    // Подложка карточки — последний элемент, добавленный в column.backdrops.
    const backdrop = column.backdrops.at(-1)
    if (backdrop && column.top > top) branchCards.push(backdrop)
  })

  for (const branchCard of branchCards) {
    await canvas.connect(center, branchCard)
  }
}

/**
 * Рефлексия: колонки с подписями и пустыми стикерами — ученик пишет на них
 * сам. Проверки здесь нет намеренно: смысл упражнения в свободном ответе.
 */
async function renderReflection(canvas: Canvas, block: ReflectionBlock, title: string): Promise<void> {
  await section(canvas, title)

  const prompts = block.prompts?.length ? block.prompts : REFLECTION_DEFAULT_PROMPTS
  const stickyColors = [sticky.reflection1, sticky.reflection2, sticky.reflection3]

  await columns(canvas, prompts.length, {}, async (index, column) => {
    await column.shape({
      width: column.width,
      height: 90,
      shape: 'round_rectangle',
      content: bold(prompts[index] ?? ''),
      fillColor: color.accent,
      textColor: '#ffffff',
      fontSize: font.cardTitle,
      gapAfter: gap.sm,
    })

    for (let slot = 0; slot < 2; slot += 1) {
      const note = await column.sticky({
        left: column.left + (column.width - size.stickyWidth) / 2,
        top: column.top,
        width: size.stickyWidth,
        shape: 'square',
        content: '',
        fillColor: stickyColors[index % stickyColors.length] ?? 'light_yellow',
      })
      column.top = note.y + note.height / 2 + gap.sm
    }
  })
}

/**
 * Текст для чтения: абзацы карточками с метками, чтобы задания могли
 * ссылаться на них («какой вопрос подходит к ответу 3?»), вопросы — стикерами.
 */
async function renderReading(canvas: Canvas, block: ReadingBlock, title: string): Promise<void> {
  await section(canvas, title)

  if (block.intro) {
    await canvas.text(paragraphs(escapeHtml(block.intro)), { color: color.muted, gapAfter: gap.md })
  }

  for (const paragraph of block.paragraphs) {
    await card(canvas, { fillColor: '#fbfbf6', borderColor: color.divider }, async (inner) => {
      const head = paragraph.label ? `${bold(paragraph.label)} — ` : ''
      await canvas.text(`${head}${escapeHtml(paragraph.text)}`, { ...inner, size: font.body })
    })
  }

  if (block.questions?.length) {
    canvas.advance(gap.md)
    await canvas.text(bold('Вопросы к тексту'), { size: font.small, color: color.muted, gapAfter: gap.xs })
    const width = cellWidth(canvas, 2)
    await grid(canvas, block.questions.length, { columns: 2, cellWidth: width }, async (index, left, top) => {
      const note = await canvas.sticky({
        left,
        top,
        width,
        shape: 'rectangle',
        content: escapeHtml(block.questions?.[index] ?? ''),
        fillColor: sticky.speaking,
      })
      return note.height
    })
  }
}

/**
 * Метка аудирования. Доска звук не проигрывает — репетитор включает трек у
 * себя, а карточка держит место в сценарии: номер трека, задание, вопросы.
 * Рядом можно бросить сам файл — Miro принимает файлы перетаскиванием.
 */
async function renderAudio(canvas: Canvas, block: AudioBlock, title: string): Promise<void> {
  await section(canvas, title)

  await card(canvas, { fillColor: color.exampleFill, borderColor: color.exampleBorder }, async (inner) => {
    await canvas.text(bold(`Track ${block.track}`), {
      ...inner,
      size: font.sectionTitle,
      gapAfter: gap.xs,
    })
    await canvas.text(paragraphs(escapeHtml(block.instruction)), { ...inner, size: font.body })
  })

  if (block.tasks?.length) {
    canvas.advance(gap.sm)
    const width = cellWidth(canvas, 2)
    await grid(canvas, block.tasks.length, { columns: 2, cellWidth: width }, async (index, left, top) => {
      const note = await canvas.sticky({
        left,
        top,
        width,
        shape: 'rectangle',
        content: escapeHtml(block.tasks?.[index] ?? ''),
        fillColor: sticky.vocabulary,
      })
      return note.height
    })
  }
}

async function renderSummary(canvas: Canvas, block: SummaryBlock, title: string): Promise<void> {
  await section(canvas, title)
  await card(canvas, { fillColor: color.formulaFill, borderColor: color.formulaBorder }, async (inner) => {
    await canvas.text(bullets(block.points), inner)
  })
}

async function renderHomework(canvas: Canvas, block: HomeworkBlock, title: string): Promise<void> {
  await section(canvas, title)
  const width = cellWidth(canvas, 2)

  await grid(canvas, block.items.length, { columns: 2, cellWidth: width }, async (index, left, top) => {
    const note = await canvas.sticky({
      left,
      top,
      width,
      shape: 'rectangle',
      content: escapeHtml(block.items[index] ?? ''),
      fillColor: sticky.homework,
    })
    return note.height
  })
}

// ---------------------------------------------------------------------------
// Физика
// ---------------------------------------------------------------------------

async function renderFormulas(canvas: Canvas, block: FormulasBlock, title: string): Promise<void> {
  await section(canvas, title)

  await rows(canvas, block.items.length, 2, async (index, column) => {
    const formula = block.items[index]
    if (!formula) return

    await card(column, { fillColor: color.formulaFill, borderColor: color.formulaBorder }, async (inner) => {
      // Моноширинный шрифт: в «I = U / R» важно, чтобы знаки не слипались.
      await column.text(bold(formula.plain), {
        ...inner,
        size: font.formula,
        fontFamily: 'roboto_mono',
        align: 'center',
        gapAfter: gap.xs,
      })
      await column.text(paragraphs(escapeHtml(formula.description)), { ...inner, size: font.small })
      if (formula.variables?.length) {
        column.advance(gap.xs)
        await column.text(bullets(formula.variables), { ...inner, size: font.small, color: color.muted })
      }
    })
  })
}

async function renderExample(canvas: Canvas, block: ExampleBlock, title: string): Promise<void> {
  await section(canvas, title)

  await card(canvas, { fillColor: color.exampleFill, borderColor: color.exampleBorder }, async (inner) => {
    await canvas.text(paragraphs(escapeHtml(block.statement)), { ...inner, size: font.cardTitle, gapAfter: gap.md })

    await canvas.text(bold('Дано'), { ...inner, size: font.body, gapAfter: gap.xs })
    await canvas.text(bullets(block.given), { ...inner, gapAfter: gap.md })

    await canvas.text(bold('Решение'), { ...inner, size: font.body, gapAfter: gap.xs })
    await canvas.text(numbered(block.steps), { ...inner, gapAfter: gap.md })

    await canvas.text(`${bold('Ответ:')} ${escapeHtml(block.answer)}`, { ...inner, size: font.cardTitle })
  })
}

async function renderTasks(canvas: Canvas, block: TasksBlock, title: string): Promise<void> {
  await section(canvas, title)
  const width = cellWidth(canvas, 3)

  await grid(canvas, block.items.length, { columns: 3, cellWidth: width }, async (index, left, top) => {
    const task = block.items[index]
    if (!task) return 0

    const fill =
      task.difficulty === 'easy'
        ? sticky.taskEasy
        : task.difficulty === 'hard'
          ? sticky.taskHard
          : sticky.taskMedium

    const note = await canvas.sticky({
      left,
      top,
      width,
      shape: 'rectangle',
      align: 'left',
      alignVertical: 'top',
      fillColor: fill,
      content: paragraphs(bold(task.ref.toUpperCase()), escapeHtml(task.statement)),
    })
    return note.height
  })

  // Подсказки идут отдельным рядом под задачами: репетитор открывает их,
  // только если ученик застрял, поэтому они не должны быть на виду.
  const hints = block.items.filter((task) => task.hint)
  if (hints.length > 0) {
    canvas.advance(gap.md)
    await card(canvas, { fillColor: '#f7f8fa' }, async (inner) => {
      await canvas.text(bold('Подсказки'), { ...inner, size: font.cardTitle, gapAfter: gap.xs })
      await canvas.text(
        bullets(hints.map((task) => `${task.ref.toUpperCase()}: ${task.hint ?? ''}`)),
        { ...inner, size: font.small, color: color.muted },
      )
    })
  }
}

// ---------------------------------------------------------------------------
// Английский
// ---------------------------------------------------------------------------

async function renderVocabulary(canvas: Canvas, block: VocabularyBlock, title: string): Promise<void> {
  await section(canvas, title)

  await rows(canvas, block.items.length, 3, async (index, column) => {
    const entry = block.items[index]
    if (!entry) return

    await card(column, { fillColor: '#eef6ff', borderColor: '#bcd9f7' }, async (inner) => {
      const head = entry.transcription
        ? `${bold(entry.term)} <span>${escapeHtml(entry.transcription)}</span>`
        : bold(entry.term)
      await column.text(head, { ...inner, size: font.cardTitle, gapAfter: gap.xs })
      await column.text(escapeHtml(entry.translation), { ...inner, color: color.muted, gapAfter: gap.xs })
      await column.text(`<em>${escapeHtml(entry.example)}</em>`, { ...inner, size: font.small })
    })
  })
}

async function renderGrammar(canvas: Canvas, block: GrammarBlock, title: string): Promise<void> {
  await section(canvas, title)

  await card(canvas, { fillColor: color.theoryFill, borderColor: color.theoryBorder }, async (inner) => {
    await canvas.text(paragraphs(escapeHtml(block.rule)), { ...inner, size: font.cardTitle })
  })

  if (block.table) {
    canvas.advance(gap.md)
    await renderTable(canvas, block.table.headers, block.table.rows)
  }

  if (block.examples.length > 0) {
    canvas.advance(gap.md)
    await canvas.text(bullets(block.examples), { size: font.body })
  }

  if (block.commonMistakes?.length) {
    canvas.advance(gap.md)
    await card(canvas, { fillColor: color.answersFill, borderColor: color.answersBorder }, async (inner) => {
      await canvas.text(bold('Типичные ошибки'), { ...inner, size: font.cardTitle, gapAfter: gap.xs })
      await canvas.text(bullets(block.commonMistakes ?? []), { ...inner, size: font.small })
    })
  }
}

/** Таблица собирается из прямоугольников: отдельного примитива таблицы в SDK нет. */
async function renderTable(canvas: Canvas, headers: string[], tableRows: string[][]): Promise<void> {
  if (headers.length === 0) return

  const columnCount = headers.length
  const width = canvas.width / columnCount
  const rowHeight = 68

  await Promise.all(
    headers.map((header, index) =>
      canvas.shape({
        left: canvas.left + index * width,
        top: canvas.top,
        width,
        height: rowHeight,
        shape: 'rectangle',
        content: bold(header),
        fillColor: color.accent,
        textColor: '#ffffff',
        fontSize: font.small,
        flow: false,
      }),
    ),
  )
  canvas.advance(rowHeight)

  for (const row of tableRows) {
    const top = canvas.top
    await Promise.all(
      Array.from({ length: columnCount }, (_, index) =>
        canvas.shape({
          left: canvas.left + index * width,
          top,
          width,
          height: rowHeight,
          shape: 'rectangle',
          content: escapeHtml(row[index] ?? ''),
          fillColor: '#ffffff',
          borderColor: color.divider,
          borderWidth: 2,
          fontSize: font.small,
          flow: false,
        }),
      ),
    )
    canvas.advance(rowHeight)
  }
}

async function renderSpeaking(canvas: Canvas, block: SpeakingBlock, title: string): Promise<void> {
  await section(canvas, title)
  const width = cellWidth(canvas, 2)

  await grid(canvas, block.prompts.length, { columns: 2, cellWidth: width }, async (index, left, top) => {
    const note = await canvas.sticky({
      left,
      top,
      width,
      shape: 'rectangle',
      content: escapeHtml(block.prompts[index] ?? ''),
      fillColor: sticky.speaking,
    })
    return note.height
  })
}

// ---------------------------------------------------------------------------
// Интерактивные задания
// ---------------------------------------------------------------------------

/**
 * Пул перетаскиваемых карточек под заданием. Порядок перемешан.
 *
 * `label` — то, что видит ученик, `value` — то, с чем сверяется зона. Обычно
 * они совпадают, но в сортировке на карточке написан элемент, а правильным
 * ответом считается название группы, куда он должен лечь.
 */
async function renderChipPool(
  canvas: Canvas,
  exercise: string,
  chips: { label: string; value: string }[],
  caption: string,
): Promise<ChipRecord[]> {
  canvas.advance(gap.md)
  await canvas.text(bold(caption), {
    size: font.small,
    color: color.muted,
    gapAfter: gap.xs,
  })

  const perRow = Math.max(1, Math.floor(canvas.width / (size.chipWidth + gap.sm)))
  const records: ChipRecord[] = []

  await grid(canvas, chips.length, { columns: perRow, cellWidth: size.chipWidth }, async (index, left, top) => {
    const chip = chips[index]
    if (!chip) return 0

    const note = await canvas.sticky({
      left,
      top,
      width: size.chipWidth,
      shape: 'rectangle',
      content: escapeHtml(chip.label),
      fillColor: sticky.draggable,
    })
    await tagItem(note, { role: 'chip', exercise, value: chip.value })
    // Координаты запоминаем до упаковки во фрейм — сейчас они ещё в системе
    // доски, а у ребёнка фрейма будут отсчитываться от него.
    records.push({ id: note.id, value: chip.value, homeX: note.x, homeY: note.y })
    return note.height
  })

  return records
}

async function renderMatching(canvas: Canvas, block: MatchingBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const labelWidth = canvas.width * 0.45
  const zoneLeft = canvas.left + labelWidth + gap.sm
  const zoneWidth = canvas.width - labelWidth - gap.sm
  const zones: ZoneRecord[] = []

  for (const pair of block.pairs) {
    const top = canvas.top
    const height = size.dropZoneHeight

    const [, zone] = await Promise.all([
      canvas.shape({
        left: canvas.left,
        top,
        width: labelWidth,
        height,
        content: escapeHtml(pair.left),
        fillColor: color.theoryFill,
        borderColor: color.theoryBorder,
        align: 'left',
        fontSize: font.body,
        flow: false,
      }),
      dropZone(canvas, { left: zoneLeft, top, width: zoneWidth, height }),
    ])

    await tagItem(zone, { role: 'zone', exercise: block.ref, expected: pair.right })
    zones.push({ id: zone.id, expected: pair.right })
    canvas.top = top + height + gap.sm
  }

  const chips = await renderChipPool(
    canvas,
    block.ref,
    shuffle(block.pairs.map((pair) => ({ label: pair.right, value: pair.right }))),
    'Карточки — перетащи к нужной паре',
  )

  canvas.exercises.push({ ref: block.ref, title, zones, chips })
}

async function renderSorting(canvas: Canvas, block: SortingBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const groupCount = block.groups.length
  if (groupCount === 0) return

  const groupWidth = cellWidth(canvas, groupCount)
  const headerHeight = 68
  // Зона под группу растёт вместе с числом карточек, которые в неё лягут.
  const maxItems = Math.max(...block.groups.map((group) => group.items.length))
  const zoneHeight = Math.max(240, maxItems * (size.chipHeight + gap.xs) + gap.md)
  const top = canvas.top

  const zones = await Promise.all(
    block.groups.map(async (group, index) => {
      const left = canvas.left + index * (groupWidth + gap.sm)

      await canvas.shape({
        left,
        top,
        width: groupWidth,
        height: headerHeight,
        content: bold(group.name),
        fillColor: color.accent,
        textColor: '#ffffff',
        fontSize: font.cardTitle,
        flow: false,
      })

      const zone = await dropZone(canvas, {
        left,
        top: top + headerHeight + gap.xs,
        width: groupWidth,
        height: zoneHeight,
      })
      await tagItem(zone, { role: 'zone', exercise: block.ref, expected: group.name })
      return { id: zone.id, expected: group.name }
    }),
  )

  canvas.top = top + headerHeight + gap.xs + zoneHeight

  // На карточке написан элемент, а правильным ответом считается название
  // группы, куда он должен лечь. Поэтому подпись и значение здесь расходятся.
  const chips = await renderChipPool(
    canvas,
    block.ref,
    shuffle(
      block.groups.flatMap((group) => group.items.map((item) => ({ label: item, value: group.name }))),
    ),
    'Карточки — перетащи в нужную группу',
  )

  canvas.exercises.push({ ref: block.ref, title, zones, chips })
}

async function renderGapFill(canvas: Canvas, block: GapFillBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const textWidth = canvas.width * 0.55
  const zonesLeft = canvas.left + textWidth + gap.md
  const zonesWidth = canvas.width - textWidth - gap.md
  const zoneRecords: ZoneRecord[] = []

  for (const [index, sentence] of block.sentences.entries()) {
    const top = canvas.top
    const gapCount = sentence.text.split(GAP_MARKER).length - 1
    const slots = Math.max(gapCount, sentence.answers.length)

    const line = await canvas.text(`${index + 1}. ${escapeHtml(sentence.text)}`, {
      top,
      width: textWidth,
      flow: false,
    })

    const zoneWidth = slots > 0 ? (zonesWidth - gap.sm * (slots - 1)) / slots : zonesWidth
    const zones = await Promise.all(
      Array.from({ length: slots }, (_, slot) =>
        dropZone(canvas, {
          left: zonesLeft + slot * (zoneWidth + gap.sm),
          top,
          width: zoneWidth,
          height: size.dropZoneHeight,
        }),
      ),
    )

    await Promise.all(
      zones.map((zone, slot) => {
        const expected = sentence.answers[slot] ?? ''
        zoneRecords.push({ id: zone.id, expected })
        return tagItem(zone, { role: 'zone', exercise: block.ref, expected })
      }),
    )

    canvas.top = top + Math.max(line.height, size.dropZoneHeight) + gap.sm
  }

  // Лишние варианты нужны, чтобы задание нельзя было решить методом исключения.
  // В проверке они ведут себя сами собой: ни одна зона их не ждёт, поэтому
  // положенная в пропуск лишняя карточка окажется ошибкой.
  const answers = block.sentences.flatMap((sentence) => sentence.answers)
  const chips = await renderChipPool(
    canvas,
    block.ref,
    shuffle([...answers, ...(block.distractors ?? [])].map((value) => ({ label: value, value }))),
    'Карточки — перетащи в пропуск',
  )

  canvas.exercises.push({ ref: block.ref, title, zones: zoneRecords, chips })
}

// ---------------------------------------------------------------------------
// Приёмы оформления
//
// Всё, что ниже, — те же зоны и карточки, но собранные так, как их собирают
// руками: карточки лежат в коробке, а не в ряду под заданием; пара сходится
// в целый предмет; вопрос выезжает из-под подноса; слово проступает в луче
// фонаря. Механика проверки от этого не меняется — она по-прежнему сверяет
// текст карточки с текстом зоны, — а урок перестаёт выглядеть как анкета.
// ---------------------------------------------------------------------------

/**
 * Волшебная коробка.
 *
 * Карточки лежат внутри нарисованной коробки, под ней — слоты для сборки
 * фразы. Крышка стоит рядом приоткрытой: задание начинается с того, что её
 * отодвигают, и этот момент стоит дороже любого оформления слотов.
 */
async function renderMysteryBox(canvas: Canvas, block: MysteryBoxBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const words = shuffle([...block.slots, ...(block.distractors ?? [])])
  const perRow = Math.max(1, Math.floor((canvas.width * 0.62) / (size.chipWidth + gap.sm)))
  const boxRows = Math.ceil(words.length / perRow)

  const boxWidth = perRow * size.chipWidth + (perRow + 1) * gap.sm
  const boxHeight = boxRows * (size.chipHeight + gap.sm) + gap.sm + 70
  const boxTop = canvas.top
  const boxLeft = canvas.left

  // Коробка — подложка: карточки должны лежать поверх неё, иначе их не видно.
  await canvas.backdrop(
    { left: boxLeft, top: boxTop, width: boxWidth, height: boxHeight },
    { fillColor: color.boxFill, borderColor: color.boxBorder },
  )

  // Крышка сдвинута вбок и повёрнута — «коробку только что открыли».
  await canvas.shape({
    left: boxLeft + boxWidth + gap.md,
    top: boxTop + boxHeight * 0.18,
    width: Math.min(canvas.width - boxWidth - gap.md, boxWidth * 0.5),
    height: 90,
    shape: 'round_rectangle',
    content: bold(block.boxLabel ?? 'крышка'),
    fillColor: color.boxLidFill,
    borderColor: color.boxBorder,
    fontSize: font.small,
    flow: false,
  })

  const chips: ChipRecord[] = []
  for (const [index, word] of words.entries()) {
    const row = Math.floor(index / perRow)
    const column = index % perRow
    const note = await canvas.sticky({
      left: boxLeft + gap.sm + column * (size.chipWidth + gap.sm),
      top: boxTop + 60 + row * (size.chipHeight + gap.sm),
      width: size.chipWidth,
      shape: 'rectangle',
      content: escapeHtml(word),
      fillColor: sticky.draggable,
    })
    await tagItem(note, { role: 'chip', exercise: block.ref, value: word })
    chips.push({ id: note.id, value: word, homeX: note.x, homeY: note.y })
  }

  canvas.top = boxTop + boxHeight + gap.md

  // Слоты для сборки: по одному на слово, в правильном порядке.
  const slotWidth = Math.min(
    size.dropZoneWidth,
    (canvas.width - gap.sm * (block.slots.length - 1)) / Math.max(1, block.slots.length),
  )
  const slotsTop = canvas.top
  const zones: ZoneRecord[] = []

  for (const [index, expected] of block.slots.entries()) {
    const zone = await dropZone(canvas, {
      left: canvas.left + index * (slotWidth + gap.sm),
      top: slotsTop,
      width: slotWidth,
      height: size.dropZoneHeight,
    })
    await tagItem(zone, { role: 'zone', exercise: block.ref, expected })
    zones.push({ id: zone.id, expected })
  }

  canvas.top = slotsTop + size.dropZoneHeight + gap.sm
  canvas.exercises.push({ ref: block.ref, title, zones, chips })
}

/**
 * Половинки.
 *
 * Слева — начало фразы с половинкой предмета на правом краю, справа — зона,
 * где ждут вторую половинку. Когда карточка встаёт на место, предмет
 * срастается, и ученик видит это раньше, чем скажет учитель.
 */
async function renderHalves(canvas: Canvas, block: HalvesBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const labelWidth = canvas.width * 0.42
  const zoneLeft = canvas.left + labelWidth + size.halfDiameter + gap.sm
  const zoneWidth = canvas.width - labelWidth - size.halfDiameter - gap.sm
  const zones: ZoneRecord[] = []

  for (const pair of block.pairs) {
    const top = canvas.top
    const height = size.dropZoneHeight

    await canvas.shape({
      left: canvas.left,
      top,
      width: labelWidth,
      height,
      content: escapeHtml(pair.left),
      fillColor: color.theoryFill,
      borderColor: color.theoryBorder,
      align: 'left',
      fontSize: font.body,
      flow: false,
    })

    // Кружок лежит на среднем слое ровно в стыке: карточки накрывают его
    // краями, и целым он выглядит только когда пара сошлась.
    await canvas.midground({
      left: canvas.left + labelWidth - size.halfDiameter / 2,
      top: top + (height - size.halfDiameter) / 2,
      width: size.halfDiameter,
      height: size.halfDiameter,
      shape: 'circle',
      fillColor: color.halfFill,
      borderColor: color.halfBorder,
      flow: false,
    })

    const zone = await dropZone(canvas, { left: zoneLeft, top, width: zoneWidth, height })
    await tagItem(zone, { role: 'zone', exercise: block.ref, expected: pair.right })
    zones.push({ id: zone.id, expected: pair.right })
    canvas.top = top + height + gap.sm
  }

  const chips = await renderChipPool(
    canvas,
    block.ref,
    shuffle(block.pairs.map((pair) => ({ label: pair.right, value: pair.right }))),
    'Вторые половинки — перетащи к своей паре',
  )

  canvas.exercises.push({ ref: block.ref, title, zones, chips })
}

/**
 * Предмет-тянучка.
 *
 * Вопросы лежат под подносом и не видны, предметы — поверх подноса. Предмет
 * и его вопрос связаны в группу, поэтому вопрос выезжает следом за предметом.
 * Ученик тянет наугад — и в этом весь смысл: вопрос достаётся, а не выбирается.
 */
async function renderPullOut(canvas: Canvas, block: PullOutBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.md })

  const count = block.questions.length
  if (count === 0) return

  const trayTop = canvas.top
  const trayHeight = size.trayHeight
  const perRow = Math.max(1, Math.min(count, Math.floor(canvas.width / (size.pullItem + gap.md))))
  const step = canvas.width / perRow

  // Вопросы кладём первыми и в подложку: всё, что окажется под подносом,
  // ученик увидит только когда вытянет.
  const hidden: Shape[] = []
  for (const [index, question] of block.questions.entries()) {
    const column = index % perRow
    const row = Math.floor(index / perRow)
    const centerX = canvas.left + step * column + step / 2
    const top = trayTop + gap.sm + row * (size.pullItem + gap.sm)

    const card = await canvas.backdrop(
      {
        left: centerX - size.pullQuestionWidth / 2,
        top: top + size.pullItem / 2 - 40,
        width: size.pullQuestionWidth,
        height: 150,
      },
      { fillColor: color.theoryFill, borderColor: color.theoryBorder },
    )
    card.content = escapeHtml(question)
    card.style.fontSize = font.small
    card.style.textAlign = 'center'
    await card.sync()

    hidden.push(card)
  }

  // Поднос — средний слой: он выше спрятанных вопросов, но ниже предметов.
  const trayRows = Math.ceil(count / perRow)
  await canvas.midground({
    left: canvas.left,
    top: trayTop,
    width: canvas.width,
    height: trayHeight + (trayRows - 1) * (size.pullItem + gap.sm),
    shape: 'round_rectangle',
    content: block.trayLabel ? bold(block.trayLabel) : '',
    fillColor: color.trayFill,
    borderColor: color.trayBorder,
    fontSize: font.small,
    alignVertical: 'bottom',
    flow: false,
  })

  for (const [index, question] of hidden.entries()) {
    const column = index % perRow
    const row = Math.floor(index / perRow)
    const centerX = canvas.left + step * column + step / 2
    const top = trayTop + gap.sm + row * (size.pullItem + gap.sm)

    const item = await canvas.shape({
      left: centerX - size.pullItem / 2,
      top,
      width: size.pullItem,
      height: size.pullItem,
      shape: 'circle',
      content: block.itemEmoji
        ? `<span style="font-size:48px">${escapeHtml(block.itemEmoji)}</span>`
        : bold(String(index + 1)),
      fillColor: color.exampleFill,
      borderColor: color.exampleBorder,
      flow: false,
    })

    // Группа связывает предмет с его вопросом: тянут за предмет, едут оба.
    // Слои при этом остаются прежними — вопрос по-прежнему под подносом,
    // пока группу не сдвинут.
    try {
      await miro.board.group({ items: [item, question] })
    } catch {
      // Группировка — удобство, а не условие работы приёма: без неё вопрос
      // просто вытягивают отдельным движением.
    }
  }

  canvas.top = trayTop + trayHeight + (trayRows - 1) * (size.pullItem + gap.sm) + gap.md
}

/**
 * Фонарик.
 *
 * Слова написаны цветом темноты и потому невидимы, светлое пятно фонаря
 * лежит между темнотой и словами. Ученик водит пятном — и слова проступают
 * там, где оно оказалось.
 */
async function renderFlashlight(canvas: Canvas, block: FlashlightBlock, title: string): Promise<void> {
  await section(canvas, title)
  await canvas.text(paragraphs(escapeHtml(block.instruction)), { color: color.muted, gapAfter: gap.xs })
  if (block.hunt) {
    await canvas.text(bold(block.hunt), { size: font.small, color: color.muted, gapAfter: gap.md })
  }

  const words = block.words
  if (words.length === 0) return

  const perRow = Math.max(1, Math.min(words.length, Math.floor(canvas.width / (size.chipWidth + gap.md))))
  const rowCount = Math.ceil(words.length / perRow)
  const rowHeight = 130
  const darkTop = canvas.top
  const darkHeight = rowCount * rowHeight + gap.md * 2

  await canvas.backdrop(
    { left: canvas.left, top: darkTop, width: canvas.width, height: darkHeight },
    { fillColor: color.darkFill, borderColor: color.darkFill },
  )

  // Пятно света — средний слой. Стоит в углу: ученик сам двигает его по темноте.
  await canvas.midground({
    left: canvas.left + gap.md,
    top: darkTop + gap.md,
    width: size.lightSpot,
    height: size.lightSpot,
    shape: 'circle',
    fillColor: color.lightSpot,
    borderColor: color.lightSpot,
    flow: false,
  })

  // Слова — цветом темноты, поверх всего. Порядок внутри строк перемешан,
  // чтобы искать приходилось глазами, а не по памяти о списке.
  const scattered = shuffle(words)
  const step = canvas.width / perRow
  for (const [index, word] of scattered.entries()) {
    const column = index % perRow
    const row = Math.floor(index / perRow)
    await canvas.text(escapeHtml(word), {
      left: canvas.left + step * column + gap.sm,
      top: darkTop + gap.md + row * rowHeight + (row % 2 === 0 ? 0 : 30),
      width: step - gap.sm * 2,
      size: font.body,
      color: color.darkFill,
      align: 'center',
      flow: false,
    })
  }

  canvas.top = darkTop + darkHeight + gap.md
}
