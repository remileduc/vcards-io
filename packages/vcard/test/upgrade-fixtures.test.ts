import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { type Issue, parseVCards, upgradeTo40, type VCard, type VProperty } from "../src/index.js";

const root = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../fixtures/`;
// Every .vcf present, so an untracked local export is tested too without being named here.
const files = readdirSync(root, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((dir) => readdirSync(`${root}${dir.name}`).map((f) => `${dir.name}/${f}`))
	.filter((f) => f.endsWith(".vcf"))
	.sort();

const codes = (issues: Issue[]) => issues.map((i) => i.code).sort();
const params = (p: VProperty | undefined) => Object.fromEntries(p?.params ?? []);
const first = (p: VProperty, name: string) => p.params.get(name)?.[0];
const names = (card: VCard | undefined, name: string) =>
	(card?.properties ?? []).filter((p) => p.name === name);
const id = (p: VProperty) => (p.group === null ? p.name : `${p.group}.${p.name}`);

function load(file: string): { cards: VCard[]; issues: Issue[] } {
	const parsed = parseVCards(readFileSync(`${root}${file}`));
	const cards: VCard[] = [];
	const issues: Issue[] = [];
	for (const card of parsed.cards) {
		const result = upgradeTo40(card);
		cards.push(result.card);
		issues.push(...result.issues);
	}
	return { cards, issues };
}

describe("every fixture upgrades to 4.0", () => {
	test.each(files)("%s", (file) => {
		const parsed = parseVCards(readFileSync(`${root}${file}`));
		for (const card of parsed.cards) {
			const original = structuredClone(card);
			const first = upgradeTo40(card);
			expect(card, "input card modified").toEqual(original);
			expect(first.card.version).toBe("4.0");
			// Fixtures are well-formed: rules apply or stay silent, nothing is malformed for them.
			expect(first.issues.filter((i) => i.severity !== "info")).toEqual([]);
			expect(first.card.properties[0]).toMatchObject({
				name: "VERSION",
				value: { value: "4.0" },
			});
			for (const p of first.card.properties) {
				expect(p.value.kind, id(p)).not.toBe("binary");
				for (const name of ["CHARSET", "ENCODING", "X-SERVICE-TYPE", "X-APPLE-OMIT-YEAR"]) {
					expect(p.params.has(name), `${id(p)} ${name}`).toBe(false);
				}
				const types = (p.params.get("TYPE") ?? []).map((t) => t.toLowerCase());
				expect(types, id(p)).not.toContain("pref");
				if (p.name === "EMAIL") expect(types, id(p)).not.toContain("internet");
				if (p.name === "N" && p.value.kind === "structured") {
					expect(p.value.components.length, id(p)).toBeGreaterThanOrEqual(7);
				}
				if (p.name === "ADR" && p.value.kind === "structured") {
					expect(p.value.components.length, id(p)).toBeGreaterThanOrEqual(18);
				}
			}
			const second = upgradeTo40(first.card);
			expect(second.card, "second upgrade changed the card").toEqual(first.card);
			expect(second.issues).toEqual([]);
		}
	});
});

describe("fixture expectations", () => {
	test("android/cozy-android-full.vcf: AOSP rows and legacy IM", () => {
		const { cards, issues } = load("android/cozy-android-full.vcf");
		const card = cards[0];
		expect(names(card, "NICKNAME")[0]?.value).toEqual({
			kind: "text-list",
			values: ["Pseudo"],
		});
		expect(names(card, "ANNIVERSARY")[0]?.value).toMatchObject({ raw: "2015-03-04" });
		expect(names(card, "BDAY")[0]?.value).toMatchObject({ raw: "2015-03-03" });
		expect(names(card, "RELATED").map((p) => first(p, "TYPE"))).toEqual([
			"x-assistant",
			"x-brother",
			"child",
			"x-domestic-partner",
			"x-father",
			"friend",
			"x-manager",
			"x-mother",
			"parent",
			"x-partner",
			"x-referred-by",
			"kin",
			"x-sister",
			"spouse",
		]);
		expect(
			names(card, "IMPP").map((p) => (p.value.kind === "uri" ? p.value.value : "")),
		).toEqual([
			"skype:skypeaccount",
			"aim:aimaccount",
			"msnim:winaccount",
			"ymsgr:yahooaccount",
			"qq:qqaccount",
			"xmpp:account",
			"icq:account",
			"xmpp:account",
			"sip:appel-internet",
		]);
		// The "other" event and the custom one have no 4.0 property and stay for vCardProps.
		expect(names(card, "X-ANDROID-CUSTOM")).toHaveLength(2);
		expect(names(card, "TEL").filter((p) => p.params.has("PREF"))).toHaveLength(2);
		expect(codes(issues)).toEqual(
			[
				"android-nickname",
				"android-event",
				...Array<string>(14).fill("android-relation"),
				...Array<string>(9).fill("legacy-im-to-impp"),
				"pref-to-param",
				"pref-to-param",
			].sort(),
		);
	});

	test("apple/cozy-ios-full.vcf: labels, relations, IM, social, country codes", () => {
		const { cards } = load("apple/cozy-ios-full.vcf");
		const card = cards[0];
		expect(names(card, "ANNIVERSARY").map(id)).toEqual(["item28.ANNIVERSARY"]);
		expect(names(card, "RELATED").map((p) => first(p, "TYPE"))).toEqual([
			"x-mother",
			"x-father",
			"parent",
			"x-brother",
			"x-sister",
			"child",
			"friend",
			"spouse",
			"x-partner",
			"x-assistant",
			"x-manager",
			undefined,
			"x-custom",
		]);
		expect(names(card, "IMPP").map((p) => first(p, "SERVICE-TYPE"))).toEqual([
			"MSN",
			"AIM",
			"Yahoo",
			"ICQ",
			"Jabber",
			"Skype",
			"MSN",
			"GoogleTalk",
			"Facebook",
			"AIM",
			"Yahoo",
			"ICQ",
			"Jabber",
			"QQ",
			"GaduGadu",
			"Customim",
		]);
		expect(names(card, "SOCIALPROFILE").map((p) => first(p, "SERVICE-TYPE"))).toEqual([
			"Twitter",
			"Facebook",
			"Flickr",
			"LinkedIn",
			"Myspace",
			"Sina Weibo",
			"Customsocial",
		]);
		expect(names(card, "SOCIALPROFILE")[0] && params(names(card, "SOCIALPROFILE")[0])).toEqual({
			"SERVICE-TYPE": ["Twitter"],
			USERNAME: ["twitteruser"],
		});
		expect(names(card, "ADR").map((p) => first(p, "CC"))).toEqual(["FR", "FR", "FR", "FR"]);
		expect(names(card, "X-ABADR")).toEqual([]);
		// Custom labels stay for the converter; built-ins and IM service names are consumed.
		expect(
			names(card, "X-ABLABEL").map((p) => (p.value.kind === "text" ? p.value.value : "")),
		).toEqual([
			"iCloud",
			"Customemail",
			"Customphone",
			"Customaddress",
			"Custom",
			"Skype",
			"_$!<Other>!$_",
			"Customdate",
			"Customrelation",
		]);
		expect(names(card, "EMAIL").map((p) => params(p))).toEqual([
			{ TYPE: ["home"], PREF: ["1"] },
			{ TYPE: ["work"] },
			{},
			{},
			{},
			{ TYPE: ["home"] },
		]);
		expect(names(card, "X-ABDATE").map(id)).toEqual(["item29.X-ABDATE", "item30.X-ABDATE"]);
	});

	test("apple/cozy-ios-complex-types.vcf: placeholder year and text UID", () => {
		const card = load("apple/cozy-ios-complex-types.vcf").cards[0];
		expect(names(card, "BDAY")[0]?.value).toEqual({
			kind: "date-and-or-time",
			value: { month: 2, day: 2 },
			raw: "--0202",
		});
		expect(params(names(card, "UID")[0])).toEqual({ VALUE: ["text"] });
	});

	test("google/cozy-google-full.vcf: Google relation words and the kept custom date", () => {
		const card = load("google/cozy-google-full.vcf").cards[0];
		expect(names(card, "RELATED").map((p) => first(p, "TYPE"))).toEqual([
			"spouse",
			"child",
			"x-mother",
			"x-father",
			"parent",
			"x-brother",
			"x-sister",
			"friend",
			"kin",
			"x-manager",
			"x-assistant",
			"x-referred-by",
			"x-partner",
			"x-domestic-partner",
			"x-custom",
		]);
		expect(names(card, "ANNIVERSARY").map(id)).toEqual(["item9.ANNIVERSARY"]);
		expect(names(card, "X-ABDATE").map(id)).toEqual(["item8.X-ABDATE"]);
		expect(
			names(card, "X-ABLABEL").map((p) => (p.value.kind === "text" ? p.value.value : "")),
		).toEqual([
			"Arbitrary String",
			"GRAND_CENTRAL",
			"Weekends",
			"PROFILE",
			"BLOG",
			"arbitraryString",
			"Died",
			"Arbitrary-string",
		]);
		expect(names(card, "IMPP")).toHaveLength(8);
	});

	test("other/cozy-contactA-davdroid.vcf: LABEL joins the ADR with the same type", () => {
		const card = load("other/cozy-contactA-davdroid.vcf").cards[0];
		expect(names(card, "LABEL")).toEqual([]);
		expect(names(card, "ADR").map((p) => params(p))).toEqual([
			{ TYPE: ["work"], LABEL: ["4, rue Léon Jouhaux\n75010 Paris  \n "] },
			{ TYPE: ["home"], LABEL: ["12, rue René Boulanger\n75010 Paris  \n "] },
		]);
	});

	test("rfc/rfc2426-properties.vcf: the 3.0 shapes RFC 6350 renamed", () => {
		const card = load("rfc/rfc2426-properties.vcf").cards[0];
		expect(names(card, "GEO")[0]?.value).toEqual({
			kind: "uri",
			value: "geo:37.386013,-122.082932",
		});
		expect(params(names(card, "N")[0])).toEqual({ "SORT-AS": ["Harten"] });
		// Two SORT-STRING examples in the fixture, one N slot: the second stays a legacy property.
		expect(names(card, "SORT-STRING")).toHaveLength(1);
		expect(names(card, "RELATED")[0]).toMatchObject({
			value: { kind: "uri", value: "CID:JQPUBLIC.part3.960129T083020.xyzMail@host3.com" },
		});
		expect(params(names(card, "RELATED")[0])).toEqual({ TYPE: ["agent"] });
		// The escaped inline AGENT vCard is text, not a URI, and stays.
		expect(names(card, "AGENT").map((p) => p.value.kind)).toEqual(["text", "text"]);
		expect(params(names(card, "TZ")[0])).toEqual({ VALUE: ["utc-offset"] });
		expect(params(names(card, "REV")[1])).toEqual({ VALUE: ["date-and-or-time"] });
		expect(names(card, "KEY")[0]?.value).toMatchObject({
			kind: "uri",
			value: expect.stringMatching(/^data:;base64,MIICajCC/),
		});
		expect(params(names(card, "ADR")[0])).toMatchObject({
			TYPE: ["dom", "home", "postal", "parcel"],
		});
		expect(names(card, "ADR")[0]?.params.get("LABEL")?.[0]).toMatch(
			/^Mr.John Q. Public, Esq.\n/,
		);
	});

	test("rfc/versit21-properties.vcf: 2.1 inline media and labels without an address", () => {
		const card = load("rfc/versit21-properties.vcf").cards[0];
		const photos = names(card, "PHOTO").map((p) =>
			p.value.kind === "uri" ? p.value.value.slice(0, 22) : p.value.kind,
		);
		expect(photos).toEqual([
			"http://www.abc.com/dir",
			"file:///jqpublic.gif",
			"data:image/gif;base64,",
		]);
		expect(params(names(card, "PHOTO")[0])).toEqual({ MEDIATYPE: ["image/gif"] });
		expect(names(card, "LABEL")).toEqual([]);
		expect(names(card, "ADR").filter((p) => p.params.has("LABEL"))).toHaveLength(4);
		expect(names(card, "AGENT")[0]?.value).toMatchObject({
			kind: "text",
			value: expect.stringMatching(/^BEGIN:VCARD/),
		});
		expect(names(card, "GEO")[0]?.value).toEqual({ kind: "uri", value: "geo:37.24,-17.87" });
	});
});
