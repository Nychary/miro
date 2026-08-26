import type { StickyNoteColorType } from '@mirohq/websdk-types'

/**
 * Единственное место, где заданы размеры, отступы и цвета урока.
 * Рендереры блоков не содержат «магических чисел» — всё берётся отсюда.
 *
 * Цвета и стикеры — темируемые: репетитор пишет в форме «Гарри Поттер» или
 * «Космос», нейросеть возвращает название стиля в meta.style, и перед
 * отрисовкой applyStyle() подменяет палитру. Формулировки в стиле — забота
 * нейросети (см. промпт), палитра — наша.
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

// ---------------------------------------------------------------------------
// Палитра
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = {
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
  /** Подсветка зон после проверки. */
  correctFill: '#eefaf3',
  correctBorder: '#2f9e63',
  wrongFill: '#fdeeee',
  wrongBorder: '#d64545',
  /** Фон фрейма урока. */
  frameFill: '#ffffff',
  divider: '#e3e6ec',
  /** Коробка с карточками и её крышка. */
  boxFill: '#c98b4b',
  boxBorder: '#9c6a34',
  boxLidFill: '#e0a566',
  /** Половинка предмета, срастающаяся при верной паре. */
  halfFill: '#f2b3c8',
  halfBorder: '#d97ba1',
  /** Поднос, из-под которого вытягивают вопрос. */
  trayFill: '#dfe6f5',
  trayBorder: '#a9b8d8',
  /**
   * Темнота для фонарика и пятно света.
   *
   * Слова пишутся ровно цветом `darkFill`, поэтому на подложке их не видно —
   * проявляются они только над светлым пятном.
   */
  darkFill: '#232a3a',
  lightSpot: '#ffe9a8',
}

/** Цвета стикеров из палитры Miro (произвольный hex стикеры не принимают). */
const DEFAULT_STICKY: Record<StickyKey, StickyNoteColorType> = {
  task: 'light_yellow',
  taskEasy: 'light_green',
  taskMedium: 'light_yellow',
  taskHard: 'light_pink',
  vocabulary: 'light_blue',
  draggable: 'yellow',
  homework: 'light_green',
  speaking: 'violet',
  reflection1: 'light_green',
  reflection2: 'light_pink',
  reflection3: 'light_blue',
}

type ColorTheme = typeof DEFAULT_COLOR
type StickyKey =
  | 'task'
  | 'taskEasy'
  | 'taskMedium'
  | 'taskHard'
  | 'vocabulary'
  | 'draggable'
  | 'homework'
  | 'speaking'
  | 'reflection1'
  | 'reflection2'
  | 'reflection3'

/**
 * Живые объекты палитры. Блоки читают их свойства в момент отрисовки,
 * поэтому подмена значений перед рендером перекрашивает весь урок.
 * Уроки рисуются строго по одному, гонок здесь нет.
 */
export const color: ColorTheme = { ...DEFAULT_COLOR }
export const sticky: Record<StickyKey, StickyNoteColorType> = { ...DEFAULT_STICKY }

// ---------------------------------------------------------------------------
// Стили оформления
// ---------------------------------------------------------------------------

interface StylePreset {
  /** Подстроки, по которым стиль узнаётся в свободном тексте. */
  keys: string[]
  color: Partial<ColorTheme>
  sticky: Partial<Record<StickyKey, StickyNoteColorType>>
}

