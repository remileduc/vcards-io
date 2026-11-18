import { describe, expect, test } from "vitest";
import {
	encodeBase64,
	type Issue,
	parseVCards,
	serializeVCards,
	upgradeTo40,
	type VCard,
	type VCardVersion,
	type VProperty,
} from "../src/index.js";

const codes = (issues: Issue[]) => issues.map((i) => i.code);
const params = (p: VProperty | undefined) => Object.fromEntries(p?.params ?? []);

function source(version: VCardVersion | null, ...lines: string[]): VCard {
	const head = version === null ? [] : [`VERSION:${version}`];
	const text = ["BEGIN:VCARD", ...head, ...lines, "END:VCARD"].join("\r\n");
	const card = parseVCards(text).cards[0];
	if (card === undefined) throw new Error(`no card parsed from ${text}`);
	return card;
}

function upgrade(version: VCardVersion | null, ...lines: string[]) {
	const result = upgradeTo40(source(version, ...lines));
	return { card: result.card, props: result.card.properties, issues: result.issues };
}

function only(version: VCardVersion | null, ...lines: string[]): VProperty {
	const { props } = upgrade(version, ...lines);
	if (props.length !== 1) throw new Error(`expected one property, got ${props.length}`);
	return props[0] as VProperty;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

describe("upgradeTo40", () => {
	test("sets version 4.0 whether the source version was declared or guessed", () => {
		expect(upgrade("3.0", "FN:A").card.version).toBe("4.0");
		const inferred = upgrade(null, "FN:A", "TEL;CELL:1");
		expect(inferred.card.version).toBe("4.0");
		expect(inferred.card.properties.map((p) => p.name)).toEqual(["FN", "TEL"]);
	});

	test("drops a VERSION property of a hand-built model, so the result can be written", () => {
		const text = (value: string) => ({ kind: "text", value }) as const;
		const built: VCard = {
			version: "3.0",
			properties: [
				{ group: null, name: "VERSION", params: new Map(), value: text("3.0") },
				{ group: null, name: "FN", params: new Map(), value: text("A") },
				{ group: "item1", name: "version", params: new Map(), value: text("2.1") },
			],
		};
		const first = upgradeTo40(built);
		expect(first.card.properties.map((p) => p.name)).toEqual(["FN"]);
		expect(first.issues.map((i) => [i.severity, i.code, i.property])).toEqual([
			["info", "version-dropped", "VERSION"],
			["info", "version-dropped", "item1.version"],
		]);
		expect(serializeVCards([first.card], { version: "4.0" }).text).toBe(
			"BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A\r\nEND:VCARD\r\n",
		);
		expect(upgradeTo40(first.card)).toEqual({ card: first.card, issues: [] });
	});

	test("does not modify the input card", () => {
		const input = source(
			"2.1",
			"FN:A",
			"TEL;PREF;WORK:1",
			`PHOTO;ENCODING=BASE64;JPEG:${encodeBase64(JPEG)}`,
		);
		const before = structuredClone(input);
		upgradeTo40(input);
		expect(input).toEqual(before);
	});

	test("issues carry the source line and group.NAME", () => {
		const { issues } = upgrade("3.0", "FN:A", "item1.ADR:;;1 Main;;;;", "item1.LABEL:1 Main");
		expect(issues).toEqual([
			{
				severity: "info",
				code: "label-merged",
				message: expect.stringContaining("LABEL"),
				line: 5,
				property: "item1.LABEL",
			},
		]);
	});

	test("is idempotent: a second pass changes nothing and reports nothing", () => {
		const first = upgradeTo40(
			source(
				"2.1",
				"N:Public;John",
				"FN:John",
				"TEL;PREF;WORK;VOICE:+1",
				"EMAIL;INTERNET;HOME:a@b.c",
				"ADR;DOM;HOME:;;1 Main;Town;CA;90210;USA",
				"LABEL;DOM;HOME:1 Main\\nTown",
				"GEO:37.24,-17.87",
				"TZ:-0500",
				"NOTE:a;b",
				`PHOTO;ENCODING=BASE64;JPEG:${encodeBase64(JPEG)}`,
				"X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;Mum;8;;;;;;;;;;;;;",
				"X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;Bob;0;Roommate;;;;;;;;;;;;",
				"X-AIM;HOME:someone",
			),
		);
		const second = upgradeTo40(first.card);
		expect(second.card).toEqual(first.card);
		expect(second.issues).toEqual([]);
	});

	test("vendor: false leaves vendor properties alone", () => {
		const line = "X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Bob;1;;;;;;;;;;;;;";
		const result = upgradeTo40(source("2.1", "FN:A", line), { vendor: false });
		expect(result.card.properties.map((p) => p.name)).toEqual(["FN", "X-ANDROID-CUSTOM"]);
		expect(result.issues).toEqual([]);
	});
});

describe("standard rules", () => {
	test("vCard 2.1 text escapes are resolved as AOSP does, so a literal \\n stays", () => {
		const legacy = upgrade("2.1", "NOTE:a;b\\\\c\\,d\\:e\\nf\\Ng");
		expect(legacy.props[0]?.value).toEqual({ kind: "text", value: "a;b\\c,d:e\\nf\\Ng" });
		expect(only("2.1", "NOTE:Files in C:\\new folder").value).toEqual({
			kind: "text",
			value: "Files in C:\\new folder",
		});
		expect(codes(legacy.issues)).toEqual(["legacy-text-unescaped"]);
		const modern = upgrade("3.0", "NOTE:a;b");
		expect(modern.props[0]?.value).toEqual({ kind: "text", value: "a;b" });
		expect(modern.issues).toEqual([]);
	});

	test("an inline 2.1 AGENT keeps its nested text verbatim", () => {
		const agent = only(
			"2.1",
			"AGENT:",
			"BEGIN:VCARD",
			"VERSION:2.1",
			"N:Friday;Fred",
			"NOTE:a;b",
			"END:VCARD",
		);
		expect(agent.name).toBe("AGENT");
		expect(agent.value).toEqual({
			kind: "text",
			value: "BEGIN:VCARD\nVERSION:2.1\nN:Friday;Fred\nNOTE:a;b\nEND:VCARD",
		});
	});

	test("CHARSET and ENCODING go silently, CONTEXT with an info", () => {
		const note = upgrade("2.1", "NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=A9");
		expect(note.props[0]?.value).toEqual({ kind: "text", value: "é" });
		expect(params(note.props[0])).toEqual({});
		expect(note.issues).toEqual([]);
		const tel = upgrade("3.0", "TEL;CONTEXT=word;TYPE=home:1");
		expect(params(tel.props[0])).toEqual({ TYPE: ["home"] });
		expect(codes(tel.issues)).toEqual(["context-dropped"]);
	});

	test("TYPE=pref and the bare 2.1 PREF become PREF=1, an existing PREF wins", () => {
		expect(params(only("2.1", "TEL;PREF;WORK:1"))).toEqual({ TYPE: ["work"], PREF: ["1"] });
		expect(params(only("3.0", "TEL;TYPE=pref,home:1"))).toEqual({
			TYPE: ["home"],
			PREF: ["1"],
		});
		expect(params(only("3.0", "TEL;TYPE=PREF:1"))).toEqual({ PREF: ["1"] });
		expect(params(only("4.0", "TEL;TYPE=pref;PREF=2:1"))).toEqual({ PREF: ["2"] });
		expect(codes(upgrade("3.0", "TEL;TYPE=pref:1").issues)).toEqual(["pref-to-param"]);
	});

	test("inline binary becomes a data: URI carrying the sniffed media type", () => {
		const { props, issues } = upgrade(
			"3.0",
			`PHOTO;ENCODING=b;TYPE=JPEG:${encodeBase64(JPEG)}`,
		);
		expect(props[0]?.value).toEqual({
			kind: "uri",
			value: `data:image/jpeg;base64,${encodeBase64(JPEG)}`,
		});
		expect(params(props[0])).toEqual({});
		expect(codes(issues)).toEqual(["binary-to-data-uri", "media-type-param"]);
		expect(issues[0]?.message).toContain("11 bytes of inline image/jpeg");
	});

	test("binary without a known media type gives data:;base64 and keeps VALUE=binary out", () => {
		const key = only(
			"3.0",
			`KEY;ENCODING=b;VALUE=binary:${encodeBase64(new Uint8Array([1, 2, 3]))}`,
		);
		expect(key.value).toEqual({ kind: "uri", value: "data:;base64,AQID" });
		expect(params(key)).toEqual({});
	});

	test("TYPE media names on a URI media property become MEDIATYPE", () => {
		const photo = only("3.0", "PHOTO;VALUE=URL;TYPE=GIF:http://x/a.gif");
		expect(photo.value).toEqual({ kind: "uri", value: "http://x/a.gif" });
		expect(params(photo)).toEqual({ MEDIATYPE: ["image/gif"] });
		const logo = only("3.0", "LOGO;VALUE=URL;TYPE=image/png;MEDIATYPE=image/jpeg:http://x/a");
		expect(params(logo)).toEqual({ MEDIATYPE: ["image/jpeg"] });
		expect(params(only("3.0", "SOUND;TYPE=BASIC;VALUE=uri:http://x/a.wav"))).toEqual({
			TYPE: ["basic"],
		});
	});

	test("GEO becomes a geo: URI in both the 3.0 and the 2.1 spelling", () => {
		expect(only("3.0", "GEO:37.386013;-122.082932").value).toEqual({
			kind: "uri",
			value: "geo:37.386013,-122.082932",
		});
		expect(only("2.1", "GEO:37.24,-17.87").value).toEqual({
			kind: "uri",
			value: "geo:37.24,-17.87",
		});
		expect(params(only("3.0", "GEO:1;2"))).toEqual({});
	});

	test("a GEO that is not two numbers in range is kept with a warning", () => {
		for (const line of ["GEO:north;south", "GEO:91;0", "GEO:1;2;3", "GEO:1"]) {
			const { props, issues } = upgrade("3.0", line);
			expect(props[0]?.value.kind, line).toBe("structured");
			expect(codes(issues), line).toEqual(["geo-invalid"]);
			expect(issues[0]?.severity).toBe("warning");
		}
	});

	test("LABEL joins the ADR of its group, else the ADR with the same TYPE set", () => {
		const grouped = upgrade(
			"3.0",
			"item1.ADR;TYPE=work:;;1;;;;",
			"ADR;TYPE=home:;;2;;;;",
			"item1.LABEL;TYPE=home:One",
		);
		expect(grouped.props.map((p) => p.name)).toEqual(["ADR", "ADR"]);
		expect(params(grouped.props[0])).toEqual({ TYPE: ["work"], LABEL: ["One"] });
		expect(params(grouped.props[1])).toEqual({ TYPE: ["home"] });
		const typed = upgrade(
			"2.1",
			"ADR;DOM;HOME:;;1;;;;",
			"ADR;WORK:;;2;;;;",
			"LABEL;HOME;DOM:One\\;Two",
		);
		expect(params(typed.props[0])).toEqual({ TYPE: ["dom", "home"], LABEL: ["One;Two"] });
		expect(params(typed.props[1])).toEqual({ TYPE: ["work"] });
		expect(codes(typed.issues)).toEqual(["legacy-text-unescaped", "label-merged"]);
	});

	test("a LABEL with no matching ADR becomes an ADR with only a LABEL, in place", () => {
		const { props, issues } = upgrade(
			"3.0",
			"ADR;TYPE=work;LABEL=Taken:;;1;;;;",
			"LABEL;TYPE=work;LANGUAGE=fr:Two",
			"NOTE:n",
		);
		expect(props.map((p) => p.name)).toEqual(["ADR", "ADR", "NOTE"]);
		expect(params(props[1])).toEqual({ TYPE: ["work"], LANGUAGE: ["fr"], LABEL: ["Two"] });
		expect(props[1]?.value).toEqual({
			kind: "structured",
			components: Array.from({ length: 18 }, () => [""]),
		});
		expect(codes(issues)).toEqual(["label-to-adr"]);
	});

	test("SORT-STRING becomes SORT-AS on N, or stays when there is no room", () => {
		const moved = upgrade("3.0", "N:Harten;Rene", "SORT-STRING:Harten");
		expect(moved.props.map((p) => p.name)).toEqual(["N"]);
		expect(params(moved.props[0])).toEqual({ "SORT-AS": ["Harten"] });
		expect(codes(moved.issues)).toEqual(["sort-string-to-sort-as"]);
		expect(upgrade("3.0", "FN:A", "SORT-STRING:Harten").props.map((p) => p.name)).toEqual([
			"FN",
			"SORT-STRING",
		]);
		expect(upgrade("3.0", "N;SORT-AS=X:A;B", "SORT-STRING:Y").props.map((p) => p.name)).toEqual(
			["N", "SORT-STRING"],
		);
	});

	test("an AGENT URI becomes RELATED;TYPE=agent", () => {
		const explicit = only("3.0", "AGENT;VALUE=uri:CID:JQPUBLIC.part3@host3.com");
		expect(explicit).toMatchObject({
			name: "RELATED",
			value: { kind: "uri", value: "CID:JQPUBLIC.part3@host3.com" },
		});
		expect(params(explicit)).toEqual({ TYPE: ["agent"] });
		expect(only("2.1", "AGENT:http://example.com/fred.vcf").name).toBe("RELATED");
		expect(only("3.0", "AGENT:Fred Friday").name).toBe("AGENT");
	});

	test("a text UID carrying a scheme is a URI, a bare one keeps VALUE=text", () => {
		const urn = only("3.0", "UID:urn:uuid:f81d4fae-7dec-11d0-a765-00a0c91e6bf6");
		expect(urn.value).toEqual({
			kind: "uri",
			value: "urn:uuid:f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
		});
		expect(params(urn)).toEqual({});
		const bare = only("3.0", "UID:8925F4AF-9773-4030-ACDE-F12D78627DBD");
		expect(bare.value.kind).toBe("text");
		expect(params(bare)).toEqual({ VALUE: ["text"] });
	});

	test("a 2.1 Content-ID reference becomes a cid: URI", () => {
		const sound = only("2.1", "SOUND;VALUE=CONTENT-ID:<jsmith.part3@host1.com>");
		expect(sound.value).toEqual({ kind: "uri", value: "cid:jsmith.part3@host1.com" });
		expect(params(sound)).toEqual({});
	});

	test("EMAIL loses TYPE=internet only; legacy TEL and ADR types stay", () => {
		expect(params(only("3.0", "EMAIL;TYPE=INTERNET;TYPE=HOME:a@b"))).toEqual({
			TYPE: ["home"],
		});
		expect(params(only("3.0", "EMAIL;TYPE=x400:a"))).toEqual({ TYPE: ["x400"] });
		expect(params(only("2.1", "TEL;MSG;CAR;ISDN;PCS:1"))).toEqual({
			TYPE: ["msg", "car", "isdn", "pcs"],
		});
		expect(params(only("2.1", "ADR;DOM;INTL;POSTAL;PARCEL:;;;;;;"))).toEqual({
			TYPE: ["dom", "intl", "postal", "parcel"],
		});
	});

	test("an 8th ADR component becomes the LABEL parameter", () => {
		const google = only(
			"3.0",
			"ADR;TYPE=home:;;1 Main;Town;CA;90210;USA;1 Main\\nTown CA 90210",
		);
		expect(params(google)).toEqual({ TYPE: ["home"], LABEL: ["1 Main\nTown CA 90210"] });
		expect(google.value).toMatchObject({ kind: "structured" });
		if (google.value.kind === "structured") {
			expect(google.value.components).toHaveLength(18);
			expect(google.value.components[6]).toEqual(["USA"]);
		}
		const empty = only("3.0", "ADR:;;1;;;;;");
		expect(params(empty)).toEqual({});
		expect(codes(upgrade("3.0", "ADR:;;1;;;;;").issues)).toEqual([]);
	});

	test("ADR components that cannot be a LABEL are kept with a warning", () => {
		for (const line of ["ADR:;;1;;;;;a;b", "ADR;LABEL=x:;;1;;;;;a"]) {
			const { props, issues } = upgrade("3.0", line);
			expect(codes(issues), line).toEqual(["adr-extra-components"]);
			if (props[0]?.value.kind === "structured") {
				expect(props[0].value.components.length, line).toBeGreaterThan(7);
			}
		}
	});

	test("N and ADR are padded to the RFC 9554 component counts", () => {
		const n = only("3.0", "N:Public;John;Quinlan;Mr.;Esq.");
		expect(n.value).toEqual({
			kind: "structured",
			components: [["Public"], ["John"], ["Quinlan"], ["Mr."], ["Esq."], [""], [""]],
		});
		const adr = only("2.1", "ADR:;;1 Main");
		if (adr.value.kind === "structured") expect(adr.value.components).toHaveLength(18);
		const full = only("4.0", "N:a;b;c;d;e;f;g;h");
		if (full.value.kind === "structured") expect(full.value.components).toHaveLength(8);
	});

	describe("canonical VALUE parameter", () => {
		test("is absent when the value has the 4.0 default kind", () => {
			expect(params(only("3.0", "BDAY;VALUE=date:1985-04-12"))).toEqual({});
			expect(params(only("3.0", "N;VALUE=text:a;b"))).toEqual({});
			expect(params(only("3.0", "TZ;VALUE=text:Europe/Paris"))).toEqual({});
			expect(params(only("3.0", "PHOTO;VALUE=uri:http://x/a"))).toEqual({});
		});

		test("names the kind when it differs from the default", () => {
			expect(params(only("3.0", "TZ:-0500"))).toEqual({ VALUE: ["utc-offset"] });
			expect(only("3.0", "TZ:-0500").value.kind).toBe("utc-offset");
			expect(params(only("3.0", "REV:1997-11-15"))).toEqual({ VALUE: ["date-and-or-time"] });
			expect(params(only("2.1", "KEY:clear text key"))).toEqual({ VALUE: ["text"] });
			expect(params(only("4.0", "TEL;VALUE=uri:tel:+1"))).toEqual({ VALUE: ["uri"] });
		});

		test("normalises the token of properties it cannot type", () => {
			const { props, issues } = upgrade("3.0", "X-FOO;VALUE=URL:http://x");
			expect(params(props[0])).toEqual({ VALUE: ["uri"] });
			expect(codes(issues)).toEqual(["value-param-rewritten"]);
			expect(params(only("3.0", "X-FOO;VALUE=Text:x"))).toEqual({ VALUE: ["text"] });
			expect(params(only("3.0", "X-FOO;VALUE=text:x"))).toEqual({ VALUE: ["text"] });
			// An unparsed date keeps what it declared.
			expect(params(only("3.0", "BDAY;VALUE=date:soon"))).toEqual({ VALUE: ["date"] });
		});
	});
});

describe("review regressions", () => {
	test("several VERSION lines are the parser's to report, the upgrade never sees one", () => {
		const { card, issues } = upgrade("3.0", "VERSION:2.1", "FN:A");
		expect(card.version).toBe("4.0");
		expect(card.properties.map((p) => p.name)).toEqual(["FN"]);
		expect(issues).toEqual([]);
	});

	test("an 8th or later ADR component in a 4.0 card is RFC 9554 data, not a Google label", () => {
		const room = only("4.0", "ADR:;;1 Main;Town;CA;90210;USA;Room 5");
		expect(params(room)).toEqual({});
		if (room.value.kind === "structured") expect(room.value.components[7]).toEqual(["Room 5"]);
		expect(upgrade("4.0", "ADR:;;1 Main;Town;CA;90210;USA;;;3rd").issues).toEqual([]);
	});

	test("a GEO with a leading plus is a valid geo: URI", () => {
		expect(only("3.0", "GEO:+37.2;-17.8").value).toEqual({
			kind: "uri",
			value: "geo:37.2,-17.8",
		});
	});

	test("a TYPE media name must look like one", () => {
		const photo = only("3.0", "PHOTO;VALUE=URL;TYPE=a/b/c:http://x/a");
		expect(params(photo)).toEqual({ TYPE: ["a/b/c"] });
		expect(params(only("3.0", 'PHOTO;VALUE=URL;MEDIATYPE="a/b;x=1":http://x/a'))).toEqual({
			MEDIATYPE: ["a/b;x=1"],
		});
	});

	test("an empty LABEL is dropped rather than made into an empty ADR", () => {
		const { props, issues } = upgrade("3.0", "LABEL;TYPE=home:");
		expect(props).toEqual([]);
		expect(codes(issues)).toEqual(["label-dropped"]);
	});

	test("a colon in free text does not make an AGENT a URI", () => {
		expect(only("3.0", "AGENT:Smith:Jones").name).toBe("AGENT");
		expect(only("3.0", "AGENT:mailto:fred@example.com").name).toBe("RELATED");
	});

	test("a card with tens of thousands of grouped rows upgrades in linear time", () => {
		const lines: string[] = [];
		for (let i = 0; i < 20_000; i++) {
			lines.push(
				`X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;B;0;Roommate;;;;;;;;;;;;`,
			);
			lines.push(
				`item${i}.TEL:${i}`,
				`item${i}.X-ABLabel:_$!<Home>!$_`,
				`LABEL;TYPE=home:${i}`,
			);
		}
		const start = performance.now();
		const { card } = upgradeTo40(source("3.0", "FN:A", ...lines));
		expect(performance.now() - start).toBeLessThan(5000);
		expect(card.properties.filter((p) => p.name === "RELATED")).toHaveLength(20_000);
		expect(card.properties.filter((p) => p.name === "ADR")).toHaveLength(20_000);
	});
});
