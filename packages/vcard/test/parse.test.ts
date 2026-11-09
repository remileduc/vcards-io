import { describe, expect, test } from "vitest";
import {
	encodeBase64,
	type Issue,
	parseVCards,
	type VCardVersion,
	type VProperty,
	type VValue,
} from "../src/index.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const codes = (issues: Issue[]) => issues.map((i) => i.code);

function card(version: VCardVersion | null, ...lines: string[]): string {
	const head = version === null ? [] : [`VERSION:${version}`];
	return ["BEGIN:VCARD", ...head, ...lines, "END:VCARD"].join("\r\n");
}

/** Properties of one card, VERSION excluded. */
function props(version: VCardVersion, ...lines: string[]): VProperty[] {
	return (parseVCards(card(version, ...lines)).cards[0]?.properties ?? []).filter(
		(p) => p.name !== "VERSION",
	);
}

function value(version: VCardVersion, line: string): VValue {
	const property = props(version, line)[0];
	if (property === undefined) throw new Error(`no property parsed from ${line}`);
	return property.value;
}

function issuesOf(version: VCardVersion, ...lines: string[]): Issue[] {
	return parseVCards(card(version, ...lines)).issues;
}

function concat(...parts: (string | number[])[]): Uint8Array {
	const chunks = parts.map((p) => (typeof p === "string" ? utf8(p) : new Uint8Array(p)));
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out;
}

describe("parseVCards", () => {
	test("returns cards in order with their version, VERSION kept among the properties", () => {
		const { cards, issues } = parseVCards(
			`${card("3.0", "FN:A", "item1.TEL;TYPE=cell:+1")}\r\n${card(null, "FN:B", "TEL;CELL:+2")}`,
		);
		expect(cards.map((c) => c.version)).toEqual(["3.0", "2.1"]);
		expect(cards[0]?.properties).toEqual([
			{
				group: null,
				name: "VERSION",
				params: new Map(),
				value: { kind: "text", value: "3.0" },
				line: 2,
			},
			{
				group: null,
				name: "FN",
				params: new Map(),
				value: { kind: "text", value: "A" },
				line: 3,
			},
			{
				group: "item1",
				name: "TEL",
				params: new Map([["TYPE", ["cell"]]]),
				value: { kind: "text", value: "+1" },
				line: 4,
			},
		]);
		expect(codes(issues)).toEqual(["version-missing"]);
	});

	test("accepts a string, bytes or an ArrayBuffer", () => {
		const text = card("4.0", "FN:Zoë");
		const bytes = utf8(text);
		for (const input of [text, bytes, bytes.buffer as ArrayBuffer]) {
			expect(parseVCards(input).cards[0]?.properties[1]?.value).toEqual({
				kind: "text",
				value: "Zoë",
			});
		}
	});

	test("empty input is no cards and no issues", () => {
		expect(parseVCards("")).toEqual({ cards: [], issues: [] });
		expect(parseVCards(new Uint8Array(0))).toEqual({ cards: [], issues: [] });
	});

	test("rejects an unknown default charset as a programming error", () => {
		expect(() => parseVCards("", { defaultCharset: "bogus" })).toThrow(RangeError);
	});
});

describe("parameters", () => {
	test("merges repeated parameters and lowercases TYPE values, except X- custom labels", () => {
		const [tel] = props("3.0", "TEL;type=CELL;type=VOICE;TYPE=X-Custom Label;pref=1:+1");
		expect(tel?.params).toEqual(
			new Map([
				["TYPE", ["cell", "voice", "X-Custom Label"]],
				["PREF", ["1"]],
			]),
		);
	});

	test("a quoted TYPE is still a comma list, as the RFC 6350 author's card writes it", () => {
		expect(props("4.0", 'TEL;TYPE="work,voice";PREF=1:tel:+1')[0]?.params.get("TYPE")).toEqual([
			"work",
			"voice",
		]);
		expect(props("3.0", 'ADR;LABEL="a, b";TYPE="home, X-Lab":;;x')[0]?.params).toEqual(
			new Map([
				["LABEL", ["a, b"]],
				["TYPE", ["home", "X-Lab"]],
			]),
		);
	});

	test("2.1 bare words are kept as the parameters they stand for", () => {
		expect(props("2.1", "TEL;CELL;PREF:1")[0]?.params).toEqual(
			new Map([["TYPE", ["cell", "pref"]]]),
		);
		expect(props("2.1", "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:a;b")[0]?.params).toEqual(
			new Map([
				["CHARSET", ["UTF-8"]],
				["ENCODING", ["QUOTED-PRINTABLE"]],
			]),
		);
	});

	test("caret-decodes parameter values in 4.0 only", () => {
		const line = 'ADR;LABEL="1^n2^\'x^^y":;;Main';
		expect(props("4.0", line)[0]?.params.get("LABEL")).toEqual(['1\n2"x^y']);
		expect(props("3.0", line)[0]?.params.get("LABEL")).toEqual(["1^n2^'x^^y"]);
	});

	test("drops empty parameter values", () => {
		expect(props("3.0", "TEL;TYPE=:1")[0]?.params.size).toBe(0);
		expect(props("3.0", "TEL;TYPE=,cell:1")[0]?.params.get("TYPE")).toEqual(["cell"]);
	});

	test("decodes parameter values with the line's charset", () => {
		const input = concat(
			"BEGIN:VCARD\r\nVERSION:2.1\r\nTEL;CHARSET=ISO-8859-1;X-",
			[0xc9],
			"t:1\r\nEND:VCARD",
		);
		const { cards, issues } = parseVCards(input);
		expect(cards[0]?.properties[1]?.params.get("TYPE")).toEqual(["X-Ét"]);
		expect(issues).toEqual([]);
	});
});

