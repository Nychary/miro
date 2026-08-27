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
  /**
   * Готовые поисковые запросы для картинок к оформлению — их предлагает
   * нейросеть под тему и стиль урока. Репетитор ищет по ним изображения
   * и перетаскивает на доску руками: автоматический поиск картинок ненадёжен,
   * а кураторство здесь и должно оставаться за человеком.
   */
  imageIdeas?: string[]
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
  | ReadingBlock
  | AudioBlock
  | FormulasBlock
  | ExampleBlock
  | TasksBlock
  | VocabularyBlock
  | GrammarBlock
  | MatchingBlock
  | SortingBlock
  | GapFillBlock
  | ChoiceBlock
  | EmbedBlock
  | MysteryBoxBlock
  | HalvesBlock
  | PullOutBlock
  | FlashlightBlock
  | SpeakingBlock
  | SummaryBlock
  | HomeworkBlock
  | AnswersBlock

/** Общее для всех блоков: тип и необязательный заголовок секции. */
interface BlockBase<T extends string> {
  type: T
  /** Если не задан, рендерер подставит заголовок по умолчанию для этого типа. */
  title?: string
  /**
   * Опорная фраза учителя: что сказать ученику, вводя этот блок, —
   * «А теперь поможем инспектору восстановить протокол…». На доску ученику
   * не попадает: живёт в панели, во фрейме ответов и в экспорте, в
   * преподавательской части.
   */
  say?: string
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

/**
 * Текст для чтения — то, что ученик читает прямо с доски: интервью, статья,
 * диалог. Абзацы нумеруются, чтобы задания могли на них ссылаться
 * («какой вопрос подходит к ответу 3?»).
 */
export interface ReadingBlock extends BlockBase<'reading'> {
  /** Подводка перед текстом: откуда он и зачем читаем. */
  intro?: string
  paragraphs: ReadingParagraph[]
  /** Вопросы на понимание — рендерятся стикерами после текста. */
  questions?: string[]
}

export interface ReadingParagraph {
  /** Метка абзаца: «1», «Erin», «Гэри». */
  label?: string
  text: string
}

/**
 * Метка аудирования: номер трека из материалов курса и что с ним делать.
 * Сам звук доска не проигрывает — репетитор включает файл у себя, а карточка
 * служит меткой в сценарии урока. Файл можно перетащить на доску рядом.
 */
export interface AudioBlock extends BlockBase<'audio'> {
  /** Номер трека, как он назван в курсе: «3.2». */
  track: string
  instruction: string
  /** Вопросы или задания к прослушиванию. */
  tasks?: string[]
}

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
// Приёмы оформления
//
// Четыре механики, которые репетиторы собирают на доске руками: коробка с
// карточками, парные половинки, предмет с вытягивающимся вопросом и фонарик,
// проявляющий спрятанные слова. Все они держатся на одном и том же — на
// порядке слоёв и на том, что часть объектов двигается, а часть закреплена
// взглядом на месте. Отличие от обычных заданий только в подаче: коробка —
// это та же сборка предложения, половинки — то же сопоставление пар.
// ---------------------------------------------------------------------------

/**
 * Встроенная страница: игра, ролик, тренажёр.
 *
 * Это единственный блок, содержимое которого конструктор не делает сам —
 * ссылку приносит репетитор. Зато он снимает вечный спор «доска или сервис
 * с играми»: игра открывается прямо на уроке, а не соседней вкладкой, куда
 * ученик уходит и не возвращается.
 *
 * На доске встаёт живой встроенной страницей, в файле — карточкой со ссылкой:
 * файл обязан открываться без интернета, а игра без него всё равно не работает.
 */
export interface EmbedBlock extends BlockBase<'embed'> {
  /** Адрес игры или ролика: Wordwall, LearningApps, YouTube, что угодно. */
  url: string
  /** Что делать с этой игрой — инструкция ученику. */
  instruction: string
  /** Сколько примерно занимает: репетитору для планирования урока. */
  minutes?: number
}

/**
 * Выбор варианта — самое частое упражнение языковых курсов.
 *
 * Ученик читает предложение с пропуском и кладёт в него ту карточку, которая
 * подходит. Отличие от заполнения пропусков в том, что варианты даны к каждому
 * предложению отдельно и различаются малым: формой глагола, предлогом,
 * порядком слов. Проверка та же, что у остальных заданий, — «в той ли зоне
 * лежит карточка», поэтому и на доске, и в файле это работает без оговорок.
 */
export interface ChoiceBlock extends BlockBase<'choice'> {
  ref: string
  instruction: string
  items: ChoiceItem[]
}

export interface ChoiceItem {
  /** Предложение с пропуском: пропуск обозначается тремя подчёркиваниями. */
  text: string
  /** Варианты ответа: обычно два-три, различающиеся мелочью. */
  options: string[]
  /** Правильный вариант — он же есть в options. */
  correct: string
}

/**
 * Волшебная коробка: карточки лежат внутри нарисованной коробки, ученик
 * достаёт их и собирает фразу по порядку. Момент открытия коробки — половина
 * эффекта, поэтому у неё есть крышка, которую сдвигают в начале задания.
 */
export interface MysteryBoxBlock extends BlockBase<'mysterybox'> {
  ref: string
  instruction: string
  /** Что лежит в коробке: подпись предмета для оформления, например «подарок». */
  boxLabel?: string
  /** Правильный порядок слов — по нему строятся слоты и проверка. */
  slots: string[]
  /** Лишние карточки, которых в ответе нет. */
  distractors?: string[]
}

/**
 * Половинки: пара сходится в целый предмет — половинка ёлочного шарика слева,
 * вторая справа. Задание проверяет себя само: если предмет не срастается,
 * пара неверная.
 */
export interface HalvesBlock extends BlockBase<'halves'> {
  ref: string
  instruction: string
  pairs: MatchingPair[]
}

/**
 * Предмет-тянучка: на подносе лежат предметы, под подносом спрятаны вопросы.
 * Ученик тянет предмет — за ним выезжает вопрос, который он не выбирал.
 * Проверки здесь нет: это разговорное задание.
 */
export interface PullOutBlock extends BlockBase<'pullout'> {
  instruction: string
  /** Название подноса: «тарелка с конфетами», «шляпа». */
  trayLabel?: string
  /**
   * Символ предмета, который тянут. Пусто — на предметах стоят номера:
   * оформление остаётся за репетитором, конструктор его не навязывает.
   */
  itemEmoji?: string
  questions: string[]
}

/**
 * Фонарик: слова написаны цветом фона и потому невидимы, а светлое пятно
 * фонаря под ними проявляет то, что оказалось в луче.
 */
export interface FlashlightBlock extends BlockBase<'flashlight'> {
  instruction: string
  /** Слова, спрятанные в темноте. */
  words: string[]
  /** Что искать: «найди все глаголы», «найди слова про погоду». */
  hunt?: string
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
  reading: { ru: 'Чтение', en: 'Reading' },
  audio: { ru: 'Аудирование', en: 'Listening' },
  formulas: { ru: 'Формулы', en: 'Formulas' },
  example: { ru: 'Разбор примера', en: 'Worked example' },
  tasks: { ru: 'Задачи', en: 'Practice tasks' },
  vocabulary: { ru: 'Лексика', en: 'Vocabulary' },
  grammar: { ru: 'Грамматика', en: 'Grammar' },
  matching: { ru: 'Сопоставь пары', en: 'Match the pairs' },
  sorting: { ru: 'Распредели по группам', en: 'Sort into groups' },
  gapfill: { ru: 'Заполни пропуски', en: 'Fill in the gaps' },
  choice: { ru: 'Выбери верное', en: 'Choose the correct option' },
  embed: { ru: 'Игра', en: 'Game' },
  mysterybox: { ru: 'Волшебная коробка', en: 'Mystery box' },
  halves: { ru: 'Собери половинки', en: 'Match the halves' },
  pullout: { ru: 'Вытяни вопрос', en: 'Pull out a question' },
  flashlight: { ru: 'Найди в темноте', en: 'Find in the dark' },
  speaking: { ru: 'Говорение', en: 'Speaking' },
  summary: { ru: 'Итоги', en: 'Summary' },
  homework: { ru: 'Домашнее задание', en: 'Homework' },
  answers: { ru: 'Ответы (для преподавателя)', en: 'Answer key (teacher)' },
}

export function titleFor(block: Block, language: 'ru' | 'en'): string {
  return block.title ?? DEFAULT_TITLES[block.type][language]
}
