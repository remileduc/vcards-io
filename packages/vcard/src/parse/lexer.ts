import { excerpt, info, latin1, warn } from "./issues.js";
import type { IssueSink, LogicalLine } from "./lines.js";

const HTAB = 0x09;
const SP = 0x20;
const DQUOTE = 0x22;
const COMMA = 0x2c;
const COLON = 0x3a;
const SEMICOLON = 0x3b;
const EQUALS = 0x3d;

// versit 2.9 `pencodingval`; RFC 2426's "B" only exists as `ENCODING=b`, never as a bare word.
const ENCODINGS = new Set(["QUOTED-PRINTABLE", "BASE64", "8BIT", "7BIT"]);
const CHARSET_RE =
	/^(?:UTF-?(?:8|16|32)(?:LE|BE)?|ISO-?8859-\d{1,2}|WINDOWS-\d{3,4}|CP\d{3,5}|US-ASCII|ASCII|LATIN-?\d|SHIFT[-_]JIS|EUC-[A-Z]{2}|GB\d{4,5}|GBK|BIG5(?:-HKSCS)?|KOI8-?[RU]?|MAC(?:INTOSH|-?ROMAN))$/i;
/** RFC 6350 `name = 1*(ALPHA / DIGIT / "-")` after uppercasing; the writer checks the same. */
export const NAME_RE = /^[A-Z0-9-]+$/;

/** A parameter as written: name uppercased, values undecoded (charset and caret are version matters). */
export interface RawParam {
	name: string;
	/** One entry per comma-separated value; a quoted value is one entry, quotes removed. */
	values: Uint8Array[];
	/** True for a 2.1 bare word ("HOME", "QUOTED-PRINTABLE") promoted to TYPE/ENCODING/CHARSET. */
	bare: boolean;
}

export interface RawLine {
	/** Lowercased group ("item1"), null when absent. */
	group: string | null;
	/** Uppercased property name. */
	name: string;
	params: RawParam[];
	/** Everything after the first unquoted ":", untouched. */
	value: Uint8Array;
	line: number;
}

/**
 * Splits one logical line into group, name, parameters and value bytes. Only the header is
 * interpreted: the value is cut at the first unquoted ":" and never inspected. Returns null
 * (with a warning) for a line that has no ":" or no name.
 */
export function lexContentLine(logical: LogicalLine, issues: IssueSink): RawLine | null {
	const { bytes, line } = logical;
	const n = bytes.length;
	let i = 0;
	while (i < n && bytes[i] !== SEMICOLON && bytes[i] !== COLON) i++;
	if (i === n) {
		issues.push(
			warn("invalid-line", `Line has no ":" and was skipped: ${excerpt(bytes)}`, line),
		);
		return null;
	}
	const identifier = latin1.decode(bytes.subarray(0, i)).trim();
	const dot = identifier.indexOf(".");
	const group = dot === -1 ? null : identifier.slice(0, dot).trim().toLowerCase();
	const name = (dot === -1 ? identifier : identifier.slice(dot + 1)).trim().toUpperCase();
	if (name === "") {
		issues.push(
			warn(
				"invalid-line",
				`Line has no property name and was skipped: ${excerpt(bytes)}`,
				line,
			),
		);
		return null;
	}
	if (!NAME_RE.test(name)) {
		issues.push(
			warn(
				"invalid-property-name",
				`Property name "${name}" is not valid vCard syntax`,
				line,
			),
		);
	}

	const params: RawParam[] = [];
	while (bytes[i] === SEMICOLON) {
		i++;
		let start = i;
		while (i < n && bytes[i] !== EQUALS && bytes[i] !== SEMICOLON && bytes[i] !== COLON) i++;
		let token = trimBytes(bytes.subarray(start, i));
		// versit 2.3.2's own example "LABEL;INTL;PARCEL,ENCODING=QUOTED-PRINTABLE" uses "," here.
		const comma = token.lastIndexOf(COMMA);
		if (comma !== -1 && bytes[i] === EQUALS) {
			for (const word of splitBytes(token.subarray(0, comma), COMMA))
				params.push(bareParam(word));
			token = trimBytes(token.subarray(comma + 1));
			issues.push(
				info(
					"param-comma-separator",
					`Comma used as a parameter separator before "${latin1.decode(token)}"`,
					line,
				),
			);
		}
		if (bytes[i] !== EQUALS) {
			// "TEL;:" is what AOSP writes for an untyped phone: nothing to report.
			for (const word of splitBytes(token, COMMA)) params.push(bareParam(word));
			continue;
		}
		i++;
		const pname = latin1.decode(token).toUpperCase();
		if (pname === "") {
			issues.push(warn("empty-parameter", "Parameter without a name skipped", line));
		}
		const values: Uint8Array[] = [];
		for (;;) {
			while (bytes[i] === SP || bytes[i] === HTAB) i++;
			let quoted: Uint8Array | null = null;
			if (bytes[i] === DQUOTE) {
				const close = bytes.indexOf(DQUOTE, i + 1);
				let after = close === -1 ? n : close + 1;
				while (bytes[after] === SP || bytes[after] === HTAB) after++;
				const next = bytes[after];
				if (close !== -1 && (next === undefined || isValueEnd(next))) {
					quoted = bytes.subarray(i + 1, close);
					i = after;
				} else {
					// No closing quote, or text after it: the quote was not one, read it as plain.
					issues.push(
						warn(
							"malformed-quote",
							`Unbalanced quote in parameter "${pname}", read as plain text`,
							line,
						),
					);
				}
			}
			if (quoted === null) {
				start = i;
				while (i < n && !isValueEnd(bytes[i] ?? 0)) i++;
				quoted = trimBytes(bytes.subarray(start, i));
			}
			values.push(quoted);
			if (bytes[i] !== COMMA) break;
			i++;
		}
		if (pname !== "") params.push({ name: pname, values, bare: false });
	}

	if (bytes[i] !== COLON) {
		issues.push(
			warn("invalid-line", `Line has no ":" and was skipped: ${excerpt(bytes)}`, line),
		);
		return null;
	}
	return { group, name, params, value: bytes.subarray(i + 1), line };
}

/** 2.1 bare word: ENCODING if it names one, CHARSET if it looks like one, else TYPE (bytes kept). */
function bareParam(word: Uint8Array): RawParam {
	const upper = latin1.decode(word).toUpperCase();
	const name = ENCODINGS.has(upper) ? "ENCODING" : CHARSET_RE.test(upper) ? "CHARSET" : "TYPE";
	return { name, values: [word], bare: true };
}

function isValueEnd(byte: number): boolean {
	return byte === COMMA || byte === SEMICOLON || byte === COLON;
}

/** Trimmed, non-empty pieces between `separator` bytes. */
function splitBytes(bytes: Uint8Array, separator: number): Uint8Array[] {
	const out: Uint8Array[] = [];
	let start = 0;
	for (let i = 0; i <= bytes.length; i++) {
		if (i === bytes.length || bytes[i] === separator) {
			const piece = trimBytes(bytes.subarray(start, i));
			if (piece.length > 0) out.push(piece);
			start = i + 1;
		}
	}
	return out;
}

function trimBytes(bytes: Uint8Array): Uint8Array {
	let start = 0;
	let end = bytes.length;
	while (start < end && (bytes[start] === SP || bytes[start] === HTAB)) start++;
	while (end > start && (bytes[end - 1] === SP || bytes[end - 1] === HTAB)) end--;
	return bytes.subarray(start, end);
}
