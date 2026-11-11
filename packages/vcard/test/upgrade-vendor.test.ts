import { describe, expect, test } from "vitest";
import {
	type Issue,
	parseVCards,
	RELATION_TYPES,
	relationTypeForAndroid,
	relationTypeForLabel,
	upgradeTo40,
	type VCard,
	type VCardVersion,
	type VProperty,
} from "../src/index.js";

const codes = (issues: Issue[]) => issues.map((i) => i.code);
const params = (p: VProperty | undefined) => Object.fromEntries(p?.params ?? []);
const first = (p: VProperty, name: string) => p.params.get(name)?.[0];
const names = (props: VProperty[]) =>
	props.map((p) => (p.group === null ? p.name : `${p.group}.${p.name}`));

function source(version: VCardVersion | null, ...lines: string[]): VCard {
	const head = version === null ? [] : [`VERSION:${version}`];
	const text = ["BEGIN:VCARD", ...head, ...lines, "END:VCARD"].join("\r\n");
	const card = parseVCards(text).cards[0];
	if (card === undefined) throw new Error(`no card parsed from ${text}`);
	return card;
}

/** Upgrades one card; `props` leaves FN out. */
function upgrade(version: VCardVersion | null, ...lines: string[]) {
	const result = upgradeTo40(source(version, "FN:A", ...lines));
	return {
		props: result.card.properties.filter((p) => p.name !== "FN"),
		issues: result.issues,
	};
}

function only(version: VCardVersion | null, ...lines: string[]): VProperty {
	const { props } = upgrade(version, ...lines);
	if (props.length !== 1) throw new Error(`expected one property, got ${names(props)}`);
	return props[0] as VProperty;
}

/** An AOSP row: MIME type then data1..data15, the trailing slots empty. */
function android(mime: string, ...data: string[]): string {
	const slots = [...data, ...Array<string>(15 - data.length).fill("")];
	return `X-ANDROID-CUSTOM:vnd.android.cursor.item/${mime};${slots.join(";")}`;
}

describe("relation table", () => {
	test("covers every Android type number once and maps Apple and Google labels", () => {
		expect(new Set(RELATION_TYPES.map((r) => r.android)).size).toBe(RELATION_TYPES.length);
		expect([...RELATION_TYPES.map((r) => r.android)].sort((a, b) => a - b)).toEqual(
			Array.from({ length: 15 }, (_, i) => i),
		);
		expect(relationTypeForAndroid(8)?.type).toBe("x-mother");
		expect(relationTypeForAndroid(12)?.type).toBe("kin");
		expect(relationTypeForAndroid(99)).toBeUndefined();
		expect(relationTypeForLabel("Mother")?.type).toBe("x-mother");
		expect(relationTypeForLabel("REFERRED_BY")?.type).toBe("x-referred-by");
		expect(relationTypeForLabel("domestic-partner")?.android).toBe(4);
		expect(relationTypeForLabel("RELATIVE")?.type).toBe("kin");
		expect(relationTypeForLabel("Other")).toBeUndefined();
	});
});

