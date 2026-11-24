import { describe, expect, test } from "vitest";
import {
	BACKUP_ISSUE_CODES,
	type Card,
	type CardIssue,
	DEFAULT_MAX_TEXT_LENGTH,
	FORMAT_STAMP,
	FORMAT_VERSION,
	normalizeCard,
	parseCards,
	serializeCards,
} from "../src/index.js";
import { MAX_ISSUES_PER_CODE } from "../src/issues.js";
import { type ConstraintCase, readFixture } from "./helpers/fixtures.js";

const figures = readFixture<Record<string, Card>>("rfc9553-figures.json");
const valid = readFixture<Record<string, ConstraintCase>>("constraints-valid.json");

const john: Card = { "@type": "Card", version: "2.0", name: { full: "John Doe" } };
const jane: Card = { "@type": "Card", version: "2.0", name: { full: "Jane Doe" } };

const stamped = (card: object, stamp: unknown = FORMAT_VERSION): object => ({
	...card,
	[FORMAT_STAMP]: stamp,
});

/** The code, the position in the input and the path of each issue. */
const found = (issues: CardIssue[]): unknown[] =>
	issues.map(({ code, input, path }) => [code, input, path]);

describe("the format stamp", () => {
	test("is a vendor property of this project holding a positive integer", () => {
		expect(FORMAT_STAMP).toBe("remileduc.github.io:formatVersion");
		expect(FORMAT_VERSION).toBe(1);
	});
});

describe("serializeCards", () => {
	test("writes an array of stamped Cards as two-space JSON ending with a line feed", () => {
		expect(serializeCards([john])).toBe(`[
  {
    "@type": "Card",
    "version": "2.0",
    "name": {
      "full": "John Doe"
    },
    "remileduc.github.io:formatVersion": 1
  }
]
`);
		expect(serializeCards([])).toBe("[]\n");
	});

	test("writes each Card as normalizeCard orders it, the stamp before the pictures", () => {
		const card = {
			media: { m1: { uri: "data:image/png;base64,AAAA", kind: "photo" } },
			"zebra.example:x": 1,
			phones: {},
			name: { full: "John Doe" },
			version: "2.0",
			"@type": "Card",
		} as Card;
		const [written] = JSON.parse(serializeCards([card])) as [{ media: { m1: object } }];
		expect(Object.keys(written)).toEqual([
			"@type",
			"version",
			"name",
			FORMAT_STAMP,
			"zebra.example:x",
			"media",
		]);
		expect(Object.keys(written.media.m1)).toEqual(["kind", "uri"]);
	});

	test("leaves the Cards it is given without a stamp", () => {
		const cards = [Object.freeze({ ...john })];
		serializeCards(cards);
		expect(cards).toEqual([john]);
	});

	test("writes a Card of version 1.0 as 2.0, which is what it is read back as", () => {
		const old = Object.freeze({ ...john, version: "1.0" }) as Card;
		const text = serializeCards([old]);
		expect(JSON.parse(text)).toEqual([stamped(john)]);
		expect(parseCards(text)).toEqual({ cards: [john], refused: 0, issues: [] });
	});

	test("replaces a stamp a Card should not have had", () => {
		const text = serializeCards([stamped(john, 7) as Card]);
		expect(JSON.parse(text)).toEqual([stamped(john)]);
	});
});

