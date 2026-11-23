import { describe, expect, test } from "vitest";
import {
	type Card,
	type CardIssue,
	cardDisplayName,
	jsonPointer,
	NICKNAME_KIND,
	normalizeCard,
	VALIDATION_ISSUE_CODES,
	type ValidationIssueCode,
	validateCard,
} from "../src/index.js";
import { MAX_ISSUES_PER_CODE } from "../src/issues.js";
import { PROPERTIES } from "../src/schema.js";
import { MAX_CARD_DEPTH, MAX_CARD_NODES, MAX_PATH_LENGTH } from "../src/validate.js";
import { type ConstraintCase, readDoc, readFixture } from "./helpers/fixtures.js";

const invalid = readFixture<Record<string, ConstraintCase>>("constraints-invalid.json");
const valid = readFixture<Record<string, ConstraintCase>>("constraints-valid.json");
const figures = readFixture<Record<string, unknown>>("rfc9553-figures.json");

type Found = [code: ValidationIssueCode | "issues-truncated", path: string];

const found = (issues: CardIssue[]): Found[] =>
	issues.map(({ code, path }) => [code as Found[0], path]);

/** A Card with the two mandatory properties and the ones given. */
const card = (properties: Record<string, unknown> = {}): Record<string, unknown> => ({
	"@type": "Card",
	version: "2.0",
	...properties,
});

/** The issues of a Card that must be refused. */
function refused(value: unknown): Found[] {
	const result = validateCard(value);
	expect(result.card).toBeNull();
	for (const issue of result.issues) expect(issue.severity).toBe("error");
	return found(result.issues);
}

function accepted(value: unknown): void {
	expect(validateCard(value)).toEqual({ card: value, issues: [] });
}

/** What each `yes` row of docs/jscontact-constraints.md is refused for, and where. */
const REFUSED: Record<string, Found> = {
	"type-missing-on-card": ["property-missing", "/@type"],
	"type-mismatch": ["type-mismatch", "/name/@type"],
	"id-empty": ["id-invalid", "/phones/"],
	"id-too-long": ["id-invalid", `/phones/${"p".repeat(256)}`],
	"id-bad-character": ["id-invalid", "/phones/tel#1"],
	"unsigned-int-negative": ["property-wrong-type", "/anniversaries/a1/date/year"],
	"unsigned-int-fraction": ["property-wrong-type", "/emails/e1/pref"],
	"unsigned-int-unsafe": ["property-wrong-type", "/anniversaries/a1/date/year"],
	"unsigned-int-string": ["property-wrong-type", "/emails/e1/pref"],
	"resource-type-resource": ["type-mismatch", "/links/l1/@type"],
	"resource-uri-missing": ["property-missing", "/media/m1/uri"],
	"context-not-boolean": ["set-value-not-true", "/emails/e1/contexts/work"],
	"context-false": ["set-value-not-true", "/emails/e1/contexts/work"],
	"property-wrong-type": ["property-wrong-type", "/name"],
	"property-null": ["property-wrong-type", "/language"],
	"type-case-variant": ["type-mismatch", "/name/@type"],
	"card-type-wrong": ["type-mismatch", "/@type"],
	"version-missing": ["property-missing", "/version"],
	"version-unregistered": ["version-unsupported", "/version"],
	"version-not-a-string": ["property-wrong-type", "/version"],
	"members-value-false": [
		"set-value-not-true",
		"/members/urn:uuid:03a0e51f-d1aa-4385-8a53-e29025acd8af",
	],
	"relation-value-false": [
		"set-value-not-true",
		"/relatedTo/urn:uuid:f81d4fae-7dec-11d0-a765-00a0c91e6bf6/relation/friend",
	],
	"uid-not-a-string": ["property-wrong-type", "/uid"],
	"name-component-value-missing": ["property-missing", "/name/components/0/value"],
	"name-component-kind-missing": ["property-missing", "/name/components/0/kind"],
	"nickname-name-missing": ["property-missing", "/nicknames/k391/name"],
	"org-unit-name-missing": ["property-missing", "/organizations/o1/units/0/name"],
	"pronouns-missing": ["property-missing", "/speakToAs/pronouns/k19/pronouns"],
	"id-reference-bad-character": ["id-invalid", "/titles/t1/organizationId"],
	"title-name-missing": ["property-missing", "/titles/le9/name"],
	"email-address-missing": ["property-missing", "/emails/e1/address"],
	"phone-number-missing": ["property-missing", "/phones/tel0/number"],
	"phone-feature-false": ["set-value-not-true", "/phones/tel0/features/voice"],
	"language-pref-language-missing": ["property-missing", "/preferredLanguages/l1/language"],
	"calendar-kind-missing": ["property-missing", "/calendars/calA/kind"],
	"scheduling-address-uri-missing": ["property-missing", "/schedulingAddresses/sched1/uri"],
	"address-context-false": ["set-value-not-true", "/addresses/k23/contexts/billing"],
	"address-component-value-missing": ["property-missing", "/addresses/k23/components/0/value"],
	"address-component-kind-missing": ["property-missing", "/addresses/k23/components/0/kind"],
	"directory-kind-missing": ["property-missing", "/directories/dir1/kind"],
	"media-kind-missing": ["property-missing", "/media/res47/kind"],
	"localizations-not-a-patch-object": ["property-wrong-type", "/localizations/fr"],
	"anniversary-kind-missing": ["property-missing", "/anniversaries/k8/kind"],
	"anniversary-date-missing": ["property-missing", "/anniversaries/k8/date"],
	"anniversary-date-not-an-object": ["property-wrong-type", "/anniversaries/k8/date"],
	"timestamp-utc-missing": ["property-missing", "/anniversaries/k9/date/utc"],
	"keyword-value-false": ["set-value-not-true", "/keywords/IETF"],
	"note-missing": ["property-missing", "/notes/n1/note"],
	"personal-info-kind-missing": ["property-missing", "/personalInfo/pi2/kind"],
	"personal-info-value-missing": ["property-missing", "/personalInfo/pi2/value"],
	"vcard-props-entry-too-short": ["jcard-prop-invalid", "/vCardProps/0"],
	"vcard-props-not-an-array": ["property-wrong-type", "/vCardProps"],
	"vcard-params-not-an-object": ["property-wrong-type", "/emails/email1/vCardParams"],
	"vcard-params-value-not-a-string": ["property-wrong-type", "/emails/email1/vCardParams/x-foo"],
};