describe("Android X-ANDROID-CUSTOM", () => {
	test("nickname rows become NICKNAME with the vendor kind in X-KIND", () => {
		expect(only("2.1", android("nickname", "Bob", "1"))).toMatchObject({
			name: "NICKNAME",
			value: { kind: "text-list", values: ["Bob"] },
		});
		expect(params(only("2.1", android("nickname", "Bob", "1")))).toEqual({});
		expect(params(only("2.1", android("nickname", "Bob", "")))).toEqual({});
		expect(params(only("2.1", android("nickname", "Bob", "2")))).toEqual({
			"X-KIND": ["other"],
		});
		expect(params(only("2.1", android("nickname", "Bob", "3")))).toEqual({
			"X-KIND": ["maiden"],
		});
		expect(params(only("2.1", android("nickname", "Bob", "4")))).toEqual({
			"X-KIND": ["short"],
		});
		expect(params(only("2.1", android("nickname", "Bob", "5")))).toEqual({
			"X-KIND": ["initials"],
		});
		expect(params(only("2.1", android("nickname", "Bob", "0", "Gamer tag")))).toEqual({
			"X-KIND": ["custom:Gamer tag"],
		});
		expect(codes(upgrade("2.1", android("nickname", "Bob", "1")).issues)).toEqual([
			"android-nickname",
		]);
	});

	test("a quoted-printable row decodes and loses CHARSET and ENCODING", () => {
		const nick = only(
			"2.1",
			"X-ANDROID-CUSTOM;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:vnd.android.cursor.item/nickname;=41=6D=62=72=65=2D=C3=A9=6C=69=65;=31;;;;;;;;;;;;;",
		);
		expect(nick.value).toEqual({ kind: "text-list", values: ["Ambre-élie"] });
		expect(params(nick)).toEqual({});
	});

	test("rows with an empty name or an unknown type are kept raw", () => {
		expect(only("2.1", android("nickname", "", "1")).name).toBe("X-ANDROID-CUSTOM");
		const { props, issues } = upgrade("2.1", android("nickname", "Bob", "9"));
		expect(props[0]?.name).toBe("X-ANDROID-CUSTOM");
		expect(issues).toEqual([
			expect.objectContaining({ severity: "warning", code: "android-custom-unknown-type" }),
		]);
	});

	test("event rows: anniversary and birthday once, other kinds and duplicates stay raw", () => {
		const { props } = upgrade(
			"2.1",
			android("contact_event", "2015-03-04", "1"),
			android("contact_event", "2016-03-04", "1"),
			android("contact_event", "--03-05", "3"),
			android("contact_event", "2015-03-06", "2"),
			android("contact_event", "2015-03-07", "0", "Date Perso"),
		);
		expect(props.map((p) => p.name)).toEqual([
			"ANNIVERSARY",
			"X-ANDROID-CUSTOM",
			"BDAY",
			"X-ANDROID-CUSTOM",
			"X-ANDROID-CUSTOM",
		]);
		expect(props[0]?.value).toEqual({
			kind: "date-and-or-time",
			value: { year: 2015, month: 3, day: 4 },
			raw: "2015-03-04",
		});
		expect(props[2]?.value).toMatchObject({ value: { month: 3, day: 5 }, raw: "--03-05" });
	});

	test("a birthday row never overrides an existing BDAY; a bad date warns", () => {
		const kept = upgrade("2.1", "BDAY:1989-02-02", android("contact_event", "2015-03-04", "3"));
		expect(kept.props.map((p) => p.name)).toEqual(["BDAY", "X-ANDROID-CUSTOM"]);
		expect(kept.issues).toEqual([]);
		const bad = upgrade("2.1", android("contact_event", "next spring", "1"));
		expect(bad.props[0]?.name).toBe("X-ANDROID-CUSTOM");
		expect(bad.issues).toEqual([
			expect.objectContaining({ severity: "warning", code: "vendor-date-invalid" }),
		]);
	});

	test("relation rows become RELATED;VALUE=text with the mapped TYPE", () => {
		for (const relation of RELATION_TYPES.filter((r) => r.android !== 0)) {
			const related = only("2.1", android("relation", "Someone", String(relation.android)));
			expect(related, relation.type).toMatchObject({
				group: null,
				name: "RELATED",
				value: { kind: "text", value: "Someone" },
			});
			expect(params(related), relation.type).toEqual({
				TYPE: [relation.type],
				VALUE: ["text"],
			});
		}
	});

	test("a custom relation gets x-custom and its label as a grouped X-ABLabel", () => {
		const { props, issues } = upgrade(
			"2.1",
			"item2.TEL:1",
			android("relation", "Bob", "0", "Roommate"),
			android("relation", "Eve", "0", ""),
		);
		expect(names(props)).toEqual(["item2.TEL", "item3.RELATED", "item3.X-ABLABEL", "RELATED"]);
		expect(params(props[1])).toEqual({ TYPE: ["x-custom"], VALUE: ["text"] });
		expect(props[2]?.value).toEqual({ kind: "text", value: "Roommate" });
		expect(params(props[3])).toEqual({ TYPE: ["x-custom"], VALUE: ["text"] });
		expect(codes(issues)).toEqual(["android-relation", "android-relation"]);
	});

	test("unknown relation types and other MIME types are kept raw", () => {
		const { props, issues } = upgrade(
			"2.1",
			android("relation", "Bob", "42"),
			android("group_membership", "7"),
			"X-ANDROID-CUSTOM:not a mime;x",
		);
		expect(props.map((p) => p.name)).toEqual([
			"X-ANDROID-CUSTOM",
			"X-ANDROID-CUSTOM",
			"X-ANDROID-CUSTOM",
		]);
		expect(codes(issues)).toEqual(["android-custom-unknown-type"]);
	});
});

