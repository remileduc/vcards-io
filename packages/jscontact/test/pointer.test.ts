import { describe, expect, test } from "vitest";
import { jsonPointer } from "../src/index.js";

// The document and the pointers of RFC 6901 section 5.
const RFC_DOCUMENT = {
	foo: ["bar", "baz"],
	"": 0,
	"a/b": 1,
	"c%d": 2,
	"e^f": 3,
	"g|h": 4,
	"i\\j": 5,
	'k"l': 6,
	" ": 7,
	"m~n": 8,
};
const RFC_POINTERS: [pointer: string, tokens: string[], value: unknown][] = [
	["", [], RFC_DOCUMENT],
	["/foo", ["foo"], ["bar", "baz"]],
	["/foo/0", ["foo", "0"], "bar"],
	["/", [""], 0],
	["/a~1b", ["a/b"], 1],
	["/c%d", ["c%d"], 2],
	["/e^f", ["e^f"], 3],
	["/g|h", ["g|h"], 4],
	["/i\\j", ["i\\j"], 5],
	['/k"l', ['k"l'], 6],
	["/ ", [" "], 7],
	["/m~0n", ["m~n"], 8],
];

describe("jsonPointer.parse and escape", () => {
	test.each(RFC_POINTERS)("%j is read as RFC 6901 does", (pointer, tokens, value) => {
		expect(jsonPointer.parse(pointer)).toEqual(tokens);
		expect(jsonPointer.get(RFC_DOCUMENT, pointer)).toEqual(value);
		expect(tokens.map((token) => `/${jsonPointer.escape(token)}`).join("")).toBe(pointer);
	});

	test("~01 is a tilde followed by 1, not a slash", () => {
		expect(jsonPointer.parse("/~01")).toEqual(["~1"]);
		expect(jsonPointer.escape("~1")).toBe("~01");
	});

	test.each(["foo", "foo/bar", "/a~", "/a~2b", "/~~", " /a"])("%j is not a pointer", (bad) => {
		expect(jsonPointer.parse(bad)).toBeUndefined();
		expect(jsonPointer.get({ foo: 1, "a~": 1 }, bad)).toBeUndefined();
		expect(jsonPointer.set({ foo: 1 }, bad, 2)).toBe(false);
		expect(jsonPointer.remove({ foo: 1 }, bad)).toBe(false);
	});
});

describe("jsonPointer.get", () => {
	test("a missing member, or a member of a value that has none, is undefined", () => {
		const doc = { a: { b: [10, 20] }, text: "abc", nothing: null };
		expect(jsonPointer.get(doc, "/a/c")).toBeUndefined();
		expect(jsonPointer.get(doc, "/a/c/d/e")).toBeUndefined();
		expect(jsonPointer.get(doc, "/text/0")).toBeUndefined();
		expect(jsonPointer.get(doc, "/text/length")).toBeUndefined();
		expect(jsonPointer.get(doc, "/nothing/x")).toBeUndefined();
		expect(jsonPointer.get(doc, "/nothing")).toBeNull();
		expect(jsonPointer.get(5, "/x")).toBeUndefined();
		expect(jsonPointer.get(5, "")).toBe(5);
	});

	test("an array member is named by its index, written without sign or leading zero", () => {
		const doc = { list: ["a", "b"] };
		expect(jsonPointer.get(doc, "/list/1")).toBe("b");
		for (const token of ["2", "-", "01", "1.0", "+1", "-1", " 1", "1e0", "length", ""]) {
			expect(jsonPointer.get(doc, `/list/${token}`), token).toBeUndefined();
		}
		expect(jsonPointer.get(doc, "/list/99999999999999999999")).toBeUndefined();
	});

	test("only own properties are members", () => {
		for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
			expect(jsonPointer.get({}, `/${name}`), name).toBeUndefined();
			expect(jsonPointer.get([], `/${name}`), name).toBeUndefined();
		}
		expect(jsonPointer.get({}, "/constructor/prototype")).toBeUndefined();
		expect(jsonPointer.get(Object.create({ inherited: 1 }), "/inherited")).toBeUndefined();
	});

	test("an own __proto__ key, as JSON.parse makes one, is read as data", () => {
		const doc: unknown = JSON.parse('{ "__proto__": { "x": 1 } }');
		expect(jsonPointer.get(doc, "/__proto__/x")).toBe(1);
		expect(jsonPointer.get(doc, "/x")).toBeUndefined();
	});
});

