import { IssueCollector, issue } from "../parse/issues.js";
import { NAME_RE } from "../parse/lexer.js";
import { FLOAT } from "../parse/properties.js";
import { encodeBase64 } from "../text/base64.js";
import { escapeText } from "../text/escape.js";
import { assertFoldAt, foldLine } from "../text/fold.js";
import type {
	SerializeOptions,
	SerializeResult,
	VCard,
	VParams,
	VProperty,
	VValue,
} from "../types.js";
import { propertyId } from "../upgrade/context.js";
import { formatDateAndOrTime, formatTimestamp, formatUtcOffset } from "../values/date.js";
import { SerializeError } from "./error.js";
import { type SyntaxTable, valueParam, type Warn } from "./syntax.js";
import { V30 } from "./v30.js";
import { V40 } from "./v40.js";

// A Map, not an object: a version such as "constructor" must not find a prototype member.
const TABLES: ReadonlyMap<string, SyntaxTable> = new Map([
	["3.0", V30],
	["4.0", V40],
]);

const LINE_BREAK = /[\r\n]/;

/**
 * Writes cards in vCard 3.0 or 4.0 syntax: `BEGIN:VCARD`, `VERSION`, the properties in model
 * order, `END:VCARD`, CRLF, no BOM, raw UTF-8, names uppercased, lines over `foldAt` octets
 * folded, `blankLinesBetweenCards` empty lines between cards (none by default). VERSION is the
 * requested one whatever `card.version` says. Every loss the version forces is a warning in
 * `issues`. Throws SerializeError for what no version can express (see the class) and
 * RangeError for options that make no sense.
 */
export function serializeVCards(
	cards: readonly VCard[],
	options: SerializeOptions,
): SerializeResult {
	const table = TABLES.get(options.version);
	if (table === undefined) throw new RangeError(`Unknown vCard version ${options.version}`);
	const { foldAt = 75, blankLinesBetweenCards = 0 } = options;
	assertFoldAt(foldAt);
	assertBlankLines(blankLinesBetweenCards);
	const fold = { foldAt };
	const separator = "\r\n".repeat(blankLinesBetweenCards);
	const issues = new IssueCollector();
	let text = "";
	cards.forEach((card, index) => {
		if (index > 0) text += separator;
		text += `BEGIN:VCARD\r\nVERSION:${table.version}\r\n`;
		for (const p of card.properties) {
			text += `${foldLine(writeProperty(p, table, index, issues), fold)}\r\n`;
		}
		text += "END:VCARD\r\n";
	});
	return { text, issues: issues.issues };
}

const MAX_BLANK_LINES = 9;

/** Comes from settings at runtime like foldAt; the cap keeps a typo from padding the file. */
function assertBlankLines(count: number): void {
	if (!Number.isInteger(count) || count < 0 || count > MAX_BLANK_LINES) {
		throw new RangeError(
			`blankLinesBetweenCards must be an integer 0..${MAX_BLANK_LINES}, got ${count}`,
		);
	}
}

/** One logical line; every failure below is rethrown with the card and property it belongs to. */
function writeProperty(
	p: VProperty,
	table: SyntaxTable,
	card: number,
	issues: IssueCollector,
): string {
	try {
		return contentLine(p, table, card, issues);
	} catch (error) {
		// A TypeError is a value that lacks the fields of its kind: JSON read without the types.
		const malformed = error instanceof TypeError;
		if (malformed || error instanceof SerializeError || error instanceof RangeError) {
			// `p` itself may be what is malformed: a null entry has no name to report.
			const id = typeof p?.name === "string" ? propertyId(p) : undefined;
			const what = malformed ? `Malformed property: ${error.message}` : error.message;
			throw new SerializeError(`${what} (card ${card}, ${id ?? "no name"})`, card, id);
		}
		throw error;
	}
}

