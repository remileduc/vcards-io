import { describe, expect, test } from "vitest";
import { decodeBase64, encodeBase64 } from "../src/index.js";
import { decodeBase64Fallback, encodeBase64Fallback } from "../src/text/base64.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

// RFC 4648 section 10 test vectors
const vectors: [string, string][] = [
	["", ""],
	["f", "Zg=="],
	["fo", "Zm8="],
	["foo", "Zm9v"],
	["foob", "Zm9vYg=="],
	["fooba", "Zm9vYmE="],
	["foobar", "Zm9vYmFy"],
];

describe.each([
	["public", decodeBase64, encodeBase64],
	["fallback", decodeBase64Fallback, encodeBase64Fallback],
])("base64 (%s)", (_name, decode, encode) => {
	test.each(vectors)("RFC 4648 vector %j <-> %j", (plain, encoded) => {
		expect(encode(utf8(plain))).toBe(encoded);
		expect(text(decode(encoded))).toBe(plain);
	});

	test("ignores whitespace and accepts missing padding", () => {
		expect(text(decode("Zm9v\r\n YmFy\n"))).toBe("foobar");
		expect(text(decode("Zm9vYg"))).toBe("foob");
		expect(text(decode("Zg"))).toBe("f");
	});

	test("rejects invalid characters, lengths and padding", () => {
		expect(() => decode("Zm9v*mFy")).toThrow(SyntaxError);
		expect(() => decode("Zm9vé")).toThrow(SyntaxError);
		expect(() => decode("Z")).toThrow(SyntaxError);
		expect(() => decode("Zm9vYg=")).toThrow(SyntaxError);
		expect(() => decode("Zm9v=")).toThrow(SyntaxError);
		expect(() => decode("Zm=9v")).toThrow(SyntaxError);
	});

	test("round trips every byte value", () => {
		const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
		expect(Array.from(decode(encode(bytes)))).toEqual(Array.from(bytes));
		const encoded = encode(bytes);
		expect(encoded).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
	});
});
