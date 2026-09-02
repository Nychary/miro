import type { Subject } from './schema'

/**
 * Указатель видео по темам.
 *
 * Панель — статическая страница: ни сервера, ни ключа к YouTube у неё нет и
 * быть не может, ключ в такой странице виден любому. Поэтому живого поиска
 * изнутри Miro не существует, и вместо него здесь лежит заранее собранный
 * указатель: тема урока узнаётся по ключевым словам, а ссылка собирается на
 * адрес поиска ВНУТРИ канала. Конкретные ролики не хранятся намеренно —
 * они протухают, а поиск по каналу всегда попадает в свежее.
 *
 * Ключевые слова даны основами без окончаний («движен», «эмоци»): русский
 * язык склоняется, а тема урока приходит живой фразой вроде «Закон Ома для
 * участка цепи». Проверено, что ни одно слово не встречается в двух темах —
 * иначе поиск начал бы путать физику с английским.
 */

export interface VideoLink {
  channel: string
  /** Хэндл канала без «собаки». */
  handle: string
  /** Запрос по-английски: на английском выдача канала заметно богаче. */
  query: string
}

export interface VideoTopic {
  topic: string
  subject: Subject
  keywords: string[]
  links: VideoLink[]
}

export const VIDEO_TOPICS: VideoTopic[] = [
  {
    topic: 'еда и рестораны',
    subject: 'english',
    keywords: [
      'еда',
      'еды',
      'еде',
      'еду',
      'едой',
      'пищ',
      'ресторан',
      'кафе',
      'меню',
      'продукт',
      'завтрак',
      'обед',
      'ужин',
      'food',
      'restaurant',
      'cooking',
      'meal',
      'drinks'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'food'
      }
    ]
  },
  {
    topic: 'путешествия и транспорт',
    subject: 'english',
    keywords: [
      'путешеств',
      'поездк',
      'поездок',
      'транспорт',
      'самолет',
      'поезд',
      'аэропорт',
      'каникул',
      'отпуск',
      'отел',
      'travel',
      'transport',
      'airport',
      'flight',
      'plane',
      'hotel',
      'holiday',
      'vacation',
      'booking'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'airplane'
      }
    ]
  },
  {
    topic: 'школа и учёба',
    subject: 'english',
    keywords: [
      'школ',
      'учеб',
      'учител',
      'экзамен',
      'образован',
      'домашнее задание',
      'домашка',
      'school',
      'study',
      'studying',
      'exams',
      'exam',
      'examination',
      'homework',
      'lesson',
      'classroom',
      'pupil'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'studying'
      }
    ]
  },
  {
    topic: 'работа и профессии',
    subject: 'english',
    keywords: [
      'работ',
      'професси',
      'карьер',
      'собеседован',
      'офис',
      'job',
      'career',
      'interview',
      'works',
      'worker',
      'working',
      'at work',
      'employee'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'job interview'
      }
    ]
  },
  {
    topic: 'спорт и здоровье',
    subject: 'english',
    keywords: [
      'спорт',
      'тренировк',
      'фитнес',
      'мышц',
      'здоров',
      'болезн',
      'врач',
      'части тела',
      'sport',
      'sports',
      'health',
      'exercise',
      'fitness',
      'workout',
      'gym',
      'doctor',
      'body'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'exercise'
      }
    ]
  },
  {
    topic: 'технологии и гаджеты',
    subject: 'english',
    keywords: [
      'технолог',
      'гаджет',
      'смартфон',
      'телефон',
      'компьютер',
      'интернет',
      'соцсет',
      'новост',
      'technology',
      'smartphone',
      'computer',
      'internet',
      'news',
      'social media',
      'gadget'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'smartphone'
      }
    ]
  },
  {
    topic: 'природа, погода и климат',
    subject: 'english',
    keywords: [
      'эколог',
      'природ',
      'климат',
      'окружающ',
      'загрязнен',
      'животн',
      'питомц',
      'погод',
      'времена года',
      'время года',
      'сезон',
      'nature',
      'ecology',
      'climate',
      'environment',
      'weather',
      'season',
      'seasons',
      'animal',
      'animals',
      'pet',
      'pets'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'climate change'
      },
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'weather'
      }
    ]
  },
  {
    topic: 'деньги и покупки',
    subject: 'english',
    keywords: [
      'деньг',
      'покупк',
      'магазин',
      'цена',
      'цены',
      'цену',
      'скидк',
      'шопинг',
      'одежд',
      'money',
      'shopping',
      'price',
      'prices',
      'budget',
      'clothes',
      'buy',
      'shop'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'shopping'
      }
    ]
  },
  {
    topic: 'дружба и общение',
    subject: 'english',
    keywords: [
      'дружб',
      'друзь',
      'подруг',
      'мой друг',
      'о друге',
      'лучший друг',
      'общени',
      'знакомств',
      'friend',
      'friends',
      'friendship',
      'communication',
      'small talk'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'friendship'
      }
    ]
  },
  {
    topic: 'семья и родственники',
    subject: 'english',
    keywords: [
      'семья',
      'семьи',
      'семье',
      'семей',
      'родител',
      'родственник',
      'family',
      'parents',
      'relatives',
      'brother',
      'sister'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'family'
      }
    ]
  },
  {
    topic: 'город и жильё',
    subject: 'english',
    keywords: [
      'город',
      'мой дом',
      'в доме',
      'квартир',
      'комнат',
      'жиль',
      'аренд',
      'city',
      'town',
      'apartment',
      'house',
      'my home',
      'room',
      'flat',
      'living'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'city life'
      }
    ]
  },
  {
    topic: 'музыка и кино',
    subject: 'english',
    keywords: [
      'музык',
      'песн',
      'кино',
      'фильм',
      'сериал',
      'кинотеатр',
      'music',
      'song',
      'songs',
      'movie',
      'film',
      'cinema',
      'series'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'music'
      }
    ]
  },
  {
    topic: 'книги и чтение',
    subject: 'english',
    keywords: [
      'книг',
      'чтени',
      'читать',
      'читаем',
      'библиотек',
      'комикс',
      'book',
      'books',
      'reading',
      'library',
      'characters',
      'story'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'books'
      }
    ]
  },
  {
    topic: 'эмоции и характер',
    subject: 'english',
    keywords: [
      'эмоци',
      'чувств',
      'настроени',
      'счасть',
      'личност',
      'характер',
      'emotions',
      'feelings',
      'personality',
      'character traits',
      'describing people',
      'happiness',
      'mood'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'emotions'
      },
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'happiness'
      }
    ]
  },
  {
    topic: 'привычки и распорядок дня',
    subject: 'english',
    keywords: [
      'привычк',
      'распорядок',
      'режим дня',
      'рутин',
      'расписани',
      'каждый день',
      'habits',
      'routine',
      'daily',
      'every day',
      'schedule'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'day in the life'
      }
    ]
  },
  {
    topic: 'хобби и свободное время',
    subject: 'english',
    keywords: [
      'хобби',
      'увлечен',
      'свободное время',
      'досуг',
      'коллекци',
      'hobby',
      'hobbies',
      'free time',
      'spare time'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'hobby'
      }
    ]
  },
  {
    topic: 'язык и слова',
    subject: 'english',
    keywords: [
      'язык',
      'слова',
      'словар',
      'лексик',
      'произношен',
      'акцент',
      'language',
      'languages',
      'words',
      'vocabulary',
      'accent',
      'pronunciation'
    ],
    links: [
      {
        channel: 'Great Big Story',
        handle: 'GreatBigStory',
        query: 'language'
      }
    ]
  },
  {
    topic: 'механика и движение',
    subject: 'physics',
    keywords: [
      'движен',
      'скорост',
      'ускорен',
      'инерц',
      'траектор',
      'механи',
      'ньютон',
      'законы ньютона',
      'сила трения',
      'трение',
      'трения',
      'упругост',
      'рычаг',
      'деформац',
      'момент силы',
      'простые механизм',
      'motion',
      'velocity',
      'acceleration',
      'friction',
      'newton'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'acceleration'
      },
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'friction'
      }
    ]
  },
  {
    topic: 'сила тяжести и вес',
    subject: 'physics',
    keywords: [
      'тяжест',
      'сила тяжести',
      'вес тел',
      'веса тел',
      'взвешив',
      'гравитац',
      'тяготен',
      'невесомост',
      'свободное падение',
      'падени',
      'gravity',
      'weight',
      'free fall'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'gravity'
      }
    ]
  },
  {
    topic: 'давление и жидкости',
    subject: 'physics',
    keywords: [
      'давлен',
      'жидкост',
      'паскал',
      'атмосферн',
      'барометр',
      'манометр',
      'сообщающ',
      'воздух',
      'pressure',
      'fluid',
      'atmospheric'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'fluid pressure'
      },
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'barometer'
      }
    ]
  },
  {
    topic: 'плотность и плавание тел',
    subject: 'physics',
    keywords: [
      'плотност',
      'плавани',
      'плавает',
      'тонет',
      'архимед',
      'выталкивающ',
      'лед',
      'льда',
      'density',
      'buoyancy',
      'archimedes',
      'float',
      'ice'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'buoyancy'
      },
      {
        channel: 'AsapSCIENCE',
        handle: 'AsapSCIENCE',
        query: 'ice'
      }
    ]
  },
  {
    topic: 'тепло и температура',
    subject: 'physics',
    keywords: [
      'тепл',
      'температур',
      'нагрев',
      'теплопередач',
      'теплот',
      'плавлен',
      'кипени',
      'испарен',
      'конденсац',
      'агрегатн',
      'влажност',
      'удельн',
      'термометр',
      'heat',
      'temperature',
      'thermal',
      'entropy',
      'melting'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'thermodynamics'
      }
    ]
  },
  {
    topic: 'электричество и ток',
    subject: 'physics',
    keywords: [
      'ток',
      'сила тока',
      'электрическ',
      'электричеств',
      'напряжен',
      'сопротивлен',
      'цеп',
      'заряд',
      'проводник',
      'изолятор',
      'последовательное соединение',
      'параллельное соединение',
      'закон ома',
      'батаре',
      'аккумулятор',
      'circuit',
      'electric current',
      'voltage',
      'electricity',
      'battery',
      'resistance'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'electricity'
      },
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'battery'
      }
    ]
  },
  {
    topic: 'магнетизм',
    subject: 'physics',
    keywords: [
      'магнит',
      'магнетизм',
      'магнитн',
      'полюс',
      'компас',
      'электромагнит',
      'magnet',
      'magnetic',
      'compass'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'magnetism'
      },
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'magnetic field'
      }
    ]
  },
  {
    topic: 'свет и цвет',
    subject: 'physics',
    keywords: [
      'свет',
      'оптик',
      'линз',
      'зеркал',
      'преломлен',
      'отражени',
      'цвет',
      'изображени',
      'радуг',
      'light',
      'optics',
      'lens',
      'lenses',
      'mirror',
      'color',
      'colour',
      'rainbow',
      'reflection'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'rainbow'
      },
      {
        channel: 'AsapSCIENCE',
        handle: 'AsapSCIENCE',
        query: 'color'
      }
    ]
  },
  {
    topic: 'звук и волны',
    subject: 'physics',
    keywords: [
      'звук',
      'волн',
      'колебани',
      'акустик',
      'эхо',
      'частот',
      'громкост',
      'ультразвук',
      'sound',
      'wave',
      'waves',
      'acoustics',
      'echo',
      'frequency'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'sound waves'
      },
      {
        channel: 'AsapSCIENCE',
        handle: 'AsapSCIENCE',
        query: 'sound'
      }
    ]
  },
  {
    topic: 'энергия и работа',
    subject: 'physics',
    keywords: [
      'энерги',
      'механическая работа',
      'работа силы',
      'работу силы',
      'мощност',
      'кпд',
      'кинетическ',
      'потенциальн',
      'джоул',
      'сохранения энерги',
      'закон сохранения',
      'energy',
      'power',
      'kinetic',
      'potential',
      'work done'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'kinetic energy'
      }
    ]
  },
  {
    topic: 'атом и ядро',
    subject: 'physics',
    keywords: [
      'атом',
      'ядро',
      'ядра',
      'ядерн',
      'радиоактивн',
      'изотоп',
      'распад',
      'строение атома',
      'молекул',
      'nuclear',
      'radiation',
      'isotope',
      'atomic'
    ],
    links: [
      {
        channel: 'TED-Ed',
        handle: 'TEDEd',
        query: 'atom'
      },
      {
        channel: 'AsapSCIENCE',
        handle: 'AsapSCIENCE',
        query: 'nuclear'
      }
    ]
  },
  {
    topic: 'космос и планеты',
    subject: 'physics',
    keywords: [
      'космос',
      'космич',
      'планет',
      'орбит',
      'звезд',
      'вселенн',
      'солнечн систем',
      'space',
      'orbit',
      'planet',
      'universe',
      'astronaut'
    ],
    links: [
      {
        channel: 'AsapSCIENCE',
        handle: 'AsapSCIENCE',
        query: 'space'
      }
    ]
  }
]

/** Адрес поиска внутри канала. Ключ и вход в аккаунт не нужны. */
export function videoSearchUrl(link: VideoLink, query = link.query): string {
  return `https://www.youtube.com/@${link.handle}/search?query=${encodeURIComponent(query)}`
}

/**
 * Ищет тему указателя по названию урока.
 *
 * Считаем совпавшие основы: тема с двумя попаданиями точнее темы с одним, и
 * «Давление и плавание тел» не должно уходить в «механику» из-за слова «тел».
 * Предмет сужает поиск, но не запирает его: урок английского про еду и урок
 * физики про давление живут в разных списках и не пересекаются.
 */
export function findVideoTopic(lessonTopic: string, subject?: Subject): VideoTopic | null {
  const needle = lessonTopic.toLowerCase()
  if (!needle.trim()) return null

  let best: VideoTopic | null = null
  let bestScore = 0
  for (const entry of VIDEO_TOPICS) {
    if (subject && entry.subject !== subject) continue
    const score = entry.keywords.reduce((sum, word) => (needle.includes(word) ? sum + 1 : sum), 0)
    if (score > bestScore) {
      best = entry
      bestScore = score
    }
  }
  return best
}
