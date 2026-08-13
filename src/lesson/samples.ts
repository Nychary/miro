import type { Lesson } from './schema'

/**
 * Эталонные уроки для отладки вёрстки.
 *
 * Пока нейросеть не подключена, это единственный вход в рендерер. Дальше они
 * останутся как «золотой образец»: если генерация начнёт выдавать что-то
 * странное, всегда можно нарисовать эти два урока и увидеть, дело в шаблонах
 * или в промпте. Содержание настоящее, а не рыба, — иначе не видно, как
 * раскладка ведёт себя на реальных длинах текста.
 */

export const PHYSICS_SAMPLE: Lesson = {
  meta: {
    subject: 'physics',
    topic: 'Закон Ома для участка цепи',
    level: '8 класс',
    durationMin: 60,
    student: 'Пётр',
    language: 'ru',
    // Стиль в образце — заодно проверка тёмной палитры на реальном уроке.
    style: 'Космос',
  },
  blocks: [
    {
      type: 'objectives',
      items: [
        'Понимать, что связывает сила тока, напряжение и сопротивление',
        'Уметь находить любую из трёх величин по двум известным',
        'Различать последовательное и параллельное соединение проводников',
      ],
    },
    {
      type: 'warmup',
      say: 'Пётр, перед стартом миссии проверим бортовые системы — размялись и вспомнили прошлое занятие.',
      prompts: [
        'Что произойдёт с током в цепи, если напряжение увеличить вдвое?',
        'Почему провода в квартире делают толстыми, а нить лампы — тонкой?',
        'Какой прибор включают в цепь последовательно, а какой — параллельно?',
      ],
    },
    {
      type: 'theory',
      points: [
        {
          heading: 'Сила тока',
          body: 'Показывает, какой заряд проходит через поперечное сечение проводника за одну секунду. Измеряется амперметром, который включают в цепь последовательно.',
        },
        {
          heading: 'Напряжение',
          body: 'Показывает работу электрического поля по переносу единичного заряда между двумя точками цепи. Измеряется вольтметром, подключённым параллельно участку.',
        },
        {
          heading: 'Сопротивление',
          body: 'Показывает, насколько проводник препятствует прохождению тока. Зависит от материала, длины и площади поперечного сечения проводника, но не от приложенного напряжения.',
        },
        {
          heading: 'Сам закон',
          body: 'Сила тока на участке цепи прямо пропорциональна напряжению на этом участке и обратно пропорциональна его сопротивлению.',
        },
      ],
    },
    {
      type: 'mindmap',
      center: 'Закон Ома',
      branches: [
        {
          label: 'Сила тока, I',
          children: ['Заряд через сечение за секунду', 'Измеряется амперметром', 'I = U / R'],
        },
        {
          label: 'Напряжение, U',
          children: ['Работа поля по переносу заряда', 'Измеряется вольтметром', 'U = I · R'],
        },
        {
          label: 'Сопротивление, R',
          children: ['Свойство самого проводника', 'R = ρ · L / S'],
        },
        {
          label: 'Соединения',
          children: ['Последовательно: R = R₁ + R₂', 'Параллельно: 1/R = 1/R₁ + 1/R₂'],
        },
      ],
    },
    {
      type: 'formulas',
      items: [
        {
          latex: 'I = \\frac{U}{R}',
          plain: 'I = U / R',
          description: 'Закон Ома для участка цепи.',
          variables: ['I — сила тока, А', 'U — напряжение, В', 'R — сопротивление, Ом'],
        },
        {
          latex: 'R = \\rho \\frac{L}{S}',
          plain: 'R = ρ · L / S',
          description: 'Сопротивление однородного проводника.',
          variables: ['ρ — удельное сопротивление, Ом·мм²/м', 'L — длина, м', 'S — площадь сечения, мм²'],
        },
        {
          latex: 'R = R_1 + R_2',
          plain: 'R = R₁ + R₂',
          description: 'Последовательное соединение: сопротивления складываются.',
        },
        {
          latex: '\\frac{1}{R} = \\frac{1}{R_1} + \\frac{1}{R_2}',
          plain: '1/R = 1/R₁ + 1/R₂',
          description: 'Параллельное соединение: складываются обратные величины.',
        },
      ],
    },
    {
      type: 'example',
      statement: 'К резистору сопротивлением 15 Ом приложено напряжение 45 В. Найдите силу тока в резисторе.',
      given: ['U = 45 В', 'R = 15 Ом', 'Найти: I'],
      steps: [
        'Записываем закон Ома для участка цепи: I = U / R',
        'Подставляем числа: I = 45 В / 15 Ом',
        'Считаем: I = 3 А',
      ],
      answer: 'I = 3 А',
    },
    {
      type: 'tasks',
      items: [
        {
          ref: 't1',
          statement: 'Напряжение на участке цепи 12 В, сопротивление участка 4 Ом. Найдите силу тока.',
          difficulty: 'easy',
        },
        {
          ref: 't2',
          statement: 'Через резистор сопротивлением 20 Ом идёт ток 0,5 А. Какое напряжение приложено к резистору?',
          difficulty: 'easy',
        },
        {
          ref: 't3',
          statement: 'Сила тока в цепи 1,5 А при напряжении 9 В. Найдите сопротивление участка.',
          difficulty: 'easy',
        },
        {
          ref: 't4',
          statement: 'При напряжении 220 В через нить лампы течёт ток 0,4 А. Найдите сопротивление нити.',
          hint: 'Выразите R из закона Ома: R = U / I.',
          difficulty: 'medium',
        },
        {
          ref: 't5',
          statement:
            'Два резистора 6 Ом и 12 Ом соединены последовательно и подключены к источнику 36 В. Найдите силу тока в цепи и напряжение на каждом резисторе.',
          hint: 'Сначала найдите общее сопротивление, затем ток — он одинаков для обоих резисторов.',
          difficulty: 'hard',
        },
        {
          ref: 't6',
          statement:
            'Те же резисторы 6 Ом и 12 Ом соединены параллельно, через источник идёт ток 3 А. Найдите общее сопротивление цепи и напряжение источника.',
          hint: 'Для двух резисторов параллельно удобна формула R = R₁·R₂ / (R₁ + R₂).',
          difficulty: 'hard',
        },
      ],
    },
    {
      type: 'matching',
      ref: 'm1',
      say: 'А теперь стыковка: каждой величине нужно найти свой стыковочный узел — единицу измерения.',
      instruction: 'Перетащи к каждой величине её единицу измерения.',
      pairs: [
        { left: 'Сила тока, I', right: 'Ампер (А)' },
        { left: 'Напряжение, U', right: 'Вольт (В)' },
        { left: 'Сопротивление, R', right: 'Ом' },
        { left: 'Работа тока, A', right: 'Джоуль (Дж)' },
        { left: 'Мощность тока, P', right: 'Ватт (Вт)' },
      ],
    },
    {
      type: 'sorting',
      ref: 's1',
      instruction: 'Распредели утверждения по типу соединения проводников.',
      groups: [
        {
          name: 'Последовательное',
          items: [
            'Сила тока одинакова на всех участках',
            'Общее сопротивление равно сумме сопротивлений',
            'Напряжение источника равно сумме напряжений на участках',
          ],
        },
        {
          name: 'Параллельное',
          items: [
            'Напряжение одинаково на всех ветвях',
            'Общий ток равен сумме токов в ветвях',
            'Общее сопротивление меньше наименьшего из сопротивлений',
          ],
        },
      ],
    },
    {
      type: 'summary',
      points: [
        'I = U / R — три величины связаны одной формулой, любую можно найти по двум другим',
        'Сопротивление — свойство самого проводника, оно не меняется от того, какое напряжение мы подали',
        'Последовательно — складываются сопротивления, параллельно — складываются токи',
      ],
    },
    {
      type: 'reflection',
      prompts: ['Освоено', 'Требует дозаправки', 'Курс на следующую миссию'],
    },
    {
      type: 'homework',
      items: [
        'Три задачи на прямое применение закона Ома — по одной на каждую из трёх величин',
        'Начертить схему из двух последовательных резисторов и рассчитать ток при напряжении 24 В',
        'Найти в квартире три прибора и выписать их мощность с шильдика',
      ],
    },
    {
      type: 'answers',
      items: [
        { ref: 't1', answer: 'I = 3 А', solution: 'I = U / R = 12 / 4 = 3 А' },
        { ref: 't2', answer: 'U = 10 В', solution: 'U = I · R = 0,5 · 20 = 10 В' },
        { ref: 't3', answer: 'R = 6 Ом', solution: 'R = U / I = 9 / 1,5 = 6 Ом' },
        { ref: 't4', answer: 'R = 550 Ом', solution: 'R = U / I = 220 / 0,4 = 550 Ом' },
        {
          ref: 't5',
          answer: 'I = 2 А, U₁ = 12 В, U₂ = 24 В',
          solution: 'R = 6 + 12 = 18 Ом; I = 36 / 18 = 2 А; U₁ = 2 · 6 = 12 В; U₂ = 2 · 12 = 24 В',
        },
        {
          ref: 't6',
          answer: 'R = 4 Ом, U = 12 В',
          solution: 'R = 6 · 12 / (6 + 12) = 72 / 18 = 4 Ом; U = I · R = 3 · 4 = 12 В',
        },
      ],
    },
  ],
}

