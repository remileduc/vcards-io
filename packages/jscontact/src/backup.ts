// The JSON backup: an array of Cards, each stamped with the format that wrote it. The stamp
// belongs to the file: no Card in memory carries it. docs/plan.md, "Format stamp".

import { type CardIssue, describeValue, IssueCollector, issue } from "./issues.js";
import { isRecord } from "./json.js";
import { normalizeCard } from "./normalize.js";
import type { Card } from "./types.js";
import { validateCard } from "./validate.js";
import { FORMAT_STAMP, FORMAT_VERSION } from "./vendor.js";

export interface ParseCardsOptions {
	/** Bytes or UTF-16 code units of JSON text read at most; `Infinity` is no cap. */
	maxTextLength?: number;
}

export interface ParseCardsResult {
	/** The Cards the validator accepted, in the order of the input, without their stamp. */
	cards: Card[];
	/** How many Cards were left out: past the cap of a code, no issue names them any more. */
	refused: number;
	/** `input`: position in the input; `card`: index in `cards`, set for a Card that was kept. */
	issues: CardIssue[];
}

/** The vCard reader takes as many bytes. `serializeCards` has no cap: it may write more. */
export const DEFAULT_MAX_TEXT_LENGTH = 64 * 1024 * 1024;

type Report = (found: CardIssue) => void;

// ignoreBOM: the mark stays in the text and is removed in one place, as it is from a string.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Reads a backup: JSON text, its UTF-8 bytes, or the value it holds, being one Card or an array of
 * Cards. No input makes it throw and it changes nothing it is given.
 */
export function parseCards(
	input: unknown,
	{ maxTextLength = DEFAULT_MAX_TEXT_LENGTH }: ParseCardsOptions = {},
): ParseCardsResult {
	const isLength = Number.isInteger(maxTextLength) || maxTextLength === Infinity;
	if (!isLength || maxTextLength < 1) {
		throw new RangeError(
			`maxTextLength must be a positive integer or Infinity, got ${maxTextLength}`,
		);
	}
	const issues = new IssueCollector();
	const cards: Card[] = [];
	let refused = 0;
	for (const [position, candidate] of candidates(input, maxTextLength, issues).entries()) {
		const found: CardIssue[] = [];
		const card = readCard(candidate, (raised) => found.push(raised));
		// `card` as @vcards-io/vcard sets it: an index in `cards`, where a refused Card is not.
		const place = card === null ? { input: position } : { input: position, card: cards.length };
		for (const raised of found) issues.push({ ...raised, ...place });
		if (card === null) refused += 1;
		else cards.push(card);
	}
	return { cards, refused, issues: issues.issues };
}

/**
 * The backup text of Cards the validator accepted: stamped, normalized, two-space JSON. Written
 * as version "2.0", which is what `parseCards` reads a "1.0" Card as.
 */
export function serializeCards(cards: readonly Card[]): string {
	// Stamped first: normalizeCard then sorts the stamp among the vendor properties.
	const stamped = cards.map((card) =>
		normalizeCard({ ...card, version: "2.0", [FORMAT_STAMP]: FORMAT_VERSION }),
	);
	return `${JSON.stringify(stamped, null, 2)}\n`;
}

function candidates(input: unknown, maxTextLength: number, issues: IssueCollector): unknown[] {
	const isBytes = input instanceof ArrayBuffer || ArrayBuffer.isView(input);
	if (!isBytes && typeof input !== "string") return Array.isArray(input) ? input : [input];
	// The length is read in the try: that of a DataView on a detached buffer throws.
	try {
		// Bytes are counted as they are: UTF-8 never takes fewer of them than UTF-16 code units.
		if ((isBytes ? input.byteLength : input.length) > maxTextLength) {
			const unit = isBytes ? "bytes" : "characters";
			const message = `The text is longer than ${maxTextLength} ${unit}`;
			issues.push(issue("error", "json-too-large", message, ""));
			return [];
		}
		const text = isBytes ? decoder.decode(input) : input;
		// A byte order mark is no JSON: editors write one.
		const value: unknown = JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);
		return Array.isArray(value) ? value : [value];
	} catch (cause) {
		issues.push(issue("error", "json-syntax", `The text is not JSON: ${cause}`, ""));
		return [];
	}
}

function readCard(candidate: unknown, report: Report): Card | null {
	let value = candidate;
	let stampIsValid = true;
	if (isRecord(candidate) && Object.hasOwn(candidate, FORMAT_STAMP)) {
		const { [FORMAT_STAMP]: stamp, ...unstamped } = candidate;
		value = unstamped;
		stampIsValid = checkStamp(stamp, report);
	}
	// Validated in full whatever the stamp says: it chooses the migrations and nothing else.
	const { card, issues } = validateCard(value);
	issues.forEach(report);
	if (card === null || !stampIsValid) return null;
	if (card.version !== "1.0") return card;
	const message = 'Version "1.0" read as "2.0": every valid 1.0 Card is a valid 2.0 Card';
	report(issue("info", "version-upgraded", message, "/version"));
	return { ...card, version: "2.0" };
}

/** False for a stamp this project never wrote. A later format is read as it stands. */
function checkStamp(stamp: unknown, report: Report): boolean {
	const path = `/${FORMAT_STAMP}`;
	if (typeof stamp !== "number" || !Number.isSafeInteger(stamp) || stamp < 1) {
		const message = `Expected a positive integer, found ${describeValue(stamp)}`;
		report(issue("error", "format-version-invalid", message, path));
		return false;
	}
	if (stamp > FORMAT_VERSION) {
		const message = `Written in format ${stamp}, later than the format ${FORMAT_VERSION} read here: taken as it stands`;
		report(issue("warning", "format-version-newer", message, path));
	}
	// A migration from an older format runs here, once there is a format 2.
	return true;
}
