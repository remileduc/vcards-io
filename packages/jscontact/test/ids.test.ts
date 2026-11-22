import { describe, expect, test } from "vitest";
import { CARD_KINDS, type Card, type CardKind, isListed, newUid, nextId } from "../src/index.js";

describe("nextId", () => {
	test("counts from 1 with the prefix, as the examples of RFC 9553 do", () => {
		expect(nextId(undefined, "p")).toBe("p1");
		expect(nextId({}, "p")).toBe("p1");
		expect(nextId({ p1: {} }, "p")).toBe("p2");
		expect(nextId({ p1: {}, p2: {}, p3: {} }, "p")).toBe("p4");
	});

	test("gives the smallest number that is free", () => {
		expect(nextId({ p1: {}, p3: {} }, "p")).toBe("p2");
		expect(nextId({ p2: {}, p10: {} }, "p")).toBe("p1");
	});

	test("only an entry of the same prefix and the same writing takes a number", () => {
		expect(nextId({ e1: {}, P1: {}, p01: {}, "p1 ": {}, p: {} }, "p")).toBe("p1");
		expect(nextId({ 1: {}, 2: {} }, "")).toBe("3");
		expect(nextId({ "ADR-1": {} }, "ADR-")).toBe("ADR-2");
	});

	test("an inherited property is no entry", () => {
		expect(nextId(Object.create({ p1: {} }), "p")).toBe("p1");
	});

	test("is the same for the same map: nothing random", () => {
		const phones: Card["phones"] = { p1: { number: "1" } };
		expect(nextId(phones, "p")).toBe(nextId(phones, "p"));
	});

	test.each(["p ", "é", "a:b", "a/b", "p.", "x".repeat(201)])(
		"%j cannot start an Id",
		(prefix) => {
			expect(() => nextId({}, prefix)).toThrow(RangeError);
		},
	);

	test("the longest prefix still gives an Id of at most 255 characters", () => {
		expect(nextId({}, "x".repeat(200))).toMatch(/^[A-Za-z0-9_-]{1,255}$/);
	});
});

describe("newUid", () => {
	test("is a version 4 UUID as a URN, new at each call", () => {
		const uid = newUid();
		expect(uid).toMatch(
			/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(newUid()).not.toBe(uid);
	});
});

describe("isListed", () => {
	test("is true for the values of the list only", () => {
		expect(isListed(CARD_KINDS, "group")).toBe(true);
		for (const value of [
			"Group",
			"example.com:robot",
			"robot",
			"",
			undefined,
			null,
			0,
			["group"],
		]) {
			expect(isListed(CARD_KINDS, value), String(value)).toBe(false);
		}
	});

	test("narrows a value to the type of the list", () => {
		const card: Card = { "@type": "Card", version: "2.0", kind: "example.com:robot" };
		const kind = isListed(CARD_KINDS, card.kind) ? card.kind : "individual";
		const standard: CardKind = kind;
		expect(standard).toBe("individual");
	});
});
