import { expect, it } from 'vitest'
import { ENGLISH_SAMPLE } from '../lesson/samples'
import { lessonToHtml } from './lessonHtml'

it('палитра доски перебивает заводскую, но не ломает вёрстку', () => {
  const plain = lessonToHtml(ENGLISH_SAMPLE)
  expect(plain).toContain('--page: #ffffff')
  expect(plain).not.toContain(':root{--page:')

  const dark = lessonToHtml(ENGLISH_SAMPLE, {
    look: { page: '#141a38', ink: '#eef1ff', card: '#232b52', border: '#4a5590' },
  })
  // Переопределение идёт последним и только переменными.
  expect(dark).toContain(':root{--page:#141a38;--ink:#eef1ff;--card:#232b52;--card-line:#4a5590}')
  expect(dark.indexOf('--page: #ffffff')).toBeLessThan(dark.indexOf(':root{--page:#141a38'))
  // Правила вёрстки остались прежними — меняются только цвета.
  expect(dark).toContain('.card { background: var(--card)')

  // Частичная палитра допустима: доска могла отдать только фон.
  const partial = lessonToHtml(ENGLISH_SAMPLE, { look: { page: '#000000' } })
  expect(partial).toContain(':root{--page:#000000}')
})
