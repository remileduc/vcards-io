export type VCardVersion = "2.1" | "3.0" | "4.0";

/** One parsed card. `properties` keeps the source order, including VERSION. */
export interface VCard {
	version: VCardVersion;
	properties: VProperty[];
}

/** Parameter names are uppercased; insertion order is kept. */
export type VParams = Map<string, string[]>;

export interface VProperty {
	/** Lowercased group ("item1"), null when absent. */
	group: string | null;
	/** Uppercased property name ("TEL", "X-ANDROID-CUSTOM"). */
	name: string;
	params: VParams;
	value: VValue;
	/** 1-based source line, for diagnostics. */
	line?: number;
}

export interface UtcOffset {
	sign: 1 | -1;
	hours: number;
	minutes: number;
}

/**
 * RFC 6350 date-and-or-time with every part optional. A date has at least one of
 * year/month/day and no hour; a time has an hour (or minute/second for truncated forms)
 * and no date part; a date-time has both.
 */
export interface DateAndOrTime {
	year?: number;
	month?: number;
	day?: number;
	hour?: number;
	minute?: number;
	second?: number;
	zone?: UtcOffset | "utc";
}

/** Complete date-time (REV, CREATED). Missing `zone` means floating. */
export interface Timestamp {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	zone?: UtcOffset | "utc";
}

export type VValue =
	| { kind: "text"; value: string }
	| { kind: "text-list"; values: string[] }
	| { kind: "structured"; components: string[][] }
	| { kind: "uri"; value: string }
	| { kind: "date-and-or-time"; value: DateAndOrTime; raw: string }
	| { kind: "timestamp"; value: Timestamp; raw: string }
	| { kind: "utc-offset"; sign: 1 | -1; hours: number; minutes: number }
	| { kind: "language-tag"; value: string }
	| { kind: "integer"; value: number }
	| { kind: "float"; value: number }
	| { kind: "boolean"; value: boolean }
	| { kind: "binary"; data: Uint8Array; mediaType?: string }
	| { kind: "unknown"; raw: string };

export type VValueKind = VValue["kind"];

export type IssueSeverity = "error" | "warning" | "info";

export interface Issue {
	severity: IssueSeverity;
	code: string;
	message: string;
	line?: number;
	property?: string;
	/** Index of the card in the `cards` argument, on issues raised by `serializeVCards`. */
	card?: number;
}

export interface ParseOptions {
	/** Charset used when a value has no CHARSET parameter. Default "utf-8". */
	defaultCharset?: string;
	/** Longest physical line accepted, in bytes. Default 1 MiB. */
	maxLineLength?: number;
	/** Largest input accepted, in bytes. Default 64 MiB. */
	maxInputBytes?: number;
}

export interface ParseResult {
	cards: VCard[];
	issues: Issue[];
}

export interface SerializeOptions {
	version: "3.0" | "4.0";
	/** Fold lines longer than this many octets. Default 75; "none" disables folding. */
	foldAt?: number | "none";
	/** Empty lines between consecutive cards, 0 to 9. Default 0: Apple's tolerance is unverified. */
	blankLinesBetweenCards?: number;
}

export interface SerializeResult {
	text: string;
	/** One warning per loss the version forced; nothing for 4.0. */
	issues: Issue[];
}