describe("encodings and charsets", () => {
	test("decodes quoted-printable in 2.1 and 3.0, then applies the charset", () => {
		expect(
			value(
				"2.1",
				"N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=54=65=73=74=C3=A9;=52=C3=A9=6D=69;;;",
			),
		).toEqual({ kind: "structured", components: [["Testé"], ["Rémi"], [""], [""], [""]] });
		expect(value("3.0", "NOTE;ENCODING=QUOTED-PRINTABLE:a=3Db")).toEqual({
			kind: "text",
			value: "a=b",
		});
		expect(value("2.1", "NOTE;ENCODING=QUOTED-PRINTABLE:abc=\r\ndef")).toEqual({
			kind: "text",
			value: "abcdef",
		});
	});

	test("decodes base64 into binary, media type sniffed from the bytes first", () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
		const [photo] = props("2.1", `PHOTO;ENCODING=BASE64;JPEG:${encodeBase64(jpeg)}`);
		expect(photo?.value).toEqual({ kind: "binary", data: jpeg, mediaType: "image/jpeg" });
		expect(photo?.params.get("TYPE")).toEqual(["jpeg"]);
		expect(value("3.0", `PHOTO;ENCODING=b;TYPE=PNG:${encodeBase64(jpeg)}`)).toMatchObject({
			mediaType: "image/jpeg",
		});
	});

	test("falls back to the declared media type when the bytes are not an image", () => {
		const data = encodeBase64(new Uint8Array([1, 2, 3]));
		expect(value("3.0", `PHOTO;ENCODING=b;TYPE=JPEG:${data}`)).toMatchObject({
			mediaType: "image/jpeg",
		});
		expect(value("3.0", `SOUND;ENCODING=b;TYPE=WAVE:${data}`)).toMatchObject({
			mediaType: "audio/wav",
		});
		expect(value("3.0", `KEY;ENCODING=b;TYPE=application/pgp-keys:${data}`)).toMatchObject({
			mediaType: "application/pgp-keys",
		});
		expect(
			value("3.0", `PHOTO;ENCODING=b;MEDIATYPE=image/x-foo;TYPE=JPEG:${data}`),
		).toMatchObject({ mediaType: "image/x-foo" });
		expect(
			value("3.0", `KEY;ENCODING=b;MEDIATYPE="Application/PGP-Keys; version=1":${data}`),
		).toMatchObject({ mediaType: "application/pgp-keys;version=1" });
		expect(value("3.0", `KEY;ENCODING=b;MEDIATYPE="a/b;,c";TYPE=PGP:${data}`)).toMatchObject({
			mediaType: "application/pgp-keys",
		});
		expect(value("3.0", `KEY;ENCODING=b:${data}`)).toEqual({
			kind: "binary",
			data: new Uint8Array([1, 2, 3]),
		});
	});

	test("accepts base64 without padding and reports corrupted base64, keeping the text", () => {
		expect(value("3.0", "PHOTO;ENCODING=b:/9j/4AAQ")).toMatchObject({ kind: "binary" });
		const { cards, issues } = parseVCards(card("3.0", "PHOTO;ENCODING=b:/9j/4AA!Q"));
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "unknown", raw: "/9j/4AA!Q" });
		expect(issues).toEqual([
			expect.objectContaining({
				severity: "warning",
				code: "invalid-base64",
				line: 3,
				property: "PHOTO",
			}),
		]);
	});

	test("7BIT and 8BIT are silent, any other ENCODING is reported and ignored", () => {
		expect(issuesOf("3.0", "NOTE;ENCODING=8BIT:a", "NOTE;ENCODING=7bit:b")).toEqual([]);
		expect(value("3.0", "NOTE;ENCODING=X-FOO:a")).toEqual({ kind: "text", value: "a" });
		expect(codes(issuesOf("3.0", "NOTE;ENCODING=X-FOO:a"))).toEqual(["encoding-unknown"]);
	});

	test("decodes bytes that are not valid in the charset as windows-1252, with a warning", () => {
		const latin1 = concat(
			"BEGIN:VCARD\r\nVERSION:2.1\r\nFN:caf",
			[0xe9],
			"\r\nNOTE;CHARSET=UTF-8:",
			[0xe9],
			"\r\nEND:VCARD",
		);
		const { cards, issues } = parseVCards(latin1);
		expect(cards[0]?.properties.slice(1).map((p) => p.value)).toEqual([
			{ kind: "text", value: "café" },
			{ kind: "text", value: "é" },
		]);
		expect(issues).toEqual([
			expect.objectContaining({ code: "charset-fallback", line: 3, property: "FN" }),
			expect.objectContaining({ code: "charset-fallback", line: 4, property: "NOTE" }),
		]);
		const asLatin1 = parseVCards(latin1, { defaultCharset: "iso-8859-1" });
		expect(asLatin1.cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "café" });
		expect(asLatin1.issues).toEqual([
			expect.objectContaining({ code: "charset-fallback", line: 4 }),
		]);
	});

	test("honours a declared legacy charset and reports an unknown one", () => {
		const shiftJis = concat(
			"BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=SHIFT_JIS:",
			[0x93, 0xfa, 0x96, 0x7b],
			"\r\nEND:VCARD",
		);
		expect(parseVCards(shiftJis).cards[0]?.properties[1]?.value).toEqual({
			kind: "text",
			value: "日本",
		});
		const { cards, issues } = parseVCards(card("2.1", "FN;CHARSET=X-BOGUS:a"));
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "a" });
		expect(issues).toEqual([
			expect.objectContaining({ code: "charset-unknown", property: "FN" }),
		]);
	});

	test("keeps a byte order mark inside a value", () => {
		expect(value("4.0", "NOTE:\uFEFFx")).toEqual({ kind: "text", value: "\uFEFFx" });
	});
});

