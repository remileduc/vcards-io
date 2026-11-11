import type { Issue, ParseOptions, ParseResult, VCard } from "../types.js";
import { toUtf8Bytes } from "./bytes.js";
import { groupCards, type RawCard } from "./cards.js";
import { IssueCollector } from "./issues.js";
import { readLogicalLines } from "./lines.js";
import { PropertyDecoder } from "./properties.js";

/**
 * Parses one or more vCards of any version (2.1, 3.0, 4.0, mixed) from text or bytes into the
 * ordered lossless model. Never throws on input: size caps and malformed content are reported
 * as issues. Throws RangeError only for options that make no sense.
 */
export function parseVCards(
	input: string | Uint8Array | ArrayBuffer,
	options: ParseOptions = {},
): ParseResult {
	const issues = new IssueCollector();
	const bytes = toUtf8Bytes(input, options.maxInputBytes);
	const decoder = new PropertyDecoder(
		options.defaultCharset ?? "utf-8",
		bytes.transcoded,
		issues,
	);
	for (const issue of bytes.issues) issues.push(issue);
	const lines = readLogicalLines(bytes.bytes, issues, options.maxLineLength);
	const raws = groupCards(lines, issues);
	const cards: VCard[] = raws.map((raw) => ({
		version: raw.version,
		properties: raw.lines.map((line) => decoder.decode(line, raw.version)),
	}));
	assignCards(issues.issues, raws);
	return { cards, issues: issues.issues };
}

// By line range: the line stage reports before cards exist and its dropped lines never reach
// the grouper, which names the card itself on a nested BEGIN line, the one line in two ranges.
function assignCards(issues: Issue[], cards: readonly RawCard[]): void {
	for (const issue of issues) {
		if (issue.line === undefined || issue.card !== undefined) continue;
		const index = firstEndingAtOrAfter(cards, issue.line);
		const card = cards[index];
		if (card !== undefined && card.line <= issue.line) issue.card = index;
	}
}

/** Binary search: cards are in source order, so `endLine` only grows. */
function firstEndingAtOrAfter(cards: readonly RawCard[], line: number): number {
	let low = 0;
	let high = cards.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if ((cards[middle]?.endLine ?? 0) < line) low = middle + 1;
		else high = middle;
	}
	return low;
}
