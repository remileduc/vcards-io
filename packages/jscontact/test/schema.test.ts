import { describe, expect, test } from "vitest";
import { type ObjectType, PROPERTIES, type Shape } from "../src/schema.js";
import { type Registry, readFixture } from "./helpers/fixtures.js";

const registry = readFixture<Registry>("rfc9553-registry.json");

/** The shape the type signature of the registry asks for, e.g. `Id[Phone]` or `NameComponent[]`. */
function shapeOf(signature: string): Shape {
	if (signature === "String[PatchObject]") return "patches";
	if (["String[Boolean]", "String[String]", "String[String|String[]]"].includes(signature)) {
		return "values";
	}
	const isType = (name: string): name is ObjectType => Object.hasOwn(PROPERTIES, name);
	const map = /^(?:Id|String)\[(\w+)\]$/.exec(signature)?.[1];
	if (map !== undefined && isType(map)) return { map };
	const list = /^(\w+)\[\]$/.exec(signature)?.[1];
	if (list !== undefined && isType(list)) return { list };
	const [first, ...others] = signature.split("|");
	if (first !== undefined && isType(first) && others.every(isType))
		return { object: [first, ...others] };
	return "value";
}

describe("property table", () => {
	test("has the object types of the registry", () => {
		expect(Object.keys(PROPERTIES).toSorted()).toEqual(
			Object.keys(registry.properties).toSorted(),
		);
	});

	test.each(Object.entries(registry.properties))(
		"%s has the registered properties",
		(type, properties) => {
			const ours = PROPERTIES[type as ObjectType];
			expect(Object.keys(ours).toSorted()).toEqual(Object.keys(properties).toSorted());
			for (const [name, signature] of Object.entries(properties)) {
				expect(ours[name], `${type}.${name}: ${signature}`).toEqual(shapeOf(signature));
			}
		},
	);

	test("the signatures of the registry are all read", () => {
		const signatures = Object.values(registry.properties).flatMap((properties) =>
			Object.values(properties),
		);
		const scalars = signatures.filter((signature) => shapeOf(signature) === "value");
		expect([...new Set(scalars)].toSorted()).toEqual([
			"Boolean",
			"Id",
			"JCardProp[]",
			"String",
			"UTCDateTime",
			"UnsignedInt",
		]);
	});

	test("@type opens every object and the RFC 9555 properties close it", () => {
		for (const [type, properties] of Object.entries(PROPERTIES)) {
			const names = Object.keys(properties);
			expect(names[0], type).toBe("@type");
			expect(names.slice(-2), type).toEqual(["vCardName", "vCardParams"]);
		}
	});
});
