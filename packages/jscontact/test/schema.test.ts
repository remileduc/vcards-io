import { describe, expect, test } from "vitest";
import { NICKNAME_KIND, VENDOR_LABEL, VENDOR_PREFIX } from "../src/index.js";
import {
	type ObjectType,
	PROPERTIES,
	MANDATORY as SCHEMA_MANDATORY,
	type Shape,
} from "../src/schema.js";
import { type Registry, readFixture } from "./helpers/fixtures.js";
import { MANDATORY } from "./helpers/mandatory.js";

const registry = readFixture<Registry>("rfc9553-registry.json");

/** The signatures of the registry that name no object type, with the shape of each. */
const PLAIN = new Map<string, Shape>([
	["String", "string"],
	["UTCDateTime", "string"],
	["Boolean", "boolean"],
	["UnsignedInt", "unsignedInt"],
	["Id", "id"],
	["JCardProp[]", "jCardProps"],
	["String[Boolean]", "set"],
	["String[String]", "strings"],
	["String[String|String[]]", "params"],
	["String[PatchObject]", "patches"],
]);

/** The shape the type signature of the registry asks for, e.g. `Id[Phone]` or `NameComponent[]`. */
function shapeOf(signature: string): Shape {
	const plain = PLAIN.get(signature);
	if (plain !== undefined) return plain;
	const isType = (name: string): name is ObjectType => Object.hasOwn(PROPERTIES, name);
	const [, keys, map] = /^(Id|String)\[(\w+)\]$/.exec(signature) ?? [];
	if (map !== undefined && isType(map)) return keys === "Id" ? { map } : { map, keys: "string" };
	const list = /^(\w+)\[\]$/.exec(signature)?.[1];
	if (list !== undefined && isType(list)) return { list };
	const [first, ...others] = signature.split("|");
	if (first !== undefined && isType(first) && others.every(isType))
		return { object: [first, ...others] };
	throw new Error(`No shape for the signature ${signature}`);
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
			const standard = Object.keys(ours).filter((name) => !name.startsWith(VENDOR_PREFIX));
			expect(standard.toSorted()).toEqual(Object.keys(properties).toSorted());
			for (const [name, signature] of Object.entries(properties)) {
				expect(ours[name], `${type}.${name}: ${signature}`).toEqual(shapeOf(signature));
			}
		},
	);

	test("every plain signature is one the registry uses", () => {
		const signatures = Object.values(registry.properties).flatMap((properties) =>
			Object.values(properties),
		);
		expect([...PLAIN.keys()].filter((signature) => !signatures.includes(signature))).toEqual(
			[],
		);
	});

	test("the Nickname kind and the label are the properties of this project in the table", () => {
		const vendor = Object.entries(PROPERTIES).flatMap(([type, properties]) =>
			Object.keys(properties)
				.filter((name) => name.startsWith(VENDOR_PREFIX))
				.map((name) => [type, name, properties[name]]),
		);
		expect(vendor).toEqual([
			["Relation", VENDOR_LABEL, "string"],
			["Nickname", NICKNAME_KIND, "string"],
			["Nickname", VENDOR_LABEL, "string"],
			["Address", VENDOR_LABEL, "string"],
			["Anniversary", VENDOR_LABEL, "string"],
		]);
	});

	test("the mandatory properties are the ones the interfaces require", () => {
		const required: Record<string, readonly string[]> = MANDATORY;
		for (const type of Object.keys(PROPERTIES) as ObjectType[]) {
			expect([...(SCHEMA_MANDATORY[type] ?? [])].sort(), type).toEqual(
				[...(required[type] ?? [])].sort(),
			);
		}
		expect(Object.keys(SCHEMA_MANDATORY).filter((type) => !(type in PROPERTIES))).toEqual([]);
	});

	test("@type opens every object and the RFC 9555 properties close it", () => {
		for (const [type, properties] of Object.entries(PROPERTIES)) {
			const names = Object.keys(properties);
			expect(names[0], type).toBe("@type");
			expect(names.slice(-2), type).toEqual(["vCardName", "vCardParams"]);
		}
	});
});
