import type { LessonMeta, Subject } from './schema'

/**
 * Сборка промпта для нейросети.
 *
 * Промпт уходит не по сети, а в буфер обмена: репетитор вставляет его в тот
 * чат, которым уже пользуется, и приносит ответ обратно. Поэтому длина промпта
 * ничего не стоит — можно позволить себе подробную схему и развёрнутые
 * требования к содержанию, что заметно поднимает качество ответа.
 *
 * Когда появится ключ, этот же текст пойдёт в системное сообщение запроса.
 * Менять придётся только транспорт.
 */

export interface LessonRequest extends Omit<LessonMeta, 'language'> {
  language: 'ru' | 'en'
  /** Что известно про ученика: уровень, пробелы, цели. Пока вводится вручную. */
  studentNotes?: string
}

export function buildPrompt(request: LessonRequest): string {
  const sections = [
    role(request.subject),
    task(request),
    structure(request),
    SCHEMA_SPEC,
    contentRules(request.subject),
    OUTPUT_RULES,
  ]
  return sections.join('\n\n').trim()
}

// ---------------------------------------------------------------------------

function role(subject: Subject): string {
  return subject === 'physics'
    ? 'Ты — опытный репетитор по физике. Ты составляешь уроки для индивидуальных занятий на онлайн-доске: ученик видит доску и работает на ней вместе с преподавателем.'
    : 'Ты — опытный репетитор по английскому языку. Ты составляешь уроки для индивидуальных занятий на онлайн-доске: ученик видит доску и работает на ней вместе с преподавателем.'
}

function task(request: LessonRequest): string {
  const lines = [
    'Составь урок.',
    `Тема: ${request.topic}`,
    `Уровень: ${request.level}`,
    `Длительность: ${request.durationMin} минут`,
  ]
  if (request.student) lines.push(`Ученик: ${request.student}`)
  if (request.studentNotes?.trim()) lines.push(`Что известно про ученика: ${request.studentNotes.trim()}`)
  return lines.join('\n')
}

/**
 * Состав блоков зависит от предмета и длительности. Без этого нейросеть
 * выдаёт то три задачи, то пятнадцать, и уроки перестают быть похожими друг
 * на друга — а репетитору нужна предсказуемая структура.
 */
function structure(request: LessonRequest): string {
  const scale = request.durationMin <= 45 ? 'short' : request.durationMin >= 90 ? 'long' : 'normal'

  if (request.subject === 'physics') {
    const tasks = scale === 'short' ? '4' : scale === 'long' ? '8–10' : '6'
    return [
      'Структура урока — блоки строго в этом порядке:',
      '1. objectives — 3 цели',
      '2. warmup — 3 вопроса на активацию знаний, без формул, на понимание',
      '3. theory — 3–4 тезиса',
      '4. formulas — все формулы темы с расшифровкой обозначений и единиц',
      '5. example — одна задача, разобранная по шагам',
      `6. tasks — ${tasks} задач по возрастанию сложности, с подсказками к трудным`,
      '7. matching или sorting — одно интерактивное задание',
      '8. summary — 3 главные мысли',
      '9. homework — 3 задания',
      '10. answers — ответы ко всем задачам из tasks, с ходом решения',
    ].join('\n')
  }

  const vocab = scale === 'short' ? '5' : scale === 'long' ? '10–12' : '6–8'
  return [
    'Структура урока — блоки строго в этом порядке:',
    '1. objectives — 3 цели',
    '2. warmup — 3 вопроса на английском, чтобы разговорить ученика',
    '3. grammar — правило, таблица форм и типичные ошибки',
    `4. vocabulary — ${vocab} слов с переводом и примером в предложении`,
    '5. matching — сопоставление пар по теме урока',
    '6. gapfill — 4–5 предложений с пропусками плюс 2–3 лишних варианта',
    '7. speaking — 4 вопроса для говорения',
    '8. summary — 3 главные мысли',
    '9. homework — 3 задания',
    '10. answers — ключ к matching, gapfill и остальным заданиям',
  ].join('\n')
}