describe("parseCards", () => {
	test("reads what serializeCards wrote: the same Cards, normalized, without the stamp", () => {
		// The two Cards of version 1.0 among them come back as 2.0, see below.
		const cards = [
			...Object.values(figures),
			...Object.values(valid).map((c) => c.card as Card),
		].filter((card) => card.version === "2.0");
		expect(cards).toHaveLength(60);
		const result = parseCards(serializeCards(cards));
		expect(result.issues).toEqual([]);
		expect(result.cards.map((card) => JSON.stringify(card))).toEqual(
			cards.map((card) => JSON.stringify(normalizeCard(card))),
		);
		// Once normalized, a Card is written as it is read.
		expect(serializeCards(result.cards)).toBe(serializeCards(cards));
	});

	test("reads the text of one Card, or of an array of them", () => {
		expect(parseCards(JSON.stringify(john))).toEqual({
			cards: [john],
			refused: 0,
			issues: [],
		});
		expect(parseCards(JSON.stringify([john, jane]))).toEqual({
			cards: [john, jane],
			refused: 0,
			issues: [],
		});
		expect(parseCards("[]")).toEqual({ cards: [], refused: 0, issues: [] });
	});

	test("reads a value that is already parsed, and a Card no tool of ours stamped", () => {
		expect(parseCards(john).cards).toEqual([john]);
		expect(parseCards([john, jane])).toEqual({
			cards: [john, jane],
			refused: 0,
			issues: [],
		});
	});

	test("skips a byte order mark before the text", () => {
		const text = `${String.fromCharCode(0xfeff)}${JSON.stringify([john])}`;
		expect(parseCards(text)).toEqual({ cards: [john], refused: 0, issues: [] });
	});

	test("changes nothing it is given: a stamped Card comes back as a copy", () => {
		const given = Object.freeze(stamped(john));
		const { cards, issues } = parseCards(Object.freeze([given]));
		expect(issues).toEqual([]);
		expect(cards).toEqual([john]);
		expect(given).toEqual(stamped(john));
	});

	test("a Card it has nothing to change in is returned itself; a copy shares what it holds", () => {
		expect(parseCards([john]).cards[0]).toBe(john);
		const [unstamped] = parseCards(stamped(john)).cards;
		expect(unstamped).not.toBe(john);
		expect(unstamped?.name).toBe(john.name);
		const old = { ...john, version: "1.0" };
		expect(parseCards(old).cards[0]?.name).toBe(john.name);
	});

	test("a number no double holds, which JSON text can write, is refused when read", () => {
		const text = '[{ "@type": "Card", "version": "2.0", "example.com:n": 1e999 }]';
		const { cards, issues } = parseCards(text);
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["value-not-json", 0, "/example.com:n"]]);
	});

	test("a Card of version 1.0 comes back as 2.0, with an info", () => {
		const old = Object.freeze({ "@type": "Card", version: "1.0", uid: "1", name: {} });
		const { cards, issues } = parseCards([jane, old]);
		expect(cards[1]).toEqual({ "@type": "Card", version: "2.0", uid: "1", name: {} });
		expect(Object.keys(cards[1] ?? {})).toEqual(Object.keys(old));
		expect(issues).toEqual([
			{
				severity: "info",
				code: "version-upgraded",
				message: 'Version "1.0" read as "2.0": every valid 1.0 Card is a valid 2.0 Card',
				path: "/version",
				card: 1,
				input: 1,
			},
		]);
	});

	test("an issue names its Card in `cards` when it was kept, and always in the input", () => {
		const old = { "@type": "Card", version: "1.0", uid: "1" };
		const { cards, issues } = parseCards([null, old, {}, stamped(jane, FORMAT_VERSION + 1)]);
		expect(issues.map(({ code, input, card }) => [code, input, card])).toEqual([
			["card-not-an-object", 0, undefined],
			["version-upgraded", 1, 0],
			["property-missing", 2, undefined],
			["property-missing", 2, undefined],
			["format-version-newer", 3, 1],
		]);
		expect(issues[0]).not.toHaveProperty("card");
		expect(cards[1]).toEqual(jane);
	});

	test("a refused Card is left out, and its issues say which one it was", () => {
		const broken = { "@type": "Card", version: "2.0", name: "John", phones: { p1: {} } };
		const { cards, refused, issues } = parseCards([john, broken, null, jane]);
		expect(cards).toEqual([john, jane]);
		expect(refused).toBe(2);
		expect(found(issues)).toEqual([
			["property-wrong-type", 1, "/name"],
			["property-missing", 1, "/phones/p1/number"],
			["card-not-an-object", 2, ""],
		]);
	});

	test.each([["42"], ['"a Card"'], ["null"]])("the text %s is JSON and no Card", (text) => {
		expect(found(parseCards(text).issues)).toEqual([["card-not-an-object", 0, ""]]);
	});

	test("a value that is no text and no Card is reported the same way", () => {
		expect(found(parseCards(undefined).issues)).toEqual([["card-not-an-object", 0, ""]]);
		expect(found(parseCards(42).issues)).toEqual([["card-not-an-object", 0, ""]]);
	});

	test("bytes are the text in UTF-8, in whatever view, with or without a byte order mark", () => {
		const josé: Card = { ...john, name: { full: "José 孫" } };
		const bytes = new TextEncoder().encode(`\uFEFF${JSON.stringify([josé])}`);
		const expected = { cards: [josé], refused: 0, issues: [] };
		expect(parseCards(bytes)).toEqual(expected);
		expect(parseCards(bytes.subarray(3))).toEqual(expected);
		expect(parseCards(bytes.buffer)).toEqual(expected);
		expect(parseCards(new DataView(bytes.buffer, 3))).toEqual(expected);
	});

	test("two byte order marks are refused, as bytes as they are as text", () => {
		const text = "\uFEFF\uFEFF[]";
		expect(found(parseCards(text).issues)).toEqual([["json-syntax", undefined, ""]]);
		expect(found(parseCards(new TextEncoder().encode(text)).issues)).toEqual([
			["json-syntax", undefined, ""],
		]);
	});

	test("a view on a detached buffer is reported, not thrown", () => {
		const buffer = new ArrayBuffer(2);
		const view = new DataView(buffer);
		buffer.transfer();
		expect(found(parseCards(view).issues)).toEqual([["json-syntax", undefined, ""]]);
	});

	test("bytes are capped as bytes, before any is decoded, and never read as a Card", () => {
		const { cards, refused, issues } = parseCards(new Uint8Array(100), {
			maxTextLength: 99,
		});
		expect({ cards, refused }).toEqual({ cards: [], refused: 0 });
		expect(issues).toEqual([
			{
				severity: "error",
				code: "json-too-large",
				message: "The text is longer than 99 bytes",
				path: "",
			},
		]);
		expect(found(parseCards(new Uint8Array(100)).issues)).toEqual([
			["json-syntax", undefined, ""],
		]);
	});

	test("bytes that are not UTF-8 are no JSON", () => {
		const latin1 = Uint8Array.of(0x5b, 0x22, 0xe9, 0x22, 0x5d);
		const { cards, issues } = parseCards(latin1);
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["json-syntax", undefined, ""]]);
		expect(issues[0]?.message).toMatch(/^The text is not JSON: TypeError: /);
	});

	test.each([[""], ["{"], ["[{}, ]"], ["BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n"]])(
		"the text %j is not JSON",
		(text) => {
			const { cards, issues } = parseCards(text);
			expect(cards).toEqual([]);
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({ severity: "error", code: "json-syntax", path: "" });
			expect(issues[0]?.message).toMatch(/^The text is not JSON: SyntaxError: /);
			expect(issues[0]).not.toHaveProperty("card");
			expect(issues[0]).not.toHaveProperty("input");
		},
	);

	test("a text longer than the cap is not parsed", () => {
		const { cards, refused, issues } = parseCards(" ".repeat(DEFAULT_MAX_TEXT_LENGTH + 1));
		expect(cards).toEqual([]);
		// No Card was read, so none was refused: the issue stands for the file.
		expect(refused).toBe(0);
		expect(issues).toEqual([
			{
				severity: "error",
				code: "json-too-large",
				message: "The text is longer than 67108864 characters",
				path: "",
			},
		]);
		expect(parseCards(`${" ".repeat(DEFAULT_MAX_TEXT_LENGTH - 2)}[]`).issues).toEqual([]);
	});

	test("the cap is an option: serializeCards has none and may write more than the default", () => {
		const text = JSON.stringify([john]);
		const short = parseCards(text, { maxTextLength: text.length - 1 });
		expect(short.cards).toEqual([]);
		expect(found(short.issues)).toEqual([["json-too-large", undefined, ""]]);
		expect(parseCards(text, { maxTextLength: text.length }).cards).toEqual([john]);
	});

	test.each([[0], [-1], [1.5], [Number.NaN], [-Infinity]])(
		"a cap of %s is thrown back",
		(cap) => {
			expect(() => parseCards("[]", { maxTextLength: cap })).toThrow(RangeError);
		},
	);

	test("a cap of Infinity is no cap", () => {
		expect(parseCards(JSON.stringify([john]), { maxTextLength: Infinity }).cards).toEqual([
			john,
		]);
	});

	test("the issues of a whole file are capped by code too, the count of refused Cards is not", () => {
		const nothing = new Array(MAX_ISSUES_PER_CODE + 500).fill(null);
		const { cards, refused, issues } = parseCards([...nothing, john]);
		expect(cards).toEqual([john]);
		expect(refused).toBe(nothing.length);
		expect(issues).toHaveLength(MAX_ISSUES_PER_CODE + 1);
		expect(issues.at(-1)).toMatchObject({ severity: "warning", code: "issues-truncated" });
	});
});

