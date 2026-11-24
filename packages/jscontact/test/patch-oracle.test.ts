// Differential tests against @sdxc/jscontact, the other JSContact implementation on npm: both
// must agree on which PatchObject applies and on what it gives.

import { applyPatch, localize as oracleLocalize } from "@sdxc/jscontact";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	applyPatchObject,
	type Card,
	jsonEqual,
	localize,
	type PatchObject,
} from "../src/index.js";
import { jsonCase } from "./helpers/arbitraries.js";
import { type ConstraintCase, readFixture } from "./helpers/fixtures.js";

/** The patched value, `"rejected"`, or `"threw"`: what the oracle does with JSON it does not expect. */
type Outcome = { value: unknown } | "rejected" | "threw";

function ours(target: unknown, patch: unknown): Outcome {
	const { patched, issues } = applyPatchObject(target as object, patch as PatchObject);
	expect(patched === null).toBe(issues.length > 0);
	return patched === null ? "rejected" : { value: patched };
}

function theirs(target: unknown, patch: unknown): Outcome {
	try {
		const result = applyPatch(target as object, patch as never);
		return result.status === "success" ? { value: result.data } : "rejected";
	} catch {
		return "threw";
	}
}

function oursLocalized(card: unknown, language: string): Outcome {
	const { card: localized } = localize(card as Card, language);
	return localized === null ? "rejected" : { value: localized };
}

function theirsLocalized(card: unknown, language: string): Outcome {
	try {
		const result = oracleLocalize(card as never, language);
		return result.status === "success" ? { value: result.data } : "rejected";
	} catch {
		return "threw";
	}
}

const TARGET = { name: { full: "John" }, phones: { "-": { number: "1" } }, list: [1, 2] };

/** Each intended divergence: why, a patch of TARGET that shows it, and what each side answers. */
const DIVERGENCES: {
	reason: string;
	patch: unknown;
	ours: Outcome;
	theirs: Outcome;
}[] = [
	{
		reason: 'it refuses "-" in any token; RFC 9553 forbids it as an array index, and "-" is a valid Id',
		patch: { "phones/-/number": "2" },
		ours: { value: { ...TARGET, phones: { "-": { number: "2" } } } },
		theirs: "rejected",
	},
	{
		reason: "it defines an own __proto__ property; this package never writes that key",
		patch: { "name/__proto__": "x" },
		ours: "rejected",
		theirs: { value: { ...TARGET, name: JSON.parse('{ "full": "John", "__proto__": "x" }') } },
	},
	{
		reason: "it reads a string as a PatchObject, one patch per character",
		patch: "ab",
		ours: "rejected",
		theirs: { value: { ...TARGET, 0: "a", 1: "b" } },
	},
	{
		reason: "it reads an array as a PatchObject, one patch per member",
		patch: [{ full: "x" }],
		ours: "rejected",
		theirs: { value: { ...TARGET, 0: { full: "x" } } },
	},
	{
		reason: "it applies a number as an empty PatchObject",
		patch: 5,
		ours: "rejected",
		theirs: { value: TARGET },
	},
	{
		reason: "it throws on null, which this package reports as an issue",
		patch: null,
		ours: "rejected",
		theirs: "threw",
	},
];

/** Whether a generated key falls into one of the first two: they are left to the cases above. */
function diverges(patch: Record<string, unknown>): boolean {
	const tokens = Object.keys(patch).flatMap((key) => key.split("/"));
	return tokens.includes("-") || tokens.includes("__proto__");
}

