import { IssueCollector } from "../issues.js";
import type { Issue, ParseOptions, ParseResult, VCard } from "../types.js";
import { toUtf8Bytes } from "./bytes.js";
import { groupCards, type RawCard } from "./cards.js";
import { readLogicalLines } from "./lines.js";
import { PropertyDecoder } from "./properties.js";
import { error } from "./report.js";

export const DEFAULT_MAX_CONTENT_LINES = 500_000;

/** Where a card sits in the source: all that is kept of its raw lines once it is decoded. */
type CardSpan = Pick<RawCard, "line" | "endLine">;

/**
 * Parses one or more vCards of any version (2.1, 3.0, 4.0, mixed) from text or bytes into the
 * ordered lossless model. Never throws on input: size caps and malformed content are reported
 * as issues. Throws RangeError only for options that make no sense.
 */
export function parseVCards(
	input: string | Uint8Array | ArrayBuffer,
	options: ParseOptions = {},
): ParseResult {
	const maxContentLines = options.maxContentLines ?? DEFAULT_MAX_CONTENT_LINES;
	if (!Number.isInteger(maxContentLines) || maxContentLines < 1) {
		throw new RangeError(`maxContentLines must be a positive integer, got ${maxContentLines}`);
	}
	const issues = new IssueCollector();
	const bytes = toUtf8Bytes(input, options.maxInputBytes);
	const decoder = new PropertyDecoder(
		options.defaultCharset ?? "utf-8",
		bytes.transcoded,
		issues,
	);
	for (const issue of bytes.issues) issues.push(issue);
	const aboutInput = issues.issues.length;

	let read = 0;
	// One line past the cap is read and only counted: it tells an input over the cap from a full one.
	const lines = readLogicalLines(bytes.bytes, issues, options.maxLineLength)
		.take(maxContentLines + 1)
		.filter(() => ++read <= maxContentLines);
	// Card by card: the lines of a card are garbage once it is decoded, so the peak is the model.
	const cards: VCard[] = [];
	const spans: CardSpan[] = [];
	for (const raw of groupCards(lines, issues)) {
		// The card the cap cut is refused with the rest: decoding it would be for nothing.
		if (read > maxContentLines) break;
		cards.push({
			version: raw.version,
			properties: raw.lines.map((line) => decoder.decode(line, raw.version)),
		});
		spans.push({ line: raw.line, endLine: raw.endLine });
	}
	if (read > maxContentLines) {
		// A line costs about a kilobyte of model whatever its length. What was read is dropped
		// with what was said of it: a card must not pass as complete when the input was cut.
		const message = `Input has more than ${maxContentLines} content lines, nothing parsed`;
		const refusal = error("too-many-lines", message);
		return { cards: [], issues: [...issues.issues.slice(0, aboutInput), refusal] };
	}
	// Source order whichever stage spoke; what is about the whole input has no line and leads.
	issues.issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
	assignCards(issues.issues, spans);
	return { cards, issues: issues.issues };
}

// By line range: the line stage reports before cards exist and its dropped lines never reach
// the grouper, which names the card itself on a nested BEGIN line, the one line in two ranges.
function assignCards(issues: Issue[], cards: readonly CardSpan[]): void {
	for (const issue of issues) {
		if (issue.line === undefined || issue.card !== undefined) continue;
		const index = firstEndingAtOrAfter(cards, issue.line);
		const card = cards[index];
		if (card !== undefined && card.line <= issue.line) issue.card = index;
	}
}

/** Binary search: cards are in source order, so `endLine` only grows. */
function firstEndingAtOrAfter(cards: readonly CardSpan[], line: number): number {
	let low = 0;
	let high = cards.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if ((cards[middle]?.endLine ?? 0) < line) low = middle + 1;
		else high = middle;
	}
	return low;
}
