import type { ParseOptions, ParseResult, VCard } from "../types.js";
import { toUtf8Bytes } from "./bytes.js";
import { groupCards } from "./cards.js";
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
	const cards: VCard[] = groupCards(lines, issues).map((raw) => ({
		version: raw.version,
		properties: raw.lines.map((line) => decoder.decode(line, raw.version)),
	}));
	return { cards, issues: issues.issues };
}