describe("applyPatchObject against @sdxc/jscontact", () => {
	test.each<Record<string, unknown>>([
		{},
		{ "name/full": "Jean" },
		{ "name/full": null, "name/sortAs": { surname: "Doe" } },
		{ "list/0": "x", "list/1": [1] },
		{ "": 1, "phones/p1": null, phones: null },
		{ "": 1, "name/phoneticScript": null },
		{ "list/2": 3 },
		{ "list/-": 3 },
		{ "list/01": 3 },
		{ "list/length": 0 },
		{ "list/1": null },
		{ "name/full/0": "x" },
		{ "titles/t1/name": "x" },
		{ name: {}, "name/full": "x" },
		{ "name~2full": "x" },
		{ "name~": "x" },
		{ "__proto__/x": 1 },
		{ "constructor/prototype/x": 1 },
		{ constructor: 1 },
	])("both answer the same to %j", (patch) => {
		expect(ours(TARGET, patch)).toEqual(theirs(TARGET, patch));
	});

	test.each(DIVERGENCES)("divergence: $reason", ({ patch, ...expected }) => {
		expect(ours(TARGET, patch)).toEqual(expected.ours);
		expect(theirs(TARGET, patch)).toEqual(expected.theirs);
	});

	test("divergence: it patches what is no object, or throws on it", () => {
		for (const target of [null, "text", 5]) {
			expect(ours(target, {})).toBe("rejected");
			expect(theirs(target, {})).toEqual({ value: target });
		}
		expect(ours("text", { a: 1 })).toBe("rejected");
		expect(theirs("text", { a: 1 })).toBe("threw");
	});

	test("both answer the same to generated values and PatchObjects", () => {
		fc.assert(
			fc.property(jsonCase, ([target, patch]) => {
				fc.pre(typeof target === "object" && target !== null && !diverges(patch));
				const mine = ours(target, patch);
				const other = theirs(target, patch);
				expect(mine).toEqual(other);
				// toEqual forgives an undefined member; jsonEqual does not.
				if (typeof mine === "object" && typeof other === "object") {
					expect(jsonEqual(mine.value, other.value)).toBe(true);
				}
			}),
			{ numRuns: 2000 },
		);
	});
});

describe("localize against @sdxc/jscontact", () => {
	const figures = readFixture<Record<string, unknown>>("rfc9553-figures.json");
	const cases = ["constraints-invalid.json", "constraints-valid.json"].flatMap((file) =>
		Object.entries(readFixture<Record<string, ConstraintCase>>(file)).map(
			([name, constraint]) => [name, constraint.card] as const,
		),
	);
	const cards = [...Object.entries(figures), ...cases];

	/** Fixture Cards the two localize differently, with the reason. */
	const DIVERGENT_CARDS = new Map([
		[
			"localizations-not-a-patch-object",
			"it reads a string as a PatchObject, one patch per character",
		],
	]);

	function languages(card: unknown): string[] {
		const localizations = (card as { localizations?: unknown }).localizations;
		const tags = typeof localizations === "object" ? Object.keys(localizations ?? {}) : [];
		return [...tags, ...tags.map((tag) => tag.toUpperCase()), "tlh", "toString", "__proto__"];
	}

	test.each(cards.filter(([name]) => !DIVERGENT_CARDS.has(name)))(
		"both localize %s the same",
		(_name, card) => {
			for (const language of languages(card)) {
				expect(oursLocalized(card, language), language).toEqual(
					theirsLocalized(card, language),
				);
			}
		},
	);

	test.each([...DIVERGENT_CARDS])("divergence on %s: %s", (name, _reason) => {
		const card = cards.find(([other]) => other === name)?.[1];
		for (const language of Object.keys((card as Card).localizations ?? {})) {
			expect(oursLocalized(card, language)).toBe("rejected");
			expect(theirsLocalized(card, language)).not.toBe("rejected");
		}
	});

	test("divergence: it lets a patch set the localizations, which RFC 9553 forbids", () => {
		const card = {
			"@type": "Card",
			version: "2.0",
			localizations: { fr: { localizations: { de: {} } } },
		};
		expect(oursLocalized(card, "fr")).toBe("rejected");
		expect(theirsLocalized(card, "fr")).toEqual({
			value: { "@type": "Card", version: "2.0", language: "fr", localizations: { de: {} } },
		});
	});

	test("a Card with no patch for the language comes back itself from both", () => {
		const card = figures["figure-40"];
		expect(localize(card as Card, "fr").card).toBe(card);
		expect(theirsLocalized(card, "fr")).toEqual({ value: card });
	});

	test("both localize generated Cards the same", () => {
		fc.assert(
			fc.property(jsonCase, fc.boolean(), ([base, patch], upper) => {
				fc.pre(typeof base === "object" && base !== null && !Array.isArray(base));
				fc.pre(!diverges(patch));
				const card = { ...base, localizations: { "fr-CA": patch, de: {} } };
				const language = upper ? "FR-ca" : "fr-CA";
				expect(oursLocalized(card, language)).toEqual(theirsLocalized(card, language));
				expect(oursLocalized(card, "de")).toEqual({ value: { ...base, language: "de" } });
			}),
			{ numRuns: 1000 },
		);
	});
});
