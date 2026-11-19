import { describe, expect, test } from "vitest";
import { type ConstraintCase, type Registry, readDoc, readFixture } from "./helpers/fixtures.js";

const invalid = readFixture<Record<string, ConstraintCase>>("constraints-invalid.json");
const valid = readFixture<Record<string, ConstraintCase>>("constraints-valid.json");
const registry = readFixture<Registry>("rfc9553-registry.json");

describe("constraint cases", () => {
	const cases = [...Object.entries(invalid), ...Object.entries(valid)];

	test("a name is used once, in one of the two files", () => {
		const names = cases.map(([name]) => name);
		expect(new Set(names).size).toBe(names.length);
	});

	test.each(cases)("%s names its section, its rule and a Card", (name, constraint) => {
		expect(name).toMatch(/^[a-z0-9.]+(?:-[a-z0-9.]+)*$/);
		expect(constraint.section).toMatch(/^(?:RFC 9555 )?\d+(?:\.\d+)*$/);
		expect(constraint.rule).not.toBe("");
		// A cell of the checklist table cannot hold the column separator.
		expect(constraint.rule).not.toContain("|");
		expect(Object.prototype.toString.call(constraint.card)).toBe("[object Object]");
	});

	test("the checklist has one row per case, in the order and the words of the files", () => {
		const row = /^\| (.+?) +\| (.+?) +\| `([^`]+)` +\|$/gm;
		// The third table lists what no Card can show: it has no case to compare.
		const [tables = ""] = readDoc("jscontact-constraints.md").split(
			"Requirements with no Card",
		);
		const rows = [...tables.matchAll(row)];
		expect(rows.map(([, section, rule, name]) => [section, rule, name])).toEqual(
			cases.map(([name, constraint]) => [constraint.section, constraint.rule, name]),
		);
	});
});

describe("registry extract", () => {
	test("every object type and every enum context is a registered type", () => {
		const contexts = registry.enumValues.flatMap((table) => table.contexts);
		for (const type of [...Object.keys(registry.properties), ...contexts]) {
			expect(registry.types).toContain(type);
		}
	});

	test("every enumerated property exists in each of its contexts", () => {
		for (const table of registry.enumValues) {
			for (const context of table.contexts) {
				expect(registry.properties[context], context).toHaveProperty([table.property]);
			}
		}
	});

	test("a reserved name is no property of the objects it is reserved in", () => {
		expect(Object.keys(registry.reservedProperties).sort()).toEqual([
			"addressBookIds",
			"blobId",
			"extra",
			"id",
		]);
		for (const [name, contexts] of Object.entries(registry.reservedProperties)) {
			const types = contexts.includes("*") ? Object.keys(registry.properties) : contexts;
			for (const type of types) {
				expect(registry.properties[type], `${name} in ${type}`).toBeDefined();
				expect(registry.properties[type]).not.toHaveProperty([name]);
			}
		}
		expect(registry.types).not.toContain("Resource");
	});

	test("every reserved name has a Card using it among the invalid cases", () => {
		const used = Object.keys(registry.reservedProperties).filter((name) =>
			Object.values(invalid).some((c) => JSON.stringify(c.card).includes(`"${name}":`)),
		);
		expect(used).toEqual(Object.keys(registry.reservedProperties));
	});
});