describe("the checklist as the contract", () => {
	const rows = readDoc("jscontact-constraints.md").matchAll(
		/^\|.+\| `([^`]+)` +\| (yes|patch|no) +\|$/gm,
	);
	const checked = new Map([...rows].map(([, name, answer]) => [name, answer]));

	test("the table above has the `yes` rows of the checklist, no more and no less", () => {
		const yes = Object.keys(invalid).filter((name) => checked.get(name) === "yes");
		expect(Object.keys(REFUSED)).toEqual(yes);
	});

	test.each(Object.entries(REFUSED))("%s is refused", (name, expected) => {
		expect(refused(invalid[name]?.card)).toEqual([expected]);
	});

	const kept = Object.entries(invalid).filter(([name]) => checked.get(name) !== "yes");
	test.each(kept)("%s is accepted though the RFC calls it invalid", (_, constraint) => {
		accepted(constraint.card);
	});

	test.each(Object.entries(valid))("%s is accepted", (_, constraint) => {
		accepted(constraint.card);
	});

	test.each(Object.entries(figures))("%s of RFC 9553 is accepted", (_, figure) => {
		accepted(figure);
	});

	test("a Card that is accepted is read without a throw", () => {
		const all = [...kept.map(([, c]) => c.card), ...Object.values(valid).map((c) => c.card)];
		for (const value of [...all, ...Object.values(figures)]) {
			const { card: read } = validateCard(value);
			expect(typeof cardDisplayName(read as Card)).toBe("string");
			expect(validateCard(normalizeCard(read as Card)).issues).toEqual([]);
		}
	});
});

describe("validateCard", () => {
	test("the Card it returns is the value itself, and nothing is changed", () => {
		const value = Object.freeze(card({ name: Object.freeze({ full: "John Doe" }) }));
		expect(validateCard(value).card).toBe(value);
	});

	test.each([
		[null, "null"],
		[[], "an array"],
		["{}", 'the string "{}"'],
		[42, "the number 42"],
		[true, "the boolean true"],
		[undefined, "undefined"],
	])("%o is not a Card", (value, described) => {
		const { card: read, issues } = validateCard(value);
		expect(read).toBeNull();
		expect(issues).toEqual([
			{
				severity: "error",
				code: "card-not-an-object",
				message: `A Card is a JSON object, found ${described}`,
				path: "",
			},
		]);
	});

	test("every issue of a Card is reported, each with its path", () => {
		const value = { version: "9.9", name: [], phones: { "p 1": { pref: -1 } } };
		expect(refused(value)).toEqual([
			["property-wrong-type", "/name"],
			["id-invalid", "/phones/p 1"],
			["property-wrong-type", "/phones/p 1/pref"],
			["property-missing", "/phones/p 1/number"],
			["property-missing", "/@type"],
			["version-unsupported", "/version"],
		]);
	});

	test("a path escapes the names a JSON Pointer cannot hold as they are", () => {
		const value = card({ relatedTo: { "a/b~c": { relation: { friend: 1 } } } });
		const [[, path = ""] = []] = refused(value);
		expect(path).toBe("/relatedTo/a~1b~0c/relation/friend");
		expect(jsonPointer.get(value, path)).toBe(1);
	});

	test("version 1.0 is a version, uid or not", () => {
		accepted(card({ version: "1.0" }));
		expect(refused(card({ version: "2" }))).toEqual([["version-unsupported", "/version"]]);
	});
});

describe("JSON types", () => {
	test.each([
		["a string", { uid: 1 }, "/uid"],
		["a string", { name: { full: false } }, "/name/full"],
		["a string", { name: { sortAs: { surname: 1 } } }, "/name/sortAs/surname"],
		["a string", { vCardName: {} }, "/vCardName"],
		[
			"a string",
			{ titles: { t1: { name: "x", organizationId: 1 } } },
			"/titles/t1/organizationId",
		],
		[
			"a string",
			{ nicknames: { n1: { name: "x", [NICKNAME_KIND]: 1 } } },
			"/nicknames/n1/remileduc.github.io:kind",
		],
		["a boolean", { name: { isOrdered: "true" } }, "/name/isOrdered"],
		[
			"a non-negative integer",
			{ directories: { d1: { kind: "entry", uri: "x", listAs: "1" } } },
			"/directories/d1/listAs",
		],
		["an object", { name: null }, "/name"],
		["an object", { phones: [] }, "/phones"],
		["an object", { phones: { p1: "tel:1" } }, "/phones/p1"],
		["an object", { relatedTo: { "urn:uuid:1": true } }, "/relatedTo/urn:uuid:1"],
		["an object", { keywords: ["a"] }, "/keywords"],
		["an object", { name: { sortAs: "Doe" } }, "/name/sortAs"],
		["an object", { name: { components: [null] } }, "/name/components/0"],
		["an object", { localizations: [] }, "/localizations"],
		[
			"an object",
			{ anniversaries: { a1: { kind: "birth", date: { year: 1 }, place: 1 } } },
			"/anniversaries/a1/place",
		],
		["an array", { name: { components: {} } }, "/name/components"],
		["an array", { organizations: { o1: { units: "Marketing" } } }, "/organizations/o1/units"],
		[
			"a string or an array of strings",
			{ vCardParams: { "x-a": ["b", 1] } },
			"/vCardParams/x-a",
		],
		["a string or an array of strings", { vCardParams: { "x-a": null } }, "/vCardParams/x-a"],
		["a PatchObject, a JSON object", { localizations: { fr: null } }, "/localizations/fr"],
	])("expected %s: %j", (expected, properties, path) => {
		const { issues } = validateCard(card(properties));
		expect(found(issues)).toEqual([["property-wrong-type", path]]);
		expect(issues[0]?.message).toMatch(new RegExp(`^Expected ${expected}, found `));
	});

	test("the largest safe integer and zero are UnsignedInts", () => {
		accepted(
			card({
				anniversaries: {
					a1: { kind: "birth", date: { year: Number.MAX_SAFE_INTEGER, month: 0 } },
				},
			}),
		);
	});

	test("vCardParams holds strings and lists of strings, on a Card and on any object", () => {
		accepted(
			card({
				vCardParams: { "x-a": "b", "x-c": [] },
				name: { full: "x", vCardParams: { "x-d": ["e", "f"] } },
				phones: { p1: { number: "1", vCardName: "x-phone", vCardParams: {} } },
			}),
		);
	});

	test("what the types do not declare is not looked at", () => {
		accepted(
			card({
				kind: "robot",
				Name: 1,
				extra: null,
				futureProperty: [{ deep: [null] }],
				"example.com:x": null,
				phones: { p1: { number: "1", Number: 2, features: { fax2: true }, pref: 1000 } },
				nicknames: { n1: { name: "x", [NICKNAME_KIND]: "nobody-listed-this" } },
			}),
		);
	});
});

describe("@type", () => {
	test("is checked wherever it is set", () => {
		const value = card({
			name: { "@type": "Name", components: [{ "@type": "Name", kind: "given", value: "x" }] },
			phones: { p1: { "@type": 1, number: "1" } },
			media: { m1: { "@type": "Link", kind: "photo", uri: "x" } },
		});
		expect(refused(value)).toEqual([
			["type-mismatch", "/name/components/0/@type"],
			["type-mismatch", "/phones/p1/@type"],
			["type-mismatch", "/media/m1/@type"],
		]);
		expect(validateCard(value).issues[1]?.message).toBe(
			'Expected @type "Phone", found the number 1',
		);
	});

	test("says which of its two types the date of an Anniversary is", () => {
		const anniversary = (date: unknown) =>
			card({ anniversaries: { a1: { kind: "birth", date } } });
		accepted(anniversary({ "@type": "PartialDate", year: 1953 }));
		accepted(anniversary({ "@type": "Timestamp", utc: "2019-10-15T23:10:00Z" }));
		// Read as a PartialDate, which keeps `utc` as a property it does not know.
		accepted(anniversary({ utc: 1 }));
		expect(refused(anniversary({ "@type": "Timestamp", utc: 1, year: -1 }))).toEqual([
			["property-wrong-type", "/anniversaries/a1/date/utc"],
		]);
		const { issues } = validateCard(anniversary({ "@type": "timestamp", year: -1 }));
		expect(found(issues)).toEqual([
			["type-mismatch", "/anniversaries/a1/date/@type"],
			["property-wrong-type", "/anniversaries/a1/date/year"],
		]);
		expect(issues[0]?.message).toBe(
			'Expected @type "PartialDate" or "Timestamp", found the string "timestamp"',
		);
	});
});

describe("Ids", () => {
	const idMaps = Object.entries(PROPERTIES.Card).filter(
		([, shape]) => typeof shape === "object" && "map" in shape && shape.keys !== "string",
	);

	test("the key of every Id map of a Card is checked", () => {
		expect(idMaps).toHaveLength(17);
		for (const [name] of idMaps) {
			const { issues } = validateCard(card({ [name]: { "not an id": {} } }));
			expect(found(issues), name).toContainEqual(["id-invalid", `/${name}/not an id`]);
		}
	});

	test("and the keys of the pronouns", () => {
		const value = card({ speakToAs: { pronouns: { é: { pronouns: "they" } } } });
		expect(refused(value)).toEqual([["id-invalid", "/speakToAs/pronouns/é"]]);
	});

	test("a uid is no Id: relatedTo, members and keywords take any key", () => {
		accepted(
			card({
				relatedTo: { "urn:uuid:1": {}, "": {} },
				members: { "8cacdfb7d1ffdb59@example.com": true },
				keywords: { "two words": true },
			}),
		);
	});

	test("an Id the Card does not have is still an Id", () => {
		accepted(card({ titles: { t1: { name: "x", organizationId: "nowhere" } } }));
	});
});

describe("vCardProps", () => {
	test.each([
		[["x-foo", {}, "unknown", "bar"]],
		[["x-foo", { group: "item1", type: ["a", "b"] }, "text", "one", "two"]],
		[["n", {}, "text", ["Doe", "John", "", ["Dr", "Prof"], ""]]],
		[["x-rev", {}, "integer", 3]],
		[["x-flag", {}, "boolean", false]],
	])("%j is a jCard property", (entry) => {
		accepted(card({ vCardProps: [entry] }));
	});

	test.each([
		[null],
		["x-foo"],
		[{ name: "x-foo" }],
		[["x-foo", {}, "unknown"]],
		[[1, {}, "unknown", "bar"]],
		[["x-foo", null, "unknown", "bar"]],
		[["x-foo", [], "unknown", "bar"]],
		[["x-foo", { type: 1 }, "unknown", "bar"]],
		[["x-foo", {}, 1, "bar"]],
		[["x-foo", {}, "unknown", null]],
		[["x-foo", {}, "unknown", "bar", { baz: 1 }]],
		[["x-foo", {}, "unknown", ["bar", [null]]]],
	])("%j is not", (entry) => {
		const valid = ["x-a", {}, "text", "b"];
		expect(refused(card({ vCardProps: [valid, entry] }))).toEqual([
			["jcard-prop-invalid", "/vCardProps/1"],
		]);
	});

	test("an empty list is one, and only a Card has the property", () => {
		accepted(card({ vCardProps: [], name: { full: "x", vCardProps: "kept as unknown" } }));
	});
});

describe("localizations", () => {
	test("a patch is not applied, nor is what it sets looked at", () => {
		accepted(
			card({
				name: { full: "x" },
				localizations: {
					fr: { "name/full": 1, "no/such/place": null, "phones/p 1": {} },
					"not a language tag": {},
				},
			}),
		);
	});
});

describe("what is no JSON value", () => {
	test.each([
		["undefined", undefined],
		["the number NaN", Number.NaN],
		["the number Infinity", Infinity],
		["the number -Infinity", -Infinity],
		["a bigint", 1n],
		["a function", () => 0],
		["a symbol", Symbol("s")],
	])("%s is refused, in a property the types know and in one they do not", (described, value) => {
		for (const name of ["uid", "example.com:x"]) {
			const { card: read, issues } = validateCard(card({ [name]: value }));
			expect(read).toBeNull();
			expect(issues).toEqual([
				{
					severity: "error",
					code: "value-not-json",
					message: `A Card holds JSON values only, found ${described}`,
					path: `/${name}`,
				},
			]);
		}
	});

	test("it is refused at any depth, and where a jCard value or a parameter is expected", () => {
		const value = card({
			vCardProps: [["x-a", {}, "float", Number.NaN]],
			vCardParams: { "x-b": ["c", undefined] },
			localizations: { fr: { "name/full": Infinity } },
		});
		expect(refused(value).toSorted()).toEqual([
			["value-not-json", "/localizations/fr/name~1full"],
			["value-not-json", "/vCardParams/x-b/1"],
			["value-not-json", "/vCardProps/0/3"],
		]);
	});

	test("the hole of a sparse array is undefined, wherever the array is", () => {
		const holes = (): unknown[] => Object.assign(new Array(2), { 1: "x" });
		expect(refused(card({ name: { components: holes() } }))).toEqual([
			["value-not-json", "/name/components/0"],
		]);
		expect(refused(card({ vCardProps: holes() }))).toEqual([
			["value-not-json", "/vCardProps/0"],
		]);
		expect(refused(card({ vCardParams: { "x-a": holes() } }))).toEqual([
			["value-not-json", "/vCardParams/x-a/0"],
		]);
		expect(refused(card({ "example.com:x": [holes()] }))).toEqual([
			["value-not-json", "/example.com:x/0/0"],
		]);
	});

	test("the types are not looked at in a value that is no JSON", () => {
		expect(refused(card({ name: 1, phones: [], uid: undefined }))).toEqual([
			["value-not-json", "/uid"],
		]);
		expect(refused({ "example.com:x": undefined })).toEqual([
			["value-not-json", "/example.com:x"],
		]);
	});

	test("an array of four billion holes is too large, and found so at once", () => {
		const { card: read, issues } = validateCard(card({ uid: new Array(2 ** 32 - 1) }));
		expect(read).toBeNull();
		expect([...new Set(issues.map(({ code }) => code))]).toEqual([
			"value-not-json",
			"issues-truncated",
			"card-too-large",
		]);
	});
});

describe("hostile input", () => {
	test("an own __proto__ key is refused wherever it is", () => {
		const text = `{
			"@type": "Card", "version": "2.0",
			"phones": { "__proto__": { "number": "1" } },
			"example.com:x": [{ "__proto__": 1 }],
			"localizations": { "fr": { "__proto__": null } }
		}`;
		expect(refused(JSON.parse(text)).toSorted()).toEqual([
			["prototype-key", "/example.com:x/0/__proto__"],
			["prototype-key", "/localizations/fr/__proto__"],
			["prototype-key", "/phones/__proto__"],
		]);
		expect(Object.hasOwn(Object.prototype, "number")).toBe(false);
	});

	/** A value with `levels` arrays around it, built without recursion. */
	function nested(levels: number): unknown {
		let value: unknown = "leaf";
		for (let i = 0; i < levels; i++) value = [value];
		return value;
	}

	test("a Card nests as deep as the cap and no deeper", () => {
		// The Card is the first level and the vendor property holds the others.
		accepted(card({ "example.com:x": nested(MAX_CARD_DEPTH - 1) }));
		const path = `/example.com:x${"/0".repeat(MAX_CARD_DEPTH - 1)}`;
		expect(refused(card({ "example.com:x": nested(MAX_CARD_DEPTH) }))).toEqual([
			["card-too-deep", path],
		]);
	});

	test("a nesting no recursion survives is reported, not thrown", () => {
		const text = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
		const deep = card({ vCardProps: JSON.parse(text), name: 1 });
		// Nothing else is looked at: the walk of the types recurses into vCardProps.
		expect(refused(deep).map(([code]) => code)).toEqual(["card-too-deep"]);
	});

	test("a value that holds itself is too deep, unless its path is too long first", () => {
		const cyclic = card();
		cyclic["x:self"] = cyclic;
		expect(refused(cyclic).map(([code]) => code)).toEqual(["card-too-deep"]);
		const wordy = card();
		wordy["example.com:itself"] = wordy;
		expect(refused(wordy).map(([code]) => code)).toEqual(["card-too-large"]);
	});

	test("a Card holds as many values as the cap and no more", () => {
		const keywords = (count: number) =>
			Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, true]));
		// @type, version and keywords are three of them.
		accepted(card({ keywords: keywords(MAX_CARD_NODES - 3) }));
		const { issues } = validateCard(card({ name: 1, keywords: keywords(MAX_CARD_NODES - 2) }));
		expect(found(issues)).toEqual([["card-too-large", ""]]);
	});

	test("the path to a member is as long as the cap and no longer: its issues hold it", () => {
		const relatedTo = (length: number) => ({ ["k".repeat(length)]: { relation: { a: 0 } } });
		// What is left once "/relatedTo/" and "/relation/a" are counted.
		const longest = MAX_PATH_LENGTH - "/relatedTo//relation/a".length;
		const [[code, path] = []] = refused(card({ relatedTo: relatedTo(longest) }));
		expect(code).toBe("set-value-not-true");
		expect(path).toHaveLength(MAX_PATH_LENGTH);
		const { issues } = validateCard(card({ relatedTo: relatedTo(longest + 1) }));
		expect(issues).toEqual([
			{
				severity: "error",
				code: "card-too-large",
				message: 'The path to "a" is longer than 1024 characters',
				path: `/relatedTo/${"k".repeat(longest + 1)}/relation`,
			},
		]);
	});

	test("the cap counts the path as written, and across the levels: no path adds up", () => {
		const { issues } = validateCard(card({ "example.com:x": { ["~".repeat(600)]: 1 } }));
		expect(found(issues)).toEqual([["card-too-large", "/example.com:x"]]);
		let nested: Record<string, unknown> = { leaf: Number.NaN };
		for (let level = 0; level < 20; level++) nested = { ["k".repeat(100)]: nested };
		const deep = validateCard(card({ "example.com:x": nested })).issues;
		expect(deep.map((issue) => issue.code)).toEqual(["card-too-large"]);
		expect(deep[0]?.path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH);
	});

	test("past a thousand issues of one code, a warning replaces the rest", () => {
		const count = MAX_ISSUES_PER_CODE + 500;
		const keywords = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, false]));
		const { card: read, issues } = validateCard(card({ keywords, uid: 1 }));
		expect(read).toBeNull();
		expect(issues).toHaveLength(MAX_ISSUES_PER_CODE + 2);
		expect(issues.filter(({ code }) => code === "set-value-not-true")).toHaveLength(
			MAX_ISSUES_PER_CODE,
		);
		expect(issues.at(-2)).toMatchObject({ severity: "warning", code: "issues-truncated" });
		expect(issues.at(-1)).toMatchObject({ code: "property-wrong-type", path: "/uid" });
	});
});

describe("issue codes", () => {
	const examples: Record<ValidationIssueCode, unknown> = {
		"card-not-an-object": [],
		"card-too-deep": card({
			"example.com:x": JSON.parse(`${"[".repeat(99)}${"]".repeat(99)}`),
		}),
		"card-too-large": card({ "example.com:x": new Array(MAX_CARD_NODES).fill(0) }),
		"prototype-key": JSON.parse('{ "@type": "Card", "version": "2.0", "__proto__": {} }'),
		"value-not-json": card({ uid: Number.NaN }),
		"type-mismatch": card({ "@type": "card" }),
		"version-unsupported": card({ version: "3.0" }),
		"property-wrong-type": card({ uid: 1 }),
		"property-missing": { "@type": "Card" },
		"set-value-not-true": card({ keywords: { a: false } }),
		"id-invalid": card({ phones: { "": { number: "1" } } }),
		"jcard-prop-invalid": card({ vCardProps: [[]] }),
	};

	test("the list is what the validator raises: each code has a Card raising it alone", () => {
		expect(Object.keys(examples)).toEqual([...VALIDATION_ISSUE_CODES]);
		for (const [code, value] of Object.entries(examples)) {
			expect(new Set(refused(value).map(([raised]) => raised))).toEqual(new Set([code]));
		}
	});
});
