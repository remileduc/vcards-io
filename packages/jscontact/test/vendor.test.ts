import { describe, expect, expectTypeOf, test } from "vitest";
import {
	NICKNAME_KIND,
	NICKNAME_KINDS,
	type Nickname,
	type NicknameKind,
	RELATION_TYPES,
	type Relation,
	VENDOR_PREFIX,
	VENDOR_RELATIONS,
	type VendorExtension,
	type VendorKey,
	type VendorRelation,
} from "../src/index.js";

// RFC 9553 section 1.8.1, the ASCII half of the v-extension rule.
const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const V_EXTENSION = new RegExp(String.raw`^${LABEL}(?:\.${LABEL})*:[ !\x23-\x2e\x30-\x7d]+$`);

describe("vendor extensions", () => {
	test("the prefix is a domain followed by the colon", () => {
		expect(VENDOR_PREFIX).toBe("remileduc.github.io:");
		expect(`${VENDOR_PREFIX}x`).toMatch(V_EXTENSION);
	});

	test("the nickname kind is a vendor property of Nickname", () => {
		expect(NICKNAME_KIND).toBe("remileduc.github.io:kind");
		expect(NICKNAME_KIND).toMatch(V_EXTENSION);
		expectTypeOf(NICKNAME_KIND).toEqualTypeOf<VendorKey<"kind">>();
		expectTypeOf<Nickname[typeof NICKNAME_KIND]>().toEqualTypeOf<NicknameKind | undefined>();
		expect(new Set(NICKNAME_KINDS).size).toBe(NICKNAME_KINDS.length);
	});

	test("a nickname kind outside the list does not compile", () => {
		const nickname = (value: Nickname): Nickname => value;
		expect(nickname({ name: "Smith", [NICKNAME_KIND]: "maiden" })).toBeDefined();
		// @ts-expect-error: "default" is how Android calls the absence of a kind
		nickname({ name: "Johnny", [NICKNAME_KIND]: "default" });
	});

	test("the nine vendor relations make valid keys and shadow no RFC 9553 relation type", () => {
		expect(VENDOR_RELATIONS).toHaveLength(9);
		expect(new Set(VENDOR_RELATIONS).size).toBe(VENDOR_RELATIONS.length);
		const standard: readonly string[] = RELATION_TYPES;
		for (const name of VENDOR_RELATIONS) {
			expect(`${VENDOR_PREFIX}${name}`).toMatch(V_EXTENSION);
			expect(standard).not.toContain(name);
		}
	});

	test("a vendor relation key is accepted beside the standard ones", () => {
		expectTypeOf<VendorKey<VendorRelation>>().toExtend<VendorExtension>();
		const mother: VendorKey<VendorRelation> = `${VENDOR_PREFIX}mother`;
		const relation: Relation = { relation: { [mother]: true, parent: true } };
		expect(relation.relation).toEqual({ "remileduc.github.io:mother": true, parent: true });
	});
});
