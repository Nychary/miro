/**
 * Модель урока.
 *
 * Это центральный контракт проекта: нейросеть выдаёт ровно такую структуру,
 * рендерер умеет нарисовать ровно такую структуру. Здесь нет ни координат,
 * ни цветов, ни размеров — только содержание. Всё оформление живёт в src/render.
 *
 * Правило, которое нельзя нарушать: если хочется добавить в схему поле вроде
 * `x`, `width` или `color` — значит, задача решается не здесь, а в шаблоне.
 */

export type Subject = 'physics' | 'english'

export interface LessonMeta {
  subject: Subject
  /** Тема урока так, как её сформулировал бы репетитор: «Закон Ома», «Past Simple». */
  topic: string
  /** Уровень: «8 класс», «подготовка к ОГЭ», «B1». */
  level: string
  /** Планируемая длительность в минутах — влияет на количество заданий. */
  durationMin: number
  /** Имя ученика, если урок персональный. */
  student?: string
  /** Язык подписей и пояснений на доске. */
  language: 'ru' | 'en'
  /**
   * Стиль оформления, как его назвал репетитор: «Барби», «Космос», «Детектив».
   * Нейросеть выдерживает в нём формулировки, рендерер по нему подбирает
   * палитру. Неизвестные названия допустимы — тогда палитра стандартная.
   */
  style?: string
  /**
   * Эмодзи, передающие атмосферу стиля, — их выбирает нейросеть. Рассыпаются
   * фоном по фрейму урока, поэтому декорации работают для любого стиля,
   * а не только для тех, что зашиты в палитры.
   */
  styleEmoji?: string[]
}

export interface Lesson {
  meta: LessonMeta
  blocks: Block[]
}

export type Block =
  | ObjectivesBlock
  | WarmupBlock
  | TheoryBlock
  | MindmapBlock
  | ReflectionBlock
  | FormulasBlock
  | ExampleBlock
  | TasksBlock
  | VocabularyBlock
  | GrammarBlock
  | MatchingBlock
  | SortingBlock
  | GapFillBlock
  | SpeakingBlock
  | SummaryBlock
  | HomeworkBlock
  | AnswersBlock

/** Общее для всех блоков: тип и необязательный заголовок секции. */
interface BlockBase<T extends string> {
  type: T
  /** Если не задан, рендерер подставит заголовок по умолчанию для этого типа. */
  title?: string
}

// ---------------------------------------------------------------------------
// Общие блоки
// ---------------------------------------------------------------------------

/** Чему научится ученик. Показывается в самом начале урока. */
export interface ObjectivesBlock extends BlockBase<'objectives'> {
  items: string[]
}

/** Разогрев: вопросы, с которых начинается занятие. */
export interface WarmupBlock extends BlockBase<'warmup'> {
  prompts: string[]
}

/** Теоретический блок: тезисы с необязательными пояснениями. */
export interface TheoryBlock extends BlockBase<'theory'> {
  points: TheoryPoint[]
}

export interface TheoryPoint {
  /** Короткий тезис — то, что должно отпечататься в памяти. */
  heading: string
  /** Развёрнутое пояснение на 1–3 предложения. */
  body: string
}

/**
 * Интеллект-карта нового материала: центральное понятие и ветки-кластеры.
 * На доске рисуется центром с расходящимися карточками и соединительными
 * линиями — формат «Упражнение 2: новый материал» из плана репетитора.
 */
export interface MindmapBlock extends BlockBase<'mindmap'> {
  /** Центральное понятие: «Закон Ома», «Past Simple». */
  center: string
  branches: MindmapBranch[]
}

export interface MindmapBranch {
  label: string
  /** Тезисы ветки: 1–4 коротких пункта. */
  children: string[]
}

/**
 * Рефлексия в конце урока: колонки, в которые ученик пишет на пустых
 * стикерах, что было легко, что сложно и что хочется узнать.
 */
export interface ReflectionBlock extends BlockBase<'reflection'> {
  /** Подписи колонок. Если не заданы, берутся стандартные три. */
  prompts?: string[]
}

export const REFLECTION_DEFAULT_PROMPTS = ['Было легко', 'Было сложно', 'Хочу узнать больше']

/** Итог урока: что усвоили. */
export interface SummaryBlock extends BlockBase<'summary'> {
  points: string[]
}

/** Домашнее задание. */
export interface HomeworkBlock extends BlockBase<'homework'> {
  items: string[]
}

/**
 * Ответы к заданиям урока. Рендерятся в стороне от рабочей области,
 * чтобы ученик не видел их до того, как решит сам.
 */
export interface AnswersBlock extends BlockBase<'answers'> {
  items: AnswerEntry[]
}

export interface AnswerEntry {
  /** Ссылка на задание: его `ref` из TasksBlock, GapFillBlock и т.п. */
  ref: string
  answer: string
  /** Ход решения, если ответ требует пояснения. */
  solution?: string
}

// ---------------------------------------------------------------------------
// Физика
// ---------------------------------------------------------------------------

/** Формулы темы. */
export interface FormulasBlock extends BlockBase<'formulas'> {
  items: FormulaEntry[]
}

export interface FormulaEntry {
  /**
   * Формула в LaTeX — используется на этапе, когда подключим рендер в картинку.
   * До этого момента на доску идёт `plain`.
   */
  latex?: string
  /** Текстовая запись формулы юникодом: «I = U / R», «Δp = F·Δt». */
  plain: string
  /** Что означает формула и когда применяется. */
  description: string
  /** Расшифровка обозначений: «I — сила тока, А». */
  variables?: string[]
}

