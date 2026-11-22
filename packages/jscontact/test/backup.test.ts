import { describe, expect, test } from "vitest";
import { DEFAULT_MAX_TEXT_LENGTH } from "../src/backup.js";
import {
	BACKUP_ISSUE_CODES,
	type Card,
	type CardIssue,
	FORMAT_STAMP,
	FORMAT_VERSION,
	normalizeCard,
	parseJSContact,
	stringifyCards,
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

/** The code, the Card and the path of each issue. */
const found = (issues: CardIssue[]): unknown[] =>
	issues.map(({ code, card, path }) => [code, card, path]);

describe("the format stamp", () => {
	test("is a vendor property of this project holding a positive integer", () => {
		expect(FORMAT_STAMP).toBe("remileduc.github.io:formatVersion");
		expect(FORMAT_VERSION).toBe(1);
	});
});

describe("stringifyCards", () => {
	test("writes an array of stamped Cards as two-space JSON ending with a line feed", () => {
		expect(stringifyCards([john])).toBe(`[
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
		expect(stringifyCards([])).toBe("[]\n");
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
		const [written] = JSON.parse(stringifyCards([card])) as [{ media: { m1: object } }];
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
		stringifyCards(cards);
		expect(cards).toEqual([john]);
	});

	test("replaces a stamp a Card should not have had", () => {
		const text = stringifyCards([stamped(john, 7) as Card]);
		expect(JSON.parse(text)).toEqual([stamped(john)]);
	});
});

describe("parseJSContact", () => {
	test("reads what stringifyCards wrote: the same Cards, normalized, without the stamp", () => {
		// The two Cards of version 1.0 among them come back as 2.0, see below.
		const cards = [
			...Object.values(figures),
			...Object.values(valid).map((c) => c.card as Card),
		].filter((card) => card.version === "2.0");
		expect(cards).toHaveLength(60);
		const result = parseJSContact(stringifyCards(cards));
		expect(result.issues).toEqual([]);
		expect(result.cards.map((card) => JSON.stringify(card))).toEqual(
			cards.map((card) => JSON.stringify(normalizeCard(card))),
		);
		// Once normalized, a Card is written as it is read.
		expect(stringifyCards(result.cards)).toBe(stringifyCards(cards));
	});

	test("reads the text of one Card, or of an array of them", () => {
		expect(parseJSContact(JSON.stringify(john))).toEqual({
			cards: [john],
			refused: 0,
			issues: [],
		});
		expect(parseJSContact(JSON.stringify([john, jane]))).toEqual({
			cards: [john, jane],
			refused: 0,
			issues: [],
		});
		expect(parseJSContact("[]")).toEqual({ cards: [], refused: 0, issues: [] });
	});

	test("reads a value that is already parsed, and a Card no tool of ours stamped", () => {
		expect(parseJSContact(john).cards).toEqual([john]);
		expect(parseJSContact([john, jane])).toEqual({
			cards: [john, jane],
			refused: 0,
			issues: [],
		});
	});

	test("skips a byte order mark before the text", () => {
		const text = `${String.fromCharCode(0xfeff)}${JSON.stringify([john])}`;
		expect(parseJSContact(text)).toEqual({ cards: [john], refused: 0, issues: [] });
	});

	test("changes nothing it is given: a stamped Card comes back as a copy", () => {
		const given = Object.freeze(stamped(john));
		const { cards, issues } = parseJSContact(Object.freeze([given]));
		expect(issues).toEqual([]);
		expect(cards).toEqual([john]);
		expect(given).toEqual(stamped(john));
	});

	test("a Card it has nothing to change in is returned itself; a copy shares what it holds", () => {
		expect(parseJSContact([john]).cards[0]).toBe(john);
		const [unstamped] = parseJSContact(stamped(john)).cards;
		expect(unstamped).not.toBe(john);
		expect(unstamped?.name).toBe(john.name);
		const old = { ...john, version: "1.0" };
		expect(parseJSContact(old).cards[0]?.name).toBe(john.name);
	});

	test("a number no double holds, which JSON text can write, is refused when read", () => {
		const text = '[{ "@type": "Card", "version": "2.0", "example.com:n": 1e999 }]';
		const { cards, issues } = parseJSContact(text);
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["value-not-json", 0, "/example.com:n"]]);
	});

	test("a Card of version 1.0 comes back as 2.0, with an info", () => {
		const old = Object.freeze({ "@type": "Card", version: "1.0", uid: "1", name: {} });
		const { cards, issues } = parseJSContact([jane, old]);
		expect(cards[1]).toEqual({ "@type": "Card", version: "2.0", uid: "1", name: {} });
		expect(Object.keys(cards[1] ?? {})).toEqual(Object.keys(old));
		expect(issues).toEqual([
			{
				severity: "info",
				code: "version-upgraded",
				message: 'Version "1.0" read as "2.0": every valid 1.0 Card is a valid 2.0 Card',
				path: "/version",
				card: 1,
			},
		]);
	});

	test("a refused Card is left out, and its issues say which one it was", () => {
		const broken = { "@type": "Card", version: "2.0", name: "John", phones: { p1: {} } };
		const { cards, refused, issues } = parseJSContact([john, broken, null, jane]);
		expect(cards).toEqual([john, jane]);
		expect(refused).toBe(2);
		expect(found(issues)).toEqual([
			["property-wrong-type", 1, "/name"],
			["property-missing", 1, "/phones/p1/number"],
			["card-not-an-object", 2, ""],
		]);
	});

	test.each([["42"], ['"a Card"'], ["null"]])("the text %s is JSON and no Card", (text) => {
		expect(found(parseJSContact(text).issues)).toEqual([["card-not-an-object", 0, ""]]);
	});

	test("a value that is no text and no Card is reported the same way", () => {
		expect(found(parseJSContact(undefined).issues)).toEqual([["card-not-an-object", 0, ""]]);
		expect(found(parseJSContact(42).issues)).toEqual([["card-not-an-object", 0, ""]]);
	});

	test.each([[""], ["{"], ["[{}, ]"], ["BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n"]])(
		"the text %j is not JSON",
		(text) => {
			const { cards, issues } = parseJSContact(text);
			expect(cards).toEqual([]);
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({ severity: "error", code: "json-syntax", path: "" });
			expect(issues[0]?.message).toMatch(/^The text is not JSON: SyntaxError: /);
			expect(issues[0]).not.toHaveProperty("card");
		},
	);

	test("a text longer than the cap is not parsed", () => {
		const { cards, refused, issues } = parseJSContact(" ".repeat(DEFAULT_MAX_TEXT_LENGTH + 1));
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
		expect(parseJSContact(`${" ".repeat(DEFAULT_MAX_TEXT_LENGTH - 2)}[]`).issues).toEqual([]);
	});

	test("the cap is an option: stringifyCards has none and may write more than the default", () => {
		const text = JSON.stringify([john]);
		const short = parseJSContact(text, { maxTextLength: text.length - 1 });
		expect(short.cards).toEqual([]);
		expect(found(short.issues)).toEqual([["json-too-large", undefined, ""]]);
		expect(parseJSContact(text, { maxTextLength: text.length }).cards).toEqual([john]);
	});

	test.each([[0], [-1], [1.5], [Number.NaN], [Infinity]])("a cap of %s is thrown back", (cap) => {
		expect(() => parseJSContact("[]", { maxTextLength: cap })).toThrow(RangeError);
	});

	test("the issues of a whole file are capped by code too, the count of refused Cards is not", () => {
		const nothing = new Array(MAX_ISSUES_PER_CODE + 500).fill(null);
		const { cards, refused, issues } = parseJSContact([...nothing, john]);
		expect(cards).toEqual([john]);
		expect(refused).toBe(nothing.length);
		expect(issues).toHaveLength(MAX_ISSUES_PER_CODE + 1);
		expect(issues.at(-1)).toMatchObject({ severity: "warning", code: "issues-truncated" });
	});
});

describe("parseJSContact and the format stamp", () => {
	test.each([[0], [-1], [1.5], ["1"], [null], [true], [Number.MAX_VALUE]])(
		"a stamp of %j is an error and the Card is refused",
		(stamp) => {
			const { cards, issues } = parseJSContact([john, stamped(jane, stamp)]);
			expect(cards).toEqual([john]);
			expect(found(issues)).toEqual([["format-version-invalid", 1, `/${FORMAT_STAMP}`]]);
			expect(issues[0]?.severity).toBe("error");
		},
	);

	test("the Card of an invalid stamp is validated all the same", () => {
		const { issues } = parseJSContact(stamped({ "@type": "Card" }, 0));
		expect(found(issues)).toEqual([
			["format-version-invalid", 0, `/${FORMAT_STAMP}`],
			["property-missing", 0, "/version"],
		]);
	});

	test("a later format is read as it stands, with a warning", () => {
		const later = stamped({ ...john, futureProperty: { a: 1 } }, FORMAT_VERSION + 1);
		const { cards, issues } = parseJSContact(JSON.stringify([later]));
		expect(cards).toEqual([{ ...john, futureProperty: { a: 1 } }]);
		expect(issues).toEqual([
			{
				severity: "warning",
				code: "format-version-newer",
				message:
					"Written in format 2, later than the format 1 read here: taken as it stands",
				path: `/${FORMAT_STAMP}`,
				card: 0,
			},
		]);
	});

	test("a stamp does not stand for validation", () => {
		const { cards, issues } = parseJSContact(stamped({ "@type": "Card", version: "9.9" }));
		expect(cards).toEqual([]);
		expect(found(issues)).toEqual([["version-unsupported", 0, "/version"]]);
	});

	test("a stamp a prototype would answer for is not one", () => {
		const text = `{ "@type": "Card", "version": "2.0", "__proto__": { "${FORMAT_STAMP}": 1 } }`;
		const { cards, issues } = parseJSContact(text);
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
		].flatMap((input) => parseJSContact(input).issues.map(({ code }) => code));
		expect(raised).toEqual([...BACKUP_ISSUE_CODES]);
	});
});
