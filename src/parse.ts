export function pickData(result: unknown): Record<string, unknown> {
  if (result && typeof result === "object" && "data" in (result as Record<string, unknown>)) {
    const root = result as Record<string, unknown>;
    const data = root.data;
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  }

  return {} as Record<string, unknown>;
}

/**
 * Разбирает списочный ответ Listmonk.
 * Разные эндпоинты возвращают `data` по-разному:
 *  - с пагинацией: { data: { results: [...], total, per_page, page } } — subscribers, campaigns, lists, media;
 *  - плоским массивом: { data: [...] } — templates.
 * Функция поддерживает оба варианта, а также вложенный массив в единственном поле объекта.
 */
export function parseListResult(value: unknown): unknown[] {
  const data = pickData(value);
  if (Array.isArray(data)) {
    return data as unknown[];
  }

  if (Array.isArray(data.results)) {
    return data.results as unknown[];
  }

  const values = Object.values(data);
  if (values.length === 1 && Array.isArray(values[0])) {
    return values[0] as unknown[];
  }

  return [];
}

/**
 * Возвращает общее число элементов: поле `total` при пагинации,
 * либо длину массива, если Listmonk вернул плоский список.
 */
export function parseListTotal(value: unknown, items: unknown[]): number {
  const data = pickData(value);
  if (!Array.isArray(data) && typeof data.total === "number") {
    return data.total;
  }

  return items.length;
}
