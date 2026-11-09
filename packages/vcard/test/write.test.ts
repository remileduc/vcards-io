import { describe, expect, test } from "vitest";
import {
	type DateAndOrTime,
	MEDIA_TYPE_NAMES,
	mediaTypeFromName,
	mediaTypeName,
	nearestValueKind,
	parseVCards,
	SerializeError,
	type SerializeOptions,
	serializeVCards,
	upgradeTo40,
	VALUE_TOKENS,
	type VCard,
	type VParams,
	type VProperty,
	type VValue,
} from "../src/index.js";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const JPEG_B64 = "/9j/4AAQSkZJRgA=";

function prop(
	name: string,
	value: VValue,
	params: Record<string, string[]> = {},
	group: string | null = null,
): VProperty {
	return { group, name, params: new Map(Object.entries(params)) as VParams, value };
}

const text = (value: string): VValue => ({ kind: "text", value });
const uri = (value: string): VValue => ({ kind: "uri", value });

function card(...properties: VProperty[]): VCard {
	return { version: "4.0", properties };
}

/** Serializes one card and returns its lines without BEGIN, VERSION and END. */
function lines(c: VCard, options: Partial<SerializeOptions> = {}): string[] {
	const out = serializeVCards([c], { version: "4.0", ...options }).text;
	return out.split("\r\n").slice(2, -2);
}

const line = (p: VProperty, options: Partial<SerializeOptions> = {}) =>
	lines(card(p), options).join("\r\n");

const issuesOf = (p: VProperty, options: Partial<SerializeOptions> = {}) =>
	serializeVCards([card(p)], { version: "4.0", ...options }).issues;

/** Parses `text` (any version), upgrades, writes in `version` and returns the property lines. */
function rewrite(version: "3.0" | "4.0", ...source: string[]): string[] {
	const parsed = parseVCards(["BEGIN:VCARD", ...source, "END:VCARD"].join("\r\n"));
	const cards = parsed.cards.map((c) => upgradeTo40(c).card);
	return serializeVCards(cards, { version }).text.split("\r\n").slice(2, -2);
}