function contentLine(
	source: VProperty,
	table: SyntaxTable,
	card: number,
	issues: IssueCollector,
): string {
	const p = canonical(source);
	// VERSION is `card.version` in the model; one more here would be a second VERSION line.
	if (p.name === "BEGIN" || p.name === "END" || p.name === "VERSION") {
		throw new SerializeError(`${p.name} is not a property`);
	}
	const warn: Warn = (code, message) => {
		const filed = issue("warning", code, message, p.line, propertyId(p));
		filed.card = card;
		issues.push(filed);
	};
	const { params, value } = table.prepare(p, warn);
	// Derived, never copied, and always first: the same model must give the same text.
	const token = valueParam(table, p, value);
	let line = propertyId(p);
	if (token !== undefined) line += parameter("VALUE", [token], table, warn);
	for (const [name, values] of params) {
		if (name !== "VALUE") line += parameter(name, values, table, warn);
	}
	// A lone surrogate has no UTF-8 form; every encoder writes U+FFFD, so do it once, here.
	line = `${line}:${formatValue(value, table)}`.toWellFormed();
	// Text is escaped above; a line break anywhere else would forge a property on re-read.
	if (LINE_BREAK.test(line)) {
		throw new SerializeError("Line break in a value that cannot escape it");
	}
	return line;
}

/** `;NAME=a,b` or `;NAME=a;NAME=b` as the table spells it; empty when no value survives. */
function parameter(name: string, values: readonly string[], table: SyntaxTable, warn: Warn) {
	const encoded: string[] = [];
	for (const v of values) {
		// Readers drop empty values, so writing them would only make the output non-canonical.
		if (v === "") continue;
		// Readers split TYPE on commas even when quoted (RFC 6350 section 8), so none can be written.
		if (name === "TYPE" && v.includes(",")) {
			throw new SerializeError(`TYPE value ${JSON.stringify(v)} holds a comma`);
		}
		const e = table.encodeParamValue(name, v, warn);
		if (e !== undefined) encoded.push(e);
	}
	if (encoded.length === 0) return "";
	if (table.repeats(name)) return encoded.map((v) => `;${name}=${v}`).join("");
	return `;${name}=${encoded.join(",")}`;
}

/**
 * The model says uppercase names and lowercase groups; a hand-built property may not comply,
 * and every table lookup relies on it. This is the one copy, which the tables then own.
 */
function canonical(p: VProperty): VProperty {
	const params: VParams = new Map();
	for (const [name, values] of p.params) {
		const upper = identifier(name, "parameter name").toUpperCase();
		const existing = params.get(upper);
		if (existing === undefined) params.set(upper, [...values]);
		else for (const v of values) existing.push(v);
	}
	const out: VProperty = {
		group: p.group === null ? null : identifier(p.group, "group").toLowerCase(),
		name: identifier(p.name, "property name").toUpperCase(),
		params,
		value: p.value,
	};
	if (p.line !== undefined) out.line = p.line;
	return out;
}

/** Groups, property and parameter names all follow the lexer's name grammar. */
function identifier(text: string, what: string): string {
	if (!NAME_RE.test(text.toUpperCase())) {
		throw new SerializeError(`Invalid ${what} ${JSON.stringify(text)}`);
	}
	return text;
}

function formatValue(value: VValue, table: SyntaxTable): string {
	switch (value.kind) {
		case "text":
			return escapeText(value.value);
		case "text-list":
			return value.values.map(escapeText).join(",");
		case "structured":
			return value.components.map((c) => c.map(escapeText).join(",")).join(";");
		case "uri":
		case "language-tag":
			return value.value;
		case "date-and-or-time":
			return formatDateAndOrTime(value.value, table.dateFormat);
		case "timestamp":
			return formatTimestamp(value.value, table.dateFormat);
		case "utc-offset":
			return formatUtcOffset(value.value, table.dateFormat);
		case "integer":
			if (!Number.isSafeInteger(value.value)) {
				throw new SerializeError(`Not a safe integer: ${value.value}`);
			}
			return String(value.value);
		case "float": {
			const text = String(value.value);
			if (!FLOAT.test(text)) throw new SerializeError(`Not a vCard float: ${text}`);
			return text;
		}
		case "boolean":
			return value.value ? "TRUE" : "FALSE";
		case "binary":
			return encodeBase64(value.data);
		case "unknown":
			return value.raw;
	}
}
