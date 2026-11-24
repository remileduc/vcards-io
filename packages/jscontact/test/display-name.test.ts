import { describe, expect, test } from "vitest";
import { type Card, cardDisplayName, type Name } from "../src/index.js";
import { readFixture } from "./helpers/fixtures.js";

const figures = readFixture<Record<string, Card>>("rfc9553-figures.json");

const card = (properties: Partial<Card>): Card => ({
	"@type": "Card",
	version: "2.0",
	...properties,
});
const named = (name: Name): string => cardDisplayName(card({ name }));

describe("cardDisplayName", () => {
	test("the full name comes first, without the spaces around it", () => {
		const name: Name = {
			full: "  Mr. John Q. Public, Esq. ",
			components: [{ kind: "given", value: "J" }],
		};
		expect(named(name)).toBe("Mr. John Q. Public, Esq.");
	});

	test("ordered components are joined as they come, by a space unless the Name says more", () => {
		expect(cardDisplayName(figures["figure-16"] as Card)).toBe("Vincent van Gogh");
		expect(cardDisplayName(figures["figure-17"] as Card)).toBe("Diego Rivera Barrientos");
		expect(
			named({
				isOrdered: true,
				defaultSeparator: ", ",
				components: [
					{ kind: "surname", value: "Sartre" },
					{ kind: "given", value: "Jean" },
					{ kind: "separator", value: "-" },
					{ kind: "given2", value: "Paul" },
				],
			}),
		).toBe("Sartre, Jean-Paul");
	});

	test("a separator is verbatim, even empty or first", () => {
		const components: Name["components"] = [
			{ kind: "separator", value: "« " },
			{ kind: "surname", value: "孫" },
			{ kind: "separator", value: "" },
			{ kind: "given", value: "中山" },
			{ kind: "separator", value: " »" },
		];
		expect(named({ isOrdered: true, components })).toBe("« 孫中山 »");
	});

	test("separators alone are no name, in order or not: the next source answers", () => {
		const components: Name["components"] = [
			{ kind: "separator", value: "-" },
			{ kind: "given", value: " " },
		];
		const nicknames: Card["nicknames"] = { n1: { name: "Johnny" } };
		expect(cardDisplayName(card({ name: { isOrdered: true, components }, nicknames }))).toBe(
			"Johnny",
		);
		expect(cardDisplayName(card({ name: { components }, nicknames }))).toBe("Johnny");
	});

	test.each(["", " "])("a component of value %j brings no separator of its own", (value) => {
		const components: Name["components"] = [
			{ kind: "given", value: "John" },
			{ kind: "given2", value },
			{ kind: "surname", value: "Doe" },
		];
		expect(named({ isOrdered: true, components })).toBe("John Doe");
		expect(named({ components })).toBe("John Doe");
	});

	test("components in no stated order are read by kind, separators left out", () => {
		expect(
			named({
				components: [
					{ kind: "surname", value: "Public" },
					{ kind: "credential", value: "Esq." },
					{ kind: "example.com:clan", value: "of Ohio" },
					{ kind: "given", value: "John" },
					{ kind: "separator", value: "-" },
					{ kind: "generation", value: "Jr." },
					{ kind: "given2", value: "Quinlan" },
					{ kind: "surname2", value: "" },
					{ kind: "title", value: "Mr." },
				],
			}),
		).toBe("Mr. John Quinlan Public Jr. Esq. of Ohio");
		expect(cardDisplayName(figures["figure-39"] as Card)).toBe("Mr. Ivan Petrovich Vasiliev");
	});

	test("without a name: the preferred nickname, none being the least preferred", () => {
		const nicknames: Card["nicknames"] = {
			n1: { name: "Johnny" },
			n2: { name: "Jo", pref: 2 },
			n3: { name: "The Boss", pref: 1 },
			n4: { name: "J", pref: 1 },
		};
		const organizations: Card["organizations"] = { o1: { name: "ACME" } };
		expect(cardDisplayName(card({ name: { full: " " }, nicknames, organizations }))).toBe(
			"The Boss",
		);
		expect(cardDisplayName(card({ nicknames: { n1: { name: "A" }, n2: { name: "B" } } }))).toBe(
			"A",
		);
		expect(
			cardDisplayName(
				card({ nicknames: { n1: { name: "A" }, n2: { name: "B", pref: 100 } } }),
			),
		).toBe("B");
		// The validator checks no range: a `pref` past 100 is still one.
		expect(
			cardDisplayName(
				card({ nicknames: { n1: { name: "A" }, n2: { name: "B", pref: 500 } } }),
			),
		).toBe("B");
	});

	test("then the first organization that has a name: a unit is none, as on Android", () => {
		const organizations: Card["organizations"] = {
			o1: { name: " " },
			o2: { units: [{ name: "Research" }] },
			o3: { name: "ACME" },
			o4: { name: "Other" },
		};
		const titles: Card["titles"] = { t1: { name: "Boss" } };
		expect(
			cardDisplayName(card({ nicknames: { n1: { name: "" } }, organizations, titles })),
		).toBe("ACME");
	});

	test("then the first job title, a role being none", () => {
		const titles: Card["titles"] = {
			t1: { name: "Project Leader", kind: "role" },
			t2: { name: "" },
			t3: { name: "Research Scientist", kind: "title" },
			t4: { name: "Boss" },
		};
		const organizations: Card["organizations"] = { o1: { units: [{ name: "Research" }] } };
		const phones: Card["phones"] = { p1: { number: "+1 555 0100" } };
		expect(cardDisplayName(card({ organizations, titles, phones }))).toBe("Research Scientist");
		expect(cardDisplayName(card({ titles: { t4: { name: "Boss" } }, phones }))).toBe("Boss");
		expect(
			cardDisplayName(card({ titles: { t1: { name: "Lead", kind: "role" } }, phones })),
		).toBe("+1 555 0100");
	});

	test("then the preferred phone number, before any email address as on Android", () => {
		const phones: Card["phones"] = {
			p1: { number: "+1 555 0100" },
			p2: { number: "+1 555 0199", pref: 50 },
		};
		const emails: Card["emails"] = { e1: { address: "john@example.com", pref: 1 } };
		expect(cardDisplayName(card({ organizations: { o1: {} }, phones, emails }))).toBe(
			"+1 555 0199",
		);
	});

	test("then the preferred email address", () => {
		const emails: Card["emails"] = {
			e1: { address: "first@example.com" },
			e2: { address: "second@example.com", pref: 2 },
			e3: { address: "third@example.com", pref: 1 },
		};
		expect(cardDisplayName(card({ phones: { p1: { number: " " } }, emails }))).toBe(
			"third@example.com",
		);
	});

	test("and a placeholder when the Card has none of them", () => {
		expect(cardDisplayName(card({}))).toBe("(no name)");
		expect(
			cardDisplayName(card({ name: { components: [] }, organizations: {}, phones: {} })),
		).toBe("(no name)");
		expect(cardDisplayName(card({ notes: { n1: { note: "Johnny" } } }))).toBe("(no name)");
	});
});