/** Разбор образцовой задачи: то, что репетитор решает вместе с учеником. */
export interface ExampleBlock extends BlockBase<'example'> {
  statement: string
  /** Дано: «U = 12 В», «R = 4 Ом». */
  given: string[]
  /** Шаги решения по одному на элемент. */
  steps: string[]
  answer: string
}

/** Задачи для самостоятельного решения. */
export interface TasksBlock extends BlockBase<'tasks'> {
  items: TaskEntry[]
}

export interface TaskEntry {
  /** Короткий идентификатор для связи с ответами: «t1», «t2». */
  ref: string
  statement: string
  /** Подсказка, которую репетитор открывает, если ученик застрял. */
  hint?: string
  /** Сложность влияет на цвет карточки на доске. */
  difficulty?: 'easy' | 'medium' | 'hard'
}

// ---------------------------------------------------------------------------
// Английский
// ---------------------------------------------------------------------------

/** Лексика урока. */
export interface VocabularyBlock extends BlockBase<'vocabulary'> {
  items: VocabularyEntry[]
}

export interface VocabularyEntry {
  term: string
  translation: string
  /** Пример употребления — предложение целиком. */
  example: string
  /** Транскрипция, если произношение неочевидно. */
  transcription?: string
  partOfSpeech?: string
}

/** Грамматическое правило с таблицей форм и примерами. */
export interface GrammarBlock extends BlockBase<'grammar'> {
  rule: string
  table?: GrammarTable
  examples: string[]
  /** Типичные ошибки: «I have seen him yesterday» → «I saw him yesterday». */
  commonMistakes?: string[]
}

export interface GrammarTable {
  headers: string[]
  rows: string[][]
}

/** Вопросы для говорения. */
export interface SpeakingBlock extends BlockBase<'speaking'> {
  prompts: string[]
}

// ---------------------------------------------------------------------------
// Интерактивные задания
//
// Все три блока ниже рендерятся как перетаскиваемые карточки плюс зоны, куда
// их нужно положить. Правильное соответствие пишется в метаданные объектов,
// чтобы кнопка «Проверить» могла сверить фактические позиции с ожидаемыми.
// ---------------------------------------------------------------------------

/** Сопоставление пар: слово ↔ перевод, величина ↔ единица измерения. */
export interface MatchingBlock extends BlockBase<'matching'> {
  ref: string
  /** Что делать — инструкция для ученика. */
  instruction: string
  pairs: MatchingPair[]
}

export interface MatchingPair {
  /** Неподвижная часть: остаётся на месте и служит зоной. */
  left: string
  /** Перетаскиваемая часть: карточка, которую ученик кладёт к своей паре. */
  right: string
}

/** Сортировка по группам: неправильные глаголы по типам, величины на скалярные и векторные. */
export interface SortingBlock extends BlockBase<'sorting'> {
  ref: string
  instruction: string
  groups: SortingGroup[]
}

export interface SortingGroup {
  name: string
  items: string[]
}

/** Заполнение пропусков карточками со словами. */
export interface GapFillBlock extends BlockBase<'gapfill'> {
  ref: string
  instruction: string
  sentences: GapFillSentence[]
  /**
   * Лишние варианты, которых нет ни в одном предложении.
   * Нужны, чтобы задание нельзя было решить методом исключения.
   */
  distractors?: string[]
}

export interface GapFillSentence {
  /** Текст с пропусками, обозначенными как `___` (три подчёркивания). */
  text: string
  /** Ответы по порядку пропусков в `text`. */
  answers: string[]
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

/** Маркер пропуска в GapFillSentence.text. */
export const GAP_MARKER = '___'

/** Заголовки секций по умолчанию, если в блоке не задан свой `title`. */
export const DEFAULT_TITLES: Record<Block['type'], { ru: string; en: string }> = {
  objectives: { ru: 'Цели урока', en: 'Objectives' },
  warmup: { ru: 'Разминка', en: 'Warm-up' },
  theory: { ru: 'Теория', en: 'Theory' },
  mindmap: { ru: 'Новый материал', en: 'Mind map' },
  reflection: { ru: 'Рефлексия', en: 'Reflection' },
  formulas: { ru: 'Формулы', en: 'Formulas' },
  example: { ru: 'Разбор примера', en: 'Worked example' },
  tasks: { ru: 'Задачи', en: 'Practice tasks' },
  vocabulary: { ru: 'Лексика', en: 'Vocabulary' },
  grammar: { ru: 'Грамматика', en: 'Grammar' },
  matching: { ru: 'Сопоставь пары', en: 'Match the pairs' },
  sorting: { ru: 'Распредели по группам', en: 'Sort into groups' },
  gapfill: { ru: 'Заполни пропуски', en: 'Fill in the gaps' },
  speaking: { ru: 'Говорение', en: 'Speaking' },
  summary: { ru: 'Итоги', en: 'Summary' },
  homework: { ru: 'Домашнее задание', en: 'Homework' },
  answers: { ru: 'Ответы (для преподавателя)', en: 'Answer key (teacher)' },
}

export function titleFor(block: Block, language: 'ru' | 'en'): string {
  return block.title ?? DEFAULT_TITLES[block.type][language]
}