describe("typing", () => {
	test("unescapes text once in 3.0 and 4.0, keeps 2.1 text as written like AOSP", () => {
		const line = "NOTE:a\\nb\\, c\\; d\\\\ e\\:f\\Ng";
		const unescaped = { kind: "text", value: "a\nb, c; d\\ e:f\ng" };
		expect(value("3.0", line)).toEqual(unescaped);
		expect(value("4.0", line)).toEqual(unescaped);
		expect(value("2.1", line)).toEqual({ kind: "text", value: line.slice(5) });
	});

	test("splits structured values on unescaped semicolons, comma lists only where the RFC has them", () => {
		expect(value("3.0", "N:Doe;John,Johnny;;Dr.;")).toEqual({
			kind: "structured",
			components: [["Doe"], ["John", "Johnny"], [""], ["Dr."], [""]],
		});
		expect(value("4.0", "N:Doe\\;Jr;John\\,Jr")).toEqual({
			kind: "structured",
			components: [["Doe;Jr"], ["John,Jr"]],
		});
		expect(value("3.0", "ORG:ACME, Inc.;Sales\\;West")).toEqual({
			kind: "structured",
			components: [["ACME, Inc."], ["Sales;West"]],
		});
		expect(value("2.1", "N:Doe\\;Jr;John, Jr;;;")).toEqual({
			kind: "structured",
			components: [["Doe;Jr"], ["John, Jr"], [""], [""], [""]],
		});
		const android = value(
			"2.1",
			"X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Zoe, Jr;1;;;;;;;;;;;;;",
		);
		expect(android.kind).toBe("structured");
		if (android.kind === "structured") {
			expect(android.components).toHaveLength(16);
			expect(android.components.slice(0, 3)).toEqual([
				["vnd.android.cursor.item/nickname"],
				["Zoe, Jr"],
				["1"],
			]);
		}
	});

	test("splits text lists on unescaped commas", () => {
		expect(value("3.0", "CATEGORIES:a,b\\,c, d")).toEqual({
			kind: "text-list",
			values: ["a", "b,c", " d"],
		});
		expect(value("4.0", "NICKNAME:Jim,Jimmie")).toEqual({
			kind: "text-list",
			values: ["Jim", "Jimmie"],
		});
	});

	test("never unescapes URIs, except Google's escaped colon which is repaired with a warning", () => {
		expect(value("3.0", "URL:http://x/a\\,b;c")).toEqual({
			kind: "uri",
			value: "http://x/a\\,b;c",
		});
		expect(issuesOf("3.0", "URL:http://x/a\\,b")).toEqual([]);
		const { cards, issues } = parseVCards(card("3.0", "item1.URL:http\\://x"));
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "uri", value: "http://x" });
		expect(issues).toEqual([
			expect.objectContaining({ code: "uri-escaped-colon", line: 3, property: "item1.URL" }),
		]);
	});

	test("VALUE selects the kind, VALUE=text keeps the registry structure", () => {
		expect(value("3.0", "TEL;VALUE=uri:tel:+1")).toEqual({ kind: "uri", value: "tel:+1" });
		expect(value("2.1", "URL;VALUE=URL:http://x")).toEqual({ kind: "uri", value: "http://x" });
		expect(value("4.0", "N;VALUE=text:a;b").kind).toBe("structured");
		expect(value("4.0", "CATEGORIES;VALUE=text:a,b").kind).toBe("text-list");
		expect(value("4.0", "BDAY;VALUE=text:circa 1800")).toEqual({
			kind: "text",
			value: "circa 1800",
		});
		expect(value("4.0", "X-FOO;VALUE=integer:42")).toEqual({ kind: "integer", value: 42 });
		expect(value("4.0", "X-FOO;VALUE=float:-1.5")).toEqual({ kind: "float", value: -1.5 });
		expect(value("4.0", "X-FOO;VALUE=boolean:TRUE")).toEqual({ kind: "boolean", value: true });
		expect(value("4.0", "X-FOO;VALUE=language-tag:fr-CA")).toEqual({
			kind: "language-tag",
			value: "fr-CA",
		});
		expect(value("4.0", "X-FOO;VALUE=utc-offset:+0530")).toEqual({
			kind: "utc-offset",
			sign: 1,
			hours: 5,
			minutes: 30,
		});
		expect(value("4.0", "X-FOO;VALUE=timestamp:20150206T073347Z").kind).toBe("timestamp");
		expect(value("4.0", "X-FOO;VALUE=date:--0412").kind).toBe("date-and-or-time");
		// VALUE=binary / vcard say nothing the registry does not: no issue, registry default.
		expect(value("3.0", "AGENT;VALUE=vcard:x")).toEqual({ kind: "text", value: "x" });
		expect(issuesOf("3.0", "AGENT;VALUE=vcard:x")).toEqual([]);
	});

	test("an unknown VALUE is reported and ignored", () => {
		const { cards, issues } = parseVCards(card("4.0", "NOTE;VALUE=bogus:x"));
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "x" });
		expect(issues).toEqual([
			expect.objectContaining({ code: "value-type-unknown", property: "NOTE" }),
		]);
	});

	test("known properties outside their version are read as in their nearest version, with an info", () => {
		expect(value("2.1", "NICKNAME:a,b")).toEqual({ kind: "text-list", values: ["a", "b"] });
		expect(value("4.0", "LABEL:x\\ny")).toEqual({ kind: "text", value: "x\ny" });
		expect(issuesOf("4.0", "LABEL:x")).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "property-not-in-version",
				property: "LABEL",
			}),
		]);
	});

	test("unknown properties keep their raw value, escapes included, without an issue", () => {
		expect(value("3.0", "X-MOZILLA-PROPERTY:a\\;b;c")).toEqual({
			kind: "unknown",
			raw: "a\\;b;c",
		});
		expect(issuesOf("3.0", "X-MOZILLA-PROPERTY:a\\;b;c")).toEqual([]);
	});

	test("registry defaults follow the version", () => {
		expect(value("4.0", "PHOTO:data:image/png;base64,AAAA").kind).toBe("uri");
		expect(value("4.0", "UID:urn:uuid:1").kind).toBe("uri");
		expect(value("3.0", "UID:1").kind).toBe("text");
		expect(value("3.0", "TZ:-05:00")).toEqual({
			kind: "utc-offset",
			sign: -1,
			hours: 5,
			minutes: 0,
		});
		expect(value("2.1", "TZ:+0100")).toEqual({
			kind: "utc-offset",
			sign: 1,
			hours: 1,
			minutes: 0,
		});
		expect(value("4.0", "TZ:America/New_York")).toEqual({
			kind: "text",
			value: "America/New_York",
		});
		expect(value("3.0", "GEO:37.386013;-122.082932")).toEqual({
			kind: "structured",
			components: [["37.386013"], ["-122.082932"]],
		});
		expect(value("4.0", "GEO:geo:37.386013,-122.082932").kind).toBe("uri");
		expect(value("4.0", "LANG;PREF=1:fr-CA")).toEqual({ kind: "language-tag", value: "fr-CA" });
		expect(value("3.0", "TEL:+1 555")).toEqual({ kind: "text", value: "+1 555" });
	});

	test("dates keep the raw text, Android --MM-DD and Apple 1604 parse as written", () => {
		expect(value("3.0", "BDAY:1989-02-02")).toEqual({
			kind: "date-and-or-time",
			value: { year: 1989, month: 2, day: 2 },
			raw: "1989-02-02",
		});
		expect(value("2.1", "BDAY:--03-12")).toMatchObject({ value: { month: 3, day: 12 } });
		expect(value("4.0", "BDAY:--0312")).toMatchObject({ value: { month: 3, day: 12 } });
		expect(value("3.0", "BDAY;value=date:1604-02-02")).toMatchObject({
			value: { year: 1604, month: 2, day: 2 },
		});
		expect(value("4.0", "BDAY:19890202T120000Z")).toMatchObject({
			value: { year: 1989, month: 2, day: 2, hour: 12, minute: 0, second: 0, zone: "utc" },
		});
		expect(value("4.0", "ANNIVERSARY: 20090808 ")).toMatchObject({ raw: " 20090808 " });
	});

	test("a date that does not parse is kept raw with a warning", () => {
		for (const line of ["BDAY:yesterday", "BDAY:1985-0412", "BDAY:1989-02-30"]) {
			const { cards, issues } = parseVCards(card("4.0", line));
			expect(cards[0]?.properties[1]?.value).toEqual({ kind: "unknown", raw: line.slice(5) });
			expect(issues).toEqual([
				expect.objectContaining({
					severity: "warning",
					code: "invalid-value",
					property: "BDAY",
				}),
			]);
		}
	});

	test("timestamps must be complete, a date-only REV becomes date-and-or-time with a warning", () => {
		expect(value("3.0", "REV:20150206T073347Z")).toEqual({
			kind: "timestamp",
			value: { year: 2015, month: 2, day: 6, hour: 7, minute: 33, second: 47, zone: "utc" },
			raw: "20150206T073347Z",
		});
		expect(value("3.0", "REV:2015-01-19T09:25:56-05:00")).toMatchObject({
			kind: "timestamp",
			value: { zone: { sign: -1, hours: 5, minutes: 0 } },
		});
		const partial = parseVCards(card("3.0", "REV:2015-01-19"));
		expect(partial.cards[0]?.properties[1]?.value).toEqual({
			kind: "date-and-or-time",
			value: { year: 2015, month: 1, day: 19 },
			raw: "2015-01-19",
		});
		expect(codes(partial.issues)).toEqual(["timestamp-incomplete"]);
		expect(value("3.0", "REV:never")).toEqual({ kind: "unknown", raw: "never" });
		expect(codes(issuesOf("3.0", "REV:never"))).toEqual(["invalid-value"]);
	});

	test("a non-gregorian CALSCALE keeps the date raw with an info", () => {
		const { cards, issues } = parseVCards(
			card("3.0", "X-ALTBDAY;CALSCALE=chinese:007800301201"),
		);
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "unknown", raw: "007800301201" });
		expect(issues).toEqual([
			expect.objectContaining({ severity: "info", code: "calscale-unsupported" }),
		]);
		expect(value("4.0", "BDAY;CALSCALE=gregorian:19890202").kind).toBe("date-and-or-time");
	});

	test("scalar kinds validate their text and fall back to unknown", () => {
		const bad = [
			["3.0", "TZ:nope"],
			["4.0", "LANG:not a tag"],
			["4.0", "X-N;VALUE=integer:1.5"],
			["4.0", "X-N;VALUE=integer:99999999999999999999"],
			["4.0", "X-F;VALUE=float:1e5"],
			["4.0", "X-B;VALUE=boolean:yes"],
			["4.0", "X-O;VALUE=utc-offset:+25:00"],
		] as const;
		for (const [version, line] of bad) {
			expect(value(version, line), line).toEqual({
				kind: "unknown",
				raw: line.slice(line.indexOf(":") + 1),
			});
			expect(codes(issuesOf(version, line)), line).toEqual(["invalid-value"]);
		}
	});
});