describe("jsonPointer.set", () => {
	test("adds or replaces a property and replaces an array member", () => {
		const doc = { a: { b: 1 }, list: [1, 2] };
		expect(jsonPointer.set(doc, "/a/b", 2)).toBe(true);
		expect(jsonPointer.set(doc, "/a/c", { d: null })).toBe(true);
		expect(jsonPointer.set(doc, "/list/0", "x")).toBe(true);
		expect(jsonPointer.set(doc, "/", "empty name")).toBe(true);
		expect(doc).toEqual({ a: { b: 2, c: { d: null } }, list: ["x", 2], "": "empty name" });
	});

	test("refuses, changing nothing, what it cannot place", () => {
		const doc = { a: { b: 1 }, list: [1, 2], text: "abc" };
		const before = structuredClone(doc);
		expect(jsonPointer.set(doc, "", {})).toBe(false);
		expect(jsonPointer.set(doc, "/missing/b", 1)).toBe(false);
		expect(jsonPointer.set(doc, "/text/0", "x")).toBe(false);
		expect(jsonPointer.set(doc, "/a/b/c", 1)).toBe(false);
		for (const token of ["2", "-", "01", "length", "name"]) {
			expect(jsonPointer.set(doc, `/list/${token}`, 0), token).toBe(false);
		}
		expect(doc).toEqual(before);
	});

	test("never assigns __proto__ and never writes through a prototype", () => {
		const doc: { a: Record<string, unknown> } = { a: {} };
		expect(jsonPointer.set(doc, "/a/__proto__", { polluted: true })).toBe(false);
		expect(jsonPointer.set(doc, "/__proto__/polluted", true)).toBe(false);
		expect(jsonPointer.set(doc, "/constructor/prototype/polluted", true)).toBe(false);
		expect(jsonPointer.set(doc, "/a/toString/polluted", true)).toBe(false);
		expect(Object.getPrototypeOf(doc.a)).toBe(Object.prototype);
		expect({}).not.toHaveProperty("polluted");
		// A name a prototype also has becomes an own property like any other.
		expect(jsonPointer.set(doc, "/a/constructor", "data")).toBe(true);
		expect(Object.hasOwn(doc.a, "constructor")).toBe(true);
	});
});

describe("jsonPointer.remove", () => {
	test("removes a property, or an array member with the next ones moving up", () => {
		const doc = { a: { b: 1, c: 2 }, list: ["x", "y", "z"] };
		expect(jsonPointer.remove(doc, "/a/b")).toBe(true);
		expect(jsonPointer.remove(doc, "/list/1")).toBe(true);
		expect(doc).toEqual({ a: { c: 2 }, list: ["x", "z"] });
	});

	test("is false when there is nothing to remove", () => {
		const doc = { a: { b: 1 }, list: ["x"] };
		const before = structuredClone(doc);
		for (const pointer of ["", "/b", "/a/c", "/a/b/c", "/list/1", "/list/-", "/list/length"]) {
			expect(jsonPointer.remove(doc, pointer), pointer).toBe(false);
		}
		expect(jsonPointer.remove(doc, "/a/toString")).toBe(false);
		expect(jsonPointer.remove(doc, "/a/__proto__")).toBe(false);
		expect(doc).toEqual(before);
	});

	test("removes an own __proto__ key as data", () => {
		const doc = JSON.parse('{ "a": { "__proto__": 1, "b": 2 } }') as { a: object };
		expect(jsonPointer.remove(doc, "/a/__proto__")).toBe(true);
		expect(Object.keys(doc.a)).toEqual(["b"]);
		expect(Object.getPrototypeOf(doc.a)).toBe(Object.prototype);
	});
});
