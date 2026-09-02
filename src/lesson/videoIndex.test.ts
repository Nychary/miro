import { describe, expect, it } from 'vitest'
import { VIDEO_TOPICS, findVideoTopic, videoSearchUrl } from './videoIndex'

/**
 * Указатель заменил поле, куда репетитор вставляла ссылку руками. Значит
 * ошибка подбора теперь не видна: раньше она сама решала, что вставить, а
 * теперь решает панель. Проверяем на живых названиях уроков.
 */

describe('подбор видео по теме урока', () => {
  const cases: Array<[string, 'physics' | 'english', string]> = [
    ['Закон Ома для участка цепи', 'physics', 'электричество'],
    ['Сила трения и её виды', 'physics', 'механика'],
    ['Давление жидкости на дно сосуда', 'physics', 'давление'],
    ['Present Perfect, fast food', 'english', 'еда'],
    ['Past Simple: рассказ о путешествии', 'english', 'путешеств'],
    ['Модальные глаголы: работа и собеседование', 'english', 'работа'],
  ]

  it.each(cases)('«%s» находит тему про %s', (lessonTopic, subject, expected) => {
    const found = findVideoTopic(lessonTopic, subject)
    expect(found, `для «${lessonTopic}» ничего не нашлось`).not.toBeNull()
    expect(found?.topic.toLowerCase()).toContain(expected)
  })

  it('не путает предметы', () => {
    // «Сила» есть и в физике, и в разговоре про спорт: предмет обязан решать.
    const physics = findVideoTopic('Сила тока в проводнике', 'physics')
    expect(physics?.subject).toBe('physics')

    const english = findVideoTopic('Спорт и здоровый образ жизни', 'english')
    expect(english?.subject).toBe('english')
  })

  it('молчит, когда темы в базе нет', () => {
    expect(findVideoTopic('Причастный оборот в китайском', 'english')).toBeNull()
    expect(findVideoTopic('', 'physics')).toBeNull()
  })

  it('собирает адрес поиска по каналу, а не по всему YouTube', () => {
    const url = videoSearchUrl({ channel: 'TED-Ed', handle: 'TEDEd', query: 'black holes' })
    expect(url).toBe('https://www.youtube.com/@TEDEd/search?query=black%20holes')
  })
})

describe('целостность указателя', () => {
  it('ни одно ключевое слово не живёт в двух темах', () => {
    // Общее слово превращает подбор в лотерею: «сила» в трёх темах — и урок
    // про силу тока уходит в ролик про мышцы.
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const entry of VIDEO_TOPICS) {
      for (const word of entry.keywords) {
        const other = seen.get(word)
        if (other && other !== entry.topic) clashes.push(`${word}: ${other} и ${entry.topic}`)
        seen.set(word, entry.topic)
      }
    }
    expect(clashes).toEqual([])
  })

  it('у каждой темы есть ключи и хотя бы одна ссылка', () => {
    for (const entry of VIDEO_TOPICS) {
      expect(entry.keywords.length, entry.topic).toBeGreaterThan(4)
      expect(entry.links.length, entry.topic).toBeGreaterThan(0)
      for (const link of entry.links) {
        expect(link.handle, entry.topic).not.toMatch(/^@/)
        expect(link.query.trim(), entry.topic).not.toBe('')
      }
    }
  })
})