const SCHEMA_SPEC = `Формат ответа — один JSON-объект такой структуры:

{
  "meta": {
    "subject": "physics" | "english",
    "topic": string,
    "level": string,
    "durationMin": number,
    "student": string,          // необязательно
    "language": "ru" | "en"     // язык подписей на доске
  },
  "blocks": Block[]
}

Каждый Block — объект с полем "type" и своими полями. Поле "title" необязательно
у всех блоков: если его не задать, подпись подставится автоматически.

{ "type": "objectives", "items": string[] }
{ "type": "warmup", "prompts": string[] }
{ "type": "theory", "points": [{ "heading": string, "body": string }] }
{ "type": "formulas", "items": [{
    "plain": string,          // формула юникодом: "I = U / R", "Δp = F·Δt"
    "latex": string,          // необязательно, та же формула в LaTeX
    "description": string,    // что означает и когда применяется
    "variables": string[]     // необязательно: "I — сила тока, А"
  }] }
{ "type": "example", "statement": string, "given": string[], "steps": string[], "answer": string }
{ "type": "tasks", "items": [{
    "ref": string,            // короткий идентификатор: "t1", "t2"
    "statement": string,
    "hint": string,           // необязательно
    "difficulty": "easy" | "medium" | "hard"
  }] }
{ "type": "vocabulary", "items": [{
    "term": string, "translation": string, "example": string,
    "transcription": string, "partOfSpeech": string   // оба необязательны
  }] }
{ "type": "grammar", "rule": string,
  "table": { "headers": string[], "rows": string[][] },   // необязательно
  "examples": string[],
  "commonMistakes": string[] }                            // необязательно
{ "type": "matching", "ref": string, "instruction": string,
  "pairs": [{ "left": string, "right": string }] }
{ "type": "sorting", "ref": string, "instruction": string,
  "groups": [{ "name": string, "items": string[] }] }
{ "type": "gapfill", "ref": string, "instruction": string,
  "sentences": [{ "text": string, "answers": string[] }],  // пропуск в text — ровно три подчёркивания: ___
  "distractors": string[] }                                // необязательно
{ "type": "speaking", "prompts": string[] }
{ "type": "summary", "points": string[] }
{ "type": "homework", "items": string[] }
{ "type": "answers", "items": [{ "ref": string, "answer": string, "solution": string }] }

Пример фрагмента, чтобы был виден стиль:

{
  "type": "formulas",
  "items": [{
    "plain": "I = U / R",
    "latex": "I = \\\\frac{U}{R}",
    "description": "Закон Ома для участка цепи.",
    "variables": ["I — сила тока, А", "U — напряжение, В", "R — сопротивление, Ом"]
  }]
}`

function contentRules(subject: Subject): string {
  if (subject === 'physics') {
    return [
      'Требования к содержанию:',
      '— Формулы записывай юникодом, не разметкой: «Δv», «ρ», «м/с²», «₁». Никаких $ и \\frac в поле plain.',
      '— В каждой задаче указывай единицы измерения. Числа подбирай так, чтобы ответ считался в уме или в одно действие.',
      '— Задачи должны отличаться друг от друга по сути, а не только числами.',
      '',
      'Обязательная самопроверка перед ответом: реши каждую задачу из tasks заново, с нуля.',
      'Проверь единицы измерения, порядок величины и арифметику. Если ответ не сошёлся —',
      'исправь условие или ответ, а не подгоняй одно под другое. В блок answers положи',
      'проверенные ответы с ходом решения.',
    ].join('\n')
  }

  return [
    'Требования к содержанию:',
    '— Лексику и примеры подбирай строго под указанный уровень: на A2 не должно быть конструкций уровня B2.',
    '— Каждое слово в vocabulary давай с примером в законченном предложении, а не словосочетанием.',
    '— В gapfill пропуск обозначай ровно тремя подчёркиваниями ___ и следи, чтобы число пропусков',
    '  в предложении совпадало с числом элементов в answers.',
    '— В commonMistakes показывай пару «неправильно → правильно», а не абстрактное описание ошибки.',
    '',
    'Обязательная самопроверка перед ответом: перечитай каждое английское предложение.',
    'Проверь грамматику, естественность формулировок и соответствие уровню.',
  ].join('\n')
}

/**
 * Куски промпта, по которым его можно опознать.
 *
 * Промпт и ответ ходят через один буфер обмена, и вставить в поле ответа
 * промпт — самая частая ошибка. Без этой проверки разборщик находит в промпте
 * описание схемы, пытается прочесть его как JSON и жалуется на синтаксис,
 * отправляя искать проблему в ответе нейросети, которого там нет.
 */
const PROMPT_MARKERS = ['Структура урока — блоки строго в этом порядке', 'Формат ответа:']

export function looksLikePrompt(text: string): boolean {
  return PROMPT_MARKERS.every((marker) => text.includes(marker))
}

const OUTPUT_RULES = [
  'Формат ответа:',
  '— Верни только JSON-объект. Без пояснений до и после, без markdown-заборов, без комментариев внутри JSON.',
  '— Все кавычки внутри строк экранируй.',
  '— Не добавляй полей, которых нет в схеме, и не переименовывай существующие.',
].join('\n')
