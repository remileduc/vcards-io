import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { escapeText, type ParseResult, parseVCards, type VValueKind } from "../src/index.js";

const KINDS: ReadonlySet<VValueKind> = new Set([
	"text",
	"text-list",
	"structured",
	"uri",
	"date-and-or-time",
	"timestamp",
	"utc-offset",
	"language-tag",
	"integer",
	"float",
	"boolean",
	"binary",
	"unknown",
]);
const VERSIONS = new Set(["2.1", "3.0", "4.0"]);
const SEVERITIES = new Set(["error", "warning", "info"]);

function wellFormed(result: ParseResult): void {
	for (const card of result.cards) {
		expect(VERSIONS.has(card.version)).toBe(true);
		for (const p of card.properties) {
			expect(p.name).toBe(p.name.toUpperCase());
			expect(p.name).not.toBe("");
			expect(KINDS.has(p.value.kind)).toBe(true);
			expect(p.line).toBeGreaterThan(0);
			for (const [name] of p.params) expect(name).toBe(name.toUpperCase());
		}
	}
	for (const issue of result.issues) {
		expect(SEVERITIES.has(issue.severity)).toBe(true);
		expect(issue.code).not.toBe("");
	}
}

const PROPERTY_NAME = fc
	.stringMatching(/^[A-Z][A-Z0-9-]{0,15}$/)
	.filter((n) => !["BEGIN", "END", "VERSION", "AGENT"].includes(n));
const ASCII_VALUE = fc.string({ maxLength: 60 });
const TYPE = fc.constantFrom("home", "work", "cell", "pref", "X-Foo");

describe("parseVCards fuzz", () => {
	test("never throws and stays well-formed on arbitrary text", () => {
		fc.assert(
			fc.property(fc.string({ unit: "binary", maxLength: 2000 }), (text) => {
				wellFormed(parseVCards(text));
			}),
			{ numRuns: 300 },
		);
	});

	test("never throws and stays well-formed on arbitrary bytes", () => {
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 4000 }), (bytes) => {
				wellFormed(parseVCards(bytes));
			}),
			{ numRuns: 300 },
		);
	});

	test("any escaped text round-trips through a 4.0 NOTE", () => {
		const text = fc
			.string({ unit: "grapheme", maxLength: 200 })
			.filter((s) => s.isWellFormed() && !s.includes("\r"));
		fc.assert(
			fc.property(text, (s) => {
				const { cards, issues } = parseVCards(
					`BEGIN:VCARD\r\nVERSION:4.0\r\nNOTE:${escapeText(s)}\r\nEND:VCARD`,
				);
				expect(issues).toEqual([]);
				expect(cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: s });
			}),
		);
	});

	test("escaped components round-trip through N", () => {
		const components = fc.array(
			fc
				.string({ unit: "grapheme", maxLength: 30 })
				.filter((s) => s.isWellFormed() && !s.includes("\r")),
			{
				minLength: 1,
				maxLength: 7,
			},
		);
		fc.assert(
			fc.property(components, (parts) => {
				const line = `N:${parts.map(escapeText).join(";")}`;
				const { cards } = parseVCards(`BEGIN:VCARD\nVERSION:3.0\n${line}\nEND:VCARD`);
				expect(cards[0]?.properties[1]?.value).toEqual({
					kind: "structured",
					components: parts.map((p) => [p]),
				});
			}),
		);
	});

	test("a generated file keeps every card and property in order, whatever the line ending", () => {
		const property = fc.record({
			name: PROPERTY_NAME,
			types: fc.array(TYPE, { maxLength: 3 }),
			value: ASCII_VALUE,
		});
		const card = fc.record({
			version: fc.constantFrom("2.1", "3.0", "4.0"),
			properties: fc.array(property, { maxLength: 12 }),
		});
		const file = fc.record({
			cards: fc.array(card, { maxLength: 6 }),
			ending: fc.constantFrom("\r\n", "\n", "\r"),
		});
		fc.assert(
			fc.property(file, ({ cards, ending }) => {
				const text = cards
					.map((c) =>
						[
							"BEGIN:VCARD",
							`VERSION:${c.version}`,
							...c.properties.map(
								(p) =>
									`${p.name}${p.types.length > 0 ? `;TYPE=${p.types.join(",")}` : ""}:${p.value}`,
							),
							"END:VCARD",
						].join(ending),
					)
					.join(ending);
				const result = parseVCards(text);
				wellFormed(result);
				expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
				expect(result.cards.map((c) => c.version)).toEqual(cards.map((c) => c.version));
				result.cards.forEach((parsed, k) => {
					const expected = cards[k];
					expect(parsed.properties.slice(1).map((p) => p.name)).toEqual(
						expected?.properties.map((p) => p.name),
					);
					for (const [i, p] of parsed.properties.slice(1).entries()) {
						const types = expected?.properties[i]?.types ?? [];
						if (types.length > 0)
							expect(p.params.get("TYPE")).toEqual(
								types.map((t) => t.toLowerCase().replace(/^x-foo$/, "X-Foo")),
							);
						if (p.value.kind === "unknown")
							expect(p.value.raw).toBe(expected?.properties[i]?.value);
					}
				});
			}),
		);
	});
});
