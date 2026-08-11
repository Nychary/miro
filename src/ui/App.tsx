import { useEffect, useRef, useState } from 'react'
import { buildPrompt, type LessonRequest } from '../lesson/prompt'
import { SAMPLES } from '../lesson/samples'
import type { Lesson, Subject } from '../lesson/schema'
import { parseLessonResponse } from '../lesson/validate'
import { renderLesson } from '../render/renderLesson'

const DEFAULT_LEVEL: Record<Subject, string> = {
  physics: '8 класс',
  english: 'B1',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'done'; message: string; warnings: string[] }
  | { kind: 'error'; errors: string[] }

export function App() {
  const [subject, setSubject] = useState<Subject>('physics')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(DEFAULT_LEVEL.physics)
  const [durationMin, setDurationMin] = useState(60)
  const [student, setStudent] = useState('')
  const [studentNotes, setStudentNotes] = useState('')

  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const promptRef = useRef<HTMLTextAreaElement>(null)
  const promptSectionRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const busy = status.kind === 'busy'

  // Панель в Miro — узкая колонка с прокруткой, и всё новое появляется ниже
  // текущего экрана. Без этого нажатие на кнопку выглядит как «ничего не
  // произошло»: результат есть, но его не видно.
  useEffect(() => {
    if (prompt) promptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [prompt])

  useEffect(() => {
    if (status.kind === 'done' || status.kind === 'error') {
      statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [status])

  function changeSubject(next: Subject) {
    // Уровень меняем только если репетитор его не трогал: «8 класс» для
    // английского и «B1» для физики одинаково бессмысленны.
    if (level === DEFAULT_LEVEL[subject]) setLevel(DEFAULT_LEVEL[next])
    setSubject(next)
    setPrompt('')
  }

  function makePrompt() {
    const request: LessonRequest = {
      subject,
      topic: topic.trim(),
      level: level.trim(),
      durationMin,
      language: 'ru',
      ...(student.trim() ? { student: student.trim() } : {}),
      ...(studentNotes.trim() ? { studentNotes: studentNotes.trim() } : {}),
    }
    setPrompt(buildPrompt(request))
    setCopied(false)
    setStatus({ kind: 'idle' })
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      // Панель живёт во фрейме Miro, и доступ к буферу там может быть закрыт.
      // Тогда выделяем текст, чтобы осталось нажать Ctrl+C.
      promptRef.current?.select()
      setCopied(false)
    }
  }

  async function draw(lesson: Lesson, warnings: string[] = []) {
    setStatus({ kind: 'busy', message: `Рисую урок «${lesson.meta.topic}»…` })
    try {
      const result = await renderLesson(lesson)
      setStatus({
        kind: 'done',
        message: `Готово: ${result.itemCount} объектов${result.answersFrame ? ', ответы в отдельном фрейме справа' : ''}.`,
        warnings,
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        errors: [error instanceof Error ? error.message : 'Не удалось нарисовать урок'],
      })
    }
  }

  function drawFromAnswer() {
    const parsed = parseLessonResponse(answer)
    if (!parsed.ok) {
      setStatus({ kind: 'error', errors: parsed.errors })
      return
    }
    void draw(parsed.lesson, parsed.warnings)
  }

  const canBuild = topic.trim().length > 0 && level.trim().length > 0

  return (
    <>
      <h1>Конструктор уроков</h1>
      <p className="subtitle">Собирает урок на доске: теория, задания и ответы.</p>

      <section className="step">
        <div className="step-label">Шаг 1 — про урок</div>

        <div className="segmented">
          <button
            type="button"
            className={subject === 'physics' ? 'active' : ''}
            onClick={() => changeSubject('physics')}
          >
            Физика
          </button>
          <button
            type="button"
            className={subject === 'english' ? 'active' : ''}
            onClick={() => changeSubject('english')}
          >
            Английский
          </button>
        </div>

        {/*
          Подсказки начинаются с «например» намеренно. Реалистичное значение
          серым текстом выглядит как заполненное поле — и тогда неактивная
          кнопка ниже воспринимается как сломанная, а не как «заполни тему».
        */}
        <label>
          Тема
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={subject === 'physics' ? 'например, Закон Ома' : 'например, Past Simple'}
          />
        </label>

        <div className="row">
          <label>
            Уровень
            <input value={level} onChange={(event) => setLevel(event.target.value)} />
          </label>
          <label>
            Минут
            <select value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))}>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </label>
        </div>

        <label>
          Ученик <span className="optional">необязательно</span>
          <input
            value={student}
            onChange={(event) => setStudent(event.target.value)}
            placeholder="например, Пётр"
          />
        </label>

        <label>
          Что учесть <span className="optional">необязательно</span>
          <textarea
            rows={3}
            value={studentNotes}
            onChange={(event) => setStudentNotes(event.target.value)}
            placeholder="Путает последовательное и параллельное соединение. Готовимся к ОГЭ."
          />
        </label>

        {/* Подсказка стоит над кнопкой, а не под ней: панель узкая, и всё,
            что ниже кнопки, оказывается за краем экрана — ровно там, где
            объяснение уже никому не поможет. */}
        {!canBuild && <p className="hint-line required">Сначала заполните тему и уровень.</p>}
        <button type="button" className="primary" disabled={!canBuild} onClick={makePrompt}>
          Собрать промпт
        </button>
      </section>

      {prompt && (
        <section className="step" ref={promptSectionRef}>
          <div className="step-label">Шаг 2 — отдайте нейросети</div>
          <p className="hint-line">
            Скопируйте промпт, вставьте в любой чат с нейросетью и скопируйте её ответ целиком.
          </p>
          <textarea className="mono" rows={6} readOnly value={prompt} ref={promptRef} />
          <button type="button" onClick={() => void copyPrompt()}>
            {copied ? 'Скопировано' : 'Скопировать промпт'}
          </button>
        </section>
      )}

      <section className="step">
        <div className="step-label">Шаг 3 — верните ответ</div>
        <textarea
          className="mono"
          rows={6}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Вставьте сюда ответ нейросети"
        />
        <button
          type="button"
          className="primary"
          disabled={busy || !answer.trim()}
          onClick={drawFromAnswer}
        >
          Нарисовать урок
        </button>
      </section>

      {status.kind === 'busy' && <div className="status">{status.message}</div>}

      {status.kind === 'done' && (
        <div className="status done" ref={statusRef}>
          {status.message}
          {status.warnings.length > 0 && (
            <>
              <div className="status-heading">Стоит проверить перед занятием:</div>
              <ul>
                {status.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {status.kind === 'error' && (
        <div className="status error" ref={statusRef}>
          <div className="status-heading">Не получилось разобрать ответ:</div>
          <ul>
            {status.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="samples">
        <summary>Образцы для проверки вёрстки</summary>
        <button type="button" disabled={busy} onClick={() => void draw(SAMPLES.physics)}>
          Физика: закон Ома
        </button>
        <button type="button" disabled={busy} onClick={() => void draw(SAMPLES.english)}>
          Английский: Past Simple
        </button>
      </details>
    </>
  )
}
