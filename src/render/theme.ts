/**
 * Единственное место, где заданы размеры, отступы и цвета урока.
 * Рендереры блоков не содержат «магических чисел» — всё берётся отсюда,
 * поэтому вид всех уроков можно поменять правкой одного файла.
 */

/** Ширина колонки урока в пикселях доски. */
export const CONTENT_WIDTH = 1680

/** Внутренний отступ фрейма урока от его содержимого. */
export const FRAME_PADDING = 80

export const gap = {
  /** Между строками внутри одной карточки. */
  xs: 10,
  /** Между соседними карточками в сетке. */
  sm: 20,
  /** Между заголовком секции и её содержимым. */
  md: 32,
  /** Между секциями. */
  lg: 72,
} as const

/**
 * Кегли подобраны под ширину урока в 1680 пикселей и под то, что во время
 * занятия доска смотрится в сильном уменьшении. Мелкий текст на такой ширине
 * даёт полторы сотни символов в строке и не читается, поэтому шкала заметно
 * крупнее привычной экранной.
 */
export const font = {
  lessonTitle: 64,
  lessonSubtitle: 28,
  sectionTitle: 44,
  cardTitle: 32,
  body: 30,
  small: 24,
  formula: 40,
  sticky: 22,
} as const

/** Шрифт с поддержкой кириллицы из списка, который принимает Miro. */
export const FONT_FAMILY = 'open_sans'

export const color = {
  ink: '#12151a',
  muted: '#6b7280',
  accent: '#4262ff',
  /** Фон карточек с теорией. */
  theoryFill: '#f2f5ff',
  theoryBorder: '#c9d4ff',
  /** Фон карточек с формулами. */
  formulaFill: '#eefaf3',
  formulaBorder: '#a8e0c2',
  /** Фон блока с разбором примера. */
  exampleFill: '#fff8e6',
  exampleBorder: '#f5d98b',
  /** Зоны, куда ученик перетаскивает карточки. */
  dropZoneFill: '#ffffff',
  dropZoneBorder: '#9aa5b8',
  /** Блок ответов для преподавателя. */
  answersFill: '#fdeeee',
  answersBorder: '#f0b4b4',
  /** Фон фрейма урока. */
  frameFill: '#ffffff',
  divider: '#e3e6ec',
} as const

/** Цвета стикеров из палитры Miro (произвольный hex стикеры не принимают). */
export const sticky = {
  task: 'light_yellow',
  taskEasy: 'light_green',
  taskMedium: 'light_yellow',
  taskHard: 'light_pink',
  vocabulary: 'light_blue',
  draggable: 'yellow',
  homework: 'light_green',
  speaking: 'violet',
} as const

/** Размеры типовых элементов. */
export const size = {
  /** Квадратный стикер в сетке заданий. */
  stickyWidth: 260,
  /** Карточка слова: шире, потому что в ней три строки. */
  vocabCardWidth: 390,
  vocabCardHeight: 210,
  /** Перетаскиваемая карточка в интерактивных заданиях. */
  chipWidth: 240,
  chipHeight: 80,
  /** Зона, в которую кладут карточку. */
  dropZoneWidth: 260,
  dropZoneHeight: 100,
  /**
   * Толщина линии-разделителя между секциями.
   * Miro отказывается создавать объекты ниже 8 пикселей, поэтому тоньше нельзя:
   * на ширине урока в 1680 пикселей это всё равно читается как тонкая линия.
   */
  dividerHeight: 8,
} as const

/** Насколько далеко вправо от урока уезжает блок с ответами. */
export const ANSWERS_OFFSET_X = CONTENT_WIDTH + 400
