import { describe, expect, test } from "vitest";
import type { Issue } from "../src/index.js";
import { lexContentLine, type RawLine } from "../src/parse/lexer.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

interface Plain {
	group: string | null;
	name: string;
	params: [string, string[], boolean?][];
	value: string;
}

function lex(input: string, issues: Issue[] = []): Plain | null {
	const raw = lexContentLine({ bytes: utf8(input), line: 7 }, issues);
	return raw === null ? null : plain(raw);
}

function plain(raw: RawLine): Plain {
	return {
		group: raw.group,
		name: raw.name,
		params: raw.params.map((p) =>
			p.bare ? [p.name, p.values.map(text), true] : [p.name, p.values.map(text)],
		),
		value: text(raw.value),
	};
}

describe("lexContentLine", () => {
	test("splits group, name, params and value; name upper, group lower", () => {
		expect(lex("Item1.tel;type=cell:+1 555")).toEqual({
			group: "item1",
			name: "TEL",
			params: [["TYPE", ["cell"]]],
			value: "+1 555",
		});
		expect(lex("FN:")).toEqual({ group: null, name: "FN", params: [], value: "" });
	});

	test("cuts the value at the first unquoted colon and never looks past it", () => {
		expect(lex("URL:http://example.com/a:b")?.value).toBe("http://example.com/a:b");
		expect(lex("URL:http\\://example.com")?.value).toBe("http\\://example.com");
		expect(lex('ADR;LABEL="Main St: 1";TYPE=home:;;Main St')).toEqual({
			group: null,
			name: "ADR",
			params: [
				["LABEL", ["Main St: 1"]],
				["TYPE", ["home"]],
			],
			value: ";;Main St",
		});
	});

	test("keeps the value bytes exactly, leading whitespace included", () => {
		expect(lex("VERSION: 3.0")?.value).toBe(" 3.0");
		expect(lex("NOTE:a\\nb;c,d")?.value).toBe("a\\nb;c,d");
	});

	test("splits unquoted values on commas, keeps quoted ones whole", () => {
		expect(lex("TEL;TYPE=home,voice:1")?.params).toEqual([["TYPE", ["home", "voice"]]]);
		expect(lex('TEL;TYPE="home,voice":1')?.params).toEqual([["TYPE", ["home,voice"]]]);
		expect(lex('TEL;TYPE="a",b,"c":1')?.params).toEqual([["TYPE", ["a", "b", "c"]]]);
	});

	test("keeps repeated parameters in order (Apple type=)", () => {
		expect(lex("TEL;type=HOME;type=pref;type=VOICE:1")?.params).toEqual([
			["TYPE", ["HOME"]],
			["TYPE", ["pref"]],
			["TYPE", ["VOICE"]],
		]);
	});

	test("promotes 2.1 bare words to ENCODING, CHARSET or TYPE, case kept", () => {
		expect(lex("N;CHARSET=UTF-8;QUOTED-PRINTABLE:a")?.params).toEqual([
			["CHARSET", ["UTF-8"]],
			["ENCODING", ["QUOTED-PRINTABLE"], true],
		]);
		expect(lex("PHOTO;BASE64;JPEG:/9j/")?.params).toEqual([
			["ENCODING", ["BASE64"], true],
			["TYPE", ["JPEG"], true],
		]);
		expect(lex("TEL;HOME;X-Perso;PREF;utf-8;iso-8859-1:1")?.params).toEqual([
			["TYPE", ["HOME"], true],
			["TYPE", ["X-Perso"], true],
			["TYPE", ["PREF"], true],
			["CHARSET", ["utf-8"], true],
			["CHARSET", ["iso-8859-1"], true],
		]);
	});

	test("keeps non-ASCII bare 2.1 words as the bytes written (AOSP X-<label> types)", () => {
		expect(lex("TEL;X-Épouse;Ménage,PREF:1")?.params).toEqual([
			["TYPE", ["X-Épouse"], true],
			["TYPE", ["Ménage"], true],
			["TYPE", ["PREF"], true],
		]);
		expect(lex("TEL;X-Épouse,TYPE=cell:1")?.params).toEqual([
			["TYPE", ["X-Épouse"], true],
			["TYPE", ["cell"]],
		]);
	});

	test("accepts a comma as a 2.1 parameter separator (Outlook) with an info", () => {
		const issues: Issue[] = [];
		expect(lex("LABEL;INTL;PARCEL,ENCODING=QUOTED-PRINTABLE:x", issues)?.params).toEqual([
			["TYPE", ["INTL"], true],
			["TYPE", ["PARCEL"], true],
			["ENCODING", ["QUOTED-PRINTABLE"]],
		]);
		expect(issues).toEqual([
			expect.objectContaining({ severity: "info", code: "param-comma-separator", line: 7 }),
		]);
		expect(lex("TEL;HOME,VOICE:1")?.params).toEqual([
			["TYPE", ["HOME"], true],
			["TYPE", ["VOICE"], true],
		]);
	});

	test("tolerates whitespace around '=', ';' and ':'", () => {
		expect(lex("TEL ; TYPE = cell , voice ; PREF :1")).toEqual({
			group: null,
			name: "TEL",
			params: [
				["TYPE", ["cell", "voice"]],
				["TYPE", ["PREF"], true],
			],
			value: "1",
		});
	});

	test("keeps empty and non-ASCII parameter values as bytes for later decoding", () => {
		const raw = lexContentLine({ bytes: utf8("TEL;X-FOO=;TYPE=Ménage:1"), line: 1 }, []);
		expect(raw?.params.map((p) => [p.name, p.values.map(text)])).toEqual([
			["X-FOO", [""]],
			["TYPE", ["Ménage"]],
		]);
		expect(raw?.params[1]?.values[0]).toBeInstanceOf(Uint8Array);
	});

	test("skips empty parameters silently (AOSP writes TEL;: for untyped phones)", () => {
		const issues: Issue[] = [];
		expect(lex("TEL;:1", issues)?.params).toEqual([]);
		expect(lex("TEL;;CELL;:1", issues)?.params).toEqual([["TYPE", ["CELL"], true]]);
		expect(issues).toEqual([]);
	});

	test("reports a nameless parameter with a value", () => {
		const issues: Issue[] = [];
		expect(lex("TEL;=x:1", issues)?.params).toEqual([]);
		expect(issues.map((i) => i.code)).toEqual(["empty-parameter"]);
	});

	test("reads an unbalanced quote as plain text and keeps the line", () => {
		const issues: Issue[] = [];
		expect(lex('TEL;TYPE="home;PREF=1:1', issues)).toEqual({
			group: null,
			name: "TEL",
			params: [
				["TYPE", ['"home']],
				["PREF", ["1"]],
			],
			value: "1",
		});
		expect(lex('TEL;TYPE="a"b:1', issues)?.params).toEqual([["TYPE", ['"a"b']]]);
		expect(lex('NOTE;X-A="b:He said "hi" there', issues)).toEqual({
			group: null,
			name: "NOTE",
			params: [["X-A", ['"b']]],
			value: 'He said "hi" there',
		});
		expect(issues.map((i) => i.code)).toEqual([
			"malformed-quote",
			"malformed-quote",
			"malformed-quote",
		]);
	});

	test("a value keeps its own quotes and a parameter may end the line", () => {
		expect(lex('NOTE;X="a:b":He said "hi"')?.value).toBe('He said "hi"');
		const issues: Issue[] = [];
		expect(lex("TEL;TYPE=", issues)).toBeNull();
		expect(issues).toEqual([expect.objectContaining({ code: "invalid-line" })]);
		expect(lex("TEL;,ENCODING=8BIT:1")?.params).toEqual([["ENCODING", ["8BIT"]]]);
	});

	test("rejects a line without a colon or without a name", () => {
		for (const input of ["", "no colon here", "TEL;TYPE=cell", ":value", "item1.:x", ";:x"]) {
			const issues: Issue[] = [];
			expect(lex(input, issues)).toBeNull();
			expect(issues).toEqual([
				expect.objectContaining({ severity: "warning", code: "invalid-line", line: 7 }),
			]);
		}
	});

	test("warns on an odd property name but still returns it", () => {
		const issues: Issue[] = [];
		expect(lex("X-GOOGLE TALK:handle", issues)?.name).toBe("X-GOOGLE TALK");
		expect(issues).toEqual([expect.objectContaining({ code: "invalid-property-name" })]);
	});
});
