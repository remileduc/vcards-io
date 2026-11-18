export interface FoldOptions {
	/** Maximum octets per physical line, default 75; "none" never folds. Minimum 5. */
	foldAt?: number | "none";
}

/** The width comes from settings at runtime; `foldLine` and `serializeVCards` both check it. */
export function assertFoldAt(foldAt: number | "none"): void {
	if (foldAt === "none") return;
	// 5 = fold space + one 4-octet UTF-8 sequence; below that a line could never make progress.
	if (!Number.isInteger(foldAt) || foldAt < 5) {
		throw new RangeError(`foldAt must be "none" or an integer >= 5, got ${foldAt}`);
	}
}

const encoder = new TextEncoder();
// ignoreBOM: a U+FEFF at the start of a segment is content, not a byte-order mark.
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

/**
 * Folds one logical line into physical lines of at most `foldAt` octets, each continuation
 * starting with a space. Never splits a UTF-8 sequence or a backslash escape, and breaks
 * before a space when one falls inside the window so no line ends with trailing whitespace.
 */
export function foldLine(line: string, options: FoldOptions = {}): string {
	const { foldAt = 75 } = options;
	assertFoldAt(foldAt);
	if (foldAt === "none") return line;
	const bytes = encoder.encode(line);
	if (bytes.length <= foldAt) return line;

	const segments: string[] = [];
	let start = 0;
	while (start < bytes.length) {
		const limit = segments.length === 0 ? foldAt : foldAt - 1;
		if (bytes.length - start <= limit) {
			segments.push(decoder.decode(bytes.subarray(start)));
			break;
		}
		let cut = start + limit;
		const space = lastSpaceInWindow(bytes, start, cut);
		if (space !== -1) {
			// Back up to the start of the whitespace run, and past a backslash escaping it.
			cut = space;
			while (cut > start && isWhitespace(bytes[cut - 1])) cut--;
			if (isEscapedAt(bytes, start, cut)) cut--;
		}
		if (space === -1 || cut <= start) {
			cut = start + limit;
			while (cut > start + 1 && ((bytes[cut] ?? 0) & 0xc0) === 0x80) cut--;
			if (cut - 1 > start && isEscapedAt(bytes, start, cut)) cut--;
		}
		segments.push(decoder.decode(bytes.subarray(start, cut)));
		start = cut;
	}
	return segments.join("\r\n ");
}

function isWhitespace(byte: number | undefined): boolean {
	return byte === 0x20 || byte === 0x09;
}

/** Bounded backward scan: `lastIndexOf` would rescan to 0 on every segment of a photo line. */
function lastSpaceInWindow(bytes: Uint8Array, start: number, cut: number): number {
	for (let i = cut; i > start; i--) if (bytes[i] === 0x20) return i;
	return -1;
}

/** True when the byte at `cut` is escaped by an odd run of backslashes ending just before it. */
function isEscapedAt(bytes: Uint8Array, start: number, cut: number): boolean {
	let run = 0;
	for (let i = cut - 1; i >= start && bytes[i] === 0x5c; i--) run++;
	return run % 2 === 1;
}