export const ENGLISH_SAMPLE: Lesson = {
  meta: {
    subject: 'english',
    topic: 'Past Simple: рассказ о поездке',
    level: 'B1',
    durationMin: 60,
    student: 'Аня',
    language: 'ru',
    style: 'Барби',
  },
  blocks: [
    {
      type: 'objectives',
      items: [
        'Строить утверждение, отрицание и вопрос в Past Simple',
        'Не путать did с формой прошедшего времени у смыслового глагола',
        'Рассказать о своей поездке пятью-шестью предложениями',
      ],
    },
    {
      type: 'warmup',
      prompts: [
        'Where did you go on your last trip?',
        'What was the best thing you ate there?',
        'Did anything go wrong? What happened?',
      ],
    },
    {
      type: 'grammar',
      rule: 'Past Simple описывает законченное действие в прошлом, когда важен сам факт, а не связь с настоящим. Часто рядом стоит указание времени: yesterday, last week, in 2019, two days ago.',
      table: {
        headers: ['Форма', 'Схема', 'Пример'],
        rows: [
          ['Утверждение', 'V2 / V-ed', 'We went to Prague last spring.'],
          ['Отрицание', 'did not + V1', 'We did not go to Prague last spring.'],
          ['Вопрос', 'Did + подлежащее + V1', 'Did you go to Prague last spring?'],
          ['Короткий ответ', 'Yes, I did. / No, I did not.', 'Did she call you? — No, she did not.'],
        ],
      },
      examples: [
        'I bought the tickets three weeks before the trip.',
        'They did not find a hotel near the centre.',
        'When did the flight land?',
      ],
      commonMistakes: [
        'I did not went — правильно: I did not go. После did смысловой глагол в первой форме.',
        'Did you saw him? — правильно: Did you see him?',
        'I have seen him yesterday — правильно: I saw him yesterday. С yesterday нужен Past Simple.',
      ],
    },
    {
      type: 'vocabulary',
      items: [
        { term: 'go', translation: 'ехать, идти', example: 'We went to Italy by train.', partOfSpeech: 'verb' },
        { term: 'buy', translation: 'покупать', example: 'She bought a ticket at the station.', partOfSpeech: 'verb' },
        { term: 'take', translation: 'занимать (о времени)', example: 'The flight took three hours.', partOfSpeech: 'verb' },
        { term: 'leave', translation: 'уезжать, покидать', example: 'They left the hotel at six.', partOfSpeech: 'verb' },
        { term: 'find', translation: 'находить', example: 'I found a small café near the river.', partOfSpeech: 'verb' },
        { term: 'lose', translation: 'терять', example: 'He lost his passport on the first day.', partOfSpeech: 'verb' },
      ],
    },
    {
      type: 'matching',
      ref: 'm1',
      instruction: 'Перетащи к каждому глаголу его форму прошедшего времени.',
      pairs: [
        { left: 'buy', right: 'bought' },
        { left: 'take', right: 'took' },
        { left: 'see', right: 'saw' },
        { left: 'do', right: 'did' },
        { left: 'have', right: 'had' },
        { left: 'write', right: 'wrote' },
      ],
    },
    {
      type: 'gapfill',
      ref: 'g1',
      say: 'Аня, а давай поможем нашей путешественнице восстановить рассказ о поездке — в нём потерялись глаголы.',
      instruction: 'Поставь глагол в Past Simple и перетащи карточку в пропуск.',
      sentences: [
        { text: 'Last summer we ___ to Italy by train.', answers: ['went'] },
        { text: 'She ___ her keys, so we waited outside.', answers: ['lost'] },
        { text: 'They ___ the museum at five o’clock.', answers: ['left'] },
        { text: 'I ___ a great restaurant near the hotel.', answers: ['found'] },
      ],
      distractors: ['go', 'leave', 'find', 'loses'],
    },
    {
      type: 'sorting',
      ref: 's1',
      instruction: 'Распредели глаголы: правильные образуют прошедшее время через -ed, неправильные — по-своему.',
      groups: [
        { name: 'Regular (-ed)', items: ['worked', 'travelled', 'visited', 'watched'] },
        { name: 'Irregular', items: ['went', 'bought', 'took', 'saw'] },
      ],
    },
    {
      type: 'speaking',
      prompts: [
        'Tell me about a trip you took last year: where, when, who with.',
        'Describe one thing that went wrong and how you solved it.',
        'What did you eat there that you had never tried before?',
        'Would you go back? Why or why not?',
      ],
    },
    {
      type: 'reflection',
    },
    {
      type: 'summary',
      points: [
        'Past Simple = законченное действие в прошлом, часто с указанием времени',
        'В отрицании и вопросе did забирает прошедшее время себе, смысловой глагол остаётся в первой форме',
        'Неправильные глаголы приходится учить списком — начали с шести',
      ],
    },
    {
      type: 'homework',
      items: [
        'Написать 6–8 предложений о своей поездке в Past Simple',
        'Выучить формы шести неправильных глаголов с урока',
        'Переделать пять утверждений из текста в вопросы',
      ],
    },
    {
      type: 'answers',
      items: [
        { ref: 'g1', answer: '1 went · 2 lost · 3 left · 4 found' },
        { ref: 'm1', answer: 'buy—bought, take—took, see—saw, do—did, have—had, write—wrote' },
        {
          ref: 's1',
          answer: 'Regular: worked, travelled, visited, watched · Irregular: went, bought, took, saw',
        },
      ],
    },
  ],
}

export const SAMPLES = {
  physics: PHYSICS_SAMPLE,
  english: ENGLISH_SAMPLE,
} as const
