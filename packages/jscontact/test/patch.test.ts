import { describe, expect, test } from "vitest";
import {
	applyPatchObject,
	type Card,
	type CardIssue,
	localize,
	type PatchIssueCode,
	type PatchObject,
} from "../src/index.js";
import { type ConstraintCase, readFixture } from "./helpers/fixtures.js";

const figures = readFixture<Record<string, Card>>("rfc9553-figures.json");
const invalid = readFixture<Record<string, ConstraintCase>>("constraints-invalid.json");
const valid = readFixture<Record<string, ConstraintCase>>("constraints-valid.json");

const codes = (issues: CardIssue[]): string[] => issues.map((issue) => issue.code);

function rejected(target: object, patch: unknown): CardIssue[] {
	const before = structuredClone(target);
	const { patched, issues } = applyPatchObject(target, patch as PatchObject);
	expect(patched).toBeNull();
	expect(target).toEqual(before);
	for (const issue of issues) {
		expect(issue.severity).toBe(issue.code === "issues-truncated" ? "warning" : "error");
	}
	return issues;
}

describe("applyPatchObject", () => {
	const card = {
		name: { full: "John Doe", components: [{ kind: "given", value: "John" }] },
		phones: { p1: { number: "1" }, p10: { number: "10" } },
	};

	test("sets, replaces and removes on a copy", () => {
		const before = structuredClone(card);
		const { patched, issues } = applyPatchObject(card, {
			"name/full": "Jean Dupont",
			"name/components/0": { kind: "given", value: "Jean" },
			"phones/p1/label": "bureau",
			"phones/p10": null,
			nicknames: { n1: { name: "Jeannot" } },
		});
		expect(issues).toEqual([]);
		expect(patched).toEqual({
			name: { full: "Jean Dupont", components: [{ kind: "given", value: "Jean" }] },
			phones: { p1: { number: "1", label: "bureau" } },
			nicknames: { n1: { name: "Jeannot" } },
		});
		expect(card).toEqual(before);
	});

	test("an empty PatchObject gives an equal copy", () => {
		const { patched } = applyPatchObject(card, {});
		expect(patched).toEqual(card);
		expect(patched).not.toBe(card);
		expect(patched?.name).not.toBe(card.name);
	});

	test("the copy shares nothing with the target or with the patch", () => {
		const patch = { nicknames: { n1: { name: "Jeannot" } } };
		const { patched } = applyPatchObject<typeof card & Partial<typeof patch>>(card, patch);
		expect(patched?.nicknames).toEqual(patch.nicknames);
		expect(patched?.nicknames).not.toBe(patch.nicknames);
		expect(patched?.phones).not.toBe(card.phones);
	});

	test("removing a property that is not there changes nothing", () => {
		expect(applyPatchObject(card, { "name/phoneticScript": null, titles: null })).toEqual({
			patched: card,
			issues: [],
		});
	});

	test("@type is patched as any other value", () => {
		const { patched } = applyPatchObject(
			{ date: { year: 2000 } },
			{ "date/@type": "Timestamp" },
		);
		expect(patched).toEqual({ date: { year: 2000, "@type": "Timestamp" } });
	});

	test("a key is a JSON Pointer without its leading slash", () => {
		const target = { "a/b": { "m~n": 1 }, "": { "": 1 } };
		expect(applyPatchObject(target, { "a~1b/m~0n": 2, "/": 3 }).patched).toEqual({
			"a/b": { "m~n": 2 },
			"": { "": 3 },
		});
		expect(applyPatchObject(target, { "": 4 }).patched).toEqual({ "a/b": { "m~n": 1 }, "": 4 });
	});

	test.each<[name: string, patch: unknown, code: PatchIssueCode, path: string]>([
		["a bad escape", { "name~2full": "x" }, "patch-pointer-invalid", "/name~02full"],
		[
			"a missing parent",
			{ "titles/t1/name": "x" },
			"patch-parent-missing",
			"/titles~1t1~1name",
		],
		[
			"a parent that is a string",
			{ "name/full/0": "x" },
			"patch-parent-missing",
			"/name~1full~10",
		],
		[
			"an appended member",
			{ "name/components/-": {} },
			"patch-array-append",
			"/name~1components~1-",
		],
		[
			"a member of -",
			{ "name/components/-/kind": "x" },
			"patch-array-append",
			"/name~1components~1-~1kind",
		],
		[
			"a new index",
			{ "name/components/1": {} },
			"patch-array-index-missing",
			"/name~1components~11",
		],
		[
			"a padded index",
			{ "name/components/00": {} },
			"patch-array-index-missing",
			"/name~1components~100",
		],
		[
			"the length",
			{ "name/components/length": 0 },
			"patch-array-index-missing",
			"/name~1components~1length",
		],
		[
			"a removed member",
			{ "name/components/0": null },
			"patch-array-index-null",
			"/name~1components~10",
		],
		["a __proto__ key", { "name/__proto__": {} }, "patch-prototype-key", "/name~1__proto__"],
		["an undefined value", { "name/full": undefined }, "patch-value-undefined", "/name~1full"],
	])("%s rejects the PatchObject", (_name, patch, code, path) => {
		const issues = rejected(card, patch);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ code, path });
	});

	test("one invalid patch rejects the valid ones with it, and every invalid one is reported", () => {
		const issues = rejected(card, {
			"name/full": "Jean Dupont",
			"titles/t1/name": "x",
			"name/components/0": null,
		});
		expect(codes(issues)).toEqual(["patch-parent-missing", "patch-array-index-null"]);
	});

	test.each([null, "name/full", 5, true, ["name/full"]])("%j is not a PatchObject", (patch) => {
		const issues = rejected(card, patch);
		expect(issues).toEqual([
			expect.objectContaining({ code: "patch-not-an-object", path: "" }),
		]);
	});

	test.each([null, "text", 5])("%j is nothing to patch, even with no patch", (target) => {
		for (const patch of [{}, { length: 1 }]) {
			const { patched, issues } = applyPatchObject(target as unknown as object, patch);
			expect(patched).toBeNull();
			expect(issues).toEqual([
				expect.objectContaining({ code: "patch-target-not-an-object", path: "" }),
			]);
		}
	});

	test("an array is patched as an object is", () => {
		expect(applyPatchObject([{ a: 1 }, 2], { "0/a": null, "1": [3] }).patched).toEqual([
			{},
			[3],
		]);
	});

	describe("prefixes", () => {
		test("a pointer that is the prefix of another one is a conflict", () => {
			const issues = rejected(card, { "name/full": "x", name: { full: "y" } });
			expect(issues).toEqual([
				expect.objectContaining({ code: "patch-prefix-conflict", path: "/name~1full" }),
			]);
		});

		test("every pointer under a patched one is reported, once", () => {
			const issues = rejected(card, {
				"phones/p1/number": "2",
				"phones/p1": { number: "3" },
				"phones/p1/label": "x",
				phones: {},
				"name/full": "x",
			});
			expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
				["patch-prefix-conflict", "/phones~1p1"],
				["patch-prefix-conflict", "/phones~1p1~1label"],
				["patch-prefix-conflict", "/phones~1p1~1number"],
			]);
		});

		test("a prefix is made of whole tokens: p1 is none of p10", () => {
			const patch = { "phones/p1": { number: "2" }, "phones/p10/label": "x", "phones/p": {} };
			expect(applyPatchObject(card, patch).patched).toEqual({
				name: card.name,
				phones: { p1: { number: "2" }, p10: { number: "10", label: "x" }, p: {} },
			});
		});

		test("a name sorting between a pointer and what it starts hides no conflict", () => {
			// As text "a!" comes between "a" and "a/b"; token by token it does not.
			const issues = rejected({ a: { b: 1 }, "a!": 1 }, { a: {}, "a!": 2, "a/b": 3 });
			expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
				["patch-prefix-conflict", "/a~1b"],
			]);
		});

		test("a conflict is seen even when the inner pointer leads nowhere", () => {
			const issues = rejected(card, { titles: {}, "titles/t1/name": "x" });
			expect(codes(issues)).toEqual(["patch-parent-missing", "patch-prefix-conflict"]);
		});
	});

	test("- is an Id like another in an object, and never an index in an array", () => {
		const target = { phones: { "-": { number: "1" } }, list: [{ "-": 1 }] };
		const patch = { "phones/-/number": "2", "list/0/-": 2 };
		expect(applyPatchObject(target, patch).patched).toEqual({
			phones: { "-": { number: "2" } },
			list: [{ "-": 2 }],
		});
	});

	describe("prototypes", () => {
		test("no patch reaches one", () => {
			for (const key of [
				"__proto__/polluted",
				"constructor/prototype/polluted",
				"toString/x",
			]) {
				expect(codes(rejected({}, { [key]: true })), key).toEqual(["patch-parent-missing"]);
			}
			expect(
				codes(rejected({}, JSON.parse('{ "__proto__": { "polluted": true } }'))),
			).toEqual(["patch-prototype-key"]);
			expect({}).not.toHaveProperty("polluted");
		});

		test("an own __proto__ key of the target or of a value is copied as data", () => {
			const target: object = JSON.parse('{ "a": { "__proto__": { "x": 1 } } }');
			const patch: PatchObject = JSON.parse('{ "b": { "__proto__": { "y": 2 } } }');
			const { patched } = applyPatchObject(target, patch);
			expect(JSON.stringify(patched)).toBe(
				'{"a":{"__proto__":{"x":1}},"b":{"__proto__":{"y":2}}}',
			);
			expect((patched as { a: { x?: number } }).a.x).toBeUndefined();
		});

		test("a property may bear the name of an inherited one", () => {
			expect(applyPatchObject({}, { constructor: 1, toString: 2 }).patched).toEqual({
				constructor: 1,
				toString: 2,
			});
		});
	});

	test("a message shows the start of a long key, the path all of it", () => {
		const key = `missing/${"x".repeat(500)}`;
		const [issue] = rejected(card, { [key]: 1 });
		expect(issue?.message).toContain(`"${key.slice(0, 40)}…"`);
		expect(issue?.message.length).toBeLessThan(200);
		expect(issue?.path).toBe(`/missing~1${"x".repeat(500)}`);
	});

	test("a hostile PatchObject is reported up to the cap of each code", () => {
		const patch = Object.fromEntries(
			Array.from({ length: 1500 }, (_, i) => [`missing/${i}`, 1]),
		);
		const issues = rejected(card, patch);
		expect(issues).toHaveLength(1001);
		expect(issues.at(-1)).toMatchObject({ severity: "warning", code: "issues-truncated" });
		expect(issues.at(-1)?.message).toContain("patch-parent-missing");
	});

	test("a nesting deeper than the call stack is patched without recursion", () => {
		const target: unknown = JSON.parse(`{"deep":${"[".repeat(200_000)}${"]".repeat(200_000)}}`);
		const path = `deep${"/0".repeat(199_999)}`;
		const { patched, issues } = applyPatchObject(target as object, {
			[`${path}/0`]: 1,
			top: 1,
		});
		expect(codes(issues)).toEqual(["patch-array-index-missing"]);
		expect(patched).toBeNull();
		expect(applyPatchObject(target as object, { [path]: "bottom" }).issues).toEqual([]);
	});
});

