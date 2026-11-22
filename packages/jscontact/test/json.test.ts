import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { equal, jsonPointer } from "../src/index.js";
import { cloneJson } from "../src/json.js";

/** The JSON text of a value with the keys of every object sorted: equal values, equal text. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) =>
		typeof item === "object" && item !== null && !Array.isArray(item)
			? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
			: item,
	);
}

describe("equal", () => {
	test("the order of keys does not count, at any depth", () => {
		expect(
			equal({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }),
		).toBe(true);
	});

	test("the order of an array does", () => {
		expect(equal([1, 2], [2, 1])).toBe(false);
		expect(equal([1, 2], [1, 2, 3])).toBe(false);
		expect(equal([1, 2, 3], [1, 2])).toBe(false);
	});

	test.each<[a: unknown, b: unknown]>([
		[1, "1"],
		[0, false],
		[null, {}],
		[null, []],
		[null, false],
		[[], {}],
		[{ 0: "a" }, ["a"]],
		[{ a: 1 }, { a: 1, b: 2 }],
		[{ a: 1, b: 2 }, { a: 1 }],
		[{ a: 1 }, { b: 1 }],
		[{ a: { b: 1 } }, { a: { b: 2 } }],
		[
			{ a: 1, b: 1 },
			{ a: 2, b: 1 },
		],
		[
			{ a: 1, b: 1 },
			{ a: 1, b: 2 },
		],
		[
			[2, 1],
			[3, 1],
		],
		[
			[1, [2, 3]],
			[1, [2, 4]],
		],
		[JSON.parse('{ "__proto__": {} }'), { a: 1 }],
		[{ a: null }, {}],
		[{ a: null }, { b: null }],
		["a", "b"],
	])("%j and %j differ", (a, b) => {
		expect(equal(a, b)).toBe(false);
		expect(equal(b, a)).toBe(false);
	});

	test("only own properties are compared", () => {
		expect(equal({}, { toString: Object.prototype.toString })).toBe(false);
		expect(equal({ constructor: Object }, {})).toBe(false);
		expect(equal(JSON.parse('{ "__proto__": 1 }'), {})).toBe(false);
		expect(equal(JSON.parse('{ "__proto__": 1 }'), JSON.parse('{ "__proto__": 1 }'))).toBe(
			true,
		);
		expect(equal(JSON.parse('{ "__proto__": 1 }'), JSON.parse('{ "__proto__": 2 }'))).toBe(
			false,
		);
	});

	test("one changed member anywhere makes two values differ", () => {
		const leaves = (value: unknown, path: string[] = []): string[][] =>
			typeof value === "object" && value !== null && Object.keys(value).length > 0
				? Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]))
				: [path];
		fc.assert(
			fc.property(fc.jsonValue(), fc.nat(), (value, pick) => {
				const paths = leaves(value);
				const path = paths[pick % paths.length] ?? [];
				fc.pre(path.length > 0);
				const changed: unknown = JSON.parse(JSON.stringify(value));
				const pointer = path.map((token) => `/${jsonPointer.escape(token)}`).join("");
				expect(jsonPointer.set(changed, pointer, "changed by the test")).toBe(true);
				expect(equal(value, changed)).toBe(false);
				expect(equal(changed, value)).toBe(false);
			}),
		);
	});

	test("agrees with the comparison of the sorted JSON text", () => {
		fc.assert(
			fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => {
				expect(equal(a, b)).toBe(canonical(a) === canonical(b));
				expect(equal(a, JSON.parse(canonical(a)))).toBe(true);
			}),
		);
	});

	test("a nesting deeper than the call stack is compared without recursion", () => {
		const deep = `${"[".repeat(200_000)}1${"]".repeat(200_000)}`;
		expect(equal(JSON.parse(deep), JSON.parse(deep))).toBe(true);
		expect(equal(JSON.parse(deep), JSON.parse(deep.replace("1", "2")))).toBe(false);
	});
});

describe("cloneJson", () => {
	test("copies every level and keeps the order of the keys", () => {
		const value = { b: [{ z: 1, a: null }], a: "text", "": { 1: true } };
		const copy = cloneJson(value);
		expect(JSON.stringify(copy)).toBe(JSON.stringify(value));
		expect(copy).not.toBe(value);
		expect(copy.b).not.toBe(value.b);
		expect(copy.b[0]).not.toBe(value.b[0]);
		expect(Array.isArray(copy.b)).toBe(true);
	});

	test("a scalar is its own copy", () => {
		for (const value of [null, 0, "", "a", true, undefined])
			expect(cloneJson(value)).toBe(value);
	});

	test("an own __proto__ key stays data and changes no prototype", () => {
		const value: object = JSON.parse(
			'{ "__proto__": { "polluted": true }, "list": [{ "__proto__": 1 }] }',
		);
		const copy = cloneJson(value);
		expect(JSON.stringify(copy)).toBe(JSON.stringify(value));
		expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
		expect(copy).not.toHaveProperty("polluted");
		expect({}).not.toHaveProperty("polluted");
	});

	test("a copy equals its original", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (value) => {
				expect(equal(cloneJson(value), value)).toBe(true);
				expect(JSON.stringify(cloneJson(value))).toBe(JSON.stringify(value));
			}),
		);
	});

	test("a nesting deeper than the call stack is copied without recursion", () => {
		const deep: unknown = JSON.parse(`${"[".repeat(200_000)}1${"]".repeat(200_000)}`);
		expect(equal(cloneJson(deep), deep)).toBe(true);
	});
});