describe("hostile input", () => {
	test("never throws on binary garbage, lone surrogates or mixed line endings", () => {
		const garbage = new Uint8Array(20000).map((_, i) => (i * 7919 + 13) % 256);
		expect(() => parseVCards(garbage)).not.toThrow();
		expect(
			parseVCards("BEGIN:VCARD\nVERSION:4.0\nFN:\uD800x\nEND:VCARD").cards[0]?.properties[1]
				?.value,
		).toEqual({ kind: "text", value: "\uFFFDx" });
		const mixed = parseVCards("BEGIN:VCARD\rVERSION:3.0\nFN:a\r\n b\rEND:VCARD");
		expect(mixed.cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "ab" });
	});

	test("rejects oversized input before encoding it", () => {
		const { cards, issues } = parseVCards("x".repeat(100 * 1024 * 1024));
		expect(cards).toEqual([]);
		expect(issues).toEqual([
			expect.objectContaining({ severity: "error", code: "input-too-large" }),
		]);
		expect(parseVCards(card("4.0", "FN:a"), { maxInputBytes: 10 }).issues).toEqual([
			expect.objectContaining({ code: "input-too-large" }),
		]);
	});

	test("drops an over-long line with an error and parses the rest", () => {
		const { cards, issues } = parseVCards(card("4.0", `NOTE:${"x".repeat(200)}`, "FN:a"), {
			maxLineLength: 100,
		});
		expect(cards[0]?.properties.map((p) => p.name)).toEqual(["VERSION", "FN"]);
		expect(issues).toEqual([
			expect.objectContaining({ severity: "error", code: "line-too-long", line: 3 }),
		]);
	});

	test("caps issues per code", () => {
		const { issues } = parseVCards(card("4.0", ...Array<string>(3000).fill("garbage")));
		expect(issues.filter((i) => i.code === "invalid-line")).toHaveLength(1000);
		expect(issues.filter((i) => i.code === "issues-truncated")).toHaveLength(1);
	});

	test("BOM, UTF-16, missing END and nested BEGIN come through the public API", () => {
		const bom = parseVCards(`\uFEFF${card("4.0", "FN:a")}`);
		expect(bom.cards).toHaveLength(1);
		expect(codes(bom.issues)).toEqual(["bom-stripped"]);
		const utf16 = new Uint8Array(
			card("4.0", "FN:é")
				.split("")
				.flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]),
		);
		const transcoded = parseVCards(utf16);
		expect(transcoded.cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "é" });
		expect(codes(transcoded.issues)).toEqual(["utf16-transcoded"]);
		const open = parseVCards("BEGIN:VCARD\nVERSION:4.0\nFN:a");
		expect(open.cards).toHaveLength(1);
		expect(codes(open.issues)).toEqual(["missing-end"]);
		const nested = parseVCards(
			"BEGIN:VCARD\nVERSION:4.0\nFN:a\nBEGIN:VCARD\nVERSION:4.0\nFN:b\nEND:VCARD",
		);
		expect(nested.cards.map((c) => c.properties[1]?.value)).toEqual([
			{ kind: "text", value: "a" },
			{ kind: "text", value: "b" },
		]);
		expect(codes(nested.issues)).toEqual(["nested-begin"]);
	});

	test("a photo folded into thousands of lines decodes to the original bytes", () => {
		const data = new Uint8Array(300 * 1024).map((_, i) => (i * 2654435761) % 256);
		const folded = encodeBase64(data).replace(/.{74}/g, "$&\r\n ");
		const { cards, issues } = parseVCards(
			card("3.0", "FN:a", `PHOTO;ENCODING=b;TYPE=JPEG:${folded}`),
		);
		expect(issues).toEqual([]);
		expect(cards[0]?.properties[2]?.value).toEqual({
			kind: "binary",
			data,
			mediaType: "image/jpeg",
		});
	});

	test("a 2.1 AGENT with an inline vCard is one raw text property", () => {
		const { cards } = parseVCards(
			card(
				"2.1",
				"FN:Boss",
				"AGENT:",
				"BEGIN:VCARD",
				"VERSION:2.1",
				"FN:Assistant",
				"END:VCARD",
			),
		);
		expect(cards).toHaveLength(1);
		expect(cards[0]?.properties[2]?.value).toEqual({
			kind: "text",
			value: "BEGIN:VCARD\nVERSION:2.1\nFN:Assistant\nEND:VCARD",
		});
	});
});

