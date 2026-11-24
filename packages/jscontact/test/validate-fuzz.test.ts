import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	cardDisplayName,
	FORMAT_STAMP,
	jsonEqual,
	jsonPointer,
	localize,
	normalizeCard,
	parseCards,
	serializeCards,
	validateCard,
} from "../src/index.js";
import { hostileTree, jsonTree, memberPaths } from "./helpers/arbitraries.js";
import { type ConstraintCase, readFixture } from "./helpers/fixtures.js";

const PROTOTYPES = [Object.prototype, Array.prototype, Function.prototype];
const prototypeKeys = (): string[][] => PROTOTYPES.map((p) => Object.getOwnPropertyNames(p));
const cleanPrototypes = prototypeKeys();

/** Runs the property, then checks that nothing was added to a shared prototype. */
function assertHarmless<T extends unknown[]>(property: fc.IProperty<T>, numRuns: number): void {
	fc.assert(property, { numRuns });
	expect(prototypeKeys()).toEqual(cleanPrototypes);
}

const hasError = (issues: { severity: string }[]): boolean =>
	issues.some(({ severity }) => severity === "error");

/** Every Card of the fixtures the validator accepts: the figures and both constraint files. */
const CARDS = [
	...Object.values(readFixture<Record<string, unknown>>("rfc9553-figures.json")),
	...["constraints-valid.json", "constraints-invalid.json"].flatMap((file) =>
		Object.values(readFixture<Record<string, ConstraintCase>>(file)).map((c) => c.card),
	),
].filter((card) => validateCard(card).card !== null);

const REMOVE = Symbol("remove");

/** What code can put in a Card and JSON text cannot: `[, "x"]` is the last. */
const NOT_JSON = [
	undefined,
	Number.NaN,
	Infinity,
	1n,
	() => 0,
	Symbol("s"),
	Object.assign(new Array(2), { 1: "x" }),
];

/** Any JavaScript value, as the name of a Card and as a property the types do not know. */
const anyValue = fc.anything({
	withBigInt: true,
	withDate: true,
	withMap: true,
	withNullPrototype: true,
	withObjectString: true,
	withSet: true,
	withSparseArray: true,
	withTypedArray: true,
});
const cardOfAnything = anyValue.map((value) => ({
	"@type": "Card",
	version: "2.0",
	name: value,
	"example.com:x": value,
}));

/** A fixture Card with one of its members, at any depth, replaced by something else or removed. */
const mutatedCard: fc.Arbitrary<unknown> = fc.constantFrom(...CARDS).chain((card) => {
	const replacement = fc.oneof(
		{ weight: 4, arbitrary: jsonTree },
		{ weight: 4, arbitrary: fc.constantFrom(null, true, false, 0, -1, 1.5, "", "x", [], {}) },
		{ weight: 1, arbitrary: hostileTree },
		{ weight: 1, arbitrary: fc.constantFrom(...NOT_JSON) },
		{ weight: 1, arbitrary: fc.constant(REMOVE) },
	);
	return fc.tuple(fc.constantFrom(...memberPaths(card)), replacement).map(([path, value]) => {
		const mutated = structuredClone(card);
		const pointer = path.map((token) => `/${jsonPointer.escape(token)}`).join("");
		if (value === REMOVE) jsonPointer.remove(mutated, pointer);
		else jsonPointer.set(mutated, pointer, value);
		return mutated;
	});
});

describe("validateCard on arbitrary input", () => {
	test("the fixtures give Cards to start from", () => {
		expect(CARDS.length).toBeGreaterThan(150);
	});

	test("nothing throws: a value is accepted as it is or refused with an error", () => {
		const asCard = hostileTree.map((tree) => ({
			"@type": "Card",
			version: "2.0",
			...Object(tree),
		}));
		assertHarmless(
			fc.property(
				fc.oneof(anyValue, cardOfAnything, hostileTree, asCard, mutatedCard),
				(value) => {
					const before = fc.stringify(value);
					const { card, issues } = validateCard(value);
					expect(fc.stringify(value)).toBe(before);
					expect(card === null).toBe(hasError(issues));
					if (card !== null) expect(card).toBe(value);
					for (const issue of issues) expect(jsonPointer.parse(issue.path)).toBeDefined();
				},
			),
			5000,
		);
	});

	test("a Card that is accepted is read, written and read back without a throw", () => {
		let generated = 0;
		let accepted = 0;
		assertHarmless(
			fc.property(mutatedCard, (value) => {
				generated += 1;
				const { card } = validateCard(value);
				fc.pre(card !== null);
				accepted += 1;
				expect(typeof cardDisplayName(card)).toBe("string");
				for (const tag of Object.keys(card.localizations ?? {})) localize(card, tag);

				const normalized = normalizeCard(card);
				const { cards, issues } = parseCards(serializeCards([card]));
				expect(hasError(issues)).toBe(false);
				expect(cards).toHaveLength(1);
				expect(jsonEqual({ ...cards[0], version: card.version }, normalized)).toBe(true);
			}),
			3000,
		);
		// A mutation lands in a vendor value, a patch or an enumerated value often enough.
		// Runs refused by `fc.pre` are not counted in numRuns: only the ratio can tell.
		expect(accepted / generated).toBeGreaterThan(0.1);
	});

	test("a Card that is refused names a place in it, or one a mandatory property is missing from", () => {
		assertHarmless(
			fc.property(mutatedCard, (value) => {
				for (const { code, path } of validateCard(value).issues) {
					const tokens = jsonPointer.parse(path) ?? [];
					const parent = tokens
						.slice(0, -1)
						.map((token) => `/${jsonPointer.escape(token)}`);
					const container = jsonPointer.get(value, parent.join(""));
					expect(typeof container, `${code} at ${path}`).toBe("object");
					// The hole of a sparse array is a member and no own property.
					if (code === "value-not-json") continue;
					expect(Object.hasOwn(container as object, tokens.at(-1) ?? "")).toBe(
						code !== "property-missing",
					);
				}
			}),
			2000,
		);
	});
});

describe("parseCards on arbitrary input", () => {
	test("nothing throws, and what comes back is a list of valid Cards without a stamp", () => {
		const stamp = fc.oneof(fc.constantFrom(1, 2, 0, "1", null), anyValue);
		// JSON.stringify throws on a bigint, which a mutated Card may hold.
		const text = (list: unknown[]): string =>
			JSON.stringify(list, (_, value) => (typeof value === "bigint" ? "1n" : value));
		const stamped = fc.tuple(mutatedCard, stamp).map(([card, value]) => ({
			...Object(card),
			[FORMAT_STAMP]: value,
		}));
		const candidate = fc.oneof(mutatedCard, stamped, hostileTree);
		const input = fc.oneof(
			fc.string(),
			fc.json(),
			anyValue,
			candidate,
			fc.array(fc.oneof(candidate, cardOfAnything), { maxLength: 4 }),
			fc.array(candidate, { maxLength: 4 }).map(text),
		);
		assertHarmless(
			fc.property(input, (value) => {
				const before = fc.stringify(value);
				const { cards, issues } = parseCards(value);
				expect(fc.stringify(value)).toBe(before);
				for (const card of cards) {
					expect(validateCard(card)).toEqual({ card, issues: [] });
					expect(card.version).toBe("2.0");
					expect(Object.hasOwn(card, FORMAT_STAMP)).toBe(false);
				}
				for (const issue of issues) {
					expect(jsonPointer.parse(issue.path)).toBeDefined();
					if (issue.card !== undefined) expect(cards[issue.card]).toBeDefined();
				}
			}),
			4000,
		);
	});
});
