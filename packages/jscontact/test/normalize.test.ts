import { describe, expect, test } from "vitest";
import { type Card, equal, localize, normalizeCard, type PatchObject } from "../src/index.js";
import { type ConstraintCase, readFixture } from "./helpers/fixtures.js";

const figures = readFixture<Record<string, Card>>("rfc9553-figures.json");
const valid = readFixture<Record<string, ConstraintCase>>("constraints-valid.json");

/** The properties of a Card in the order of RFC 9553, `media` moved to the end. */
const CARD_ORDER = [
	"@type",
	"version",
	"created",
	"kind",
	"language",
	"members",
	"prodId",
	"relatedTo",
	"uid",
	"updated",
	"name",
	"nicknames",
	"organizations",
	"speakToAs",
	"titles",
	"emails",
	"onlineServices",
	"phones",
	"preferredLanguages",
	"calendars",
	"schedulingAddresses",
	"addresses",
	"cryptoKeys",
	"directories",
	"links",
	"localizations",
	"anniversaries",
	"keywords",
	"notes",
	"personalInfo",
	"vCardProps",
	"vCardName",
	"vCardParams",
	"example.com:b",
	"futureProperty",
	"media",
];

/** A Card that sets every property of the list, written last property first. */
function fullCard(): Card {
	const values: Record<string, unknown> = {
		"@type": "Card",
		version: "2.0",
		created: "2026-01-01T00:00:00Z",
		kind: "group",
		language: "en",
		members: { "urn:uuid:1": true },
		prodId: "test",
		relatedTo: { "urn:uuid:2": {} },
		uid: "urn:uuid:0",
		updated: "2026-01-02T00:00:00Z",
		name: { full: "John" },
		nicknames: { n1: { name: "Johnny" } },
		organizations: { o1: { name: "ACME" } },
		speakToAs: { grammaticalGender: "neuter" },
		titles: { t1: { name: "Boss" } },
		emails: { e1: { address: "john@example.com" } },
		onlineServices: { os1: { user: "john" } },
		phones: { p1: { number: "1" } },
		preferredLanguages: { l1: { language: "en" } },
		calendars: { c1: { kind: "calendar", uri: "https://example.com/c" } },
		schedulingAddresses: { s1: { uri: "mailto:john@example.com" } },
		addresses: { a1: { full: "Here" } },
		cryptoKeys: { k1: { uri: "https://example.com/k" } },
		directories: { d1: { kind: "entry", uri: "https://example.com/d" } },
		links: { li1: { uri: "https://example.com" } },
		localizations: { fr: { "name/full": "Jean" } },
		anniversaries: { an1: { kind: "birth", date: { year: 2000 } } },
		keywords: { friend: true },
		notes: { no1: { note: "A note" } },
		personalInfo: { pi1: { kind: "hobby", value: "chess" } },
		vCardProps: [["x-foo", {}, "unknown", "bar"]],
		vCardName: "x-card",
		vCardParams: { group: "item1" },
		"example.com:b": 1,
		futureProperty: 2,
		media: { m1: { kind: "photo", uri: "data:image/png;base64,AAAA" } },
	};
	expect(Object.keys(values)).toEqual(CARD_ORDER);
	return Object.fromEntries(Object.entries(values).reverse()) as unknown as Card;
}

const keys = (value: unknown): string[] => Object.keys(value as object);
const first = <T>(map: Record<string, T> | undefined): T | undefined => Object.values(map ?? {})[0];