describe("legacy instant messaging", () => {
	test.each([
		["X-AIM", "AIM", "aim"],
		["X-MSN", "MSN", "msnim"],
		["X-YAHOO", "Yahoo", "ymsgr"],
		["X-ICQ", "ICQ", "icq"],
		["X-JABBER", "Jabber", "xmpp"],
		["X-SKYPE", "Skype", "skype"],
		["X-SKYPE-USERNAME", "Skype", "skype"],
		["X-GOOGLE-TALK", "GoogleTalk", "xmpp"],
		["X-GTALK", "GoogleTalk", "xmpp"],
		["X-QQ", "QQ", "qq"],
		["X-NETMEETING", "NetMeeting", "callto"],
	])("%s becomes IMPP;SERVICE-TYPE=%s with a %s: URI", (name, service, scheme) => {
		const impp = only("3.0", `${name};TYPE=home;TYPE=pref:some.one`);
		expect(impp).toMatchObject({
			name: "IMPP",
			value: { kind: "uri", value: `${scheme}:some.one` },
		});
		expect(params(impp)).toEqual({ TYPE: ["home"], PREF: ["1"], "SERVICE-TYPE": [service] });
	});

	test("handles are percent-encoded, an existing scheme is not doubled, empty ones stay", () => {
		expect(only("3.0", "X-SKYPE:some one").value).toEqual({
			kind: "uri",
			value: "skype:some%20one",
		});
		expect(only("3.0", "X-SKYPE:skype:someone").value).toEqual({
			kind: "uri",
			value: "skype:someone",
		});
		expect(only("3.0", "X-JABBER:user@example.org").value).toEqual({
			kind: "uri",
			value: "xmpp:user@example.org",
		});
		expect(only("3.0", "X-AIM:").name).toBe("X-AIM");
	});

	test("URI delimiters in a handle are encoded so the URI decodes back to the handle", () => {
		expect(only("3.0", "X-AIM:bob#1").value).toEqual({ kind: "uri", value: "aim:bob%231" });
		expect(only("3.0", "X-ICQ:50%").value).toEqual({ kind: "uri", value: "icq:50%25" });
		expect(only("3.0", "X-JABBER:a%40b@x?y").value).toEqual({
			kind: "uri",
			value: "xmpp:a%2540b@x%3Fy",
		});
		expect(only("3.0", "X-SKYPE:éà").value).toEqual({
			kind: "uri",
			value: "skype:%C3%A9%C3%A0",
		});
	});

	test("a handle that cannot be a URI is kept with a warning", () => {
		const card = source("3.0", "FN:A", "X-AIM:x");
		const aim = card.properties.find((p) => p.name === "X-AIM");
		if (aim !== undefined) aim.value = { kind: "text", value: "lone \ud800 surrogate" };
		const { issues, card: result } = upgradeTo40(card);
		expect(result.properties.map((p) => p.name)).toEqual(["FN", "X-AIM"]);
		expect(issues).toEqual([
			expect.objectContaining({ severity: "warning", code: "impp-handle-invalid" }),
		]);
	});

	test("X-SIP, X-SKYPE-PSTNNUMBER and X-TWITTER have their own targets", () => {
		const sip = only("2.1", "X-SIP:appel-internet");
		expect(sip).toMatchObject({
			name: "IMPP",
			value: { kind: "uri", value: "sip:appel-internet" },
		});
		expect(params(sip)).toEqual({});
		expect(only("2.1", "X-SIP:sip:a@b").value).toEqual({ kind: "uri", value: "sip:a@b" });
		const tel = only("2.1", "X-SKYPE-PSTNNUMBER:+1 555");
		expect(tel).toMatchObject({ name: "TEL", value: { kind: "text", value: "+1 555" } });
		expect(params(tel)).toEqual({ TYPE: ["x-skype"] });
		const twitter = only("3.0", "X-TWITTER:jack");
		expect(twitter).toMatchObject({
			name: "SOCIALPROFILE",
			value: { kind: "text", value: "jack" },
		});
		expect(params(twitter)).toEqual({ "SERVICE-TYPE": ["Twitter"], VALUE: ["text"] });
		// One code per target, so a string table can say what the property became.
		expect(
			["X-SIP:a", "X-SKYPE-PSTNNUMBER:+1", "X-TWITTER:jack"].map(
				(line) => upgrade("3.0", line).issues[0]?.code,
			),
		).toEqual(["legacy-im-to-impp", "legacy-im-to-tel", "legacy-im-to-socialprofile"]);
	});

	test("Apple's X-SERVICE-TYPE on IMPP becomes SERVICE-TYPE", () => {
		const impp = only("3.0", "item1.IMPP;X-SERVICE-TYPE=Skype;type=pref:skype:user");
		expect(params(impp)).toEqual({ PREF: ["1"], "SERVICE-TYPE": ["Skype"] });
		expect(params(only("3.0", "IMPP;X-SERVICE-TYPE=Skype;SERVICE-TYPE=Other:skype:u"))).toEqual(
			{
				"SERVICE-TYPE": ["Other"],
			},
		);
	});
});

