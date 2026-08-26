import type { Frame, Image } from '@mirohq/websdk-types'
import { absoluteCenter, loadParents, type Positioned } from '../render/geometry'
import type { BlockAnchor } from '../render/metadata'

/**
 * Сбор картинок, которые репетитор положил на урок руками.
 *
 * Конструктор рисует текст и карточки, а фоны, наклейки и иллюстрации
 * приносит человек — и именно они делают урок «своим». В файл они не попадали:
 * экспорт собирался из JSON урока, а о доске ничего не знал. Здесь мы идём
 * с другой стороны — читаем фрейм урока и забираем всё, что в нём лежит
 * картинками.
 *
 * Картинка на доске — ссылка на хранилище Miro, а файл-страховка обязан
 * открываться без интернета. Поэтому каждая картинка скачивается и вшивается
 * в HTML целиком (data:), заодно уменьшаясь до разумного размера: урок с
 * десятком фотографий в оригинале весил бы десятки мегабайт.
 */

export interface LessonImage {
  /** Картинка, вшитая в файл. */
  dataUrl: string
  alt: string
  /** Индекс блока, рядом с которым картинка лежала на доске. -1 — шапка. */
  blockIndex: number
  /** Ширина картинки на доске относительно ширины фрейма, 0…1. */
  widthRatio: number
}

export interface CollectResult {
  images: LessonImage[]
  /** Сколько картинок не удалось забрать — о них честно говорим в панели. */
  skipped: number
}

/** Дальше этой ширины школьная иллюстрация в файле не нужна. */
const MAX_WIDTH = 1200
/** Потолок на файл целиком: почтой и мессенджером должно отправляться. */
const TOTAL_BUDGET = 12 * 1024 * 1024

/** Картинка вместе с её положением в координатах доски. */
interface Placed {
  picture: Image
  x: number
  y: number
}

export async function collectFrameImages(
  frameId: string,
  anchors: BlockAnchor[],
  onProgress?: (message: string) => void,
): Promise<CollectResult> {
  const [frame] = (await miro.board.get({ id: [frameId] })) as Frame[]
  if (!frame) return { images: [], skipped: 0 }

  const pictures = await picturesOver(frame)
  if (pictures.length === 0) return { images: [], skipped: 0 }

  // Сверху вниз — в том же порядке, в каком идут секции в файле.
  const ordered = [...pictures].sort((a, b) => a.y - b.y || a.x - b.x)

  const images: LessonImage[] = []
  let skipped = 0
  let budget = TOTAL_BUDGET

  for (const [index, placed] of ordered.entries()) {
    const picture = placed.picture
    onProgress?.(`Забираю картинку ${index + 1} из ${ordered.length}…`)
    const dataUrl = await toDataUrl(picture, budget)
    if (!dataUrl) {
      skipped += 1
      continue
    }

    budget -= dataUrl.length
    images.push({
      dataUrl,
      alt: picture.title || 'Иллюстрация урока',
      blockIndex: blockAt(placed.y, anchors),
      widthRatio: frame.width > 0 ? Math.min(1, picture.width / frame.width) : 0.5,
    })

    if (budget <= 0) {
      skipped += ordered.length - index - 1
      break
    }
  }

  return { images, skipped }
}

/**
 * Картинки, лежащие на уроке.
 *
 * Дети фрейма — только половина ответа. Картинку, брошенную поверх готового
 * урока, Miro присоединяет к фрейму не всегда: если она легла на карточку, а
 * не на свободное место фрейма, она остаётся самостоятельным объектом доски и
 * в `getChildren` не попадает. Для человека она при этом часть урока — он её
 * туда и клал. Поэтому вторым заходом берём все картинки доски и оставляем те,
 * что попадают в прямоугольник фрейма.
 */
