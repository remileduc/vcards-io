const encoder = new TextEncoder();

export interface QuotedPrintableOptions {
	/** Soft-break lines so they never exceed this many characters. Default 76. */
	maxLineLength?: number;
}

/**
 * Encodes bytes as quoted-printable with `=CRLF` soft breaks and no indentation, the way
 * AOSP writes 2.1. A test helper to build 2.1 input: the library never writes QP.
 */
export function encodeQuotedPrintable(
	input: Uint8Array | string,
	options: QuotedPrintableOptions = {},
): string {
	const { maxLineLength = 76 } = options;
	if (!Number.isInteger(maxLineLength) || maxLineLength < 4) {
		throw new RangeError(`maxLineLength must be >= 4, got ${maxLineLength}`);
	}
	const bytes = typeof input === "string" ? encoder.encode(input) : input;
	let out = "";
	let lineLength = 0;
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i] ?? 0;
		const literal =
			(b >= 0x21 && b <= 0x7e && b !== 0x3d) ||
			((b === 0x20 || b === 0x09) && i + 1 < bytes.length);
		const token = literal
			? String.fromCharCode(b)
			: `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
		// Keep one column for the soft-break "=".
		if (lineLength + token.length > maxLineLength - 1) {
			out += "=\r\n";
			lineLength = 0;
		}
		out += token;
		lineLength += token.length;
	}
	return out;
}
