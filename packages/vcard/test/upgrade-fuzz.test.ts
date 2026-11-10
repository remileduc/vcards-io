import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseVCards, upgradeTo40, type VCard } from "../src/index.js";

/** Upgrades every card twice: never throws, the input stays intact, the second pass is a no-op. */
function stable(cards: VCard[]): void {
	for (const card of cards) {
		const before = structuredClone(card);
		const first = upgradeTo40(card);
		expect(card).toEqual(before);
		expect(first.card.version).toBe("4.0");
		for (const p of first.card.properties) {
			expect(p.value.kind).not.toBe("binary");
			expect(p.params.has("CHARSET")).toBe(false);
			expect(p.params.has("ENCODING")).toBe(false);
		}
		const second = upgradeTo40(first.card);
		expect(second.card).toEqual(first.card);
		expect(second.issues.filter((i) => i.severity === "info")).toEqual([]);
	}
}

const WORD = fc.string({ unit: "grapheme", maxLength: 12 }).filter((s) => !/[\r\n]/.test(s));
const NUMBER = fc.integer({ min: -2, max: 16 }).map(String);
const GROUP = fc.constantFrom("", "item1.", "item2.", "a.");
const TYPES = fc.constantFrom(
	"",
	";TYPE=pref",
	";TYPE=home,pref",
	";PREF;WORK",
	";TYPE=INTERNET",
	";TYPE=JPEG",
);
const LABEL = fc.constantFrom(
	"_$!<Home>!$_",
	"_$!<Mobile>!$_",
	"_$!<Other>!$_",
	"_$!<Anniversary>!$_",
	"_$!<Mother>!$_",
	"RELATIVE",
	"Custom",
	"",
);

/** Lines shaped like what the rules look for, with random pieces where a rule could trip. */
const LINE = fc.oneof(
	fc
		.tuple(WORD, NUMBER, WORD)
		.map(([n, t, l]) => `X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;${n};${t};${l}`),
	fc
		.tuple(WORD, NUMBER)
		.map(([d, t]) => `X-ANDROID-CUSTOM:vnd.android.cursor.item/contact_event;${d};${t};x`),
	fc
		.tuple(WORD, NUMBER, WORD)
		.map(([n, t, l]) => `X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;${n};${t};${l}`),
	fc.tuple(GROUP, TYPES, WORD).map(([g, t, v]) => `${g}TEL${t}:${v}`),
	fc.tuple(GROUP, TYPES, WORD).map(([g, t, v]) => `${g}EMAIL${t}:${v}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}ADR;TYPE=home:;;${v};;;;`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}ADR:;;${v};;;;;${v}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}LABEL;TYPE=home:${v}`),
	fc.tuple(GROUP, LABEL).map(([g, l]) => `${g}X-ABLabel:${l}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}X-ABDATE:${v}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}X-ABRELATEDNAMES:${v}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}X-ABADR:${v}`),
	fc.tuple(GROUP, WORD).map(([g, v]) => `${g}IMPP;X-SERVICE-TYPE=Skype:${v}`),
	fc
		.tuple(
			fc.constantFrom("X-AIM", "X-SIP", "X-SKYPE-PSTNNUMBER", "X-TWITTER", "X-GTALK"),
			WORD,
		)
		.map(([n, v]) => `${n}:${v}`),
	fc.tuple(WORD, WORD).map(([a, b]) => `GEO:${a};${b}`),
	WORD.map((v) => `BDAY:${v}`),
	WORD.map((v) => `BDAY;X-APPLE-OMIT-YEAR=1604:${v}`),
	WORD.map((v) => `SORT-STRING:${v}`),
	WORD.map((v) => `AGENT:${v}`),
	WORD.map((v) => `UID:${v}`),
	WORD.map((v) => `TZ:${v}`),
	WORD.map((v) => `X-WAB-GENDER:${v}`),
	WORD.map((v) => `X-SOCIALPROFILE;type=twitter;x-user=${v}:${v}`),
	WORD.map((v) => `X-ABShowAs:${v}`),
	WORD.map((v) => `X-ADDRESSBOOKSERVER-KIND:${v}`),
	WORD.map((v) => `NOTE:${v}`),
	fc.constant("PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ"),
	fc.constant("KEY;ENCODING=b:AQID"),
);

describe("upgradeTo40 fuzz", () => {
	test("never throws and is idempotent on arbitrary parsed text", () => {
		fc.assert(
			fc.property(fc.string({ unit: "binary", maxLength: 1500 }), (text) => {
				stable(parseVCards(text).cards);
			}),
			{ numRuns: 200 },
		);
	});

	test("never throws and is idempotent on cards built from the shapes the rules match", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("2.1", "3.0", "4.0"),
				fc.array(LINE, { maxLength: 12 }),
				(version, lines) => {
					const text = [
						"BEGIN:VCARD",
						`VERSION:${version}`,
						"FN:A",
						...lines,
						"END:VCARD",
					].join("\r\n");
					stable(parseVCards(text).cards);
				},
			),
			{ numRuns: 400 },
		);
	});
});
