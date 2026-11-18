const encoder = new TextEncoder();

function hexValue(byte: number | undefined): number {
	if (byte === undefined) return -1;
	if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
	if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
	if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
	return -1;
}

/**
 * Decodes quoted-printable to bytes. Tolerant: lowercase hex, `=` soft breaks before CRLF, CR
 * or LF (trailing whitespace allowed), a trailing `=` at end of input dropped, a lone `=` kept.
 * The parser's unfolder consumes AOSP's `=CRLF` soft breaks itself (the `=` and the line
 * break both go), so a logical line reaching this function never contains one.
 */
export function decodeQuotedPrintable(input: Uint8Array | string): Uint8Array {
	const bytes = typeof input === "string" ? encoder.encode(input) : input;
	const out = new Uint8Array(bytes.length);
	let n = 0;
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i] ?? 0;
		if (b !== 0x3d) {
			out[n++] = b;
			continue;
		}
		const hi = hexValue(bytes[i + 1]);
		const lo = hexValue(bytes[i + 2]);
		if (hi >= 0 && lo >= 0) {
			out[n++] = hi * 16 + lo;
			i += 2;
			continue;
		}
		// RFC 2045 6.7 rule 3: whitespace between "=" and the line break was added in transit.
		let j = i + 1;
		while (bytes[j] === 0x20 || bytes[j] === 0x09) j++;
		const next = bytes[j];
		if (next === undefined) break;
		if (next === 0x0d) {
			i = bytes[j + 1] === 0x0a ? j + 1 : j;
		} else if (next === 0x0a) {
			i = j;
		} else {
			out[n++] = b;
		}
	}
	return out.slice(0, n);
}
