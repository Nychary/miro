import { describe, expect, it } from 'vitest'
import { ENGLISH_SAMPLE, PHYSICS_SAMPLE } from '../lesson/samples'
import type { Lesson } from '../lesson/schema'
import { lessonToHtml } from './lessonHtml'

/**
 * Экспорт — страховка на случай потери доступа к доске, поэтому главное
 * свойство здесь — полнота: всё содержание урока обязано попасть в файл.
 */

describe('полнота экспорта', () => {
  it('физика: все блоки и все задачи на месте', () => {
    const html = lessonToHtml(PHYSICS_SAMPLE)

    expect(html).toContain('Закон Ома для участка цепи')
    expect(html).toContain('Цели урока')
    expect(html).toContain('I = U / R')
    expect(html).toContain('Разбор примера')
    for (const ref of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
      expect(html).toContain(ref)
    }
    expect(html).toContain('Подсказки')
    expect(html).toContain('Ампер (А)')
    expect(html).toContain('Домашнее задание')
  })

  it('английский: таблица грамматики, лексика и банк слов', () => {
    const html = lessonToHtml(ENGLISH_SAMPLE)

    expect(html).toContain('Past Simple')
    expect(html).toContain('<table>')
    expect(html).toContain('We went to Prague last spring.')
    expect(html).toContain('bought')
    // Пропуски превращаются в зоны: на экране в них кладут карточки,
    // на печати это пустые подчёркивания.
    expect(html).toContain('Last summer we <span class="slot" data-answer="went"></span> to Italy by train.')
  })

  it('интерактивные задания получают карточки, зоны и самопроверку', () => {
    const html = lessonToHtml(ENGLISH_SAMPLE)

    expect(html).toContain('class="chip"')
    expect(html).toContain('class="zone blank tall"')
    expect(html).toContain('class="btn check"')
    expect(html).toContain('<script>')
    // Карточка сортировки знает свою правильную группу.
    expect(html).toMatch(/class="chip" data-value="[^"]+" data-group="[^"]+"/)
  })

  it('интеллект-карта и рефлексия попадают в файл', () => {
    const physics = lessonToHtml(PHYSICS_SAMPLE)
    expect(physics).toContain('Закон Ома</div>')
    expect(physics).toContain('Требует дозаправки')
    expect(physics).toContain('стиль: Космос')

    const english = lessonToHtml(ENGLISH_SAMPLE)
    expect(english).toContain('Было легко')
  })

  it('ответы попадают в файл и помечены для преподавателя', () => {
    const html = lessonToHtml(PHYSICS_SAMPLE)
    expect(html).toContain('для преподавателя')
    expect(html).toContain('R = 550 Ом')
    expect(html).toContain('отрежьте эту часть')
  })

  it('сценарий учителя лежит в преподавательской части', () => {
    const html = lessonToHtml(PHYSICS_SAMPLE)
    const teacherPart = html.slice(html.indexOf('class="answers"'))
    expect(teacherPart).toContain('Сценарий')
    expect(teacherPart).toContain('проверим бортовые системы')
    // До преподавательской части фраз сценария быть не должно.
    expect(html.slice(0, html.indexOf('class="answers"'))).not.toContain('бортовые системы')
  })
})

describe('устойчивость', () => {
  it('экранирует HTML в содержании', () => {
    const lesson: Lesson = {
      meta: {
        subject: 'physics',
        topic: 'Сравнение: a < b и <script>alert(1)</script>',
        level: '8 класс',
        durationMin: 60,
        language: 'ru',
      },
      blocks: [{ type: 'objectives', items: ['Понять, когда x > y & x < z'] }],
    }

    const html = lessonToHtml(lesson)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('x &gt; y &amp; x &lt; z')
  })

  it('урок без ответов не рождает секцию ответов', () => {
    const lesson: Lesson = {
      meta: { subject: 'english', topic: 'Тест', level: 'B1', durationMin: 45, language: 'ru' },
      blocks: [{ type: 'objectives', items: ['Цель'] }],
    }

    const html = lessonToHtml(lesson)
    expect(html).not.toContain('class="answers"')
  })

  it('урок без интерактивных заданий не тащит скрипт', () => {
    const lesson: Lesson = {
      meta: { subject: 'english', topic: 'Тест', level: 'B1', durationMin: 45, language: 'ru' },
      blocks: [{ type: 'objectives', items: ['Цель'] }],
    }

    const html = lessonToHtml(lesson)
    expect(html).not.toContain('<script>')
  })

  it('выдаёт валидный самодостаточный документ', () => {
    const html = lessonToHtml(PHYSICS_SAMPLE)
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<style>')
    // Никаких внешних зависимостей: файл должен открываться без интернета.
    expect(html).not.toMatch(/src="http/)
    expect(html).not.toMatch(/href="http/)
  })
})
