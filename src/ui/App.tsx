import { useEffect, useRef, useState } from 'react'
import { checkLesson, type CheckResult } from '../check/checkLesson'
import { lessonToHtml } from '../export/lessonHtml'
import { findLessonToCheck } from '../check/findLesson'
import { startLiveCheck, type LiveCheck } from '../check/liveCheck'
import { resetChips } from '../check/resetChips'
import { buildPrompt, TRICK_LABELS, type LessonRequest, type TrickKind } from '../lesson/prompt'
import { SAMPLES } from '../lesson/samples'
import { titleFor, type Lesson, type Subject } from '../lesson/schema'
import { parseLessonResponse } from '../lesson/validate'
import { collectFrameImages } from '../export/boardImages'
import { collectBoardWork, normalizeText, type BoardWork } from '../export/boardWork'
import {
  exportArchive,
  importArchive,
  listLessonSnapshots,
  saveLessonSnapshot,
  type LessonArchive,
  type LessonSnapshot,
} from '../render/metadata'
import { renderLesson } from '../render/renderLesson'
import { onBoard } from '../render/store'
import { STYLE_SUGGESTIONS } from '../render/theme'

/**
 * Есть ли рядом доска.
 *
 * Панель открывается двумя способами: колонкой внутри Miro и просто ссылкой
 * в браузере. Второй способ — не запасной вход, а страховка: производство
 * уроков не должно зависеть от того, работает ли сегодня Miro и остался ли к
 * нему доступ. Форма, промпт, разбор ответа и скачивание файла живут без
 * доски; на доску нужны только отрисовка и проверка карточек.
 *
 * Значение читается один раз при загрузке: доска не может появиться посреди
 * сессии.
 */
const BOARD = onBoard()

const DEFAULT_LEVEL: Record<Subject, string> = {
  physics: '8 класс',
  english: 'B1',
}

const TRICK_TITLES = {
  mysterybox: 'волшебная коробка',
  halves: 'половинки',
  pullout: 'тянучка с вопросами',
  flashlight: 'фонарик',
} as const

/** Чем каждый приём хорош — чтобы выбирать по задаче, а не по названию. */
const TRICK_HINTS: Record<TrickKind, string> = {
  mysterybox: 'собрать фразу или правило из карточек, лежащих в коробке',
  halves: 'пара сходится в целый предмет и проверяет себя сама',
  pullout: 'вопрос вытягивается наугад — для разговора и разминки',
  flashlight: 'слова проявляются в луче — для новой лексики и терминов',
}

/**
 * Все тексты, которые конструктор написал на доске сам.
 *
 * Нужны сбору работы ученика: пустую заготовку от заполненной отличает не
 * время создания — оно у них одно, — а то, свой ли в ней текст. Идём по
 * уроку целиком, не перечисляя поля блоков: блоков два с лишним десятка, и
 * список полей пришлось бы дописывать при каждом новом типе задания.
 */
function ownTexts(lesson: Lesson): ReadonlySet<string> {
  const texts = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const clean = normalizeText(value)
      if (clean) texts.add(clean)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(lesson)
  return texts
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'done'; message: string; warnings: string[] }
  | { kind: 'checked'; result: CheckResult }
  // Заголовок хранится вместе с ошибками: разбор ответа и отрисовка падают
  // по разным причинам, и сваливать их под одну подпись — значит посылать
  // искать проблему не там.
  | { kind: 'error'; heading: string; errors: string[] }

