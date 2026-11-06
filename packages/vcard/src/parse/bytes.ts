import type { Issue } from "../types.js";

export const DEFAULT_MAX_INPUT_BYTES = 64 * 1024 * 1024;

const encoder = new TextEncoder();

export interface ByteInput {
	bytes: Uint8Array;
	issues: Issue[];
}

/**
 * Lifts any accepted input to UTF-8 bytes without a BOM, so the rest of the parser has one
 * code path. UTF-16 input (BOM or a BOM-less file starting with "B\0") is transcoded.
 */
export function toUtf8Bytes(
	input: string | Uint8Array | ArrayBuffer,
	maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
): ByteInput {
	if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1) {
		throw new RangeError(`maxInputBytes must be a positive integer, got ${maxInputBytes}`);
	}
	const issues: Issue[] = [];
	let bytes: Uint8Array | null;
	if (typeof input === "string") {
		bytes = encodeCapped(input, maxInputBytes);
	} else {
		bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	}
	if (bytes === null || bytes.length > maxInputBytes) {
		return { bytes: new Uint8Array(0), issues: [tooLarge()] };
	}

	const b0 = bytes[0] ?? 0;
	const b1 = bytes[1] ?? 0;
	if (b0 === 0xef && b1 === 0xbb && bytes[2] === 0xbf) {
		bytes = bytes.subarray(3);
		issues.push({ severity: "info", code: "bom-stripped", message: "UTF-8 BOM removed" });
		return { bytes, issues };
	}
	// A BOM-less file is recognised by the "B" of BEGIN, in either case like the delimiter itself.
	const utf16 =
		(b0 === 0xff && b1 === 0xfe) || ((b0 | 0x20) === 0x62 && b1 === 0x00)
			? "utf-16le"
			: (b0 === 0xfe && b1 === 0xff) || (b0 === 0x00 && (b1 | 0x20) === 0x62)
				? "utf-16be"
				: null;
	if (utf16) {
		// The decoder drops its own BOM. Transcoding can grow the input by half: cap it again.
		bytes = encodeCapped(new TextDecoder(utf16).decode(bytes), maxInputBytes);
		if (bytes === null) return { bytes: new Uint8Array(0), issues: [tooLarge()] };
		issues.push({
			severity: "info",
			code: "utf16-transcoded",
			message: `Input was ${utf16}, transcoded to UTF-8`,
		});
	}
	return { bytes, issues };

	function tooLarge(): Issue {
		return {
			severity: "error",
			code: "input-too-large",
			message: `Input exceeds the ${maxInputBytes} byte limit, nothing parsed`,
		};
	}
}

/** UTF-8 of `text`, or null past `max` bytes, without ever allocating more than that. */
function encodeCapped(text: string, max: number): Uint8Array | null {
	// Every code unit encodes to at least one octet, so this rejection is free.
	if (text.length > max) return null;
	// A code point is at most 4 octets: with this much room, stopping early means over the cap.
	const buffer = new Uint8Array(Math.min(text.length * 3, max + 4));
	const { written } = encoder.encodeInto(text, buffer);
	return written > max ? null : buffer.subarray(0, written);
}
