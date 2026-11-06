import { describe, expect, test } from "vitest";
import { toUtf8Bytes } from "../src/parse/bytes.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("toUtf8Bytes", () => {
	test("encodes a string and passes bytes through", () => {
		expect(text(toUtf8Bytes("BEGIN:VCARD\r\nFN:Zoë").bytes)).toBe("BEGIN:VCARD\r\nFN:Zoë");
		const input = utf8("BEGIN:VCARD");
		expect(toUtf8Bytes(input).bytes).toBe(input);
		expect(text(toUtf8Bytes(input.buffer as ArrayBuffer).bytes)).toBe("BEGIN:VCARD");
		expect(toUtf8Bytes(input).issues).toEqual([]);
	});

	test("strips a UTF-8 BOM, from bytes or from a string", () => {
		const fromBytes = toUtf8Bytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x42, 0x45]));
		expect(text(fromBytes.bytes)).toBe("BE");
		expect(fromBytes.issues).toEqual([expect.objectContaining({ code: "bom-stripped" })]);
		expect(text(toUtf8Bytes("﻿BEGIN").bytes)).toBe("BEGIN");
	});

	test("transcodes UTF-16 with a BOM, either endianness", () => {
		const le = new Uint8Array([0xff, 0xfe, 0x42, 0x00, 0xe9, 0x00]);
		const be = new Uint8Array([0xfe, 0xff, 0x00, 0x42, 0x00, 0xe9]);
		for (const input of [le, be]) {
			const result = toUtf8Bytes(input);
			expect(text(result.bytes)).toBe("Bé");
			expect(result.issues).toEqual([expect.objectContaining({ code: "utf16-transcoded" })]);
		}
	});

	test("recognises BOM-less UTF-16 by the B of BEGIN, in either case", () => {
		expect(text(toUtf8Bytes(new Uint8Array([0x42, 0x00, 0x45, 0x00])).bytes)).toBe("BE");
		expect(text(toUtf8Bytes(new Uint8Array([0x00, 0x42, 0x00, 0x45])).bytes)).toBe("BE");
		const lower = toUtf8Bytes(new Uint8Array([0x62, 0x00, 0x65, 0x00]));
		expect(text(lower.bytes)).toBe("be");
		expect(lower.issues).toEqual([expect.objectContaining({ code: "utf16-transcoded" })]);
		expect(text(toUtf8Bytes(new Uint8Array([0x00, 0x62, 0x00, 0x65])).bytes)).toBe("be");
	});

	test("an odd UTF-16 byte count yields a replacement character, no throw", () => {
		expect(text(toUtf8Bytes(new Uint8Array([0xff, 0xfe, 0x42, 0x00, 0x45])).bytes)).toBe(
			"B\uFFFD",
		);
	});

	test("rejects oversized input as an error issue, nothing parsed", () => {
		for (const input of ["x".repeat(11), utf8("x".repeat(11))]) {
			const result = toUtf8Bytes(input, 10);
			expect(result.bytes.length).toBe(0);
			expect(result.issues).toEqual([
				expect.objectContaining({ severity: "error", code: "input-too-large" }),
			]);
		}
		expect(toUtf8Bytes("x".repeat(10), 10).issues).toEqual([]);
	});

	test("applies the limit to the UTF-8 size, not to the input before transcoding", () => {
		// four euro signs: 8 bytes of UTF-16, 12 of UTF-8
		const utf16 = new Uint8Array([0xff, 0xfe, ...Array(4).fill([0xac, 0x20]).flat()]);
		expect(toUtf8Bytes(utf16, 10).issues).toEqual([
			expect.objectContaining({ code: "input-too-large" }),
		]);
		expect(toUtf8Bytes("€".repeat(4), 10).issues).toEqual([
			expect.objectContaining({ code: "input-too-large" }),
		]);
		expect(text(toUtf8Bytes("€".repeat(3), 10).bytes)).toBe("€€€");
	});

	test("throws on a nonsensical limit", () => {
		expect(() => toUtf8Bytes("", 0)).toThrow(RangeError);
		expect(() => toUtf8Bytes("", 1.5)).toThrow(RangeError);
	});
});