describe("localize", () => {
	// The result is typed a JSON object: these Cards are known to stay valid.
	const localized = (card: Card, language: string) =>
		localize(card, language).card as Card | null;

	test("figure 40: a title in Spanish", () => {
		expect(localize(figures["figure-40"] as Card, "es")).toEqual({
			card: {
				"@type": "Card",
				version: "2.0",
				language: "es",
				name: { full: "Gabriel García Márquez" },
				titles: { t1: { kind: "title", name: "escritor" } },
			},
			issues: [],
		});
	});

	test("figure 39: a whole name replaced", () => {
		const card = localized(figures["figure-39"] as Card, "uk-Cyrl");
		expect(card?.language).toBe("uk-Cyrl");
		expect(card?.name?.components?.map((component) => component.value)).toEqual([
			"г-н",
			"Иван",
			"Петрович",
			"Васильев",
		]);
		expect(card).not.toHaveProperty("localizations");
	});

	test("figure 20: phonetics added inside the components of an array", () => {
		const card = localized(figures["figure-20"] as Card, "yue");
		expect(localize(figures["figure-20"] as Card, "yue").issues).toEqual([]);
		expect(card?.language).toBe("yue");
		expect(card?.name).toMatchObject({ phoneticSystem: "jyut", phoneticScript: "Latn" });
		expect(card?.name?.components?.map((component) => component.phonetic)).toEqual([
			"syun1",
			"zung1saan1",
			"man4",
			"jat6sin1",
		]);
	});

	test("figure 33: an address replaced", () => {
		const card = localized(figures["figure-33"] as Card, "jp");
		expect(Object.values(card?.addresses ?? {})).toEqual([
			expect.objectContaining({
				full: "〒100-8994東京都千代田区丸ノ内2-7-2",
				defaultSeparator: "",
			}),
		]);
	});

	test("the Card is left as it was", () => {
		const card = figures["figure-40"] as Card;
		const before = structuredClone(card);
		const spanish = localized(card, "es");
		expect(card).toEqual(before);
		expect(spanish?.titles).not.toBe(card.titles);
	});

	test("the tag is compared without case and written back as the Card has it", () => {
		expect(localized(figures["figure-39"] as Card, "UK-cyrl")?.language).toBe("uk-Cyrl");
		expect(localize(figures["figure-39"] as Card, "uk").card).toBe(figures["figure-39"]);
	});

	test("of two tags that differ by case only, the first one answers", () => {
		const card: Card = {
			"@type": "Card",
			version: "2.0",
			name: { full: "John" },
			localizations: { FR: { "name/full": "first" }, fr: { "name/full": "second" } },
		};
		for (const language of ["fr", "FR", "Fr"]) {
			expect(localize(card, language).card).toMatchObject({
				language: "FR",
				name: { full: "first" },
			});
		}
	});

	test("a Card without a patch for the language is returned itself", () => {
		const plain = figures["figure-16"] as Card;
		expect(localize(plain, "fr")).toEqual({ card: plain, issues: [] });
		expect(localize(plain, "fr").card).toBe(plain);
		const other = figures["figure-40"] as Card;
		expect(localize(other, "fr").card).toBe(other);
		for (const name of ["toString", "constructor", "__proto__"]) {
			expect(localize(other, name).card, name).toBe(other);
		}
		const broken = { ...plain, localizations: "fr" } as unknown as Card;
		expect(localize(broken, "fr").card).toBe(broken);
	});

	test.each([null, "text", []])("%j is no Card to localize", (card) => {
		expect(localize(card as unknown as Card, "fr")).toEqual({
			card: null,
			issues: [expect.objectContaining({ code: "patch-target-not-an-object", path: "" })],
		});
	});

	test("the language of the patch wins over a language the patch sets", () => {
		const card: Card = {
			"@type": "Card",
			version: "2.0",
			language: "en",
			localizations: { fr: { language: "de", "name/full": "x" } },
		};
		expect(localize(card, "fr").card).toBeNull();
		card.name = { full: "John" };
		expect(localize(card, "fr").card).toMatchObject({ language: "fr", name: { full: "x" } });
	});

	test("an issue is placed in the Card, the tag and the key escaped", () => {
		const card: Card = {
			"@type": "Card",
			version: "2.0",
			localizations: { "x/y": { "titles/t1/name": "x" }, de: 5 as unknown as PatchObject },
		};
		expect(localize(card, "x/y")).toEqual({
			card: null,
			issues: [
				expect.objectContaining({
					severity: "error",
					code: "patch-parent-missing",
					path: "/localizations/x~1y/titles~1t1~1name",
				}),
			],
		});
		expect(localize(card, "de").issues).toEqual([
			expect.objectContaining({ code: "patch-not-an-object", path: "/localizations/de" }),
		]);
	});

	test("a patch on the localizations is refused, whole or inside, and reported once", () => {
		const card: Card = {
			"@type": "Card",
			version: "2.0",
			name: { full: "John" },
			localizations: {
				fr: { localizations: {}, "localizations/de": {}, "name/full": "Jean" },
				de: { localizationsOfMine: 1 },
			},
		};
		const { card: localized, issues } = localize(card, "fr");
		expect(localized).toBeNull();
		expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
			["patch-targets-localizations", "/localizations/fr/localizations"],
			["patch-targets-localizations", "/localizations/fr/localizations~1de"],
		]);
		expect(localize(card, "de").card).toHaveProperty("localizationsOfMine", 1);
	});

	describe("constraint cases", () => {
		const REJECTED: Record<string, PatchIssueCode> = {
			"patch-array-index-null": "patch-array-index-null",
			"patch-array-append": "patch-array-append",
			"patch-parent-missing": "patch-parent-missing",
			"patch-array-index-missing": "patch-array-index-missing",
			"patch-prefix-conflict": "patch-prefix-conflict",
			"patch-targets-localizations": "patch-targets-localizations",
			"localizations-not-a-patch-object": "patch-not-an-object",
		};
		// The patch applies: what is wrong is a value or the Card it gives, which the validator judges.
		const APPLIED = [
			"patch-value-invalid",
			"patch-null-on-mandatory",
			"patch-result-invalid",
			"localizations-key-not-a-language-tag",
		];
		const localized = (constraint: ConstraintCase) => {
			const card = constraint.card as Card;
			return Object.keys(card.localizations ?? {}).map((language) =>
				localize(card, language),
			);
		};
		const withPatches = (cases: Record<string, ConstraintCase>) =>
			Object.entries(cases).filter(
				([, constraint]) => "localizations" in (constraint.card as object),
			);

		test("every invalid Card with localizations is in one of the two lists", () => {
			const names = withPatches(invalid).map(([name]) => name);
			expect(names.toSorted()).toEqual([...Object.keys(REJECTED), ...APPLIED].toSorted());
		});

		test.each(Object.entries(REJECTED))("%s is rejected as %s", (name, code) => {
			const results = localized(invalid[name] as ConstraintCase);
			expect(results).toHaveLength(1);
			expect(results[0]?.card).toBeNull();
			expect(codes(results[0]?.issues ?? [])).toEqual([code]);
		});

		test.each(APPLIED)("%s applies", (name) => {
			for (const result of localized(invalid[name] as ConstraintCase)) {
				expect(result.issues).toEqual([]);
				expect(result.card).not.toBeNull();
			}
		});

		test.each(withPatches(valid))("%s applies", (_name, constraint) => {
			const results = localized(constraint);
			expect(results).not.toHaveLength(0);
			for (const result of results) expect(result.issues).toEqual([]);
		});

		test("patch-forms: a member replaced, a property set, one removed, one added", () => {
			const [result] = localized(valid["patch-forms"] as ConstraintCase);
			expect(result?.card).toMatchObject({
				language: "es",
				name: {
					components: [
						{ kind: "given", value: "Juan" },
						{ kind: "surname", value: "Doe" },
					],
				},
				titles: { t1: { name: "escritor" } },
				nicknames: { n1: { name: "Juanito" } },
			});
			expect(result?.card).not.toHaveProperty("titles.t1.kind");
		});
	});
});