describe("Apple dates", () => {
	test("the placeholder year 1604 is dropped, flagged or not", () => {
		const flagged = only("3.0", "BDAY;X-APPLE-OMIT-YEAR=1604:1604-04-15");
		expect(flagged.value).toEqual({
			kind: "date-and-or-time",
			value: { month: 4, day: 15 },
			raw: "--0415",
		});
		expect(params(flagged)).toEqual({});
		expect(only("3.0", "BDAY;value=date:1604-02-02").value).toMatchObject({ raw: "--0202" });
		expect(only("3.0", "item1.X-ABDATE:1604-12-25").value).toMatchObject({ raw: "--1225" });
		expect(codes(upgrade("3.0", "BDAY:1604-02-02").issues)).toEqual(["omit-year"]);
	});

	test("a real year, a mismatched flag or a bare year are left alone", () => {
		expect(only("3.0", "BDAY:1985-04-12").value).toMatchObject({ value: { year: 1985 } });
		expect(only("3.0", "BDAY;X-APPLE-OMIT-YEAR=1604:2015-04-12").value).toMatchObject({
			value: { year: 2015 },
		});
		expect(params(only("3.0", "BDAY;X-APPLE-OMIT-YEAR=1604:2015-04-12"))).toEqual({
			"X-APPLE-OMIT-YEAR": ["1604"],
		});
		expect(only("3.0", "BDAY:1604").value).toMatchObject({ value: { year: 1604 } });
	});

	test("X-ABDATE labelled Anniversary is the ANNIVERSARY; other dates stay with their label", () => {
		const { props, issues } = upgrade(
			"3.0",
			"item1.X-ABDATE;type=pref:2013-03-12",
			"item1.X-ABLabel:_$!<Anniversary>!$_",
			"item2.X-ABDATE:2012-03-12",
			"item2.X-ABLabel:_$!<Other>!$_",
			"item3.X-ABDATE:2006-03-12",
			"item3.X-ABLabel:Customdate",
			"item4.X-ABDATE:2001-01-01",
			"item4.X-ABLabel:_$!<Anniversary>!$_",
		);
		expect(names(props)).toEqual([
			"item1.ANNIVERSARY",
			"item2.X-ABDATE",
			"item2.X-ABLABEL",
			"item3.X-ABDATE",
			"item3.X-ABLABEL",
			"item4.X-ABDATE",
			"item4.X-ABLABEL",
		]);
		expect(params(props[0])).toEqual({ PREF: ["1"] });
		expect(codes(issues)).toEqual(["pref-to-param", "abdate-to-anniversary"]);
	});
});