describe("parseCards and the format stamp", () => {
	test.each([[0], [-1], [1.5], ["1"], [null], [true], [Number.MAX_VALUE]])(
		"a stamp of %j is an error and the Card is refused",
		(stamp) => {
			const { cards, issues } = parseCards([john, stamped(jane, stamp)]);
			expect(cards).toEqual([john]);
			expect(found(issues)).toEqual([["format-version-invalid", 1, `/${FORMAT_STAMP}`]]);
			expect(issues[0]?.severity).toBe("error");
		},
	);

	test("the Card of an invalid stamp is validated all the same", () => {
		const { issues } = parseCards(stamped({ "@type": "Card" }, 0));
		expect(found(issues)).toEqual([
			["format-version-invalid", 0, `/${FORMAT_STAMP}`],
			["property-missing", 0, "/version"],
		]);
	});

	test("a later format is read as it stands, with a warning", () => {
		const later = stamped({ ...john, futureProperty: { a: 1 } }, FORMAT_VERSION + 1);
		const { cards, issues } = parseCards(JSON.stringify([later]));
		expect(cards).toEqual([{ ...john, futureProperty: { a: 1 } }]);
		expect(issues).toEqual([
			{
				severity: "warning",
				code: "format-version-newer",
				message:
					"Written in format 2, later than the format 1 read here: taken as it stands",
				path: `/${FORMAT_STAMP}`,
				card: 0,
				input: 0,
			},
		]);
	});

	test("a stamp does not stand for validation", () => {
		const { cards, issues } = parseCards(stamped({ "@type": "Card", version: "9.9" }));
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["version-unsupported", 0, "/version"]]);
	});

	test("a stamp a prototype would answer for is not one", () => {
		const text = `{ "@type": "Card", "version": "2.0", "__proto__": { "${FORMAT_STAMP}": 1 } }`;
		const { cards, issues } = parseCards(text);
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["prototype-key", 0, "/__proto__"]]);
	});
});

describe("issue codes", () => {
	test("the list is what the reader raises beside the validator's", () => {
		const raised = [
			" ".repeat(DEFAULT_MAX_TEXT_LENGTH + 1),
			"{",
			stamped(john, 0),
			stamped(john, FORMAT_VERSION + 1),
			{ ...john, version: "1.0" },
		].flatMap((input) => parseCards(input).issues.map(({ code }) => code));
		expect(raised).toEqual([...BACKUP_ISSUE_CODES]);
	});
});