async function picturesOver(frame: Frame): Promise<Placed[]> {
  const candidates = new Map<string, Image>()

  for (const child of await frame.getChildren()) {
    if (child.type === 'image') candidates.set(child.id, child as Image)
  }

  try {
    // Картинку, брошенную поверх карточки, Miro к фрейму не присоединяет —
    // для человека она при этом часть урока. Берём все картинки доски и ниже
    // оставляем те, что лежат в границах фрейма.
    for (const picture of (await miro.board.get({ type: ['image'] })) as Image[]) {
      if (picture.parentId && picture.parentId !== frame.id) continue
      candidates.set(picture.id, picture)
    }
  } catch {
    // Доска не отдала список — довольствуемся детьми фрейма.
  }

  const items = [...candidates.values()] as unknown as Positioned[]
  const parents = await loadParents([...items, frame as unknown as Positioned])
  parents.set(frame.id, frame as unknown as Positioned)

  const left = frame.x - frame.width / 2
  const right = frame.x + frame.width / 2
  const top = frame.y - frame.height / 2
  const bottom = frame.y + frame.height / 2

  const placed: Placed[] = []
  for (const picture of candidates.values()) {
    const center = absoluteCenter(picture as unknown as Positioned, parents)
    if (center.x < left || center.x > right || center.y < top || center.y > bottom) continue
    placed.push({ picture, x: center.x, y: center.y })
  }

  return placed
}

/** К какой секции урока относится картинка — по её вертикали на доске. */
function blockAt(y: number, anchors: BlockAnchor[]): number {
  const inside = anchors.find((anchor) => y >= anchor.top && y <= anchor.bottom)
  if (inside) return inside.index

  // Не попала ни в одну секцию — значит лежит в просвете или на полях.
  // Относим к ближайшей сверху: декор обычно ставят под своим заданием.
  const above = anchors.filter((anchor) => anchor.top <= y)
  const nearest = above[above.length - 1]
  return nearest ? nearest.index : -1
}

/**
 * Скачивает картинку и превращает в data:-строку.
 *
 * Первым делом спрашиваем саму Miro: у картинки на доске есть getDataUrl(),
 * и это единственный путь, которому не мешают правила доступа к чужому
 * домену. Загрузка по ссылке остаётся запасной — на случай, если метод
 * недоступен в этой версии SDK.
 */
async function toDataUrl(picture: Image, budget: number): Promise<string | null> {
  const bitmap = await loadBitmap(picture)
  if (!bitmap) return null

  const width = bitmap instanceof globalThis.Image ? bitmap.naturalWidth : bitmap.width
  const height = bitmap instanceof globalThis.Image ? bitmap.naturalHeight : bitmap.height
  if (width === 0 || height === 0) return null

  try {
    const scale = Math.min(1, MAX_WIDTH / width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    // PNG держит прозрачность — она нужна вырезанным наклейкам, из которых
    // и собирают оформление. Но фотография в PNG весит вчетверо больше, чем
    // в JPEG, поэтому в бюджет пробуем уложиться сначала честным PNG.
    const png = canvas.toDataURL('image/png')
    if (png.length <= budget && png.length <= 2 * 1024 * 1024) return png

    const jpeg = canvas.toDataURL('image/jpeg', 0.82)
    return jpeg.length <= budget ? jpeg : null
  } catch {
    // toDataURL бросает на «испорченном» холсте — когда картинка пришла
    // без разрешения читать её пиксели.
    return null
  }
}

type Bitmap = ImageBitmap | HTMLImageElement

async function loadBitmap(picture: Image): Promise<Bitmap | null> {
  // Путь через SDK: Miro отдаёт свою же картинку без разговоров о доменах.
  try {
    const dataUrl = await picture.getDataUrl()
    if (dataUrl) {
      const bitmap = await fromUrl(dataUrl)
      if (bitmap) return bitmap
    }
  } catch {
    // Старые версии SDK метода не знают — идём обычным путём.
  }

  try {
    const response = await fetch(picture.url, { mode: 'cors', credentials: 'omit' })
    if (response.ok) {
      const blob = await response.blob()
      return await createImageBitmap(blob)
    }
  } catch {
    // Последняя попытка — <img>: у него другие правила, иногда проходит он.
  }

  return await fromUrl(picture.url, true)
}

function fromUrl(url: string, cors = false): Promise<Bitmap | null> {
  return new Promise((resolve) => {
    const element = new globalThis.Image()
    if (cors) element.crossOrigin = 'anonymous'
    element.onload = () => resolve(element)
    element.onerror = () => resolve(null)
    element.src = url
  })
}
