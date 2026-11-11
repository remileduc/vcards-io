import { describe, expect, test } from "vitest";
import { decodeQuotedPrintable } from "../src/index.js";
import { encodeQuotedPrintable } from "./helpers/quoted-printable.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("decodeQuotedPrintable", () => {
	test("decodes =XX in either case and keeps plain bytes", () => {
		expect(text(decodeQuotedPrintable("Caf=C3=A9 =c3=a0 la cr=C3=A8me"))).toBe(
			"Café à la crème",
		);
	});

	test("yields raw bytes so the charset can be applied afterwards", () => {
		expect(Array.from(decodeQuotedPrintable("=E9=3D"))).toEqual([0xe9, 0x3d]);
	});

	test("drops soft line breaks =CRLF, =LF, =CR and a trailing =", () => {
		expect(text(decodeQuotedPrintable("abc=\r\ndef=\nghi=\rjkl="))).toBe("abcdefghijkl");
	});

	test("ignores whitespace between a soft-break = and the line break (RFC 2045 6.7)", () => {
		expect(text(decodeQuotedPrintable("abc= \r\ndef=\t\nghi"))).toBe("abcdefghi");
	});

	test("decodes an AOSP soft-broken value once the unfolder has removed '=CRLF'", () => {
		// `N;ENCODING=QUOTED-PRINTABLE:Caf=` CRLF `=C3=A9` arrives here already joined.
		expect(text(decodeQuotedPrintable("Caf=C3=A9"))).toBe("Café");
		expect(text(decodeQuotedPrintable("abcdef"))).toBe("abcdef");
	});

	test("keeps a lone = that is not followed by hex", () => {
		expect(text(decodeQuotedPrintable("a=b =G1 ="))).toBe("a=b =G1 ");
	});

	test("accepts bytes as input", () => {
		expect(text(decodeQuotedPrintable(utf8("=C3=A9")))).toBe("é");
	});
});

describe("encodeQuotedPrintable", () => {
	test("encodes non-ASCII, '=' and trailing whitespace", () => {
		expect(encodeQuotedPrintable("é=1 ")).toBe("=C3=A9=3D1=20");
		expect(encodeQuotedPrintable("a b")).toBe("a b");
	});

	test("soft-breaks at 76 columns with =CRLF and no indentation, like AOSP", () => {
		const encoded = encodeQuotedPrintable("x".repeat(100));
		expect(encoded).toBe(`${"x".repeat(75)}=\r\n${"x".repeat(25)}`);
		for (const line of encoded.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
	});

	test("never splits an =XX token across a soft break", () => {
		const encoded = encodeQuotedPrintable(`${"x".repeat(74)}é`, { maxLineLength: 76 });
		expect(encoded.split("\r\n")).toEqual([`${"x".repeat(74)}=`, "=C3=A9"]);
	});

	test("round trips", () => {
		const original =
			"Ünïcödé text with = signs and\nnewlines, that is long enough to be soft-broken twice over";
		expect(
			text(decodeQuotedPrintable(encodeQuotedPrintable(original, { maxLineLength: 20 }))),
		).toBe(original);
	});

	test("rejects a useless line length", () => {
		expect(() => encodeQuotedPrintable("a", { maxLineLength: 3 })).toThrow(RangeError);
	});
});
