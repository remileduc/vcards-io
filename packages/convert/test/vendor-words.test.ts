import { NICKNAME_KINDS, RELATION_TYPES, VENDOR_RELATIONS } from "@vcards-io/jscontact";
import { parseVCards, RELATION_MAPPINGS, upgradeTo40 } from "@vcards-io/vcard";
import { expect, test } from "vitest";

// The two libraries cannot see each other: this is where the words they share are compared.

test("the vcard relation table and the JSContact relation lists name the same relations", () => {
	const words = RELATION_MAPPINGS.map((mapping) => mapping.type).filter((w) => w !== "x-custom");
	const vendor = words.filter((word) => word.startsWith("x-")).map((word) => word.slice(2));
	const standard: readonly string[] = RELATION_TYPES;

	expect(vendor.sort()).toEqual([...VENDOR_RELATIONS].sort());
	for (const word of words.filter((w) => !w.startsWith("x-"))) expect(standard).toContain(word);
});

test("the nickname kinds the normaliser writes are the JSContact nickname kinds", () => {
	const kindOfAndroidType = (type: number): string | undefined => {
		const row = `X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Bob;${type};;;;;;;;;;;;;`;
		const [card] = parseVCards(
			`BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Bob\r\n${row}\r\nEND:VCARD\r\n`,
		).cards;
		if (card === undefined) throw new Error("the card did not parse");
		const nickname = upgradeTo40(card).card.properties.find((p) => p.name === "NICKNAME");
		return nickname?.params.get("X-KIND")?.[0];
	};
	// Type 1 is the plain nickname and carries no kind; 0 is the custom one.
	expect(kindOfAndroidType(1)).toBeUndefined();
	expect([0, 2, 3, 4, 5].map(kindOfAndroidType).sort()).toEqual([...NICKNAME_KINDS].sort());
});