describe("Apple related names", () => {
	test("built-in and Google labels map to a TYPE and are consumed", () => {
		const { props } = upgrade(
			"3.0",
			"item1.X-ABRELATEDNAMES;type=pref:Mum",
			"item1.X-ABLabel:_$!<Mother>!$_",
			"item2.X-ABRELATEDNAMES:Cousin",
			"item2.X-ABLabel:RELATIVE",
		);
		expect(names(props)).toEqual(["item1.RELATED", "item2.RELATED"]);
		expect(params(props[0])).toEqual({ PREF: ["1"], TYPE: ["x-mother"], VALUE: ["text"] });
		expect(props[0]?.value).toEqual({ kind: "text", value: "Mum" });
		expect(params(props[1])).toEqual({ TYPE: ["kin"], VALUE: ["text"] });
	});

	test("Other has no TYPE, custom text keeps its label as x-custom, no label no TYPE", () => {
		const { props } = upgrade(
			"3.0",
			"item1.X-ABRELATEDNAMES:Someone",
			"item1.X-ABLabel:_$!<Other>!$_",
			"item2.X-ABRELATEDNAMES:Bob",
			"item2.X-ABLabel:Roommate",
			"X-ABRELATEDNAMES:Eve",
		);
		expect(names(props)).toEqual([
			"item1.RELATED",
			"item2.RELATED",
			"item2.X-ABLABEL",
			"RELATED",
		]);
		expect(params(props[0])).toEqual({ VALUE: ["text"] });
		expect(params(props[1])).toEqual({ TYPE: ["x-custom"], VALUE: ["text"] });
		expect(params(props[3])).toEqual({ VALUE: ["text"] });
	});

	test("an existing TYPE is kept beside the relation type", () => {
		const related = only(
			"3.0",
			"item1.X-ABRELATEDNAMES;TYPE=home:Jane",
			"item1.X-ABLabel:_$!<Mother>!$_",
		);
		expect(params(related)).toEqual({ TYPE: ["home", "x-mother"], VALUE: ["text"] });
		const custom = upgrade(
			"3.0",
			"item1.X-ABRELATEDNAMES;TYPE=home:Jo",
			"item1.X-ABLabel:Roommate",
		).props[0];
		expect(params(custom)).toEqual({ TYPE: ["home", "x-custom"], VALUE: ["text"] });
	});
});

describe("Apple social profiles, countries, groups and company flag", () => {
	test("X-SOCIALPROFILE becomes SOCIALPROFILE with SERVICE-TYPE and USERNAME", () => {
		const twitter = only(
			"3.0",
			"X-SOCIALPROFILE;type=twitter;x-user=jack:http://twitter.com/jack",
		);
		expect(twitter).toMatchObject({
			name: "SOCIALPROFILE",
			value: { kind: "uri", value: "http://twitter.com/jack" },
		});
		expect(params(twitter)).toEqual({ "SERVICE-TYPE": ["Twitter"], USERNAME: ["jack"] });
		expect(
			params(only("3.0", "X-SOCIALPROFILE;type=linkedin;x-user=u:http://l/u")),
		).toMatchObject({
			"SERVICE-TYPE": ["LinkedIn"],
		});
		const bare = only("3.0", "X-SOCIALPROFILE;TYPE=facebook;x-userid=1:someone");
		expect(bare.value).toEqual({ kind: "text", value: "someone" });
		expect(params(bare)).toEqual({
			"X-USERID": ["1"],
			"SERVICE-TYPE": ["Facebook"],
			VALUE: ["text"],
		});
	});

	test("X-ABADR becomes CC on the grouped ADR", () => {
		const { props, issues } = upgrade(
			"3.0",
			"item1.ADR;type=HOME:;;1;;;;",
			"item1.X-ABADR:fr",
			"item2.X-ABADR:de",
			"item3.ADR:;;2;;;;",
			"item3.X-ABADR:usa",
		);
		expect(names(props)).toEqual(["item1.ADR", "item2.X-ABADR", "item3.ADR", "item3.X-ABADR"]);
		expect(params(props[0])).toEqual({ TYPE: ["home"], CC: ["FR"] });
		expect(codes(issues)).toEqual(["abadr-to-cc", "abadr-invalid"]);
	});

	test("X-ABShowAs:COMPANY is KIND:org unless a KIND says otherwise", () => {
		expect(only("3.0", "X-ABShowAs:COMPANY")).toMatchObject({
			name: "KIND",
			value: { kind: "text", value: "org" },
		});
		expect(upgrade("3.0", "KIND:org", "X-ABShowAs:COMPANY").props.map((p) => p.name)).toEqual([
			"KIND",
		]);
		expect(
			upgrade("3.0", "KIND:individual", "X-ABShowAs:COMPANY").props.map((p) => p.name),
		).toEqual(["KIND", "X-ABSHOWAS"]);
		expect(only("3.0", "X-ABShowAs:PERSON").name).toBe("X-ABSHOWAS");
	});

	test("X-ADDRESSBOOKSERVER-KIND and -MEMBER become KIND and MEMBER", () => {
		const { props, issues } = upgrade(
			"3.0",
			"X-ADDRESSBOOKSERVER-KIND:Group",
			"X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:1",
			"X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:2",
		);
		expect(props.map((p) => p.name)).toEqual(["KIND", "MEMBER", "MEMBER"]);
		expect(props[0]?.value).toEqual({ kind: "text", value: "group" });
		expect(props[1]?.value).toEqual({ kind: "uri", value: "urn:uuid:1" });
		expect(codes(issues)).toEqual(Array<string>(3).fill("x-addressbookserver"));
		expect(
			upgrade("4.0", "KIND:org", "X-ADDRESSBOOKSERVER-KIND:group").props.map((p) => p.name),
		).toEqual(["KIND", "X-ADDRESSBOOKSERVER-KIND"]);
	});
});

