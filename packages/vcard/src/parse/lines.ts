import type { Issue } from "../types.js";
import { discardIssues, error, latin1, warn } from "./issues.js";
import { lexContentLine } from "./lexer.js";

export const DEFAULT_MAX_LINE_LENGTH = 1024 * 1024;

const HTAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const SP = 0x20;
const DQUOTE = 0x22;
const HASH = 0x23;
const COMMA = 0x2c;
const HYPHEN = 0x2d;
const DOT = 0x2e;
const COLON = 0x3a;
const SEMICOLON = 0x3b;
const EQUALS = 0x3d;

/** Anything with a `push`: a plain array in tests, the capped collector in the parser. */
export interface IssueSink {
	push(issue: Issue): void;
}

/** One unfolded content line as raw bytes, with the physical line it started on. */
export interface LogicalLine {
	bytes: Uint8Array;
	/** 1-based physical line number of the first segment. */
	line: number;
}

type Encoding = "quoted-printable" | "base64" | null;

/** How a physical line attaches to the logical line before it (see docs/plan.md, step 3). */
type Join = "fold" | "soft-break" | "base64" | "unindented";

// AOSP joins an unindented line without ":" to these; writers do break them that way.
const JOINABLE = new Set(["N", "ADR", "ORG"]);

/** Splits on CRLF, LF or CR and unfolds, with the tolerance rules of docs/plan.md step 3. */
export function readLogicalLines(
	bytes: Uint8Array,
	issues: IssueSink,
	maxLineLength = DEFAULT_MAX_LINE_LENGTH,
): LogicalLine[] {
	if (!Number.isInteger(maxLineLength) || maxLineLength < 1) {
		throw new RangeError(`maxLineLength must be a positive integer, got ${maxLineLength}`);
	}
	const out: LogicalLine[] = [];
	const pending = new Pending();
	let dropping = false;

	const flush = (): void => {
		if (pending.open) out.push(pending.take());
	};

	const handle = (segment: Uint8Array, line: number): void => {
		const first = segment[0];
		const indented = first === SP || first === HTAB;
		if (segment.length > maxLineLength) {
			// A truncated value must not pass as complete: the line it continues goes with it.
			const continues = pending.open && pending.joins(segment, indented) !== null;
			issues.push(
				error(
					"line-too-long",
					`Line of ${segment.length} bytes exceeds the ${maxLineLength} byte limit and was dropped${
						continues
							? `, with the ${pending.name || "unnamed"} line ${pending.line} it continues`
							: ""
					}`,
					line,
				),
			);
			if (continues) pending.discard();
			else flush();
			dropping = true;
			return;
		}
		if (dropping && indented) return;
		dropping = false;
		if (pending.open) {
			const join = pending.joins(segment, indented);
			if (join !== null) {
				if (join === "soft-break") pending.takeSoftBreak();
				if (join === "unindented") {
					issues.push(
						warn(
							"unindented-continuation",
							`Line without ":" joined to the ${pending.name} above it`,
							line,
						),
					);
				}
				pending.append(join === "fold" ? segment.subarray(1) : segment);
				return;
			}
			if (
				pending.encoding === "quoted-printable" &&
				pending.takeSoftBreak() &&
				segment.length > 0
			) {
				// On the line holding the "=", not the delimiter's: that one may open another card.
				issues.push(
					warn(
						"qp-soft-break-dangling",
						"Quoted-printable soft break followed by a card delimiter, value ended",
						line - 1,
					),
				);
			}
		}
		flush();
		if (segment.length === 0) return;
		pending.start(segment, line);
	};

	let pos = 0;
	let line = 0;
	const n = bytes.length;
	while (pos < n) {
		line++;
		let end = pos;
		while (end < n && bytes[end] !== CR && bytes[end] !== LF) end++;
		handle(bytes.subarray(pos, end), line);
		pos = end + (bytes[end] === CR && bytes[end + 1] === LF ? 2 : 1);
	}
	flush();
	return out;
}

/** Where the header scanner is, mirroring the lexer's states at each parameter byte. */
type HeaderState = "name" | "param-name" | "value-start" | "value" | "quoted" | "quote-closed";

/**
 * The logical line under construction, in one growable buffer: a photo folded into tens of
 * thousands of physical lines costs one amortised copy, not one view per line.
 */
class Pending {
	open = false;
	line = 0;
	name = "";
	encoding: Encoding = null;
	private buffer = new Uint8Array(1024);
	private length = 0;
	/** Where the last appended segment starts: transport whitespace is only looked for there. */
	private segmentStart = 0;
	/** The header (group, name, params) ends at the first unquoted ":"; scanned incrementally. */
	private headerDone = false;
	private state: HeaderState = "name";
	private quoteStart = 0;
	private scanned = 0;

	start(segment: Uint8Array, line: number): void {
		this.open = true;
		this.line = line;
		this.name = "";
		this.encoding = null;
		this.length = 0;
		this.segmentStart = 0;
		this.headerDone = false;
		this.state = "name";
		this.quoteStart = 0;
		this.scanned = 0;
		this.append(segment);
	}

	take(): LogicalLine {
		this.open = false;
		return { bytes: this.buffer.slice(0, this.length), line: this.line };
	}

	discard(): void {
		this.open = false;
	}

	append(segment: Uint8Array): void {
		if (segment.length === 0) return;
		const needed = this.length + segment.length;
		if (needed > this.buffer.length) {
			const grown = new Uint8Array(Math.max(needed, this.buffer.length * 2));
			grown.set(this.buffer.subarray(0, this.length));
			this.buffer = grown;
		}
		this.buffer.set(segment, this.length);
		this.segmentStart = this.length;
		this.length = needed;
		if (!this.headerDone) this.scanHeader();
	}