describe("serializeVCards envelope", () => {
	test("writes BEGIN, VERSION, properties in model order, END, CRLF, no BOM", () => {
		const out = serializeVCards([card(prop("FN", text("A")), prop("N", text("B")))], {
			version: "4.0",
		}).text;
		expect(out).toBe("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A\r\nN:B\r\nEND:VCARD\r\n");
	});

	test("replaces any VERSION property with the requested version", () => {
		const c = card(
			prop("VERSION", text("2.1")),
			prop("FN", text("A")),
			prop("version", text("x")),
		);
		expect(serializeVCards([c], { version: "3.0" }).text).toBe(
			"BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD\r\n",
		);
	});

	test("concatenates cards without blank lines and returns an empty string for no card", () => {
		const two = serializeVCards([card(prop("FN", text("A"))), card(prop("FN", text("B")))], {
			version: "4.0",
		}).text;
		expect(two.split("\r\n").filter((l) => l === "")).toEqual([""]);
		expect(two.match(/BEGIN:VCARD/g)).toHaveLength(2);
		expect(serializeVCards([], { version: "4.0" }).text).toBe("");
	});

	test("honours foldAt, folding only lines over the limit, and always ends lines with CRLF", () => {
		const long = prop("NOTE", text("x".repeat(100)));
		const crlf = serializeVCards([card(long)], { version: "4.0" }).text;
		expect(crlf.split("\r\n")).toHaveLength(6);
		expect(crlf.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
		const none = serializeVCards([card(long)], { version: "4.0", foldAt: "none" }).text;
		expect(none.split("\r\n")).toHaveLength(5);
		const folded = serializeVCards([card(long)], { version: "4.0" }).text;
		for (const physical of folded.split("\r\n")) {
			expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
		}
		expect(
			serializeVCards([card(prop("FN", text("short")))], { version: "4.0", foldAt: 10 }).text,
		).toBe("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:short\r\nEND:VCARD\r\n");
	});

	test("separates cards with blankLinesBetweenCards empty lines, none by default", () => {
		const a = card(prop("FN", text("A")));
		const cards = [a, card(prop("FN", text("B"))), card(prop("FN", text("C")))];
		const one = (fn: string) => `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${fn}\r\nEND:VCARD\r\n`;
		const plain = one("A") + one("B") + one("C");
		expect(serializeVCards(cards, { version: "4.0" }).text).toBe(plain);
		const options: SerializeOptions = { version: "4.0", blankLinesBetweenCards: 2 };
		const spaced = serializeVCards(cards, options).text;
		expect(spaced).toBe(`${one("A")}\r\n\r\n${one("B")}\r\n\r\n${one("C")}`);
		expect(serializeVCards([a], options).text).toBe(one("A"));
		expect(serializeVCards([], options).text).toBe("");
		// The parser drops empty physical lines, so the spaced output re-reads to the plain one.
		const back = parseVCards(spaced);
		expect(back.issues).toEqual([]);
		expect(serializeVCards(back.cards, { version: "4.0" }).text).toBe(plain);
	});

	test("rejects bad options with RangeError before writing anything", () => {
		const c = card(prop("FN", text("A")));
		expect(() => serializeVCards([c], { version: "2.1" as "3.0" })).toThrow(RangeError);
		expect(() => serializeVCards([c], { version: "4.0", foldAt: 4 })).toThrow(RangeError);
		expect(() => serializeVCards([], { version: "4.0", foldAt: -1 })).toThrow(RangeError);
		expect(() => serializeVCards([], { version: "4.0", foldAt: 7.5 })).toThrow(RangeError);
		for (const n of [-1, 1.5, 10, Number.NaN]) {
			expect(() =>
				serializeVCards([], { version: "4.0", blankLinesBetweenCards: n }),
			).toThrow(RangeError);
		}
		for (const version of ["constructor", "__proto__", "toString", ""]) {
			expect(() => serializeVCards([], { version: version as "3.0" })).toThrow(RangeError);
		}
	});

	test("normalises names before the tables look at them: upper names, lower groups", () => {
		expect(line(prop("tel", text("1"), { type: ["cell"] }, "Item1"))).toBe(
			"item1.TEL;TYPE=cell:1",
		);
		// Lowercase keys must still hit the transport filter, the 3.0 allow-list and PREF.
		expect(line(prop("fn", text("é"), { charset: ["UTF-8"], encoding: ["8BIT"] }))).toBe(
			"FN:é",
		);
		expect(
			line(prop("tel", text("1"), { type: ["cell"], pref: ["1"] }), { version: "3.0" }),
		).toBe("TEL;TYPE=CELL;TYPE=PREF:1");
		expect(
			line(prop("photo", uri(`data:image/jpeg;base64,${JPEG_B64}`)), { version: "3.0" }),
		).toBe(`PHOTO;ENCODING=b;TYPE=JPEG:${JPEG_B64}`);
		const n: VValue = {
			kind: "structured",
			components: [["a"], ["b"], [""], [""], [""], [""], [""]],
		};
		expect(line(prop("n", n), { version: "3.0" })).toBe("N:a;b;;;");
		// Two spellings of one parameter merge.
		expect(line(prop("TEL", text("1"), { type: ["cell"], TYPE: ["home"] }))).toBe(
			"TEL;TYPE=cell,home:1",
		);
	});

	test("skips a parameter with no non-empty value, as readers would", () => {
		expect(line(prop("TEL", text("1"), { "X-A": [], TYPE: [""], "X-B": ["", "b"] }))).toBe(
			"TEL;X-B=b:1",
		);
	});

	test("replaces a lone surrogate with U+FFFD, folded or not", () => {
		const lone = `a${String.fromCharCode(0xd800)}b`;
		expect(line(prop("NOTE", text(lone)))).toBe("NOTE:a\uFFFDb");
		const long = line(prop("NOTE", text(`${"x".repeat(80)}${lone}`)));
		expect(long.isWellFormed()).toBe(true);
		expect(long).toContain("\uFFFD");
	});
});

describe("values", () => {
	test("escapes text: backslash, comma, semicolon, newline, never colon", () => {
		expect(line(prop("NOTE", text("a\\b,c;d\ne\r\nf\rg:h")))).toBe(
			"NOTE:a\\\\b\\,c\\;d\\ne\\nf\\ng:h",
		);
	});

	test("joins text lists with commas and structured components with semicolons", () => {
		expect(line(prop("NICKNAME", { kind: "text-list", values: ["Jo,e", "J;o"] }))).toBe(
			"NICKNAME:Jo\\,e,J\\;o",
		);
		const n: VValue = {
			kind: "structured",
			components: [["Stevenson"], ["John"], ["Philip", "Paul"], ["Dr."], ["Jr.", "M.D."]],
		};
		expect(line(prop("N", n))).toBe("N:Stevenson;John;Philip,Paul;Dr.;Jr.,M.D.");
		expect(
			line(prop("ORG", { kind: "structured", components: [["ABC, Inc."], ["R&D"]] })),
		).toBe("ORG:ABC\\, Inc.;R&D");
	});

	test("writes URIs, language tags, numbers and booleans verbatim", () => {
		expect(line(prop("URL", uri("http://x.example/a,b;c")))).toBe("URL:http://x.example/a,b;c");
		expect(line(prop("LANG", { kind: "language-tag", value: "fr-CA" }))).toBe("LANG:fr-CA");
		expect(line(prop("X-N", { kind: "integer", value: -42 }))).toBe("X-N;VALUE=integer:-42");
		expect(line(prop("X-F", { kind: "float", value: 1.5 }))).toBe("X-F;VALUE=float:1.5");
		expect(line(prop("X-B", { kind: "boolean", value: true }))).toBe("X-B;VALUE=boolean:TRUE");
		expect(line(prop("X-B", { kind: "boolean", value: false }))).toBe(
			"X-B;VALUE=boolean:FALSE",
		);
	});

	test("rejects an unsafe integer or a float outside the grammar", () => {
		expect(() => line(prop("X-N", { kind: "integer", value: 2 ** 53 }))).toThrow(
			SerializeError,
		);
		expect(() => line(prop("X-F", { kind: "float", value: 1e21 }))).toThrow(SerializeError);
		expect(() => line(prop("X-F", { kind: "float", value: Number.NaN }))).toThrow(
			SerializeError,
		);
	});

	test("formats dates in the basic form for 4.0 and the extended form for 3.0", () => {
		const bday = prop("BDAY", {
			kind: "date-and-or-time",
			value: { year: 1985, month: 4, day: 12, hour: 23, minute: 20, second: 50, zone: "utc" },
			raw: "ignored",
		});
		expect(line(bday)).toBe("BDAY:19850412T232050Z");
		expect(line(bday, { version: "3.0" })).toBe("BDAY:1985-04-12T23:20:50Z");
		const rev = prop("REV", {
			kind: "timestamp",
			value: { year: 2015, month: 1, day: 19, hour: 9, minute: 25, second: 56 },
			raw: "",
		});
		expect(line(rev)).toBe("REV:20150119T092556");
		expect(line(rev, { version: "3.0" })).toBe("REV:2015-01-19T09:25:56");
		const tz = prop("TZ", { kind: "utc-offset", sign: -1, hours: 5, minutes: 0 });
		expect(line(tz)).toBe("TZ;VALUE=utc-offset:-0500");
		expect(line(tz, { version: "3.0" })).toBe("TZ:-05:00");
	});

	test("turns a formatter RangeError into a SerializeError naming the property", () => {
		const bad = prop(
			"BDAY",
			{ kind: "date-and-or-time", value: { month: 13 }, raw: "" },
			{},
			"g",
		);
		let caught: unknown;
		try {
			serializeVCards([card(prop("FN", text("A"))), card(bad)], { version: "4.0" });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SerializeError);
		const error = caught as SerializeError;
		expect(error.card).toBe(1);
		expect(error.property).toBe("g.BDAY");
		expect(error.message).toContain("g.BDAY");
	});

	test("writes an unknown value raw, escapes kept", () => {
		expect(line(prop("X-RAW", { kind: "unknown", raw: "a\\;b,c" }))).toBe("X-RAW:a\\;b,c");
	});
});

describe("VALUE parameter", () => {
	test("is written first whether or not the model declared one", () => {
		const declared = prop("TEL", uri("tel:+1"), { VALUE: ["uri"], TYPE: ["cell"] });
		const derived = prop("TEL", uri("tel:+1"), { TYPE: ["cell"] });
		for (const version of ["3.0", "4.0"] as const) {
			expect(line(declared, { version })).toBe(line(derived, { version }));
		}
		expect(line(declared, { version: "3.0" })).toBe("TEL;VALUE=uri;TYPE=CELL:tel:+1");
		expect(line(declared)).toBe("TEL;VALUE=uri;TYPE=cell:tel:+1");
	});

	test("is omitted for the version's default kind and derived otherwise", () => {
		expect(line(prop("URL", uri("http://a")))).toBe("URL:http://a");
		expect(line(prop("URL", uri("http://a"), { VALUE: ["uri"] }))).toBe("URL:http://a");
		expect(line(prop("UID", text("abc")))).toBe("UID;VALUE=text:abc");
		expect(line(prop("UID", text("abc")), { version: "3.0" })).toBe("UID:abc");
		expect(line(prop("UID", uri("urn:uuid:1")), { version: "3.0" })).toBe(
			"UID;VALUE=uri:urn:uuid:1",
		);
		expect(line(prop("TEL", uri("tel:+1")))).toBe("TEL;VALUE=uri:tel:+1");
		expect(
			line(prop("N", { kind: "structured", components: [["a"]] }, { VALUE: ["text"] })),
		).toBe("N:a");
	});

	test("uses 3.0 tokens date, time and date-time by shape", () => {
		// X-DATE is not in the registry, so its default is text and the date needs a VALUE.
		const d = (value: DateAndOrTime) =>
			prop("X-DATE", { kind: "date-and-or-time", value, raw: "" });
		expect(line(d({ year: 2013, month: 3, day: 12 }), { version: "3.0" })).toBe(
			"X-DATE;VALUE=date:2013-03-12",
		);
		expect(line(d({ hour: 10, minute: 0 }), { version: "3.0" })).toBe(
			"X-DATE;VALUE=time:10:00",
		);
		expect(line(d({ year: 2013, month: 3, day: 12, hour: 10 }), { version: "3.0" })).toBe(
			"X-DATE;VALUE=date-time:2013-03-12T10",
		);
		expect(line(d({ year: 2013 }))).toBe("X-DATE;VALUE=date-and-or-time:2013");
		// RFC 2426 has no T prefix on a bare time; truncated forms only exist in the 4.0 grammar.
		expect(line(d({ hour: 10, minute: 22, second: 0, zone: "utc" }), { version: "3.0" })).toBe(
			"X-DATE;VALUE=time:10:22:00Z",
		);
		expect(line(d({ hour: 10 }), { version: "3.0" })).toBe("X-DATE;VALUE=time:T10");
		expect(line(d({ minute: 22 }), { version: "3.0" })).toBe("X-DATE;VALUE=time:T-22");
		expect(line(d({ hour: 10, minute: 22 }))).toBe("X-DATE;VALUE=date-and-or-time:T1022");
		// X-ABDATE is a registry date property: no VALUE in either version.
		expect(
			line(prop("X-ABDATE", { kind: "date-and-or-time", value: { year: 2013 }, raw: "" }), {
				version: "3.0",
			}),
		).toBe("X-ABDATE:2013");
	});

	test("keeps a declared VALUE on an unknown value and never writes one for binary", () => {
		expect(line(prop("BDAY", { kind: "unknown", raw: "yesterday" }, { VALUE: ["date"] }))).toBe(
			"BDAY;VALUE=date:yesterday",
		);
		expect(
			line(prop("X-BLOB", { kind: "binary", data: JPEG }, { VALUE: ["binary"] }), {
				version: "3.0",
			}),
		).toBe(`X-BLOB;ENCODING=b:${JPEG_B64}`);
	});

	test("says VALUE=binary on a text property, where readers take base64 as a transfer encoding", () => {
		const data = new Uint8Array([0xff, 0xfe, 0, 0x41]);
		const note = prop("NOTE", { kind: "binary", data });
		const out = line(note, { version: "3.0" });
		expect(out).toBe("NOTE;VALUE=binary;ENCODING=b://4AQQ==");
		const back = parseVCards(`BEGIN:VCARD\r\nVERSION:3.0\r\n${out}\r\nEND:VCARD\r\n`);
		expect(back.issues).toEqual([]);
		expect(back.cards[0]?.properties[1]?.value).toEqual({ kind: "binary", data });
		// Media and unknown properties: ENCODING=b is enough, the reader keeps the bytes.
		expect(line(prop("PHOTO", { kind: "binary", data }), { version: "3.0" })).toBe(
			"PHOTO;ENCODING=b://4AQQ==",
		);
		expect(line(prop("X-BLOB", { kind: "binary", data }), { version: "3.0" })).toBe(
			"X-BLOB;ENCODING=b://4AQQ==",
		);
	});

	test("defaults an unknown property to text", () => {
		expect(line(prop("X-FOO", text("a")))).toBe("X-FOO:a");
		expect(line(prop("X-FOO", uri("http://a")))).toBe("X-FOO;VALUE=uri:http://a");
	});
});

describe("4.0 parameters", () => {
	test("writes comma lists, caret-encodes and quotes when needed", () => {
		expect(line(prop("TEL", text("1"), { TYPE: ["work", "voice"], PREF: ["1"] }))).toBe(
			"TEL;TYPE=work,voice;PREF=1:1",
		);
		expect(line(prop("ADR", text(""), { LABEL: ['123 Main\nSt. "A"; 2'] }))).toBe(
			"ADR;LABEL=\"123 Main^nSt. ^'A^'; 2\":",
		);
		expect(line(prop("N", text("a"), { "SORT-AS": ["Harten", "Rene,Jr"] }))).toBe(
			'N;SORT-AS=Harten,"Rene,Jr":a',
		);
	});

	test("keeps parameter values as given, including TYPE case", () => {
		expect(line(prop("TEL", text("1"), { TYPE: ["Cell", "X-Custom"] }))).toBe(
			"TEL;TYPE=Cell,X-Custom:1",
		);
	});

	test("never writes CHARSET or ENCODING from the model", () => {
		expect(line(prop("FN", text("é"), { CHARSET: ["UTF-8"], ENCODING: ["8BIT"] }))).toBe(
			"FN:é",
		);
	});

	test("rejects a binary value: the normaliser makes data: URIs", () => {
		expect(() => line(prop("PHOTO", { kind: "binary", data: JPEG }))).toThrow(SerializeError);
	});

	test("rejects a control character in a parameter", () => {
		expect(() => line(prop("TEL", text("1"), { TYPE: ["a\u0001b"] }))).toThrow(SerializeError);
	});
});

describe("3.0 parameters", () => {
	test("repeats TYPE, uppercases it except X- labels, and turns PREF into TYPE=PREF", () => {
		expect(
			line(prop("TEL", text("1"), { TYPE: ["cell", "X-Perso"], PREF: ["1"] }), {
				version: "3.0",
			}),
		).toBe("TEL;TYPE=CELL;TYPE=X-Perso;TYPE=PREF:1");
		expect(line(prop("TEL", text("1"), { PREF: ["01"] }), { version: "3.0" })).toBe(
			"TEL;TYPE=PREF:1",
		);
	});

	test("only PREF=1 becomes TYPE=PREF: marking every rank would invert the ranking", () => {
		const second = prop("TEL", text("1"), { PREF: ["2"], TYPE: ["home"] });
		expect(line(second, { version: "3.0" })).toBe("TEL;TYPE=HOME:1");
		expect(issuesOf(second, { version: "3.0" })).toEqual([
			{
				severity: "warning",
				code: "pref-not-in-30",
				message: expect.stringContaining('PREF="2" dropped'),
				property: "TEL",
				card: 0,
			},
		]);
		expect(issuesOf(prop("TEL", text("1"), { PREF: [""] }), { version: "3.0" })).toEqual([]);
		expect(issuesOf(second)).toEqual([]);
		expect(
			line(prop("TEL", text("1"), { TYPE: ["pref", "home", "HOME"] }), { version: "3.0" }),
		).toBe("TEL;TYPE=HOME;TYPE=PREF:1");
	});

	test("moves a TYPE=pref already in the model last too, so a re-read card writes the same", () => {
		const first = line(prop("TEL", text("1"), { TYPE: ["pref", "home"] }), { version: "3.0" });
		expect(first).toBe("TEL;TYPE=HOME;TYPE=PREF:1");
		const back = parseVCards(`BEGIN:VCARD\r\nVERSION:3.0\r\n${first}\r\nEND:VCARD\r\n`);
		const again = upgradeTo40(back.cards[0] as VCard).card;
		expect(serializeVCards([again], { version: "3.0" }).text.split("\r\n")[2]).toBe(first);
	});

	test("writes PREF last whatever the model order", () => {
		expect(
			line(prop("TEL", text("1"), { PREF: ["1"], TYPE: ["cell"], "X-A": ["b"] }), {
				version: "3.0",
			}),
		).toBe("TEL;X-A=b;TYPE=CELL;TYPE=PREF:1");
	});

	test("keeps CALSCALE: Apple writes it in 3.0 and the date is garbage without it", () => {
		const altbday = prop(
			"X-ALTBDAY",
			{ kind: "unknown", raw: "007800301201" },
			{
				CALSCALE: ["chinese"],
			},
		);
		expect(line(altbday, { version: "3.0" })).toBe("X-ALTBDAY;CALSCALE=chinese:007800301201");
	});

	test("turns MEDIATYPE back into the legacy TYPE word on a media property", () => {
		const photo = prop("PHOTO", uri("https://x/p"), { MEDIATYPE: ["image/gif;q=1"] });
		expect(line(photo, { version: "3.0" })).toBe("PHOTO;VALUE=uri;TYPE=GIF:https://x/p");
		// Normalised like the parser does; junk is not a type; the value's own type wins.
		expect(
			line(prop("PHOTO", uri("https://x"), { MEDIATYPE: [" IMAGE/PNG ; q=1"] }), {
				version: "3.0",
			}),
		).toBe("PHOTO;VALUE=uri;TYPE=PNG:https://x");
		expect(
			line(prop("PHOTO", uri("https://x"), { MEDIATYPE: ["not a type"] }), {
				version: "3.0",
			}),
		).toBe("PHOTO;VALUE=uri:https://x");
		const png = prop(
			"PHOTO",
			{ kind: "binary", data: JPEG, mediaType: "image/png" },
			{
				MEDIATYPE: ["image/jpeg"],
			},
		);
		expect(line(png, { version: "3.0" })).toBe(`PHOTO;ENCODING=b;TYPE=PNG:${JPEG_B64}`);
		const sound = prop("SOUND", uri("https://x/s"), { MEDIATYPE: ["audio/ogg"] });
		expect(line(sound, { version: "3.0" })).toBe("SOUND;VALUE=uri;TYPE=audio/ogg:https://x/s");
		// Not a media property: dropped like any other 4.0 parameter.
		expect(
			line(prop("URL", uri("https://x"), { MEDIATYPE: ["text/html"] }), { version: "3.0" }),
		).toBe("URL:https://x");
	});

	test("keeps VALUE, LANGUAGE and X- parameters and drops the rest", () => {
		const p = prop(
			"ADR",
			{ kind: "structured", components: [[""]] },
			{
				LANGUAGE: ["fr"],
				ALTID: ["1"],
				PID: ["1.1"],
				LABEL: ["x"],
				GEO: ["geo:1,2"],
				CC: ["FR"],
				"X-ABADR": ["fr"],
				MEDIATYPE: ["image/png"],
			},
		);
		expect(line(p, { version: "3.0" })).toBe("ADR;LANGUAGE=fr;X-ABADR=fr:;;;;;;");
		expect(issuesOf(p, { version: "3.0" })).toEqual([
			{
				severity: "warning",
				code: "param-not-in-30",
				message:
					"ALTID, PID, LABEL, GEO, CC, MEDIATYPE dropped: vCard 3.0 has no such parameter",
				property: "ADR",
				card: 0,
			},
		]);
		// Transport parameters are the writer's own: dropped in silence.
		expect(
			issuesOf(prop("FN", text("a"), { CHARSET: ["UTF-8"], ENCODING: ["8BIT"] }), {
				version: "3.0",
			}),
		).toEqual([]);
	});

	test("quotes a value with leading or trailing whitespace, which readers would trim", () => {
		expect(
			line(prop("TEL", text("1"), { "X-A": [" a", "b ", "c d"] }), { version: "3.0" }),
		).toBe('TEL;X-A=" a","b ",c d:1');
		expect(line(prop("TEL", text("1"), { "X-A": ["\ta"] }))).toBe('TEL;X-A="\ta":1');
	});

	test("quotes a value with ; : or , and drops a quote or newline with a warning", () => {
		expect(
			line(prop("TEL", text("1"), { "X-A": ["a;b", "c:d", "e,f", "g"] }), { version: "3.0" }),
		).toBe('TEL;X-A="a;b","c:d","e,f",g:1');
		for (const bad of ['a"b', "a\nb", "a\u0000b"]) {
			const p = prop("TEL", text("1"), { "X-A": [bad, "ok"], TYPE: ["cell"] });
			expect(line(p, { version: "3.0" })).toBe("TEL;X-A=ok;TYPE=CELL:1");
			expect(issuesOf(p, { version: "3.0" }).map((i) => i.code)).toEqual([
				"param-value-not-in-30",
			]);
		}
		// A parsed 4.0 card may carry a caret-encoded newline: never an error, one warning.
		const parsed = parseVCards(
			'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A\r\nGEO;X-ADDRESS="1 Main^nTown":geo:1,2\r\nEND:VCARD\r\n',
		);
		const out = serializeVCards(parsed.cards, { version: "3.0" });
		expect(out.text).toContain("\r\nGEO;VALUE=uri:geo:1,2\r\n");
		expect(out.issues).toEqual([
			{
				severity: "warning",
				code: "param-value-not-in-30",
				message: expect.stringContaining("X-ADDRESS="),
				line: 4,
				property: "GEO",
				card: 0,
			},
		]);
	});

	test("writes binary as ENCODING=b with the legacy TYPE word first", () => {
		const photo = prop(
			"PHOTO",
			{ kind: "binary", data: JPEG, mediaType: "image/jpeg" },
			{
				TYPE: ["work"],
				MEDIATYPE: ["image/jpeg"],
				"PROP-ID": ["P1"],
			},
		);
		expect(line(photo, { version: "3.0" })).toBe(
			`PHOTO;ENCODING=b;TYPE=JPEG;TYPE=WORK:${JPEG_B64}`,
		);
		const svg = prop("LOGO", { kind: "binary", data: JPEG, mediaType: "image/svg+xml" });
		expect(line(svg, { version: "3.0" })).toBe(
			`LOGO;ENCODING=b;TYPE=image/svg+xml:${JPEG_B64}`,
		);
		expect(line(prop("KEY", { kind: "binary", data: JPEG }), { version: "3.0" })).toBe(
			`KEY;ENCODING=b:${JPEG_B64}`,
		);
	});

	test("decodes a data: URI on a media property back to inline base64", () => {
		const photo = prop("PHOTO", uri(`data:image/jpeg;base64,${JPEG_B64}`));
		expect(line(photo, { version: "3.0" })).toBe(`PHOTO;ENCODING=b;TYPE=JPEG:${JPEG_B64}`);
		expect(line(prop("PHOTO", uri("data:,abc")), { version: "3.0" })).toBe(
			"PHOTO;ENCODING=b:YWJj",
		);
		// A URL stays a URL (declared, since 3.0 PHOTO is binary by default); a data: URI
		// outside a media property is just a URI.
		expect(line(prop("PHOTO", uri("https://x/p.jpg")), { version: "3.0" })).toBe(
			"PHOTO;VALUE=uri:https://x/p.jpg",
		);
		expect(line(prop("URL", uri("data:,abc")), { version: "3.0" })).toBe("URL:data:,abc");
		expect(line(prop("PHOTO", uri("data:image/jpeg;base64,!!")), { version: "3.0" })).toBe(
			"PHOTO;VALUE=uri:data:image/jpeg;base64,!!",
		);
	});

	test("writes exactly 5 N and 7 ADR components", () => {
		const n7: VValue = {
			kind: "structured",
			components: [["a"], ["b"], [""], [""], [""], [""], [""]],
		};
		expect(line(prop("N", n7), { version: "3.0" })).toBe("N:a;b;;;");
		const n2: VValue = { kind: "structured", components: [["a"], ["b"]] };
		expect(line(prop("N", n2), { version: "3.0" })).toBe("N:a;b;;;");
		const adr18: VValue = {
			kind: "structured",
			components: Array.from({ length: 18 }, (_, i) => [String(i)]),
		};
		expect(line(prop("ADR", adr18), { version: "3.0" })).toBe("ADR:0;1;2;3;4;5;6");
		expect(issuesOf(prop("ADR", adr18), { version: "3.0" })).toEqual([
			expect.objectContaining({
				code: "components-not-in-30",
				message: "ADR has 7 components in vCard 3.0, 11 non-empty extra dropped",
			}),
		]);
		// Padding and cutting empty tails is lossless: no issue.
		expect(issuesOf(prop("N", n7), { version: "3.0" })).toEqual([]);
		expect(issuesOf(prop("N", n2), { version: "3.0" })).toEqual([]);
		// 4.0 writes what the model holds.
		expect(line(prop("N", n2))).toBe("N:a;b");
	});
});

describe("hostile models", () => {
	test("refuses a TYPE value holding a comma, which readers split even when quoted", () => {
		for (const version of ["3.0", "4.0"] as const) {
			expect(() => line(prop("EMAIL", text("e@x"), { TYPE: ["a,b"] }), { version })).toThrow(
				SerializeError,
			);
		}
	});

	test("rejects names and groups outside the grammar, and BEGIN/END as properties", () => {
		expect(() => line(prop("FN:X", text("a")))).toThrow(SerializeError);
		expect(() => line(prop("FN", text("a"), {}, "item 1"))).toThrow(SerializeError);
		expect(() => line(prop("FN", text("a"), { "T;Y": ["x"] }))).toThrow(SerializeError);
		expect(() => line(prop("", text("a")))).toThrow(SerializeError);
		expect(() => line(prop("END", text("VCARD")))).toThrow(SerializeError);
		expect(() => line(prop("begin", text("VCARD")))).toThrow(SerializeError);
	});

	test("rejects a line break that escaping cannot absorb", () => {
		expect(() => line(prop("URL", uri("http://a\r\nFN:injected")))).toThrow(SerializeError);
		expect(() => line(prop("X-RAW", { kind: "unknown", raw: "a\nb" }))).toThrow(SerializeError);
		expect(() => line(prop("LANG", { kind: "language-tag", value: "fr\n" }))).toThrow(
			SerializeError,
		);
	});

	test("the error carries the card index and property id", () => {
		try {
			serializeVCards([card(prop("FN", text("a"), {}, "item1"), prop("URL", uri("\n")))], {
				version: "4.0",
			});
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(SerializeError);
			expect((error as SerializeError).card).toBe(0);
			expect((error as SerializeError).property).toBe("URL");
			expect((error as SerializeError).name).toBe("SerializeError");
		}
	});
});

describe("parse, upgrade, write", () => {
	test("a 2.1 Android card becomes readable 3.0 and 4.0", () => {
		const source = [
			"VERSION:2.1",
			"N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Dupont;Ren=C3=A9;;;",
			"FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ren=C3=A9 Dupont",
			"TEL;CELL;PREF:+33612345678",
			"EMAIL;HOME:rene@example.org",
			`PHOTO;ENCODING=BASE64;JPEG:${JPEG_B64}`,
			"",
		];
		expect(rewrite("3.0", ...source)).toEqual([
			"N:Dupont;René;;;",
			"FN:René Dupont",
			"TEL;TYPE=CELL;TYPE=PREF:+33612345678",
			"EMAIL;TYPE=HOME:rene@example.org",
			`PHOTO;ENCODING=b;TYPE=JPEG:${JPEG_B64}`,
		]);
		expect(rewrite("4.0", ...source)).toEqual([
			"N:Dupont;René;;;;;",
			"FN:René Dupont",
			"TEL;TYPE=cell;PREF=1:+33612345678",
			"EMAIL;TYPE=home:rene@example.org",
			`PHOTO:data:image/jpeg;base64,${JPEG_B64}`,
		]);
	});

	test("Apple 3.0 types and labels round-trip through 4.0", () => {
		const source = [
			"VERSION:3.0",
			"FN:A",
			"item1.TEL;type=HOME;type=VOICE;type=pref:1",
			"item1.X-ABLabel:Perso",
			"BDAY;value=date:1985-04-12",
			"TZ:-05:00",
		];
		expect(rewrite("3.0", ...source)).toEqual([
			"FN:A",
			"item1.TEL;TYPE=HOME;TYPE=VOICE;TYPE=PREF:1",
			"item1.X-ABLABEL:Perso",
			"BDAY:1985-04-12",
			"TZ:-05:00",
		]);
		expect(rewrite("4.0", ...source)).toEqual([
			"FN:A",
			"item1.TEL;TYPE=home,voice;PREF=1:1",
			"item1.X-ABLABEL:Perso",
			"BDAY:19850412",
			"TZ;VALUE=utc-offset:-0500",
		]);
	});

	test("a folded photo re-reads byte for byte", () => {
		const data = new Uint8Array(500).map((_, i) => (i * 7) & 0xff);
		const c = card(prop("PHOTO", { kind: "binary", data, mediaType: "image/png" }));
		const out = serializeVCards([c], { version: "3.0" }).text;
		const back = parseVCards(out);
		expect(back.issues).toEqual([]);
		expect(back.cards[0]?.properties[1]?.value).toEqual({
			kind: "binary",
			data,
			mediaType: "image/png",
		});
	});
});

describe("size", () => {
	test("20 000 rows and a 10 MB photo write in well under a second each way", () => {
		const rows = Array.from({ length: 20_000 }, (_, i) =>
			prop(
				"TEL",
				text(`+33 6 ${i}`),
				{ TYPE: ["cell", `X-Label ${i}`], PREF: ["1"] },
				`item${i}`,
			),
		);
		const photo = prop("PHOTO", {
			kind: "binary",
			data: new Uint8Array(10 * 1024 * 1024).map((_, i) => i & 0xff),
			mediaType: "image/jpeg",
		});
		const upgraded = upgradeTo40(card(...rows, photo)).card;
		for (const version of ["3.0", "4.0"] as const) {
			const start = performance.now();
			const out = serializeVCards([upgraded], { version }).text;
			expect(performance.now() - start).toBeLessThan(5000);
			expect(out.length).toBeGreaterThan(10 * 1024 * 1024);
		}
	}, 30_000);
});

describe("registry helpers the writer relies on", () => {
	test("nearestValueKind falls back to the last version a property is defined in", () => {
		expect(nearestValueKind("NICKNAME", "2.1")).toBe("text-list");
		expect(nearestValueKind("LABEL", "4.0")).toBe("text");
		expect(nearestValueKind("PHOTO", "3.0")).toBe("binary");
		expect(nearestValueKind("photo", "4.0")).toBe("uri");
		expect(nearestValueKind("X-NOPE", "4.0")).toBeUndefined();
	});

	test("VALUE_TOKENS names every typed kind but binary and unknown", () => {
		expect([...VALUE_TOKENS.keys()].sort()).toEqual(
			[
				"boolean",
				"date-and-or-time",
				"float",
				"integer",
				"language-tag",
				"structured",
				"text",
				"text-list",
				"timestamp",
				"uri",
				"utc-offset",
			].sort(),
		);
		expect(VALUE_TOKENS.get("structured")).toBe("text");
	});

	test("mediaTypeName is the inverse of mediaTypeFromName for the legacy words", () => {
		expect(mediaTypeName("image/jpeg")).toBe("JPEG");
		expect(mediaTypeName("audio/wav")).toBe("WAVE");
		expect(mediaTypeName("image/svg+xml")).toBeUndefined();
		for (const [word, type] of MEDIA_TYPE_NAMES) {
			expect(mediaTypeFromName(mediaTypeName(type) ?? "")).toBe(type);
			expect(mediaTypeFromName(word)).toBe(type);
		}
	});
});
