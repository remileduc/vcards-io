import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseVCards, type VCard, type VProperty } from "../src/index.js";

// Decoded values and allowed warnings are pinned per fixture in parse-fixtures.test.ts.
// This file keeps the parser rules the RFC examples exercise.
const root = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../fixtures/rfc/`;

/** Parses a fixture; infos are allowed (RFC 2426 writes a date-only REV), nothing stronger. */
function load(file: string): VCard[] {
	const { cards, issues } = parseVCards(readFileSync(`${root}${file}`));
	expect(issues.filter((i) => i.severity !== "info")).toEqual([]);
	return cards;
}

/** The index-th property of that name; throws so a wrong index fails loudly. */
function prop(card: VCard | undefined, name: string, index = 0): VProperty {
	const found = (card?.properties ?? []).filter((p) => p.name === name)[index];
	if (found === undefined) throw new Error(`${name} #${index} not found`);
	return found;
}

describe("RFC examples", () => {
	test("versit 2.1 section 3: the transport example cards", () => {
		const { cards, issues } = parseVCards(readFileSync(`${root}versit21-examples.vcf`));
		expect(cards.map((c) => c.version)).toEqual(["2.1", "2.1", "2.1"]);
		// Bare 2.1 parameter words become TYPE values, lowercased.
		expect(prop(cards[0], "TEL").params.get("TYPE")).toEqual(["work", "voice", "msg"]);
		// A content-id reference is not binary data: left raw, with the warning on its line.
		const photo = prop(cards[2], "PHOTO");
		expect(photo.params.get("TYPE")).toEqual(["gif", "mime"]);
		expect(photo.value).toEqual({
			kind: "unknown",
			raw: "<<JOHNSMITH.part3.960129T083020.xyzMail@host3.com>",
		});
		expect(issues).toEqual([
			expect.objectContaining({
				code: "binary-without-encoding",
				line: 21,
				property: "PHOTO",
			}),
		]);
	});

	test("versit 2.1 section 2: property examples", () => {
		const { cards, issues } = parseVCards(readFileSync(`${root}versit21-properties.vcf`));
		expect(issues.map((i) => [i.severity, i.code])).toEqual([
			["info", "param-comma-separator"],
			["info", "param-comma-separator"],
			["info", "agent-inline-vcard"],
		]);
		const [card] = cards;
		expect(card?.version).toBe("2.1");
		// Both spellings of the quoted-printable parameter; the soft break keeps the next
		// line verbatim, indentation included, as AOSP reads it.
		for (const index of [0, 1]) {
			const note = prop(card, "NOTE", index);
			expect(note.params.get("ENCODING")).toEqual(["QUOTED-PRINTABLE"]);
			expect(note.value).toEqual({
				kind: "text",
				value: "Don't remember to order Girl  Scout cookies from Stacey today!",
			});
		}
		// 2.1 has no comma lists and no escaping outside list splitting.
		expect(prop(card, "FN").value).toEqual({ kind: "text", value: "Mr. John Q. Public, Esq." });
		expect(prop(card, "N", 1).value).toEqual({
			kind: "structured",
			components: [["Veni, Vidi, Vici"], ["The Restaurant."]],
		});
		// Unindented soft-break continuations and the spec's own "PARCEL,ENCODING=" comma.
		expect(prop(card, "LABEL", 2).params).toEqual(
			new Map([
				["TYPE", ["intl", "parcel"]],
				["ENCODING", ["QUOTED-PRINTABLE"]],
			]),
		);
		expect(prop(card, "LABEL", 2).value).toEqual({
			kind: "text",
			value: "Suite 101\r\n123 Main Street\r\nAny Town, CA 91921-1234\r\nU.S.A.",
		});
		// 2.1 writes GEO with a comma: one component, left for the normaliser.
		expect(prop(card, "GEO").value).toEqual({
			kind: "structured",
			components: [["37.24,-17.87"]],
		});
		// The inline AGENT vCard stays one text value; SOUND is text unless VALUE says otherwise.
		expect(prop(card, "AGENT").value).toEqual({
			kind: "text",
			value: "BEGIN:VCARD\nVERSION:2.1\nN:Friday;Fred\nTEL;WORK;VOICE:+1-213-555-1234\nTEL;WORK;FAX:+1-213-555-5678\nEND:VCARD",
		});
		expect(prop(card, "SOUND").value).toEqual({
			kind: "uri",
			value: "<jsmith.part3.960817T083000.xyzMail@host1.com",
		});
		expect(prop(card, "SOUND", 1).value).toEqual({ kind: "text", value: "JON Q PUBLIK" });
	});

	test("RFC 2426 section 3: 3.0 property examples", () => {
		const { cards, issues } = parseVCards(readFileSync(`${root}rfc2426-properties.vcf`));
		expect(issues).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "timestamp-incomplete",
				property: "REV",
			}),
		]);
		const [card] = cards;
		expect(card?.version).toBe("3.0");
		// VALUE=text turns TZ into text; VALUE=uri turns AGENT into a URI, else inline text.
		expect(prop(card, "TZ", 1).value).toEqual({
			kind: "text",
			value: "-05:00; EST; Raleigh/North America",
		});
		expect(prop(card, "AGENT").value).toEqual({
			kind: "uri",
			value: "CID:JQPUBLIC.part3.960129T083020.xyzMail@host3.com",
		});
		expect(prop(card, "AGENT", 1).value).toEqual({
			kind: "text",
			value: "BEGIN:VCARD\nFN:Susan Thomas\nTEL:+1-919-555-1234\nEMAIL;INTERNET:sthomas@host.com\nEND:VCARD\n",
		});
		// Tim Howes' X.509 certificate, a DER SEQUENCE once the misprint is corrected.
		const key = prop(card, "KEY").value;
		expect(key.kind).toBe("binary");
		if (key.kind === "binary") {
			expect(key.data.length).toBe(622);
			expect(Array.from(key.data.subarray(0, 2))).toEqual([0x30, 0x82]);
			expect(key.mediaType).toBeUndefined();
		}
	});

	test("RFC 6350 section 8: the author's vCard", () => {
		const [card] = load("rfc6350-author.vcf");
		expect(card?.version).toBe("4.0");
		// A quoted TYPE value is still a comma list (RFC 6350 section 8).
		expect(prop(card, "TEL").params.get("TYPE")).toEqual(["work", "voice"]);
		// RFC 6350 6.5.1: TZ is text unless VALUE=utc-offset says otherwise.
		expect(prop(card, "TZ").value).toEqual({ kind: "text", value: "-0500" });
	});

	test("RFC 2426 section 7: 3.0 cards with BEGIN:vCard and folded ADR", () => {
		const cards = load("rfc2426-examples.vcf");
		expect(cards.map((c) => c.version)).toEqual(["3.0", "3.0"]);
		// The fold strips one whitespace character only: the second space is data.
		expect(prop(cards[1], "ADR").value).toMatchObject({
			components: expect.arrayContaining([[" 94043"]]),
		});
	});

	test("RFC 6350 section 6: property examples", () => {
		const [card] = load("rfc6350-properties.vcf");
		// 4.0 splits components on comma; a quoted SORT-AS keeps its comma.
		expect(prop(card, "N", 1).value).toEqual({
			kind: "structured",
			components: [
				["Stevenson"],
				["John"],
				["Philip", "Paul"],
				["Dr."],
				["Jr.", "M.D.", "A.C.P."],
			],
		});
		expect(prop(card, "N", 2).params.get("SORT-AS")).toEqual(["Harten,Rene"]);
		expect(prop(card, "TEL", 2).params.get("PID")).toEqual(["3.1", "4.2"]);
		// 4.0 parameters know no backslash escapes: the \n stays two characters.
		expect(prop(card, "ADR").params.get("LABEL")).toEqual([
			"Mr. John Q. Public, Esq.\\nMail Drop: TNE QB\\n123 Main Street\\nAny Town, CA  91921-1234\\nU.S.A.",
		]);
		// VALUE=text overrides the registry type.
		expect(prop(card, "BDAY", 3).value).toEqual({ kind: "text", value: "circa 1800" });
	});

	test("RFC 6868: caret-encoded parameter value folded inside its quotes", () => {
		const [card] = load("rfc6868-caret.vcf");
		expect(prop(card, "GEO").params.get("X-ADDRESS")).toEqual([
			"Pittsburgh Pirates\n115 Federal St\nPittsburgh, PA 15212",
		]);
	});

	test("RFC 9554: JSContact extension properties and parameters", () => {
		const [card] = load("rfc9554-properties.vcf");
		// Structured values keep every component, not only the seven of RFC 6350.
		const adr = prop(card, "ADR").value;
		expect(adr.kind).toBe("structured");
		if (adr.kind === "structured") expect(adr.components).toHaveLength(18);
		expect(prop(card, "N", 4).params).toEqual(
			new Map([
				["ALTID", ["1"]],
				["PHONETIC", ["jyut"]],
				["SCRIPT", ["Latn"]],
				["LANGUAGE", ["yue"]],
			]),
		);
	});

	test("RFC 9555 figures: groups, PROP-ID, JSPROP and JSCOMPS", () => {
		const [card] = load("rfc9555-figures.vcf");
		expect(prop(card, "X-FOO")).toMatchObject({
			group: "item2",
			value: { kind: "unknown", raw: "bar" },
		});
		// Folded before the ":" that ends the parameters.
		const phoneA = prop(card, "TEL", 1);
		expect(phoneA.params).toEqual(
			new Map([
				["PROP-ID", ["PHONE-A"]],
				["VALUE", ["uri"]],
				["PREF", ["1"]],
				["TYPE", ["voice", "home"]],
			]),
		);
		expect(phoneA.value).toEqual({ kind: "uri", value: "tel:+1-555-555-5555;ext=5555" });
		// JSPROP values are JSON text, kept as text with their quotes.
		expect(prop(card, "JSPROP", 1).value).toEqual({ kind: "text", value: '{"bar":1234}' });
		expect(prop(card, "JSPROP", 2).value).toEqual({ kind: "text", value: '"tux hux"' });
		// The quoted JSCOMPS value keeps its own backslash: it is JSCOMPS syntax, not vCard escaping.
		expect(prop(card, "ADR").params.get("JSCOMPS")).toEqual(["s,\\, ;11;s, ;10;3"]);
	});
});