	/** How the next physical line attaches to this one, null when it does not. */
	joins(segment: Uint8Array, indented: boolean): Join | null {
		// A fold continues the header; only an unindented line shows where the lexer stops.
		if (!indented) this.resolveHeader();
		if (this.encoding === "quoted-printable" && this.softBreak() !== -1) {
			// RFC 2045 6.7: the next line follows verbatim, a leading space is content.
			return segment.length > 0 && !isCardDelimiter(segment) ? "soft-break" : null;
		}
		if (indented) return "fold";
		if (this.encoding === "base64" && isBase64Line(segment)) return "base64";
		if (
			JOINABLE.has(this.name) &&
			segment.length > 0 &&
			segment[0] !== HASH &&
			!segment.includes(COLON) &&
			!isHeaderStart(segment)
		) {
			return "unindented";
		}
		return null;
	}

	/** Removes a trailing "=" (plus transport whitespace after it) and reports whether there was one. */
	takeSoftBreak(): boolean {
		const at = this.softBreak();
		if (at === -1) return false;
		this.length = at;
		return true;
	}

	private softBreak(): number {
		let i = this.length - 1;
		while (i >= this.segmentStart && (this.buffer[i] === SP || this.buffer[i] === HTAB)) i--;
		return i >= this.segmentStart && this.buffer[i] === EQUALS ? i : -1;
	}

	/** Same quote rule as the lexer: a quote only opens at a value start and must be closed. */
	private scanHeader(): void {
		while (this.scanned < this.length) {
			const b = this.buffer[this.scanned];
			const state = this.state;
			if (state === "quoted") {
				if (b === DQUOTE) this.state = "quote-closed";
			} else if (state === "name") {
				if (b === SEMICOLON) this.state = "param-name";
				else if (b === COLON) break;
			} else if (state === "param-name") {
				if (b === EQUALS) this.state = "value-start";
				else if (b === COLON) break;
			} else if (b === COMMA) {
				this.state = "value-start";
			} else if (b === SEMICOLON) {
				this.state = "param-name";
			} else if (b === COLON) {
				break;
			} else if (b === SP || b === HTAB) {
				// Skipped before a quote and after one, content inside a plain value: no change.
			} else if (state === "value-start" && b === DQUOTE) {
				this.state = "quoted";
				this.quoteStart = this.scanned;
			} else if (state === "quote-closed") {
				// Text after the closing quote: it was not a quote, reread it as plain value.
				this.reopenQuoteAsPlain();
				continue;
			} else {
				this.state = "value";
			}
			this.scanned++;
		}
		if (this.scanned < this.length) this.finishHeader();
	}

	/** At a line boundary a still-open quote is unbalanced; the lexer then reads it as plain. */
	private resolveHeader(): void {
		if (this.headerDone || this.state !== "quoted") return;
		this.reopenQuoteAsPlain();
		this.scanHeader();
	}

	private reopenQuoteAsPlain(): void {
		this.state = "value";
		this.scanned = this.quoteStart + 1;
	}

	/** The header is complete: let the lexer read it, so both agree on name and encoding. */
	private finishHeader(): void {
		this.headerDone = true;
		const header = this.buffer.subarray(0, this.scanned + 1);
		const raw = lexContentLine({ bytes: header, line: this.line }, discardIssues);
		if (raw === null) return;
		this.name = raw.name;
		for (const param of raw.params) {
			if (param.name !== "ENCODING") continue;
			for (const value of param.values) {
				const encoding = latin1.decode(value).trim().toUpperCase();
				if (encoding === "QUOTED-PRINTABLE") this.encoding = "quoted-printable";
				else if (encoding === "BASE64" || encoding === "B") this.encoding = "base64";
			}
		}
	}
}

function isBase64Line(segment: Uint8Array): boolean {
	let end = segment.length;
	while (end > 0 && (segment[end - 1] === SP || segment[end - 1] === HTAB)) end--;
	if (end === 0) return false;
	for (let i = 0; i < end; i++) {
		const b = segment[i] ?? 0;
		const ok =
			(b >= 0x41 && b <= 0x5a) ||
			(b >= 0x61 && b <= 0x7a) ||
			(b >= 0x30 && b <= 0x39) ||
			b === 0x2b ||
			b === 0x2f ||
			b === EQUALS;
		if (!ok) return false;
	}
	return true;
}

/**
 * `NAME;PARAM=...` without a ":": a property header folded inside its parameter list (RFC
 * 9554 examples), not a broken N/ADR/ORG value, which has no name token before its first ";".
 */
function isHeaderStart(segment: Uint8Array): boolean {
	let i = nameEnd(segment, 0);
	if (i > 0 && segment[i] === DOT) {
		const start = i + 1;
		i = nameEnd(segment, start);
		if (i === start) return false;
	}
	return i > 0 && segment[i] === SEMICOLON && segment.includes(EQUALS, i);
}

/** End of the run of property-name bytes (letters, digits, "-") starting at `from`. */
function nameEnd(segment: Uint8Array, from: number): number {
	let i = from;
	while (i < segment.length) {
		const b = segment[i] ?? 0;
		const ok =
			(b >= 0x41 && b <= 0x5a) ||
			(b >= 0x61 && b <= 0x7a) ||
			(b >= 0x30 && b <= 0x39) ||
			b === HYPHEN;
		if (!ok) break;
		i++;
	}
	return i;
}

function isCardDelimiter(segment: Uint8Array): boolean {
	const head = latin1.decode(segment.subarray(0, 6)).toUpperCase();
	return head.startsWith("BEGIN:") || head.startsWith("END:");
}