describe("legacy gender", () => {
	test("X-WAB-GENDER numbers and X-GENDER words become GENDER", () => {
		expect(only("2.1", "X-WAB-GENDER:1")).toMatchObject({
			name: "GENDER",
			value: { kind: "structured", components: [["F"]] },
		});
		expect(only("2.1", "X-WAB-GENDER:2").value).toEqual({
			kind: "structured",
			components: [["M"]],
		});
		expect(only("3.0", "X-GENDER:Male").value).toEqual({
			kind: "structured",
			components: [["M"]],
		});
		expect(only("3.0", "X-GENDER:unknown").value).toEqual({
			kind: "structured",
			components: [["U"]],
		});
	});

	test("unspecified stays silently, nonsense warns, an existing GENDER wins", () => {
		expect(upgrade("2.1", "X-WAB-GENDER:0").issues).toEqual([]);
		expect(only("2.1", "X-WAB-GENDER:0").name).toBe("X-WAB-GENDER");
		const bad = upgrade("2.1", "X-WAB-GENDER:7");
		expect(bad.props[0]?.name).toBe("X-WAB-GENDER");
		expect(bad.issues).toEqual([
			expect.objectContaining({ severity: "warning", code: "x-gender-invalid" }),
		]);
		expect(upgrade("4.0", "GENDER:F", "X-GENDER:Male").props.map((p) => p.name)).toEqual([
			"GENDER",
			"X-GENDER",
		]);
	});
});