describe("review regressions", () => {
	test("a parameter repeated hundreds of thousands of times does not overflow the stack", () => {
		const values = Array<string>(300000).fill("a").join(",");
		const { cards } = parseVCards(card("3.0", `TEL;TYPE=x;TYPE=${values}:1`));
		expect(cards[0]?.properties[1]?.params.get("TYPE")).toHaveLength(300001);
	});

	test("2.1 components unescape a backslash as well as ; , and :", () => {
		expect(value("2.1", "N:Doe\\\\;John\\:Jr\\,III;;;")).toEqual({
			kind: "structured",
			components: [["Doe\\"], ["John:Jr,III"], [""], [""], [""]],
		});
		expect(value("2.1", "CATEGORIES:a\\,b,c\\nd")).toEqual({
			kind: "text-list",
			values: ["a,b", "c\\nd"],
		});
	});

	test("a 3.0 media property without ENCODING is a URI when it has a scheme, else reported", () => {
		const asUri = parseVCards(card("3.0", "PHOTO:http://x/a.jpg"));
		expect(asUri.cards[0]?.properties[1]?.value).toEqual({
			kind: "uri",
			value: "http://x/a.jpg",
		});
		expect(asUri.issues).toEqual([
			expect.objectContaining({ severity: "info", code: "binary-as-uri", property: "PHOTO" }),
		]);
		const junk = parseVCards(card("2.1", "LOGO:not a photo"));
		expect(junk.cards[0]?.properties[1]?.value).toEqual({
			kind: "unknown",
			raw: "not a photo",
		});
		expect(codes(junk.issues)).toEqual(["binary-without-encoding"]);
	});

	test("a 2.1 KEY is clear text unless ENCODING makes it binary", () => {
		expect(value("2.1", "KEY;PGP:-----BEGIN PGP PUBLIC KEY BLOCK-----")).toEqual({
			kind: "text",
			value: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
		});
		expect(issuesOf("2.1", "KEY;PGP:abc")).toEqual([]);
		expect(value("2.1", "KEY;X509;ENCODING=BASE64:MIIB")).toMatchObject({
			kind: "binary",
			data: new Uint8Array([0x30, 0x82, 0x01]),
		});
		expect(codes(issuesOf("3.0", "KEY:abc"))).toEqual(["binary-without-encoding"]);
	});

	test("a stray bare B is a TYPE, not a base64 marker", () => {
		expect(value("2.1", "TEL;B:+2")).toEqual({ kind: "text", value: "+2" });
		expect(issuesOf("2.1", "TEL;B:+2")).toEqual([]);
	});

	test("CHARSET, ENCODING and VALUE are read as ASCII whatever charset the line declares", () => {
		const [fn] = props("2.1", "FN;CHARSET=UTF-16;VALUE=text:ab");
		expect(fn?.params).toEqual(
			new Map([
				["CHARSET", ["UTF-16"]],
				["VALUE", ["text"]],
			]),
		);
	});

	test("a charset fallback on a parameter value is reported too", () => {
		const input = concat(
			"BEGIN:VCARD\r\nVERSION:3.0\r\nTEL;TYPE=X-caf",
			[0xe9],
			":1\r\nEND:VCARD",
		);
		const { cards, issues } = parseVCards(input);
		expect(cards[0]?.properties[1]?.params.get("TYPE")).toEqual(["X-café"]);
		expect(codes(issues)).toEqual(["charset-fallback"]);
	});

	test("empty inline binary gets an info, ENCODING wins over VALUE=uri", () => {
		const empty = parseVCards(card("3.0", "PHOTO;ENCODING=b:"));
		expect(empty.cards[0]?.properties[1]?.value).toEqual({
			kind: "binary",
			data: new Uint8Array(0),
		});
		expect(codes(empty.issues)).toEqual(["binary-empty"]);
		expect(
			value("3.0", `PHOTO;ENCODING=b;VALUE=uri:${encodeBase64(new Uint8Array([1]))}`).kind,
		).toBe("binary");
	});

	test("2.1 VALUE=INLINE is silent and VALUE=CID is a URI", () => {
		expect(value("2.1", "NOTE;VALUE=INLINE:x")).toEqual({ kind: "text", value: "x" });
		expect(issuesOf("2.1", "NOTE;VALUE=INLINE:x")).toEqual([]);
		expect(value("2.1", "PHOTO;VALUE=CID:cid:a@b")).toEqual({ kind: "uri", value: "cid:a@b" });
	});

	test("VALUE and TYPE naming an Object.prototype member are not lookups that succeed", () => {
		for (const word of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
			expect(value("3.0", `NOTE;VALUE=${word}:hello`)).toEqual({
				kind: "text",
				value: "hello",
			});
			expect(codes(issuesOf("3.0", `NOTE;VALUE=${word}:hello`))).toEqual([
				"value-type-unknown",
			]);
			expect(value("3.0", `PHOTO;ENCODING=b;TYPE=${word}:AAAA`)).toEqual({
				kind: "binary",
				data: new Uint8Array([0, 0, 0]),
			});
		}
	});

	test("text input is already UTF-8: CHARSET and defaultCharset are ignored with an info", () => {
		const text = card("2.1", "N;CHARSET=ISO-8859-1:Dupont;Rémi", "NOTE;CHARSET=UTF-8:é");
		const { cards, issues } = parseVCards(text);
		expect(cards[0]?.properties.slice(1).map((p) => p.value)).toEqual([
			{ kind: "structured", components: [["Dupont"], ["Rémi"]] },
			{ kind: "text", value: "é" },
		]);
		expect(issues).toEqual([
			expect.objectContaining({ code: "charset-ignored", line: 3, property: "N" }),
		]);
		const forced = parseVCards(card("2.1", "FN:Rémi"), { defaultCharset: "windows-1252" });
		expect(forced.cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "Rémi" });
		expect(forced.issues).toEqual([
			expect.objectContaining({
				code: "charset-ignored",
				message: expect.stringContaining("defaultCharset"),
			}),
		]);
		// UTF-16 input is transcoded, so the same applies to it.
		const utf16 = new Uint8Array(
			`\uFEFF${card("2.1", "FN;CHARSET=ISO-8859-1:Rémi")}`.split("").flatMap((c) => {
				const code = c.charCodeAt(0);
				return [code & 0xff, code >> 8];
			}),
		);
		const transcoded = parseVCards(utf16);
		expect(transcoded.cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "Rémi" });
		expect(codes(transcoded.issues)).toEqual(["utf16-transcoded", "charset-ignored"]);
		// Bytes keep honouring CHARSET: the same card as windows-1252 bytes decodes through it.
		const bytes = concat(
			"BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=ISO-8859-1:R",
			[0xe9],
			"mi\r\nEND:VCARD",
		);
		expect(parseVCards(bytes).cards[0]?.properties[1]?.value).toEqual({
			kind: "text",
			value: "Rémi",
		});
		expect(parseVCards(bytes).issues).toEqual([]);
	});

	test("CHARSET on a vCard 4.0 line is ignored with an info, the card is UTF-8", () => {
		const bytes = concat(
			"BEGIN:VCARD\r\nVERSION:4.0\r\nFN;CHARSET=ISO-8859-1:R",
			[0xc3, 0xa9],
			"mi\r\nEND:VCARD",
		);
		const { cards, issues } = parseVCards(bytes);
		expect(cards[0]?.properties[1]?.value).toEqual({ kind: "text", value: "Rémi" });
		expect(issues).toEqual([
			expect.objectContaining({ code: "charset-ignored", line: 3, property: "FN" }),
		]);
		expect(issuesOf("3.0", "FN;CHARSET=UTF-8:a")).toEqual([]);
	});

	test("base64 is a transfer encoding for text, the value itself for media and unknown kinds", () => {
		const hello = encodeBase64(utf8("héllo"));
		expect(value("2.1", `NOTE;ENCODING=BASE64;CHARSET=UTF-8:${hello}`)).toEqual({
			kind: "text",
			value: "héllo",
		});
		expect(value("2.1", `N;ENCODING=BASE64:${encodeBase64(utf8("Doe;John"))}`)).toEqual({
			kind: "structured",
			components: [["Doe"], ["John"]],
		});
		expect(issuesOf("2.1", `NOTE;ENCODING=BASE64;CHARSET=UTF-8:${hello}`)).toEqual([]);
		const photo = value("4.0", `PHOTO;ENCODING=b:${hello}`);
		expect(photo.kind).toBe("binary");
		expect(value("2.1", `X-THING;ENCODING=BASE64:${hello}`)).toEqual({
			kind: "binary",
			data: utf8("héllo"),
		});
		expect(value("2.1", `NOTE;VALUE=binary;ENCODING=BASE64:${hello}`)).toEqual({
			kind: "binary",
			data: utf8("héllo"),
		});
		expect(value("2.1", "NOTE;ENCODING=BASE64:not*base64")).toEqual({
			kind: "unknown",
			raw: "not*base64",
		});
	});
});
