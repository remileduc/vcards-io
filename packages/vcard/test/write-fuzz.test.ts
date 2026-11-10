import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	escapeText,
	parseVCards,
	SerializeError,
	serializeVCards,
	upgradeTo40,
	type VCard,
	type VParams,
	type VProperty,
	type VValue,
} from "../src/index.js";

// Any Unicode text, line breaks included; the writer escapes what the grammar needs.
const TEXT = fc.string({ unit: "grapheme", maxLength: 40 });
// What a label or TYPE may hold once the layers above sanitised it: no control character, no quote.
const PARAM_TEXT = fc
	.string({ unit: "grapheme", maxLength: 20 })
	.filter((s) => !s.includes('"') && !s.includes("\u007f"))
	.filter((s) => [...s].every((c) => (c.codePointAt(0) ?? 0) >= 0x20));
const NAME = fc.stringMatching(/^[A-Z][A-Z0-9-]{0,10}$/).map((n) => `X-${n}`);
const GROUP = fc.option(fc.stringMatching(/^item[0-9]{1,3}$/), { nil: null });

const textValue: fc.Arbitrary<VValue> = TEXT.map((value) => ({ kind: "text", value }));
const listValue: fc.Arbitrary<VValue> = fc
	.array(TEXT, { minLength: 1, maxLength: 4 })
	.map((values) => ({ kind: "text-list", values }));
const nameValue: fc.Arbitrary<VValue> = fc
	.array(fc.array(TEXT, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 5 })
	.map((components) => ({ kind: "structured", components }));
// ORG and X-ANDROID-CUSTOM components are single literals: a comma inside is text, not a list.
const literalValue: fc.Arbitrary<VValue> = fc
	.array(TEXT, { minLength: 1, maxLength: 5 })
	.map((components) => ({ kind: "structured", components: components.map((c) => [c]) }));

/** Parameters the parser hands back as given: TYPE is normalised, so it is kept out of here. */
const params: fc.Arbitrary<VParams> = fc
	.array(
		fc.tuple(
			NAME,
			fc.array(
				PARAM_TEXT.filter((s) => s !== ""),
				{ minLength: 1, maxLength: 3 },
			),
		),
		{
			maxLength: 3,
		},
	)
	.map((entries) => new Map(entries));

const property = (value: fc.Arbitrary<VValue>, name: fc.Arbitrary<string>) =>
	fc
		.tuple(GROUP, name, params, value)
		.map(([group, n, p, v]): VProperty => ({ group, name: n, params: p, value: v }));

const card: fc.Arbitrary<VCard> = fc
	.array(
		fc.oneof(
			property(textValue, fc.constantFrom("FN", "NOTE", "TITLE")),
			property(textValue, NAME),
			property(listValue, fc.constant("NICKNAME")),
			property(nameValue, fc.constant("N")),
			property(literalValue, fc.constantFrom("ORG", "X-ANDROID-CUSTOM")),
		),
		{ maxLength: 8 },
	)
	.map((properties) => ({ version: "4.0", properties }));

/** What the parser returns for a written property, minus the source line. */
function stripLines(c: VCard): VCard {
	return {
		version: c.version,
		properties: c.properties.map(({ line: _line, ...rest }) => rest),
	};
}

