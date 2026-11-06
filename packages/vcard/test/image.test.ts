import { expect, test } from "vitest";
import { guessImageType } from "../src/index.js";

test("recognises JPEG, PNG, GIF and WebP magic bytes", () => {
	expect(guessImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
	expect(
		guessImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
	).toBe("image/png");
	expect(guessImageType(new TextEncoder().encode("GIF89a...."))).toBe("image/gif");
	expect(guessImageType(new TextEncoder().encode("GIF87a...."))).toBe("image/gif");
	expect(guessImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
});

test("returns undefined for anything else or too short", () => {
	expect(guessImageType(new Uint8Array())).toBeUndefined();
	expect(guessImageType(Uint8Array.from([0xff, 0xd8]))).toBeUndefined();
	expect(guessImageType(new TextEncoder().encode("GIF90a"))).toBeUndefined();
	expect(guessImageType(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBeUndefined();
	expect(guessImageType(new TextEncoder().encode("<svg/>"))).toBeUndefined();
});
