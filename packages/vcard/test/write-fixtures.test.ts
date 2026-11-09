import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	type Issue,
	parseVCards,
	SerializeError,
	serializeVCards,
	upgradeTo40,
	type VCard,
	type VProperty,
	type VValue,
} from "../src/index.js";

const root = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../fixtures/`;
// Every .vcf present, so an untracked local export is tested too without being named here.
const files = readdirSync(root, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((dir) => readdirSync(`${root}${dir.name}`).map((f) => `${dir.name}/${f}`))
	.filter((f) => f.endsWith(".vcf"))
	.sort();

/**
 * Properties the tolerant parser keeps but no writer can name: a Google line whose name is
 * `\NARBITRARY_STRING` and a bare `END:` line DAVdroid wrote. The layer building a card for
 * export (convert) has to drop them; here they are removed before writing.
 */
const UNWRITABLE: Record<string, string[]> = {
	"google/cozy-google-full.vcf": ["\\NARBITRARY_STRING"],
	"other/cozy-contactA-davdroid.vcf": ["END"],
};

/** A 4.0 parameter value holding a newline (RFC 6868 `^n`) has no 3.0 encoding at all. */
const DROPPED_IN_30: Record<string, string[]> = {
	"rfc/rfc6868-caret.vcf": ["param-value-not-in-30"],
};

/** Infos our own output may raise on re-read: properties of another version, a non-Gregorian date. */
const REPARSE_INFOS = new Set(["property-not-in-version", "calscale-unsupported"]);

/**
 * A card whose 3.0 text settles only after a second round: RFC 2426's example has two
 * SORT-STRING lines, the first became SORT-AS (no 3.0 form, dropped), the second is still a
 * SORT-STRING that the next upgrade moves onto N in its turn.
 */
const SETTLES_IN_TWO_ROUNDS_30 = new Set(["rfc/rfc2426-properties.vcf"]);

/**
 * An `unknown` value written into a card is typed by the reader like any other text of that
 * property: the versit PHOTO holding a MIME content id reads back as a URI.
 */
const RETYPED_ON_REREAD: Record<string, string[]> = {
	"rfc/versit21-examples.vcf": ["PHOTO"],
};

const encoder = new TextEncoder();
const codes = (issues: Issue[]) => issues.map((i) => i.code).sort();
const nonInfo = (issues: Issue[]) => issues.filter((i) => i.severity !== "info");

/**
 * The model without what a rewrite legitimately changes: source lines, the spelling of dates, a
 * redundant VALUE parameter (the writer derives it from the kind, which is still compared) and
 * CRLF inside a text or a parameter (`\n` and `^n` escaping cannot tell it from LF).
 */
function comparable(card: VCard, skip: readonly string[] = []): VCard {
	return {
		version: card.version,
		properties: card.properties
			.filter((p) => !skip.includes(p.name))
			.map((p): VProperty => {
				const { line: _line, ...rest } = p;
				const params = new Map([...rest.params].map(([k, v]) => [k, v.map(lf)]));
				params.delete("VALUE");
				return { ...rest, params, value: comparableValue(rest.value) };
			}),
	};
}

const lf = (s: string) => s.replace(/\r\n?/g, "\n");

function comparableValue(value: VValue): VValue {
	switch (value.kind) {
		case "date-and-or-time":
		case "timestamp":
			return { ...value, raw: "" };
		case "text":
			return { kind: "text", value: lf(value.value) };
		case "text-list":
			return { kind: "text-list", values: value.values.map(lf) };
		case "structured":
			return { kind: "structured", components: value.components.map((c) => c.map(lf)) };
		default:
			return value;
	}
}

function upgradeAll(cards: VCard[]): { cards: VCard[]; issues: Issue[] } {
	const out: VCard[] = [];
	const issues: Issue[] = [];
	for (const card of cards) {
		const result = upgradeTo40(card);
		out.push(result.card);
		issues.push(...result.issues);
	}
	return { cards: out, issues };
}

function without(cards: VCard[], names: readonly string[]): VCard[] {
	if (names.length === 0) return cards;
	return cards.map((c) => ({
		version: c.version,
		properties: c.properties.filter((p) => !names.includes(p.name)),
	}));
}

/** Lines are CRLF, at most 75 octets, continuation lines start with a space, nothing legacy. */
function expectWellFormed(text: string, version: string, cards: number): void {
	expect(text.startsWith("BEGIN:VCARD\r\n")).toBe(true);
	expect(text.endsWith("END:VCARD\r\n")).toBe(true);
	expect(text).not.toContain("﻿");
	const physical = text.split("\r\n");
	expect(physical.at(-1)).toBe("");
	for (const line of physical.slice(0, -1)) {
		expect(line, "blank line").not.toBe("");
		expect(line).not.toMatch(/[\r\n]/);
		expect(encoder.encode(line).length, line).toBeLessThanOrEqual(75);
		expect(line).not.toMatch(/^[^ :]*;(CHARSET|ENCODING=QUOTED-PRINTABLE)/i);
	}
	expect(text.match(/^VERSION:.*$/gm)).toEqual(Array<string>(cards).fill(`VERSION:${version}`));
}

describe("every fixture round-trips through the writer", () => {
	test.each(files)("%s", (file) => {
		const source = readFileSync(`${root}${file}`);
		const unwritable = UNWRITABLE[file] ?? [];
		const parsed = parseVCards(source);
		const first = upgradeAll(parsed.cards);
		const expectedCodes = codes(first.issues);
		const kept = unwritable.length;
		for (const name of unwritable) {
			expect(() => serializeVCards(first.cards, { version: "4.0" })).toThrow(SerializeError);
			expect(
				first.cards.flatMap((c) => c.properties).filter((p) => p.name === name),
			).toHaveLength(1);
		}
		const cards = without(first.cards, unwritable);
		expect(first.cards.flatMap((c) => c.properties).length - kept).toBe(
			cards.flatMap((c) => c.properties).length,
		);

		for (const version of ["4.0", "3.0"] as const) {
			const written = serializeVCards(cards, { version });
			const { text } = written;
			expectWellFormed(text, version, cards.length);
			// 4.0 carries the whole model; 3.0 warns about what it dropped, and only that.
			if (version === "4.0") expect(written.issues).toEqual([]);
			for (const code of version === "3.0" ? (DROPPED_IN_30[file] ?? []) : []) {
				expect(
					written.issues.map((i) => i.code),
					`${version} ${code}`,
				).toContain(code);
			}

			// Our own output reads back with no new warning (one the source itself raised may
			// recur: junk stays junk); infos only for what the version lacks.
			const reparsed = parseVCards(text);
			const sourceWarnings = new Set(nonInfo(parsed.issues).map((i) => i.code));
			for (const issue of reparsed.issues) {
				const allowed = issue.severity === "info" ? REPARSE_INFOS : sourceWarnings;
				expect(allowed.has(issue.code), `${version} reparse: ${issue.code}`).toBe(true);
			}
			expect(reparsed.cards).toHaveLength(cards.length);
			for (const card of reparsed.cards) expect(card.version).toBe(version);

			// Upgrading what we wrote is a fixed point: same text again, no non-info issue.
			const second = upgradeAll(reparsed.cards);
			expect(nonInfo(second.issues), `${version} re-upgrade`).toEqual([]);
			const again = serializeVCards(second.cards, { version }).text;
			if (version === "3.0" && SETTLES_IN_TWO_ROUNDS_30.has(file)) {
				expect(again).not.toBe(text);
				const third = upgradeAll(parseVCards(again).cards);
				expect(serializeVCards(third.cards, { version }).text).toBe(again);
			} else {
				expect(again).toBe(text);
			}
			if (version === "4.0") {
				// Lossless: the normalised model survives a 4.0 write exactly.
				const retyped = RETYPED_ON_REREAD[file] ?? [];
				expect(second.cards.map((c) => comparable(c, retyped))).toEqual(
					cards.map((c) => comparable(c, retyped)),
				);
				expect(second.issues).toEqual([]);
			}
		}
		// The input itself was not touched by any of this.
		expect(codes(upgradeAll(parseVCards(source).cards).issues)).toEqual(expectedCodes);
	});
});

describe("4.0 fixtures are stable without the normaliser", () => {
	const v40 = files.filter((f) => readFileSync(`${root}${f}`, "utf-8").includes("VERSION:4.0"));
	test.each(v40)("%s", (file) => {
		const parsed = parseVCards(readFileSync(`${root}${file}`));
		const cards = parsed.cards.filter((c) => c.version === "4.0");
		const text = serializeVCards(cards, { version: "4.0" }).text;
		const back = parseVCards(text);
		expect(back.issues).toEqual([]);
		expect(back.cards.map((c) => comparable(c))).toEqual(cards.map((c) => comparable(c)));
		expect(serializeVCards(back.cards, { version: "4.0" }).text).toBe(text);
	});
});