describe("writer round trip", () => {
	test("text, lists, structured values and X- parameters survive a 4.0 write and read", () => {
		fc.assert(
			fc.property(card, (c) => {
				const text = serializeVCards([c], { version: "4.0" }).text;
				const back = parseVCards(text);
				expect(back.issues).toEqual([]);
				expect(back.cards).toHaveLength(1);
				const expected: VCard = {
					version: "4.0",
					properties: [
						{
							group: null,
							name: "VERSION",
							params: new Map(),
							value: { kind: "text", value: "4.0" },
						},
						...c.properties.map((p) => ({
							...p,
							params: new Map([...p.params].map(([k, v]) => [k.toUpperCase(), v])),
							value: expectedValue(p),
						})),
					],
				};
				expect(stripLines(back.cards[0] as VCard)).toEqual(expected);
			}),
			{ numRuns: 300 },
		);
	});

	test("the 3.0 writer is a fixed point after one parse and upgrade", () => {
		fc.assert(
			fc.property(card, (c) => {
				const text = serializeVCards([c], { version: "3.0" }).text;
				const back = parseVCards(text);
				expect(back.issues).toEqual([]);
				const again = serializeVCards(
					back.cards.map((parsed) => upgradeTo40(parsed).card),
					{ version: "3.0" },
				).text;
				expect(again).toBe(text);
			}),
			{ numRuns: 300 },
		);
	});

	test("any fold width re-reads identically: multi-byte text, escapes and spaces", () => {
		fc.assert(
			// A fold inside `group.NAME;PARAM` before the first `=` leaves a first line the tolerant
			// parser joins to an N/ADR/ORG above it (docs/plan.md, unfolding rule 3); 40 octets is
			// above every such prefix this generator can build, as 75 is for real names.
			fc.property(card, fc.integer({ min: 40, max: 75 }), (c, foldAt) => {
				const text = serializeVCards([c], { version: "4.0", foldAt }).text;
				for (const physical of text.split("\r\n")) {
					// BEGIN:VCARD and VERSION:4.0 are 11 octets and never folded.
					expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(
						Math.max(foldAt, 11),
					);
				}
				const back = parseVCards(text);
				expect(back.issues).toEqual([]);
				expect(serializeVCards(back.cards, { version: "4.0" }).text).toBe(
					serializeVCards([c], { version: "4.0" }).text,
				);
			}),
			{ numRuns: 200 },
		);
	});

	test("dates, URIs, TYPE and PREF survive both versions through parse and upgrade", () => {
		const date = fc
			.record({
				year: fc.integer({ min: 1, max: 9999 }),
				month: fc.integer({ min: 1, max: 12 }),
				day: fc.integer({ min: 1, max: 28 }),
			})
			.map((value): VValue => ({ kind: "date-and-or-time", value, raw: "" }));
		// Distinct types: the 3.0 table deduplicates, so a repeated one cannot round-trip.
		const typed = fc.uniqueArray(fc.constantFrom("home", "work", "cell", "voice", "X-Custom"), {
			maxLength: 3,
		});
		const pref = fc.option(fc.constant(["1"]), { nil: undefined });
		const typedCard = fc
			.array(
				fc.oneof(
					fc.tuple(typed, pref, TEXT).map(([t, p, v]): VProperty => {
						const params: VParams = new Map();
						if (t.length > 0) params.set("TYPE", t);
						if (p) params.set("PREF", [...p]);
						return {
							group: null,
							name: "TEL",
							params,
							value: { kind: "text", value: v },
						};
					}),
					date.map(
						(v): VProperty => ({
							group: null,
							name: "BDAY",
							params: new Map(),
							value: v,
						}),
					),
					fc.webUrl().map(
						(u): VProperty => ({
							group: null,
							name: "URL",
							params: new Map(),
							value: { kind: "uri", value: u },
						}),
					),
				),
				{ maxLength: 6 },
			)
			.map((properties): VCard => ({ version: "4.0", properties }));
		fc.assert(
			fc.property(typedCard, (c) => {
				for (const version of ["3.0", "4.0"] as const) {
					const text = serializeVCards([c], { version }).text;
					const back = parseVCards(text);
					expect(back.issues).toEqual([]);
					const again = back.cards.map((parsed) => upgradeTo40(parsed).card);
					expect(serializeVCards(again, { version }).text).toBe(text);
					// The 4.0 text of the re-read card equals the 4.0 text of the upgraded original.
					expect(serializeVCards(again, { version: "4.0" }).text).toBe(
						serializeVCards([upgradeTo40(c).card], { version: "4.0" }).text,
					);
				}
			}),
			{ numRuns: 200 },
		);
	});

	test("a parameter value no version can carry is refused, never written", () => {
		const hostile = fc.oneof(
			fc.constant("a\nb"),
			fc.constant("a\rb"),
			fc.constant("\u0000"),
			fc.string({ unit: "grapheme", maxLength: 5 }).map((s) => `${s}\u001b`),
		);
		fc.assert(
			fc.property(hostile, (value) => {
				const c: VCard = {
					version: "4.0",
					properties: [
						{
							group: null,
							name: "TEL",
							params: new Map([["X-A", [value]]]),
							value: { kind: "text", value: "1" },
						},
					],
				};
				const out = serializeVCards([c], { version: "3.0" });
				expect(out.text).toBe("BEGIN:VCARD\r\nVERSION:3.0\r\nTEL:1\r\nEND:VCARD\r\n");
				expect(out.issues.map((i) => i.code)).toEqual(["param-value-not-in-30"]);
				if (!/[\r\n]/.test(value)) {
					// 4.0 caret-encodes a newline, so only the other control characters fail there.
					expect(() => serializeVCards([c], { version: "4.0" })).toThrow(SerializeError);
				}
			}),
		);
	});
});

/**
 * What the parser gives back: \r\n becomes \n (the one thing `\n` escaping cannot tell apart)
 * and a property outside the registry is `unknown` text with its escapes kept.
 */
function expectedValue(p: VProperty): VValue {
	const value = normaliseNewlines(p.value);
	if (p.name.startsWith("X-") && value.kind === "text") {
		return { kind: "unknown", raw: escapeText(value.value) };
	}
	return value;
}

function normaliseNewlines(value: VValue): VValue {
	const fix = (s: string) => s.replace(/\r\n?/g, "\n");
	switch (value.kind) {
		case "text":
			return { kind: "text", value: fix(value.value) };
		case "text-list":
			return { kind: "text-list", values: value.values.map(fix) };
		case "structured":
			return { kind: "structured", components: value.components.map((c) => c.map(fix)) };
		default:
			return value;
	}
}
