import { useState } from 'react'
import { SAMPLES } from '../lesson/samples'
import type { Lesson } from '../lesson/schema'
import { renderLesson } from '../render/renderLesson'

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; message: string }

const IDLE: Status = { kind: 'idle', message: '' }

export function App() {
  const [status, setStatus] = useState<Status>(IDLE)
  const busy = status.kind === 'busy'

  async function draw(lesson: Lesson) {
    setStatus({ kind: 'busy', message: `Рисую урок «${lesson.meta.topic}»…` })
    try {
      const result = await renderLesson(lesson)
      setStatus({
        kind: 'done',
        message: `Готово: ${result.itemCount} объектов${result.answersFrame ? ', ответы в отдельном фрейме справа' : ''}.`,
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Не удалось нарисовать урок',
      })
    }
  }

  return (
    <>
      <h1>Конструктор уроков</h1>
      <p className="subtitle">Собирает урок на доске: теория, задания и ответы.</p>

      <div className="group">
        <div className="group-label">Образцы для проверки вёрстки</div>

        <button type="button" disabled={busy} onClick={() => void draw(SAMPLES.physics)}>
          Физика: закон Ома
          <span className="hint">8 класс · теория, формулы, 6 задач, два интерактива</span>
        </button>

        <button type="button" disabled={busy} onClick={() => void draw(SAMPLES.english)}>
          Английский: Past Simple
          <span className="hint">B1 · грамматика, лексика, три интерактива</span>
        </button>
      </div>

      {status.message && (
        <div className={status.kind === 'error' ? 'status error' : 'status'}>{status.message}</div>
      )}

      <p className="note">
        Генерация по произвольной теме появится, когда подключим нейросеть. Пока эти два урока служат
        образцом: по ним видно, как раскладка ведёт себя на реальных текстах.
      </p>
    </>
  )
}
