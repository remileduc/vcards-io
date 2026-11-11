import type { VCardVersion } from "../types.js";
import { discardIssues, info, latin1, warn } from "./issues.js";
import { lexContentLine, type RawLine } from "./lexer.js";
import type { IssueSink, LogicalLine } from "./lines.js";

const LF = new Uint8Array([0x0a]);
const HASH = 0x23;

export interface RawCard {
	version: VCardVersion;
	/** "guessed" when the card had no usable VERSION line. */
	versionSource: "explicit" | "guessed";
	/** Every lexed line between BEGIN and END but VERSION, in source order. */
	lines: RawLine[];
	/** Physical line of BEGIN:VCARD. */
	line: number;
	/** Physical line that closed the card: its END, a nested BEGIN, Infinity at end of input. */
	endLine: number;
}

interface OpenCard {
	lines: RawLine[];
	line: number;
	versions: RawLine[];
	/** Line read last, VERSION or not: an inline AGENT is told by the line right before its BEGIN. */
	last: RawLine | null;
	/** 2.1 markers: bare parameters or quoted-printable encoding seen. */
	legacy: boolean;
}

interface OpenAgent {
	target: RawLine;
	depth: number;
	chunks: Uint8Array[];
}

/**
 * Groups logical lines into cards. BEGIN/END are matched case-insensitively; a missing END
 * closes the card at EOF, a 2.1 AGENT's nested vCard (after an empty `AGENT:` as in the
 * versit example, or right after the colon as in its grammar) becomes that AGENT's raw text
 * value, any other nested BEGIN closes the current card. VERSION may sit anywhere in the
 * card and is consumed here, never kept as a line; without one, 2.1 is assumed when 2.1
 * syntax was seen, 3.0 otherwise. Lines starting with "#" are comments to AOSP and skipped
 * here too.
 */
export function groupCards(lines: LogicalLine[], issues: IssueSink): RawCard[] {
	const cards: RawCard[] = [];
	let card: OpenCard | null = null;
	let agent: OpenAgent | null = null;

	const close = (endLine: number): void => {
		if (card === null) return;
		cards.push(finish(card, cards.length, endLine, issues));
		card = null;
	};
	const openAgent = (target: RawLine, first: Uint8Array, line: number): OpenAgent => {
		// Valid 2.1 (versit 2.5.4); the android profile reports the loss later.
		issues.push(info("agent-inline-vcard", "Nested vCard in AGENT kept as text", line));
		return { target, depth: 1, chunks: [first] };
	};
	const closeAgent = (): void => {
		if (agent === null) return;
		agent.target.value = join(agent.chunks);
		agent = null;
	};

	for (const logical of lines) {
		if (logical.bytes[0] === HASH) {
			issues.push(info("comment-skipped", "Line starting with # skipped", logical.line));
			continue;
		}
		// Nested AGENT lines are kept verbatim, only BEGIN/END matter: their diagnostics would mislead.
		const raw = lexContentLine(logical, agent === null ? issues : discardIssues);
		if (agent !== null) {
			agent.chunks.push(logical.bytes);
			if (raw !== null && isDelimiter(raw, "BEGIN")) agent.depth++;
			if (raw !== null && isDelimiter(raw, "END") && --agent.depth === 0) closeAgent();
			continue;
		}
		if (raw === null) continue;
		if (isDelimiter(raw, "BEGIN")) {
			if (card !== null) {
				const previous = card.last;
				if (previous?.name === "AGENT" && latin1.decode(previous.value).trim() === "") {
					agent = openAgent(previous, logical.bytes, raw.line);
					continue;
				}
				issues.push(
					warn(
						"nested-begin",
						"BEGIN:VCARD inside a card, previous card closed",
						raw.line,
						cards.length,
					),
				);
				close(raw.line);
			}
			card = { lines: [], line: raw.line, versions: [], last: null, legacy: false };
		} else if (isDelimiter(raw, "END")) {
			if (card === null) {
				issues.push(warn("unexpected-end", "END:VCARD outside a card ignored", raw.line));
			} else {
				close(raw.line);
			}
		} else if (card === null) {
			issues.push(
				warn("line-outside-card", `${raw.name} outside BEGIN/END ignored`, raw.line),
			);
		} else {
			if (raw.name === "VERSION") card.versions.push(raw);
			else card.lines.push(raw);
			card.last = raw;
			if (!card.legacy) card.legacy = hasLegacySyntax(raw);
			// versit 2.9: `"AGENT" [params] ":" vcard`, the nested card starts after the colon.
			if (raw.name === "AGENT" && isBeginVCard(raw.value)) {
				agent = openAgent(raw, raw.value, raw.line);
			}
		}
	}
	if (agent !== null) {
		issues.push(
			warn("missing-end", "Nested AGENT vCard closed at end of input", agent.target.line),
		);
		closeAgent();
	}
	if (card !== null) {
		const last = lines.at(-1)?.line;
		issues.push(warn("missing-end", "Card closed at end of input without END:VCARD", last));
		close(Number.POSITIVE_INFINITY);
	}
	return cards;
}

function finish(card: OpenCard, index: number, endLine: number, issues: IssueSink): RawCard {
	let version: VCardVersion | null = null;
	for (const raw of card.versions) {
		const text = latin1.decode(raw.value).trim();
		if (text !== "2.1" && text !== "3.0" && text !== "4.0") {
			issues.push(warn("version-unknown", `Unknown VERSION "${text}" ignored`, raw.line));
		} else if (version === null) {
			version = text;
			if (raw.group !== null || raw.params.length > 0) {
				issues.push(
					info(
						"version-extras-dropped",
						"Group and parameters of the VERSION line dropped",
						raw.line,
					),
				);
			}
		} else {
			issues.push(warn("version-duplicate", `Second VERSION "${text}" ignored`, raw.line));
		}
	}
	if (version !== null) {
		return { version, versionSource: "explicit", lines: card.lines, line: card.line, endLine };
	}
	version = card.legacy ? "2.1" : "3.0";
	// Reported on the BEGIN line, which after a nested BEGIN is also where the card before ends.
	issues.push(warn("version-missing", `No VERSION, assuming ${version}`, card.line, index));
	return { version, versionSource: "guessed", lines: card.lines, line: card.line, endLine };
}

function isDelimiter(raw: RawLine, name: "BEGIN" | "END"): boolean {
	return raw.name === name && latin1.decode(raw.value).trim().toUpperCase() === "VCARD";
}

function isBeginVCard(value: Uint8Array): boolean {
	return latin1.decode(value).trim().toUpperCase() === "BEGIN:VCARD";
}

function hasLegacySyntax(raw: RawLine): boolean {
	return raw.params.some(
		(p) =>
			p.bare ||
			(p.name === "ENCODING" &&
				p.values.some((v) => latin1.decode(v).toUpperCase() === "QUOTED-PRINTABLE")),
	);
}

function join(chunks: Uint8Array[]): Uint8Array {
	let total = chunks.length - 1;
	for (const c of chunks) total += c.length;
	const out = new Uint8Array(Math.max(total, 0));
	let offset = 0;
	for (const [k, c] of chunks.entries()) {
		if (k > 0) out.set(LF, offset++);
		out.set(c, offset);
		offset += c.length;
	}
	return out;
}