describe("Apple labels", () => {
	test("built-ins with a TYPE meaning move onto the grouped property", () => {
		const { props, issues } = upgrade(
			"3.0",
			"item1.EMAIL;type=INTERNET;type=HOME:a@b",
			"item1.X-ABLabel:_$!<Home>!$_",
			"item2.TEL:1",
			"item2.X-ABLabel:_$!<Mobile>!$_",
			"item3.TEL:2",
			"item3.X-ABLabel:_$!<Main>!$_",
			"item4.URL:http://w",
			"item4.X-ABLabel:_$!<Work>!$_",
		);
		expect(names(props)).toEqual(["item1.EMAIL", "item2.TEL", "item3.TEL", "item4.URL"]);
		expect(params(props[0])).toEqual({ TYPE: ["home"] });
		expect(params(props[1])).toEqual({ TYPE: ["cell"] });
		expect(params(props[2])).toEqual({ TYPE: ["main"] });
		expect(params(props[3])).toEqual({ TYPE: ["work"] });
		expect(codes(issues)).toEqual([
			"type-dropped",
			...Array<string>(4).fill("ablabel-to-type"),
		]);
	});

	test("HomePage, Other, empty and redundant IMPP labels are dropped", () => {
		const { props, issues } = upgrade(
			"3.0",
			"item1.URL;type=pref:http://h",
			"item1.X-ABLabel:_$!<HomePage>!$_",
			"item2.EMAIL:a@b",
			"item2.X-ABLabel:_$!<Other>!$_",
			"item3.TEL:1",
			"item3.X-ABLabel:",
			"item4.IMPP;X-SERVICE-TYPE=Skype:skype:u",
			"item4.X-ABLabel:skype",
			"item5.X-MSN:u",
			"item5.X-ABLabel:MSN",
		);
		expect(names(props)).toEqual([
			"item1.URL",
			"item2.EMAIL",
			"item3.TEL",
			"item4.IMPP",
			"item5.IMPP",
		]);
		expect(params(props[0])).toEqual({ PREF: ["1"] });
		expect(codes(issues).filter((c) => c === "ablabel-dropped")).toHaveLength(5);
	});

	test("custom text, orphans, unknown built-ins and labels on raw X- properties are kept", () => {
		const { props, issues } = upgrade(
			"3.0",
			"item1.TEL:1",
			"item1.X-ABLabel:Customphone",
			"item2.X-ABLabel:_$!<Home>!$_",
			"item3.TEL:2",
			"item3.X-ABLabel:_$!<School>!$_",
			"item4.X-FOO:bar",
			"item4.X-ABLabel:_$!<Home>!$_",
			"item5.X-ABLabel:Boss",
		);
		expect(names(props)).toEqual([
			"item1.TEL",
			"item1.X-ABLABEL",
			"item2.X-ABLABEL",
			"item3.TEL",
			"item3.X-ABLABEL",
			"item4.X-FOO",
			"item4.X-ABLABEL",
			"item5.X-ABLABEL",
		]);
		expect(params(props[3])).toEqual({});
		expect(params(props[5])).toEqual({});
		expect(issues).toEqual([
			expect.objectContaining({
				severity: "warning",
				code: "ablabel-orphan",
				property: "item2.X-ABLABEL",
			}),
			expect.objectContaining({
				severity: "warning",
				code: "ablabel-orphan",
				property: "item5.X-ABLABEL",
			}),
		]);
	});
});

describe("review regressions", () => {
	test("event rows of every type must carry a date, even those kept raw", () => {
		const { props, issues } = upgrade(
			"2.1",
			android("contact_event", "soon", "2", "x"),
			android("contact_event", "2015-01-01", "9"),
		);
		expect(props.map((p) => p.name)).toEqual(["X-ANDROID-CUSTOM", "X-ANDROID-CUSTOM"]);
		expect(codes(issues)).toEqual(["vendor-date-invalid", "android-custom-unknown-type"]);
	});

	test("a custom nickname without a label is X-KIND=custom", () => {
		expect(params(only("2.1", android("nickname", "Bob", "0")))).toEqual({
			"X-KIND": ["custom"],
		});
	});

	test("the social profile service is the TYPE that is not a place", () => {
		const p = only("3.0", "X-SOCIALPROFILE;type=home;type=twitter;x-user=u:http://t/u");
		expect(params(p)).toEqual({ TYPE: ["home"], "SERVICE-TYPE": ["Twitter"], USERNAME: ["u"] });
	});

	test("two related names sharing one label both get its TYPE", () => {
		const { props } = upgrade(
			"3.0",
			"item1.X-ABRELATEDNAMES:A",
			"item1.X-ABRELATEDNAMES:B",
			"item1.X-ABLabel:_$!<Mother>!$_",
		);
		expect(props.map((p) => [p.name, first(p, "TYPE")])).toEqual([
			["RELATED", "x-mother"],
			["RELATED", "x-mother"],
		]);
	});

	test("the 1604 placeholder is only looked for on date properties", () => {
		expect(only("3.0", "REV:1604-01-01").value).toMatchObject({ value: { year: 1604 } });
	});

	test("a date with no form without its year is kept with a warning", () => {
		const card = source("3.0", "FN:A", "BDAY:1604-04-15");
		const bday = card.properties.find((p) => p.name === "BDAY");
		if (bday !== undefined) {
			bday.value = {
				kind: "date-and-or-time",
				value: { year: 1604, month: 4, hour: 10 },
				raw: "x",
			};
		}
		const { issues, card: result } = upgradeTo40(card);
		expect(result.properties.find((p) => p.name === "BDAY")?.value).toMatchObject({
			value: { year: 1604 },
		});
		expect(codes(issues)).toEqual(["omit-year-invalid"]);
	});
});
