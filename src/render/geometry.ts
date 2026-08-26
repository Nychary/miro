/**
 * Координаты объектов доски.
 *
 * Miro задаёт положение ребёнка фрейма относительно самого фрейма, а не доски,
 * и делает это двумя способами: от центра фрейма или от его левого верхнего
 * угла. Пока объект лежит на месте, разница незаметна; стоит ученику вытащить
 * карточку из фрейма — и сравнивать её положение с чем-либо становится нечем.
 * Поэтому всё, что связано с геометрией, приводится к координатам доски здесь,
 * в одном месте: проверка заданий, сбор картинок и сбор ответов ученика видят
 * одни и те же числа.
 */

/** Минимум, который нужен от объекта для геометрии. */
export interface Positioned {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  parentId: string | null
  relativeTo: string
}

/** Центр объекта в координатах доски. */
export function absoluteCenter(
  item: Positioned,
  parents: Map<string, Positioned>,
): { x: number; y: number } {
  const parent = item.parentId ? parents.get(item.parentId) : undefined
  if (!parent) return { x: item.x, y: item.y }

  if (item.relativeTo === 'parent_top_left') {
    return { x: parent.x - parent.width / 2 + item.x, y: parent.y - parent.height / 2 + item.y }
  }
  if (item.relativeTo === 'parent_center') {
    return { x: parent.x + item.x, y: parent.y + item.y }
  }
  return { x: item.x, y: item.y }
}

/** Родители перечисленных объектов — чтобы было относительно чего считать. */
export async function loadParents(items: Positioned[]): Promise<Map<string, Positioned>> {
  const ids = [...new Set(items.map((item) => item.parentId).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()

  const parents = (await miro.board.get({ id: ids })) as unknown as Positioned[]
  return new Map(parents.map((parent) => [parent.id, parent]))
}