export function App() {
  const [subject, setSubject] = useState<Subject>('physics')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(DEFAULT_LEVEL.physics)
  const [durationMin, setDurationMin] = useState(60)
  const [student, setStudent] = useState('')
  const [studentNotes, setStudentNotes] = useState('')
  const [style, setStyle] = useState('')
  // План из пяти упражнений — авторская структура репетитора, поэтому
  // он и по умолчанию: классическая остаётся как запасная.
  const [template, setTemplate] = useState<'five' | 'classic' | 'language'>('five')
  const [prevTopic, setPrevTopic] = useState('')
  // Приёмы по умолчанию выключены: пусть решает тема занятия, а не привычка.
  const [tricks, setTricks] = useState<TrickKind[]>([])
  /** Ссылка на игру или ролик: конструктор встроит её прямо в урок. */
  const [gameUrl, setGameUrl] = useState('')

  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const [live, setLive] = useState(false)
  const liveRef = useRef<LiveCheck | null>(null)

  const [answersOnBoard, setAnswersOnBoard] = useState(false)
  const [lastLesson, setLastLesson] = useState<Lesson | null>(null)
  /** Фрейм последнего урока этой сессии: по нему берём картинки, если снимок не сохранился. */
  const [lastFrameId, setLastFrameId] = useState('')

  // Уроки, которые помнит сама доска. Панель — обычная страница внутри Miro:
  // любое обновление вкладки стирает её состояние, и без этого списка скачать
  // урок файлом можно было только сразу после отрисовки.
  const [saved, setSaved] = useState<LessonSnapshot[]>([])
  const [chosenFrame, setChosenFrame] = useState('')
  const [withPictures, setWithPictures] = useState(BOARD)
  const [withWork, setWithWork] = useState(false)
  const [audience, setAudience] = useState<'teacher' | 'student'>('teacher')

  const promptRef = useRef<HTMLTextAreaElement>(null)
  const promptSectionRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const busy = status.kind === 'busy'

  /**
   * Урок, о котором сейчас говорит панель.
   *
   * После перезагрузки вкладки состояние React пусто, но доска помнит свои
   * уроки — поэтому берём выбранный в списке, и только если списка ещё нет,
   * опираемся на нарисованный в этой сессии. Иначе F5 стирал бы и ответы,
   * и сценарий, и кнопку сохранения.
   */
  const activeLesson = saved.find((entry) => entry.frameId === chosenFrame)?.lesson ?? lastLesson

  const lessonAnswers = activeLesson?.blocks.find(
    (block): block is Extract<Lesson['blocks'][number], { type: 'answers' }> => block.type === 'answers',
  )

  const lessonScript = activeLesson
    ? activeLesson.blocks
        .filter((block) => block.say)
        .map((block) => ({ title: titleFor(block, activeLesson.meta.language), say: block.say as string }))
    : []

  // Живая проверка держит подписку на события доски и таймер опроса. Если
  // панель закроют, их некому будет снять — Miro просто уничтожит фрейм.
  useEffect(() => () => liveRef.current?.stop(), [])

  useEffect(() => {
    void refreshSaved()
  }, [])

  async function refreshSaved(): Promise<void> {
    try {
      const snapshots = await listLessonSnapshots()
      setSaved(snapshots)
      setChosenFrame((current) => current || snapshots[0]?.frameId || '')
    } catch {
      // Доска не отдала список — не повод показывать ошибку: панель нужна
      // прежде всего для отрисовки, а скачивание здесь просто не появится.
    }
  }

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
      template,
      ...(student.trim() ? { student: student.trim() } : {}),
      ...(studentNotes.trim() ? { studentNotes: studentNotes.trim() } : {}),
      ...(style.trim() ? { style: style.trim() } : {}),
      ...(prevTopic.trim() ? { prevTopic: prevTopic.trim() } : {}),
      ...(tricks.length > 0 ? { tricks } : {}),
      ...(gameUrl.trim() ? { gameUrl: gameUrl.trim() } : {}),
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
      // Тогда раскрываем промпт и выделяем текст, чтобы осталось нажать Ctrl+C.
      setPromptOpen(true)
      setCopied(false)
      requestAnimationFrame(() => promptRef.current?.select())
    }
  }

  async function draw(lesson: Lesson, warnings: string[] = []) {
    setStatus({ kind: 'busy', message: `Рисую урок «${lesson.meta.topic}»…` })
    try {
      const result = await renderLesson(lesson, {
        answersOnBoard,
        onProgress: (progress) =>
          setStatus({ kind: 'busy', message: `Рисую урок «${lesson.meta.topic}»… ${progress}` }),
      })
      setLastLesson(lesson)
      if (result.frame) {
        setChosenFrame(result.frame.id)
        setLastFrameId(result.frame.id)
      }
      void refreshSaved()
      // Приёмы — то, ради чего урок и делается непохожим на анкету. Если их
      // в ответе нейросети не оказалось, репетитор должен узнать это сразу,
      // а не искать коробку глазами на готовой доске.
      const tricks = lesson.blocks
        .filter((block) => TRICK_TITLES[block.type as keyof typeof TRICK_TITLES])
        .map((block) => TRICK_TITLES[block.type as keyof typeof TRICK_TITLES])
      const trickNote = tricks.length
        ? `Приёмы в уроке: ${[...new Set(tricks)].join(', ')}.`
        : 'Приёмов в этом уроке нет: нейросеть не вернула ни коробку, ни половинки, ни тянучку, ни фонарик. Попросите её добавить их — промпт эти блоки запрашивает.'

      setStatus({
        kind: 'done',
        message: `Готово: ${result.itemCount} объектов${
          result.answersFrame ? ', ответы в отдельном фрейме справа' : ', ответы — ниже в панели'
        }. ${trickNote}`,
        warnings: [...warnings, ...result.warnings],
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось нарисовать урок:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка Miro'],
      })
    }
  }

  /**
   * Урок без доски: разобрали ответ, проверили, запомнили.
   *
   * Рисовать здесь нечего — фрейма нет и не будет, — но всё остальное, ради
   * чего панель существует, работает: ошибки в ответе нейросети видны сразу,
   * сценарий и ответы открываются ниже, а урок ложится в память браузера и
   * скачивается файлом. Идентификатор берётся из времени: доска раздавала
   * его сама, а без доски нужен хоть какой-то, лишь бы разные уроки не
   * затирали друг друга.
   */
  async function keep(lesson: Lesson, warnings: string[] = []) {
    const frameId = `local-${Date.now().toString(36)}`
    setLastLesson(lesson)
    setChosenFrame(frameId)
    try {
      await saveLessonSnapshot({ frameId, lesson, anchors: [], savedAt: new Date().toISOString() })
      await refreshSaved()
    } catch {
      // Память браузера могла отказать — урок всё равно у нас в руках,
      // и кнопка «Скачать урок файлом» ниже работает от lastLesson.
    }
    setStatus({
      kind: 'done',
      message: `Урок «${lesson.meta.topic}» готов. Скачайте его файлом внизу — карточки в нём перетаскиваются, задания проверяют себя сами.`,
      warnings,
    })
  }

  /** Что делает кнопка «Нарисовать»: на доске — рисует, без доски — запоминает. */
  const place = BOARD ? draw : keep

  async function toggleLive() {
    if (liveRef.current) {
      liveRef.current.stop()
      liveRef.current = null
      setLive(false)
      return
    }

    setStatus({ kind: 'busy', message: 'Включаю живую проверку…' })
    try {
      liveRef.current = await startLiveCheck({
        onUpdate: (result) => setStatus({ kind: 'checked', result }),
        onError: (message) =>
          setStatus({ kind: 'error', heading: 'Живая проверка споткнулась:', errors: [message] }),
      })
      setLive(true)
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось включить:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка Miro'],
      })
    }
  }

  async function check() {
    setStatus({ kind: 'busy', message: 'Проверяю задания…' })
    try {
      const frame = await findLessonToCheck()
      if (!frame) {
        setStatus({
          kind: 'error',
          heading: 'Нечего проверять:',
          errors: ['На доске нет уроков с интерактивными заданиями.'],
        })
        return
      }
      setStatus({ kind: 'checked', result: await checkLesson(frame) })
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось проверить:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка Miro'],
      })
    }
  }

  async function reset() {
    setStatus({ kind: 'busy', message: 'Раскладываю карточки обратно…' })
    try {
      const frame = await findLessonToCheck()
      if (!frame) {
        setStatus({
          kind: 'error',
          heading: 'Нечего раскладывать:',
          errors: ['На доске нет уроков с интерактивными заданиями.'],
        })
        return
      }
      const moved = await resetChips(frame)
      setStatus({ kind: 'done', message: `Карточек возвращено на места: ${moved}.`, warnings: [] })
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось разложить:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка Miro'],
      })
    }
  }

  function drawFromAnswer() {
    const parsed = parseLessonResponse(answer)
    if (!parsed.ok) {
      setStatus({ kind: 'error', heading: 'Не получилось разобрать ответ:', errors: parsed.errors })
      return
    }
    void place(parsed.lesson, parsed.warnings)
  }

  /**
   * Выгрузка всех уроков одним файлом.
   *
   * HTML-копия — это готовая страница: по ней можно провести занятие, но
   * нельзя пересобрать урок на другой доске. Исходники до сих пор жили только
   * в памяти Miro и исчезли бы вместе с доступом к ней.
   */
  async function downloadArchive() {
    setStatus({ kind: 'busy', message: 'Собираю все уроки…' })
    try {
      const archive = await exportArchive()
      const blob = new Blob([JSON.stringify(archive)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `уроки-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)

      setStatus({
        kind: 'done',
        message: `Сохранено уроков: ${archive.lessons.length}. Из этого файла урок можно нарисовать заново на любой доске.`,
        warnings: [],
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось собрать уроки:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка Miro'],
      })
    }
  }

  async function uploadArchive(file: File) {
    setStatus({ kind: 'busy', message: BOARD ? 'Возвращаю уроки на доску…' : 'Читаю файл с уроками…' })
    try {
      const archive = JSON.parse(await file.text()) as LessonArchive
      const restored = await importArchive(archive)
      await refreshSaved()
      setStatus({
        kind: 'done',
        message: `Уроков вернулось: ${restored}. Они в списке ниже — выберите и ${
          BOARD ? 'нарисуйте заново' : 'скачайте файлом'
        }.`,
        warnings: [],
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        heading: 'Не получилось прочитать файл:',
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка'],
      })
    }
  }

  async function downloadHtml() {
    const snapshot = saved.find((entry) => entry.frameId === chosenFrame)
    const lesson = snapshot?.lesson ?? lastLesson
    if (!lesson) return

    // Картинки живут только на доске, поэтому забираем их прямо перед
    // сохранением: репетитор украшает урок уже после отрисовки, и в файл
    // должно попасть то, что на доске сейчас, а не то, что было при генерации.
    let images: Awaited<ReturnType<typeof collectFrameImages>> = { images: [], notes: [], look: {}, skipped: 0 }
    let imageError: string | null = null
    let warningsFromWork: string | null = null

    // Фрейм нужен только для картинок, и он известен даже без снимка: урок,
    // нарисованный в этой сессии, помнит свой фрейм. Раньше картинки собирались
    // исключительно по снимку — а если снимок не сохранился, файл молча уходил
    // без оформления, и понять почему было невозможно.
    const frameId = snapshot?.frameId ?? lastFrameId
    if (BOARD && withPictures && frameId) {
      setStatus({ kind: 'busy', message: 'Собираю картинки с доски…' })
      try {
        images = await collectFrameImages(
          frameId,
          snapshot?.anchors ?? [],
          snapshot?.itemIds ?? [],
          lesson.blocks.filter((block) => block.type !== 'answers').length,
          (message) => setStatus({ kind: 'busy', message }),
        )
      } catch (error) {
        imageError = error instanceof Error ? error.message : 'неизвестная ошибка Miro'
      }
    }

    // Ответы ученика и его заметки: то, ради чего файл становится памятью
    // о занятии, а не бланком. Берутся с доски в момент сохранения.
    let work: BoardWork | undefined
    if (BOARD && withWork && frameId) {
      setStatus({ kind: 'busy', message: 'Собираю работу ученика…' })
      try {
        work = await collectBoardWork(
          frameId,
          snapshot?.savedAt ?? new Date(0).toISOString(),
          ownTexts(lesson),
        )
      } catch (error) {
        warningsFromWork = error instanceof Error ? error.message : 'неизвестная ошибка Miro'
      }
    }

    const html = lessonToHtml(lesson, {
      images: images.images,
      notes: images.notes,
      look: images.look,
      audience,
      ...(work ? { work } : {}),
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const slug = lesson.meta.topic.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
    link.download = `урок-${slug}${audience === 'student' ? '-ученику' : ''}.html`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)

    const size = Math.round(html.length / 1024)
    const warnings: string[] = []
    if (warningsFromWork) {
      warnings.push(`Работу ученика собрать не удалось (${warningsFromWork}).`)
    }
    if (work?.drawings) {
      warnings.push(
        `На доске ${work.drawings} рисунков от руки — их содержимое Miro в файл не отдаёт. Если рисунки важны, сохраните доску картинкой: меню фрейма, «Export image».`,
      )
    }
    if (imageError) {
      warnings.push(`Картинки с доски забрать не удалось (${imageError}).`)
    } else if (images.skipped) {
      warnings.push(
        `Картинок найдено, но не удалось забрать: ${images.skipped}. Скорее всего, Miro не отдаёт их файлы из панели — покажите мне это сообщение, найдём другой путь.`,
      )
    } else if (BOARD && withPictures && !frameId) {
      warnings.push(
        'Картинки не искали: неизвестно, в каком фрейме урок. Нарисуйте урок заново — тогда доска запомнит его вместе с фреймом.',
      )
    } else if (BOARD && withPictures && images.images.length === 0) {
      warnings.push(
        'Картинок на уроке не нашлось. Они должны лежать внутри рамки урока — если картинка легла рядом с фреймом, перетащите её внутрь.',
      )
    }

    setStatus({
      kind: 'done',
      message: BOARD
        ? `Файл сохранён: ${images.images.length} картинок с доски, ${size} КБ.`
        : `Файл сохранён, ${size} КБ. Откройте его двойным щелчком — он работает без интернета.`,
      warnings,
    })
  }

  const canBuild = topic.trim().length > 0 && level.trim().length > 0

  return (
    <>
      <h1>Конструктор уроков</h1>
      <p className="subtitle">
        {BOARD
          ? 'Собирает урок на доске: теория, задания и ответы.'
          : 'Собирает урок файлом: теория, задания и ответы. Доска не нужна — файл открывается в любом браузере.'}
      </p>

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
          Структура урока
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value as 'five' | 'classic' | 'language')}
          >
            <option value="five">Короткая: 5 упражнений подряд</option>
            <option value="classic">Полная: с целями, итогами и домашкой</option>
            <option value="language">Языковая: лексика, текст, грамматика, разговор</option>
          </select>
          <span className="hint">
            {template === 'language'
              ? 'Разминка, план, новая лексика с закреплением, текст с этой же лексикой, грамматика с упражнением, разговор, итоги. Семь шагов языковой школы: слово сначала встречается в речи и тексте, а правило разбирается после.'
              : template === 'five'
              ? 'Вспоминаем прошлое, разбираем новое картой, практика, игра, рефлексия. Ровно пять упражнений, без целей и домашки — для занятия, которое идёт по накатанной.'
              : subject === 'physics'
                ? 'Цели, разминка, теория, формулы, разбор примера, задачи, игра, вопросы «почему», итоги, домашка. Длиннее и подробнее — для новой темы.'
                : 'Цели, разминка, грамматика, лексика, половинки, фонарик, пропуски, коробка, говорение, итоги, домашка. Длиннее и подробнее — для новой темы.'}
            {' '}Все три структуры работают и для физики, и для английского — предмет выбирается выше.
          </span>
        </label>

        <label>
          Игра или видео <span className="optional">необязательно</span>
          <input
            value={gameUrl}
            onChange={(event) => setGameUrl(event.target.value)}
            placeholder="ссылка с Wordwall, LearningApps, YouTube"
          />
          <span className="hint">
            {BOARD
              ? 'Встанет прямо на доску живым окном — ученику не придётся уходить в соседнюю вкладку. В скачанном файле останется ссылкой.'
              : 'В уроке останется ссылкой — ученик откроет её из файла одним щелчком.'}
          </span>
        </label>

        <fieldset className="tricks">
          <legend>
            Приёмы оформления <span className="optional">по умолчанию без них</span>
          </legend>
          <span className="hint">
            Приём хорош, пока он неожиданность: коробка в каждом уроке — уже просто ящик.
            Отметьте один-два под тему занятия.
          </span>
          {(Object.keys(TRICK_LABELS) as TrickKind[]).map((kind) => (
            <label className="check" key={kind}>
              <input
                type="checkbox"
                checked={tricks.includes(kind)}
                onChange={(event) =>
                  setTricks((current) =>
                    event.target.checked ? [...current, kind] : current.filter((item) => item !== kind),
                  )
                }
              />
              <span>
                {TRICK_LABELS[kind]}
                <span className="hint">{TRICK_HINTS[kind]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {template === 'five' && (
          <label>
            Прошлая тема <span className="optional">для упражнения «Вспоминаем»</span>
            <input
              value={prevTopic}
              onChange={(event) => setPrevTopic(event.target.value)}
              placeholder={subject === 'physics' ? 'например, Сила тока' : 'например, Present Simple'}
            />
          </label>
        )}

        <label>
          Стиль оформления <span className="optional">необязательно</span>
          <input
            list="style-suggestions"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            placeholder="например, Гарри Поттер — цвета и формулировки"
          />
          <datalist id="style-suggestions">
            {STYLE_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

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
          <button type="button" className="primary" onClick={() => void copyPrompt()}>
            {copied ? 'Скопировано' : 'Скопировать промпт'}
          </button>
          {/*
            Промпт свёрнут намеренно. Промпт и ответ ходят через один буфер
            обмена, и два одинаковых поля подряд провоцируют вставить промпт
            туда, где ждут ответ. Видимое поле должно быть ровно одно.
          */}
          <details open={promptOpen} onToggle={(event) => setPromptOpen(event.currentTarget.open)}>
            <summary className="reveal">Показать промпт</summary>
            <textarea className="mono" rows={6} readOnly value={prompt} ref={promptRef} />
          </details>
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
        {BOARD && (
          <label className="check">
            <input
              type="checkbox"
              checked={answersOnBoard}
              onChange={(event) => setAnswersOnBoard(event.target.checked)}
            />
            <span>
              Вынести ответы фреймом на доску
              <span className="hint">
                осторожно: ученик с правами редактирования может до них доскроллить
              </span>
            </span>
          </label>
        )}
        <button
          type="button"
          className="primary"
          disabled={busy || !answer.trim()}
          onClick={drawFromAnswer}
        >
          {BOARD ? 'Нарисовать урок' : 'Собрать урок'}
        </button>
      </section>

      {BOARD && (
      <section className="step">
        <div className="step-label">Во время занятия</div>
        <p className="hint-line">
          {live
            ? 'Зона окрашивается сразу, как только в неё легла карточка.'
            : 'Включите — и зоны начнут краснеть и зеленеть сами, по мере того как ученик раскладывает карточки. Следим за уроком, на который вы смотрите.'}
        </p>
        <button
          type="button"
          className={live ? 'primary' : ''}
          disabled={busy}
          onClick={() => void toggleLive()}
        >
          {live ? 'Живая проверка включена' : 'Включить живую проверку'}
        </button>
        <button type="button" disabled={busy || live} onClick={() => void check()}>
          Проверить один раз
        </button>
        <button type="button" disabled={busy} onClick={() => void reset()}>
          Разложить карточки обратно
          <span className="hint">чтобы дать тот же урок следующему ученику</span>
        </button>
      </section>
      )}

      {status.kind === 'busy' && <div className="status">{status.message}</div>}

      {status.kind === 'checked' && (
        <div className="status done" ref={statusRef}>
          {`«${status.result.topic}» — верно ${status.result.correct} из ${status.result.total}`}
          <ul>
            {status.result.exercises.map((exercise) => (
              <li key={exercise.ref}>
                {exercise.title}: {exercise.correct} из {exercise.total}
                {exercise.untouched > 0 && `, не разложено ${exercise.untouched}`}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {lessonScript.length > 0 && (
            <details className="answers-panel">
              <summary>Сценарий для учителя — что говорить</summary>
              <ul>
                {lessonScript.map((entry) => (
                  <li key={entry.title + entry.say}>
                    <strong>{entry.title}:</strong> {entry.say}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {activeLesson?.meta.imageIdeas && activeLesson.meta.imageIdeas.length > 0 && (
            <>
              <div className="status-heading">
                Картинки к оформлению — поищите и перетащите на доску:
              </div>
              <ul>
                {activeLesson.meta.imageIdeas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </>
          )}
          {!answersOnBoard && lessonAnswers && lessonAnswers.items.length > 0 && (
            <details className="answers-panel">
              <summary>Ответы — только для преподавателя</summary>
              <ul>
                {lessonAnswers.items.map((entry) => (
                  <li key={entry.ref}>
                    <strong>{entry.ref.toUpperCase()}</strong> — {entry.answer}
                    {entry.solution && <span className="solution"> ({entry.solution})</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!busy && (
        <section className="step">
          <div className="step-label">Страховка</div>

          {saved.length === 0 && !lastLesson && (
            <p className="hint">
              {BOARD
                ? 'Здесь появится кнопка «Скачать урок файлом». Доска помнит только уроки, нарисованные этой панелью: если ваши уроки старше обновления, нарисуйте любой урок заново — и он встанет в список.'
                : 'Здесь появится кнопка «Скачать урок файлом». Соберите урок выше — или верните уроки из файла кнопкой ниже.'}
            </p>
          )}

          {saved.length > 0 && (
            <label>
              Какой урок сохранить
              <select value={chosenFrame} onChange={(event) => setChosenFrame(event.target.value)}>
                {saved.map((entry) => (
                  <option key={entry.frameId} value={entry.frameId}>
                    {entry.lesson.meta.topic}
                    {entry.lesson.meta.student ? ` · ${entry.lesson.meta.student}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {BOARD && (saved.length > 0 || lastLesson) && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={withPictures}
                  onChange={(event) => setWithPictures(event.target.checked)}
                />
                <span>
                  с картинками с доски
                  <span className="hint">
                    заберёт всё, что вы положили на урок руками, и вошьёт прямо в файл
                  </span>
                </span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={withWork}
                  onChange={(event) => setWithWork(event.target.checked)}
                />
                <span>
                  с работой ученика
                  <span className="hint">
                    что он разложил по клеткам и что написал на доске — урок на память
                  </span>
                </span>
              </label>
            </>
          )}

          <div className="segmented">
            <button
              type="button"
              className={audience === 'teacher' ? 'active' : ''}
              onClick={() => setAudience('teacher')}
            >
              Себе
            </button>
            <button
              type="button"
              className={audience === 'student' ? 'active' : ''}
              onClick={() => setAudience('student')}
            >
              Ученику
            </button>
          </div>
          <span className="hint">
            {audience === 'teacher'
              ? 'С ключом к заданиям и репликами «что сказать».'
              : 'Без ответов и без ваших реплик — то же занятие его глазами.'}
          </span>

          <div className="archive">
            <button type="button" disabled={saved.length === 0} onClick={() => void downloadArchive()}>
              Сохранить все уроки одним файлом
              <span className="hint">
                исходники, а не готовые страницы: из этого файла урок собирается заново — на новой
                доске, в новом аккаунте, вообще без доски
              </span>
            </button>
            <label className="restore">
              Вернуть уроки из файла
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void uploadArchive(file)
                }}
              />
            </label>
          </div>

          <button
            type="button"
            disabled={saved.length === 0 && !lastLesson}
            onClick={() => void downloadHtml()}
          >
            Скачать урок файлом (HTML)
            <span className="hint">
              карточки перетаскиваются, задания проверяют себя сами — работает в любом браузере
              без Miro и интернета, а на печати превращается в рабочий лист
            </span>
          </button>
        </section>
      )}

      {status.kind === 'error' && (
        <div className="status error" ref={statusRef}>
          <div className="status-heading">{status.heading}</div>
          <ul>
            {status.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="samples">
        <summary>Образцы для проверки вёрстки</summary>
        <button type="button" disabled={busy} onClick={() => void place(SAMPLES.physics)}>
          Физика: закон Ома
          <span className="hint">стиль «Космос», интеллект-карта, рефлексия</span>
        </button>
        <button type="button" disabled={busy} onClick={() => void place(SAMPLES.english)}>
          Английский: Past Simple
          <span className="hint">стиль «Барби», три интерактива, рефлексия</span>
        </button>
      </details>
    </>
  )
}
