import { describe, expect, test } from "vitest";
import { escapeText, splitEscaped, unescapeText } from "../src/index.js";

describe("escapeText", () => {
	test("escapes backslash, comma, semicolon and newline (RFC 6350 3.4)", () => {
		expect(escapeText("Mythical Manager\nHyjinx Software Division\nBabsCo, Inc.\n")).toBe(
			"Mythical Manager\\nHyjinx Software Division\\nBabsCo\\, Inc.\\n",
		);
		expect(escapeText("a\\b;c")).toBe("a\\\\b\\;c");
	});

	test("normalises CRLF and CR to an escaped newline", () => {
		expect(escapeText("one\r\ntwo\rthree")).toBe("one\\ntwo\\nthree");
	});

	test("never escapes a colon", () => {
		expect(escapeText("http://example.com")).toBe("http://example.com");
	});
});

describe("unescapeText", () => {
	test("undoes the four standard escapes, \\N included", () => {
		expect(unescapeText("BabsCo\\, Inc.\\nLine 2\\NLine 3\\; done \\\\")).toBe(
			"BabsCo, Inc.\nLine 2\nLine 3; done \\",
		);
	});

	test("is lenient with unknown escapes so http\\:// reads back", () => {
		expect(unescapeText("http\\://example.com")).toBe("http://example.com");
		expect(unescapeText("\\x\\y")).toBe("xy");
	});

	test("keeps a trailing lone backslash", () => {
		expect(unescapeText("abc\\")).toBe("abc\\");
	});

	test("round trips arbitrary text", () => {
		const text = "a,b;c\\d\ne\\nf \\\\, \\;";
		expect(unescapeText(escapeText(text))).toBe(text);
	});
});

describe("splitEscaped", () => {
	test("splits on unescaped separators only and keeps escapes", () => {
		expect(splitEscaped("Doe;John\\;Jr;;Dr\\\\;", ";")).toEqual([
			"Doe",
			"John\\;Jr",
			"",
			"Dr\\\\",
			"",
		]);
		expect(splitEscaped("a\\,b,c", ",")).toEqual(["a\\,b", "c"]);
	});

	test("empty input gives one empty component", () => {
		expect(splitEscaped("", ";")).toEqual([""]);
	});

	test("a trailing backslash does not swallow the end", () => {
		expect(splitEscaped("a;b\\", ";")).toEqual(["a", "b\\"]);
	});
});
