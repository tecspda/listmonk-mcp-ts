import { describe, expect, test } from "bun:test";
import { parseListResult, parseListTotal } from "../src/parse";

describe("parseListResult / parseListTotal", () => {
  test("ответ с пагинацией", () => {
    const response = { data: { results: [{ id: 1 }, { id: 2 }], total: 10, page: 1 } };
    const items = parseListResult(response);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(parseListTotal(response, items)).toBe(10);
  });

  test("плоский массив (templates)", () => {
    const response = { data: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    const items = parseListResult(response);
    expect(items).toHaveLength(3);
    expect(parseListTotal(response, items)).toBe(3);
  });

  test("пустой и неожиданный ответ", () => {
    expect(parseListResult({})).toEqual([]);
    expect(parseListResult({ data: { results: [], total: 0 } })).toEqual([]);
    expect(parseListResult({ data: "oops" })).toEqual([]);
  });
});
