import { nearestValueKind, TEXT_FAMILY } from "../registry.js";
import type { VParams, VProperty, VValue } from "../types.js";
import type { DateFormatOptions } from "../values/date.js";

/** Reports one loss the version forced on the property being written; the engine files it. */
export type Warn = (code: string, message: string) => void;

/** What a property looks like in one version, before the engine formats and folds it. */
export interface Prepared {
	params: VParams;
	value: VValue;
}

/** CHARSET and ENCODING describe transport bytes; the writer owns both and never emits them. */
export const TRANSPORT_PARAMS: ReadonlySet<string> = new Set(["CHARSET", "ENCODING"]);

/**
 * One vCard version's syntax. The engine is version-agnostic: it formats values, derives the
 * VALUE parameter, assembles and folds lines; the table says what the version can carry and
 * how it spells parameters.
 */
export interface SyntaxTable {
	readonly version: "3.0" | "4.0";
	/** Basic (4.0) or extended (3.0) ISO forms for dates, times and offsets. */
	readonly dateFormat: DateFormatOptions;
	/** The parameters this version carries and the value shape it needs; `p` is the engine's copy. */
	prepare(p: VProperty, warn: Warn): Prepared;
	/** The VALUE token naming a value's kind, undefined when the version has no word for it. */
	valueToken(value: VValue): string | undefined;
	/** A multi-valued parameter written once per value rather than as one comma list. */
	repeats(name: string): boolean;
	/** One parameter value, encoded and quoted; undefined, after `warn`, when the version has no form. */
	encodeParamValue(name: string, value: string, warn: Warn): string | undefined;
}

/**
 * The VALUE parameter to write: none when the kind is the property's default in this version
 * (unknown properties default to text), the version's token otherwise. An `unknown` value keeps
 * the declared parameter. A `binary` one needs none on a media or unknown property (ENCODING
 * says it) but must say so on a text property, where readers take base64 as a transfer
 * encoding. Deriving it rather than copying it keeps the output canonical whatever the
 * caller's model declared.
 */
export function valueParam(table: SyntaxTable, p: VProperty, value: VValue): string | undefined {
	const declared = p.params.get("VALUE")?.[0];
	if (value.kind === "unknown") return declared;
	const known = nearestValueKind(p.name, table.version);
	if (value.kind === "binary") {
		return known === undefined || known === "binary" ? undefined : table.valueToken(value);
	}
	const expected = known ?? "text";
	const same =
		value.kind === expected || (TEXT_FAMILY.has(value.kind) && TEXT_FAMILY.has(expected));
	return same ? undefined : table.valueToken(value);
}

/** True for a C0 control (tab excepted) or DEL: a parameter value has no encoding for them. */
export function hasControlChar(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
	}
	return false;
}

/** RFC 2426 / 6350: a value holding `;` `:` or `,` must be quoted; readers trim an unquoted one. */
export function quoteIfNeeded(value: string): string {
	return /[;:,]|^\s|\s$/.test(value) ? `"${value}"` : value;
}
