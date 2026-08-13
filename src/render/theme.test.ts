import { afterEach, describe, expect, it } from 'vitest'
import { applyStyle, color, sticky } from './theme'

/**
 * Палитра — живой объект, который подменяется перед отрисовкой.
 * Главные свойства: узнавание стиля по свободному тексту и полный откат
 * к стандартной палитре, когда стиль не задан или неизвестен.
 */

afterEach(() => applyStyle())

describe('подбор палитры по названию', () => {
  it('узнаёт стиль в свободной формулировке', () => {
    applyStyle('урок в стиле Гарри Поттера, пожалуйста')
    expect(color.accent).toBe('#740001')
  })

  it('латиница тоже работает', () => {
    applyStyle('Minecraft')
    expect(color.accent).toBe('#3c8527')
  })

  it('космос — тёмная палитра со светлым текстом', () => {
    applyStyle('Космос')
    expect(color.frameFill).toBe('#141a38')
    expect(color.ink).toBe('#eef1ff')
    expect(sticky.draggable).toBe('yellow')
  })

  it('неизвестный стиль — стандартная палитра', () => {
    applyStyle('Космос')
    applyStyle('вестерн')
    expect(color.accent).toBe('#4262ff')
    expect(color.ink).toBe('#12151a')
  })

  it('пустой вызов полностью откатывает предыдущий стиль', () => {
    applyStyle('Барби')
    applyStyle()
    expect(color.accent).toBe('#4262ff')
    expect(sticky.draggable).toBe('yellow')
    expect(color.theoryFill).toBe('#f2f5ff')
  })
})