const PRESETS: Record<string, StylePreset> = {
  barbie: {
    keys: ['барби', 'barbie', 'розов'],
    color: {
      accent: '#e0218a',
      theoryFill: '#ffe9f4',
      theoryBorder: '#f5a8cd',
      formulaFill: '#fff3e0',
      formulaBorder: '#e8c36a',
      exampleFill: '#fff0f7',
      exampleBorder: '#eba8c9',
      frameFill: '#fffafd',
      divider: '#f3d9e7',
    },
    sticky: {
      draggable: 'light_pink',
      speaking: 'pink',
      vocabulary: 'light_pink',
      homework: 'yellow',
      taskEasy: 'light_pink',
      taskMedium: 'pink',
      taskHard: 'violet',
    },
  },
  potter: {
    keys: ['поттер', 'хогвартс', 'potter', 'hogwarts', 'магия', 'волшеб'],
    color: {
      accent: '#740001',
      theoryFill: '#f7efdd',
      theoryBorder: '#c9b37e',
      formulaFill: '#e9f0e9',
      formulaBorder: '#7ba088',
      exampleFill: '#fdf3d0',
      exampleBorder: '#d9b23c',
      frameFill: '#fbf7ec',
      divider: '#ddd0b0',
    },
    sticky: {
      draggable: 'yellow',
      speaking: 'orange',
      vocabulary: 'light_blue',
      homework: 'green',
      taskEasy: 'yellow',
      taskMedium: 'light_blue',
      taskHard: 'red',
    },
  },
  minecraft: {
    keys: ['майнкрафт', 'minecraft', 'пиксел'],
    color: {
      accent: '#3c8527',
      theoryFill: '#eaf4e2',
      theoryBorder: '#94c47d',
      formulaFill: '#efe6d5',
      formulaBorder: '#a1887f',
      exampleFill: '#f3efdf',
      exampleBorder: '#c2a878',
      frameFill: '#f6faf2',
      divider: '#d5e3c8',
    },
    sticky: {
      draggable: 'light_green',
      speaking: 'green',
      vocabulary: 'light_green',
      homework: 'light_yellow',
      taskEasy: 'light_green',
      taskMedium: 'green',
      taskHard: 'orange',
    },
  },
  space: {
    keys: ['космос', 'space', 'галактик', 'звёзд', 'звезд'],
    color: {
      ink: '#eef1ff',
      muted: '#a7b0d8',
      accent: '#8c9bff',
      theoryFill: '#232b52',
      theoryBorder: '#4a5590',
      formulaFill: '#1e2a4a',
      formulaBorder: '#3d5a80',
      exampleFill: '#2a2440',
      exampleBorder: '#6c5b9e',
      dropZoneFill: '#1c2340',
      dropZoneBorder: '#5560a0',
      answersFill: '#3a2030',
      answersBorder: '#8a4a5a',
      correctFill: '#1d3a2c',
      wrongFill: '#3a2028',
      frameFill: '#141a38',
      divider: '#333c6b',
    },
    sticky: {
      draggable: 'yellow',
      speaking: 'violet',
      vocabulary: 'blue',
      homework: 'dark_blue',
      taskEasy: 'blue',
      taskMedium: 'violet',
      taskHard: 'dark_blue',
    },
  },
  detective: {
    keys: ['детектив', 'detective', 'шерлок', 'sherlock', 'нуар'],
    color: {
      accent: '#1f1f1f',
      theoryFill: '#fdf6d8',
      theoryBorder: '#dfc23a',
      formulaFill: '#f2f2f0',
      formulaBorder: '#8a8a86',
      exampleFill: '#fff9e0',
      exampleBorder: '#d4b500',
      frameFill: '#fbfaf5',
      dropZoneBorder: '#6b6b66',
      divider: '#dedbc9',
    },
    sticky: {
      draggable: 'yellow',
      speaking: 'yellow',
      vocabulary: 'gray',
      homework: 'light_yellow',
      taskEasy: 'light_yellow',
      taskMedium: 'yellow',
      taskHard: 'black',
    },
  },
}

/** Названия для подсказок в форме. Свободный текст тоже принимается. */
export const STYLE_SUGGESTIONS = [
  'Придумай тему сам',
  'Барби',
  'Гарри Поттер',
  'Майнкрафт',
  'Космос',
  'Детектив',
]

/**
 * Подменяет палитру под названный стиль. Неизвестный или пустой стиль —
 * возврат к стандартной: формулировки в этом случае всё равно стилизует
 * нейросеть, просто цвета останутся обычными.
 */
export function applyStyle(styleName?: string): void {
  Object.assign(color, DEFAULT_COLOR)
  Object.assign(sticky, DEFAULT_STICKY)

  const preset = findPreset(styleName)
  if (preset) {
    Object.assign(color, preset.color)
    Object.assign(sticky, preset.sticky)
  }
}

function findPreset(styleName?: string): StylePreset | null {
  if (!styleName) return null
  const needle = styleName.trim().toLowerCase()
  if (!needle) return null

  return Object.values(PRESETS).find((preset) => preset.keys.some((key) => needle.includes(key))) ?? null
}

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
  /**
   * Зона, в которую кладут карточку. Должна быть выше самой карточки:
   * иначе карточка в зону не помещается, и на проверке попадание пришлось бы
   * определять с допуском вместо простого «лежит внутри».
   */
  dropZoneWidth: 260,
  dropZoneHeight: 140,
  /** Кружок-«половинка» в стыке пары: карточки накрывают его краями. */
  halfDiameter: 96,
  /** Предмет, который вытягивают с подноса, и высота самого подноса. */
  pullItem: 150,
  pullQuestionWidth: 460,
  trayHeight: 230,
  /** Пятно света у фонарика. */
  lightSpot: 260,
  /**
   * Толщина линии-разделителя между секциями.
   * Miro отказывается создавать объекты ниже 8 пикселей, поэтому тоньше нельзя:
   * на ширине урока в 1680 пикселей это всё равно читается как тонкая линия.
   */
  dividerHeight: 8,
} as const

/** Насколько далеко вправо от урока уезжает блок с ответами. */
export const ANSWERS_OFFSET_X = CONTENT_WIDTH + 400
