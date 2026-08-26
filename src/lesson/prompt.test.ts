import { describe, expect, it } from 'vitest'
import { buildPrompt, looksLikePrompt, type LessonRequest } from './prompt'

const BASE: LessonRequest = {
  subject: 'physics',
  topic: 'Закон Ома',
  level: '8 класс',
  durationMin: 60,
  language: 'ru',
}

describe('секция стиля', () => {
  it('появляется, когда стиль задан, и требует вернуть его в meta.style', () => {
    const prompt = buildPrompt({ ...BASE, style: 'Гарри Поттер' })
    expect(prompt).toContain('Стиль оформления: «Гарри Поттер»')
    expect(prompt).toContain('meta.style')
    expect(prompt).toContain('meta.imageIdeas')
  })

  it('не просит эмодзи: оформление добавляет репетитор сам', () => {
    const prompt = buildPrompt({ ...BASE, style: 'Космос' })
    expect(prompt).not.toContain('styleEmoji')
    expect(prompt).not.toContain('эмодзи')
  })

  it('не появляется без стиля', () => {
    expect(buildPrompt(BASE)).not.toContain('Стиль оформления')
  })

  it('«Стандарт» — это отсутствие стиля, а не стиль по имени', () => {
    expect(buildPrompt({ ...BASE, style: 'Стандарт' })).not.toContain('Стиль оформления')
  })

  it('просит поисковые запросы для картинок', () => {
    const prompt = buildPrompt({ ...BASE, style: 'Детектив' })
    expect(prompt).toContain('meta.imageIdeas')
    expect(prompt).toContain('поисковых запрос')
  })

  it('«Придумай тему сам» включает режим изобретения темы', () => {
    const prompt = buildPrompt({ ...BASE, style: 'Придумай тему сам' })
    expect(prompt).toContain('Придумай тематическую обёртку')
    expect(prompt).toContain('Ван Гога')
    expect(prompt).toContain('meta.imageIdeas')
    // Название изобретённой темы должно вернуться в meta.style.
    expect(prompt).toContain('meta.style')
  })
})

describe('шаблон из пяти упражнений', () => {
  it('строит структуру Лады с её названиями упражнений', () => {
    const prompt = buildPrompt({ ...BASE, template: 'five', prevTopic: 'Сила тока' })
    expect(prompt).toContain('Вспоминаем')
    expect(prompt).toContain('«Сила тока»')
    expect(prompt).toContain('mindmap')
    expect(prompt).toContain('reflection')
    expect(prompt).toContain('Игра')
  })

  it('для английского практика — заполнение пропусков', () => {
    const prompt = buildPrompt({ ...BASE, subject: 'english', level: 'B1', template: 'five' })
    expect(prompt).toContain('gapfill')
    expect(prompt).not.toContain('задач по возрастанию')
  })

  it('сложность привязана к уровню, а не к средней школе', () => {
    const prompt = buildPrompt(BASE)
    expect(prompt).toContain('Сложность калибруй по полю «Уровень»')
    expect(prompt).toContain('части 2 ЕГЭ')
    expect(prompt).toContain('НЕ упрощай физику задачи')
  })

  it('число задач по физике растёт с длительностью — с реальных занятий', () => {
    expect(buildPrompt({ ...BASE, template: 'five', durationMin: 60 })).toContain('10 задач')
    expect(buildPrompt({ ...BASE, template: 'five', durationMin: 45 })).toContain('6 задач')
    expect(buildPrompt({ ...BASE, template: 'five', durationMin: 90 })).toContain('12–14 задач')
    // Классический шаблон масштабируется так же.
    expect(buildPrompt({ ...BASE, template: 'classic', durationMin: 60 })).toContain('10 задач')
  })

  it('классический шаблон остаётся прежним', () => {
    const prompt = buildPrompt({ ...BASE, template: 'classic' })
    expect(prompt).toContain('блоки строго в этом порядке')
  })
})

describe('опорный сценарий учителя', () => {
  it('всегда просит фразы say и учитывает имя ученика', () => {
    const prompt = buildPrompt({ ...BASE, student: 'Пётр' })
    expect(prompt).toContain('Опорный сценарий для учителя')
    expect(prompt).toContain('"say"')
    expect(prompt).toContain('по имени (Пётр)')
  })
})

describe('опознание собственного промпта', () => {
  it('узнаёт промпт любого шаблона', () => {
    expect(looksLikePrompt(buildPrompt(BASE))).toBe(true)
    expect(looksLikePrompt(buildPrompt({ ...BASE, template: 'five' }))).toBe(true)
  })

  it('не путает с обычным ответом', () => {
    expect(looksLikePrompt('{"meta": {}, "blocks": []}')).toBe(false)
  })
})
