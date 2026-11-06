const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

// Uint8Array.fromBase64 / toBase64 are ES2026 and not yet in the ES2025 lib nor in Node 24.
interface Base64Static {
	fromBase64?: (text: string, options?: { lastChunkHandling?: "loose" | "strict" }) => Uint8Array;
}
interface Base64Instance {
	toBase64?: () => string;
}
const nativeFromBase64 = (Uint8Array as unknown as Base64Static).fromBase64;

/**
 * Decodes standard base64. ASCII whitespace is ignored and missing padding accepted;
 * anything else throws a SyntaxError, which callers turn into an Issue.
 */
export function decodeBase64(text: string): Uint8Array {
	return nativeFromBase64
		? nativeFromBase64.call(Uint8Array, text, { lastChunkHandling: "loose" })
		: decodeBase64Fallback(text);
}

export function decodeBase64Fallback(text: string): Uint8Array {
	const clean = text.replace(/[\t\n\f\r ]+/g, "");
	let end = clean.length;
	while (end > 0 && clean.charCodeAt(end - 1) === 0x3d) end--;
	const padding = clean.length - end;
	if (end % 4 === 1 || (padding > 0 && padding !== (4 - (end % 4)) % 4)) {
		throw new SyntaxError("Invalid base64 length or padding");
	}
	const out = new Uint8Array(Math.floor((end * 3) / 4));
	let buffer = 0;
	let bits = 0;
	let n = 0;
	for (let i = 0; i < end; i++) {
		const code = clean.charCodeAt(i);
		const v = code < 128 ? (LOOKUP[code] ?? -1) : -1;
		if (v < 0) throw new SyntaxError(`Invalid base64 character at index ${i}`);
		buffer = (buffer << 6) | v;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[n++] = (buffer >> bits) & 0xff;
			buffer &= (1 << bits) - 1;
		}
	}
	return out;
}

/** Encodes bytes as standard padded base64 on one line. */
export function encodeBase64(bytes: Uint8Array): string {
	const native = (bytes as Base64Instance).toBase64;
	return native ? native.call(bytes) : encodeBase64Fallback(bytes);
}

export function encodeBase64Fallback(bytes: Uint8Array): string {
	let out = "";
	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
		out += ALPHABET.charAt(n >> 18) + ALPHABET.charAt((n >> 12) & 63);
		out += ALPHABET.charAt((n >> 6) & 63) + ALPHABET.charAt(n & 63);
	}
	const rest = bytes.length - i;
	if (rest === 1) {
		const n = (bytes[i] ?? 0) << 16;
		out += `${ALPHABET.charAt(n >> 18)}${ALPHABET.charAt((n >> 12) & 63)}==`;
	} else if (rest === 2) {
		const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
		out += `${ALPHABET.charAt(n >> 18)}${ALPHABET.charAt((n >> 12) & 63)}${ALPHABET.charAt((n >> 6) & 63)}=`;
	}
	return out;
}