describe("normalizeCard", () => {
	test("writes a Card in the order of RFC 9553, the unknown properties next, the media last", () => {
		const card = fullCard();
		expect(keys(card)).toEqual(CARD_ORDER.toReversed());
		expect(keys(normalizeCard(card))).toEqual(CARD_ORDER);
		expect(equal(normalizeCard(card), card)).toBe(true);
	});

	test("orders every object it knows, wherever it is", () => {
		const card = normalizeCard({
			version: "2.0",
			"@type": "Card",
			name: {
				phoneticSystem: "ipa",
				sortAs: { surname: "Doe" },
				full: "John Doe",
				isOrdered: true,
				components: [
					{
						phonetic: "dʒɑn",
						vCardParams: { x: "1" },
						kind: "given",
						value: "John",
						"@type": "NameComponent",
					},
				],
				"@type": "Name",
			},
			phones: {
				p1: {
					label: "home",
					vCardName: "tel",
					pref: 1,
					contexts: { private: true },
					features: { voice: true },
					number: "1",
					"example.com:z": 0,
					"@type": "Phone",
				},
			},
			organizations: {
				o1: {
					contexts: { work: true },
					sortAs: "ACME",
					units: [{ sortAs: "RD", name: "R&D" }],
					name: "ACME",
				},
			},
			speakToAs: {
				pronouns: { k1: { pref: 1, pronouns: "they/them" } },
				grammaticalGender: "neuter",
			},
			relatedTo: { "urn:uuid:2": { relation: { friend: true }, "@type": "Relation" } },
			notes: {
				n1: {
					author: { uri: "mailto:a@example.com", name: "A" },
					created: "2026-01-01T00:00:00Z",
					note: "x",
				},
			},
			directories: {
				d1: {
					listAs: 1,
					label: "l",
					pref: 1,
					contexts: { work: true },
					mediaType: "text/vcard",
					uri: "https://example.com",
					kind: "entry",
				},
			},
			anniversaries: {
				a1: {
					place: {
						full: "Paris",
						countryCode: "FR",
						components: [{ value: "Paris", kind: "locality" }],
					},
					date: { day: 2, month: 1, year: 2000 },
					kind: "birth",
				},
				a2: {
					date: { utc: "2000-01-02T00:00:00Z", "example.com:a": 1, "@type": "Timestamp" },
					kind: "death",
				},
			},
		});
		expect(keys(card.name)).toEqual([
			"@type",
			"components",
			"isOrdered",
			"full",
			"sortAs",
			"phoneticSystem",
		]);
		expect(keys(card.name?.components?.[0])).toEqual([
			"@type",
			"value",
			"kind",
			"phonetic",
			"vCardParams",
		]);
		expect(keys(first(card.phones))).toEqual([
			"@type",
			"number",
			"features",
			"contexts",
			"pref",
			"label",
			"vCardName",
			"example.com:z",
		]);
		const [organization] = Object.values(card.organizations ?? {});
		expect(keys(organization)).toEqual(["name", "units", "sortAs", "contexts"]);
		expect(keys(organization?.units?.[0])).toEqual(["name", "sortAs"]);
		expect(keys(card.speakToAs)).toEqual(["grammaticalGender", "pronouns"]);
		expect(keys(Object.values(card.speakToAs?.pronouns ?? {})[0])).toEqual([
			"pronouns",
			"pref",
		]);
		expect(keys(Object.values(card.relatedTo ?? {})[0])).toEqual(["@type", "relation"]);
		const [note] = Object.values(card.notes ?? {});
		expect(keys(note)).toEqual(["note", "created", "author"]);
		expect(keys(note?.author)).toEqual(["name", "uri"]);
		expect(keys(Object.values(card.directories ?? {})[0])).toEqual([
			"kind",
			"uri",
			"mediaType",
			"contexts",
			"pref",
			"label",
			"listAs",
		]);
		const [birth, death] = Object.values(card.anniversaries ?? {});
		expect(keys(birth)).toEqual(["kind", "date", "place"]);
		expect(keys(birth?.date)).toEqual(["year", "month", "day"]);
		expect(keys(birth?.place)).toEqual(["components", "countryCode", "full"]);
		expect(keys(birth?.place?.components?.[0])).toEqual(["value", "kind"]);
		// By its @type: as a PartialDate, `utc` would be unknown and follow the vendor property.
		expect(keys(death?.date)).toEqual(["@type", "utc", "example.com:a"]);
	});

	test("keeps the entries of a map, of a set and of an array in their order", () => {
		const card = normalizeCard({
			"@type": "Card",
			version: "2.0",
			phones: {
				p2: { number: "2", features: { voice: true, mobile: true } },
				p1: { number: "1" },
				name: { number: "3" },
			},
			keywords: { zebra: true, apple: true },
			name: {
				components: [
					{ kind: "surname", value: "Doe" },
					{ kind: "given", value: "John" },
				],
				sortAs: { surname: "Doe", given: "John" },
			},
		});
		expect(keys(card.phones)).toEqual(["p2", "p1", "name"]);
		expect(keys(first(card.phones)?.features)).toEqual(["voice", "mobile"]);
		expect(keys(card.keywords)).toEqual(["zebra", "apple"]);
		expect(card.name?.components?.map((component) => component.kind)).toEqual([
			"surname",
			"given",
		]);
		expect(keys(card.name?.sortAs)).toEqual(["surname", "given"]);
	});

	test("leaves out a property that is an empty map", () => {
		const card = normalizeCard({
			"@type": "Card",
			version: "2.0",
			members: {},
			relatedTo: {},
			nicknames: {},
			phones: { p1: { number: "1", features: {}, contexts: {}, vCardParams: {} } },
			name: { full: "John", sortAs: {} },
			speakToAs: { grammaticalGender: "neuter", pronouns: {} },
			media: {},
			localizations: {},
			keywords: {},
			vCardParams: {},
		});
		expect(card).toEqual({
			"@type": "Card",
			version: "2.0",
			phones: { p1: { number: "1" } },
			name: { full: "John" },
			speakToAs: { grammaticalGender: "neuter" },
		});
		expect(JSON.stringify(card)).not.toContain("{}");
	});

	test("keeps what is empty and is no map property", () => {
		const card = {
			"@type": "Card",
			version: "2.0",
			relatedTo: { "urn:uuid:2": {}, "urn:uuid:3": { relation: {} } },
			name: {},
			organizations: { o1: { name: "", units: [] }, o2: {} },
			vCardProps: [["x-foo", {}, "unknown", ""]],
			"example.com:empty": {},
			futureProperty: { phones: {}, contexts: {} },
		} as unknown as Card;
		expect(normalizeCard(card)).toEqual({
			...card,
			relatedTo: { "urn:uuid:2": {}, "urn:uuid:3": {} },
		});
	});

	test("a Card with localization patches keeps its empty maps: a patch may land in one", () => {
		const card: Card = {
			"@type": "Card",
			version: "2.0",
			titles: {},
			phones: { p1: { number: "1", contexts: {} } },
			localizations: {
				fr: { "titles/t1": { name: "écrivain" }, "phones/p1/contexts/work": true },
				de: {},
			},
		};
		const normalized = normalizeCard(card);
		expect(normalized).toEqual(card);
		expect(localize(normalized, "fr")).toEqual({
			card: {
				"@type": "Card",
				version: "2.0",
				language: "fr",
				titles: { t1: { name: "écrivain" } },
				phones: { p1: { number: "1", contexts: { work: true } } },
			},
			issues: [],
		});
		// With no patch left, they go.
		expect(normalizeCard({ ...card, localizations: {} })).toEqual({
			"@type": "Card",
			version: "2.0",
			phones: { p1: { number: "1" } },
		});
	});

	test("copies a localization patch and an unknown property as they are", () => {
		const patch: PatchObject = {
			"phones/p1": { label: "bureau", number: "1", "@type": "Phone", contexts: {} },
			name: { full: "Jean", "@type": "Name" },
		};
		const future = { z: 1, a: { "@type": "Phone", number: "1" } };
		const props: Card["vCardProps"] = [["x-foo", { type: "b", group: "a" }, "unknown", "bar"]];
		const card = normalizeCard({
			"@type": "Card",
			version: "2.0",
			localizations: { fr: patch },
			vCardProps: props,
			"example.com:future": future,
		});
		expect(JSON.stringify(first(card.localizations))).toBe(JSON.stringify(patch));
		expect(JSON.stringify(card.vCardProps)).toBe(JSON.stringify(props));
		expect(JSON.stringify(card["example.com:future"])).toBe(JSON.stringify(future));
	});

	test("the copy shares nothing with the Card, which is left as it was", () => {
		const card = fullCard();
		const before = JSON.stringify(card);
		const copy = normalizeCard(card);
		expect(JSON.stringify(card)).toBe(before);
		for (const name of CARD_ORDER) {
			const value = (card as unknown as Record<string, unknown>)[name];
			if (typeof value === "object") {
				expect((copy as unknown as Record<string, unknown>)[name], name).not.toBe(value);
			}
		}
		expect(first(copy.phones)).not.toBe(first(card.phones));
		expect(copy.vCardProps?.[0]).not.toBe(card.vCardProps?.[0]);
	});

	test("a value of the wrong JSON type is kept: judging it is the validator's", () => {
		const card = {
			"@type": "Card",
			version: "2.0",
			name: "John",
			phones: ["1"],
			emails: { e1: "john@example.com", e2: null, e3: [] },
			keywords: "friend",
			addresses: { a1: { components: { kind: "locality" } } },
			anniversaries: { a1: { date: "2000-01-02", place: 5 } },
		} as unknown as Card;
		expect(normalizeCard(card)).toEqual(card);
	});

	test("a property named as an inherited one is an unknown property like another", () => {
		const card = normalizeCard(
			JSON.parse('{ "version": "2.0", "toString": 1, "constructor": {}, "@type": "Card" }'),
		);
		expect(keys(card)).toEqual(["@type", "version", "constructor", "toString"]);
	});

	test("an own __proto__ key stays data and changes no prototype", () => {
		const text =
			'{"@type":"Card","version":"2.0","phones":{"p1":{"number":"1","__proto__":{"polluted":true}}},"__proto__":{"polluted":true}}';
		const card = normalizeCard(JSON.parse(text));
		expect(JSON.stringify(card)).toBe(text);
		expect(card).not.toHaveProperty("polluted");
		expect(Object.getPrototypeOf(card)).toBe(Object.prototype);
		expect({}).not.toHaveProperty("polluted");
	});

	const cards = [
		...Object.entries(figures),
		...Object.entries(valid).map(
			([name, constraint]) => [name, constraint.card as Card] as const,
		),
	];

	test.each(cards)("%s keeps its content and is stable once normalized", (_name, card) => {
		const once = normalizeCard(card);
		expect(JSON.stringify(normalizeCard(once))).toBe(JSON.stringify(once));
		for (const language of Object.keys(card.localizations ?? {})) {
			expect(localize(once, language).card).toEqual(localize(card, language).card);
		}
		expect(keys(once)[0]).toBe("@type");
		// No fixture relies on an empty map but the Relation of relation-undefined.
		const relatedTo = Object.values(card.relatedTo ?? {});
		if (relatedTo.every((relation) => JSON.stringify(relation.relation) !== "{}")) {
			expect(equal(once, card)).toBe(true);
		}
	});
});
