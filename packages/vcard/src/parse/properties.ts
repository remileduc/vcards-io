import type { ParseIssueCode } from "../issue-codes.js";
import { defaultValueKind, isMediaProperty, PROPERTY_REGISTRY, TEXT_FAMILY } from "../registry.js";
import { decodeBase64 } from "../text/base64.js";
import { caretDecode } from "../text/caret.js";
import { splitEscaped, unescapeText, unescapeText21 } from "../text/escape.js";
import { decodeQuotedPrintable } from "../text/quoted-printable.js";
import type {
	IssueSeverity,
	VCardVersion,
	VParams,
	VProperty,
	VValue,
	VValueKind,
} from "../types.js";
import { parseDateAndOrTime, parseTimestamp, parseUtcOffset } from "../values/date.js";
import { guessImageType } from "../values/image.js";
import { declaredMediaType, mediaTypeFromName } from "../values/media.js";
import { URI_SCHEME } from "../values/uri.js";
import { excerpt, info, issue, latin1 } from "./issues.js";
import type { RawLine } from "./lexer.js";
import type { IssueSink } from "./lines.js";

/** VALUE parameter values and the kind they select; `vcard` and `inline` defer to the registry. */
const VALUE_KINDS: ReadonlyMap<string, VValueKind | "registry"> = new Map([
	["text", "text"],
	["uri", "uri"],
	["url", "uri"],
	["date", "date-and-or-time"],
	["time", "date-and-or-time"],
	["date-time", "date-and-or-time"],
	["date-and-or-time", "date-and-or-time"],
	["timestamp", "timestamp"],
	["utc-offset", "utc-offset"],
	["language-tag", "language-tag"],
	["integer", "integer"],
	["float", "float"],
	["boolean", "boolean"],
	["binary", "binary"],
	["vcard", "registry"],
	// 2.1 forms: INLINE is the default; CID / CONTENT-ID reference a MIME part by URI.
	["inline", "registry"],
	["cid", "uri"],
	["content-id", "uri"],
]);

/** Parameters whose values are ASCII tokens by definition: never decoded with a declared charset. */
const ASCII_PARAMS: ReadonlySet<string> = new Set(["CHARSET", "ENCODING", "VALUE"]);

const INTEGER = /^[+-]?\d+$/;
/** A FLOAT value, also the shape of each GEO coordinate the upgrade turns into a geo: URI. */
export const FLOAT = /^[+-]?\d+(?:\.\d+)?$/;
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * Turns lexed lines into typed properties once the card's version is known: decodes
 * parameter and value bytes (ENCODING, CHARSET, caret), then types the value from VALUE or
 * the registry (docs/plan.md, step 6). One instance per parse call caches the decoders.
 */
export class PropertyDecoder {
	private readonly decoders = new Map<string, TextDecoder>();
	private readonly defaultCharset: string;

	/**
	 * Throws RangeError when `defaultCharset` is not an encoding label the platform knows.
	 * Transcoded input is UTF-8 by construction: its CHARSET parameters and `defaultCharset`
	 * describe bytes that no longer exist and are ignored with an info.
	 */
	constructor(
		defaultCharset: string,
		private readonly transcoded: boolean,
		private readonly issues: IssueSink,
	) {
		const requested = this.decoder(defaultCharset).encoding;
		this.defaultCharset = transcoded ? "utf-8" : requested;
		if (transcoded && requested !== "utf-8") {
			issues.push(
				info("charset-ignored", `defaultCharset ${requested} ignored, the input is text`),
			);
		}
	}

	decode(raw: RawLine, version: VCardVersion): VProperty {
		const ctx = new Context(raw, version, this.issues);
		const charset = this.charsetOf(raw, ctx);
		const params = this.decodeParams(raw, version, charset, ctx);
		const property: VProperty = {
			group: raw.group,
			name: raw.name,
			params,
			value: this.decodeValue(raw.value, params, charset, ctx),
			line: raw.line,
		};
		return property;
	}

	private charsetOf(raw: RawLine, ctx: Context): string {
		for (const param of raw.params) {
			if (param.name !== "CHARSET") continue;
			for (const value of param.values) {
				const label = latin1.decode(value).trim();
				if (label === "") continue;
				if (ctx.version === "4.0") {
					// RFC 6350 dropped CHARSET: a 4.0 card is UTF-8 whatever a legacy writer put there.
					ctx.report(
						"info",
						"charset-ignored",
						`CHARSET is not a vCard 4.0 parameter, ${this.defaultCharset} used`,
					);
					return this.defaultCharset;
				}
				let charset: string;
				try {
					charset = this.decoder(label).encoding;
				} catch {
					ctx.report(
						"warning",
						"charset-unknown",
						`Unknown CHARSET "${label}", ${this.defaultCharset} used`,
					);
					return this.defaultCharset;
				}
				if (this.transcoded && charset !== "utf-8") {
					ctx.report(
						"info",
						"charset-ignored",
						`CHARSET=${label} ignored, the input is text`,
					);
					return this.defaultCharset;
				}
				return charset;
			}
		}
		return this.defaultCharset;
	}

	private decodeParams(
		raw: RawLine,
		version: VCardVersion,
		charset: string,
		ctx: Context,
	): VParams {
		const params: VParams = new Map();
		for (const param of raw.params) {
			const values: string[] = [];
			for (const bytes of param.values) {
				let value = ASCII_PARAMS.has(param.name)
					? latin1.decode(bytes)
					: this.decodeText(bytes, charset, ctx);
				if (version === "4.0") value = caretDecode(value);
				if (param.name === "TYPE") {
					// RFC 6350 section 8 writes TYPE="work,voice": a quoted TYPE is still a list.
					for (const piece of value.split(",")) {
						const type = normaliseType(piece.trim());
						if (type !== "") values.push(type);
					}
				} else if (value !== "") {
					values.push(value);
				}
			}
			if (values.length === 0) continue;
			const existing = params.get(param.name);
			if (existing === undefined) params.set(param.name, values);
			// No spread: a hostile line with a million values would overflow the call stack.
			else for (const value of values) existing.push(value);
		}
		return params;
	}

	private decodeValue(bytes: Uint8Array, params: VParams, charset: string, ctx: Context): VValue {
		const kind = resolveKind(ctx, params);
		const encoding = encodingOf(params, ctx);
		if (encoding === "base64") {
			try {
				bytes = decodeBase64(latin1.decode(bytes));
			} catch {
				ctx.report("warning", "invalid-base64", "Value is not valid base64, kept as text");
				return { kind: "unknown", raw: this.decodeText(bytes, charset, ctx) };
			}
			// Base64 is the value itself for media, a transfer encoding for text (versit 2.1).
			if (kind === "binary" || kind === "unknown" || isMediaProperty(ctx.name)) {
				if (bytes.length === 0) ctx.report("info", "binary-empty", "Empty inline binary");
				const value: VValue = { kind: "binary", data: bytes };
				const mediaType = mediaTypeOf(bytes, params);
				if (mediaType !== undefined) value.mediaType = mediaType;
				return value;
			}
		}
		if (encoding === "quoted-printable") bytes = decodeQuotedPrintable(bytes);
		const text = this.decodeText(bytes, charset, ctx);
		return typeValue(text, kind, params, ctx);
	}

	/** Strict decode in the given charset; bytes it rejects are read as windows-1252 with a warning. */
	private decodeText(bytes: Uint8Array, charset: string, ctx: Context): string {
		try {
			return this.decoder(charset).decode(bytes);
		} catch {
			ctx.report(
				"warning",
				"charset-fallback",
				`Bytes are not valid ${charset}, decoded as ${latin1.encoding}`,
			);
			return latin1.decode(bytes);
		}
	}

	private decoder(label: string): TextDecoder {
		const key = label.toLowerCase();
		let decoder = this.decoders.get(key);
		if (decoder === undefined) {
			// ignoreBOM keeps a U+FEFF inside a value; fatal makes mojibake detectable.
			decoder = new TextDecoder(label, { fatal: true, ignoreBOM: true });
			this.decoders.set(key, decoder);
		}
		return decoder;
	}
}

/** Where a value is being decoded, for diagnostics. */
class Context {
	readonly name: string;
	readonly version: VCardVersion;
	private readonly line: number;
	private readonly property: string;

	constructor(
		raw: RawLine,
		version: VCardVersion,
		private readonly issues: IssueSink,
	) {
		this.name = raw.name;
		this.version = version;
		this.line = raw.line;
		this.property = raw.group === null ? raw.name : `${raw.group}.${raw.name}`;
	}

	report(severity: IssueSeverity, code: ParseIssueCode, message: string): void {
		this.issues.push(issue(severity, code, message, this.line, this.property));
	}
}

/** TYPE values are case-insensitive tokens, except X- custom labels, which Android shows as written. */
function normaliseType(value: string): string {
	return /^x-/i.test(value) ? value : value.toLowerCase();
}

function encodingOf(params: VParams, ctx: Context): "base64" | "quoted-printable" | null {
	for (const value of params.get("ENCODING") ?? []) {
		switch (value.toUpperCase()) {
			case "B":
			case "BASE64":
				return "base64";
			case "QUOTED-PRINTABLE":
				return "quoted-printable";
			case "7BIT":
			case "8BIT":
				return null;
			default:
				ctx.report("warning", "encoding-unknown", `Unknown ENCODING "${value}" ignored`);
		}
	}
	return null;
}

/** What the bytes are, then what the line claims: writers label every photo JPEG. */
function mediaTypeOf(data: Uint8Array, params: VParams): string | undefined {
	const sniffed = guessImageType(data);
	if (sniffed !== undefined) return sniffed;
	for (const declared of params.get("MEDIATYPE") ?? []) {
		const typed = declaredMediaType(declared);
		if (typed !== undefined) return typed;
	}
	for (const type of params.get("TYPE") ?? []) {
		const named = mediaTypeFromName(type);
		if (named !== undefined) return named;
	}
	return undefined;
}

/** VALUE parameter first, then the registry default for the version, else unknown. */
function resolveKind(ctx: Context, params: VParams): VValueKind {
	let kind = defaultValueKind(ctx.name, ctx.version);
	const spec = PROPERTY_REGISTRY.get(ctx.name);
	if (kind === undefined && spec !== undefined) {
		// Defined for other versions only: NICKNAME in 2.1, LABEL in 4.0. Read it as there.
		const nearest = spec.versions.at(-1) ?? ctx.version;
		kind = typeof spec.kind === "string" ? spec.kind : spec.kind[nearest];
		ctx.report(
			"info",
			"property-not-in-version",
			`${ctx.name} is not a vCard ${ctx.version} property, read as in ${nearest}`,
		);
	}
	const requested = params.get("VALUE")?.[0];
	if (requested !== undefined) {
		const selected = VALUE_KINDS.get(requested.toLowerCase());
		if (selected === undefined) {
			ctx.report("warning", "value-type-unknown", `Unknown VALUE "${requested}" ignored`);
		} else if (
			selected !== "registry" &&
			!(selected === "text" && TEXT_FAMILY.has(kind ?? "unknown"))
		) {
			kind = selected;
		}
	}
	return kind ?? "unknown";
}

function typeValue(text: string, kind: VValueKind, params: VParams, ctx: Context): VValue {
	const legacy = ctx.version === "2.1";
	const unescapeComponent = legacy ? unescapeText21 : unescapeText;
	switch (kind) {
		case "text":
			// AOSP leaves 2.1 text as written; only list splitting unescapes there.
			return { kind, value: legacy ? text : unescapeText(text) };
		case "text-list":
			return { kind, values: splitEscaped(text, ",").map(unescapeComponent) };
		case "structured": {
			const commaIsLiteral =
				legacy || PROPERTY_REGISTRY.get(ctx.name)?.commaIsLiteral === true;
			const components = splitEscaped(text, ";").map((component) =>
				commaIsLiteral
					? [unescapeComponent(component)]
					: splitEscaped(component, ",").map(unescapeText),
			);
			return { kind, components };
		}
		case "uri":
			if (text.includes("\\:")) {
				// Google writes `http\://`, and some exports double it: strip the whole run.
				ctx.report("warning", "uri-escaped-colon", "Escaped colon in URI repaired");
				return { kind, value: text.replace(/\\+:/g, ":") };
			}
			return { kind, value: text };
		case "date-and-or-time":
		case "timestamp":
			return typeDate(text, kind, params, ctx);
		case "utc-offset": {
			const offset = parseUtcOffset(text.trim());
			if (offset === null) return invalid(text, kind, ctx);
			return { kind, value: offset };
		}
		case "language-tag": {
			const tag = text.trim();
			return LANGUAGE_TAG.test(tag) ? { kind, value: tag } : invalid(text, kind, ctx);
		}
		case "integer": {
			const value = Number(text.trim());
			if (!INTEGER.test(text.trim()) || !Number.isSafeInteger(value)) {
				return invalid(text, kind, ctx);
			}
			return { kind, value };
		}
		case "float": {
			const trimmed = text.trim();
			return FLOAT.test(trimmed)
				? { kind, value: Number(trimmed) }
				: invalid(text, kind, ctx);
		}
		case "boolean": {
			const word = text.trim().toLowerCase();
			if (word !== "true" && word !== "false") return invalid(text, kind, ctx);
			return { kind, value: word === "true" };
		}
		case "binary":
			// 2.1 / 3.0 media property without ENCODING: a URL (Thunderbird, Evolution) or junk.
			if (URI_SCHEME.test(text.trim())) {
				ctx.report("info", "binary-as-uri", `${ctx.name} without ENCODING read as a URI`);
				return { kind: "uri", value: text.trim() };
			}
			ctx.report(
				"warning",
				"binary-without-encoding",
				`${ctx.name} has neither ENCODING nor a URI, kept as written`,
			);
			return { kind: "unknown", raw: text };
		case "unknown":
			return { kind, raw: text };
	}
}

function typeDate(
	text: string,
	kind: "date-and-or-time" | "timestamp",
	params: VParams,
	ctx: Context,
): VValue {
	const calscale = params.get("CALSCALE")?.[0];
	if (calscale !== undefined && calscale.toLowerCase() !== "gregorian") {
		ctx.report("info", "calscale-unsupported", `CALSCALE=${calscale} date kept as written`);
		return { kind: "unknown", raw: text };
	}
	const trimmed = text.trim();
	if (kind === "timestamp") {
		const timestamp = parseTimestamp(trimmed);
		if (timestamp !== null) return { kind, value: timestamp, raw: text };
		const partial = parseDateAndOrTime(trimmed);
		if (partial !== null) {
			// RFC 2426 lets REV carry a plain date; RFC 6350 does not.
			ctx.report(
				ctx.version === "4.0" ? "warning" : "info",
				"timestamp-incomplete",
				`${ctx.name} is not a complete date-time, read as date-and-or-time`,
			);
			return { kind: "date-and-or-time", value: partial, raw: text };
		}
		return invalid(text, kind, ctx);
	}
	const date = parseDateAndOrTime(trimmed);
	return date === null ? invalid(text, kind, ctx) : { kind, value: date, raw: text };
}

function invalid(text: string, kind: VValueKind, ctx: Context): VValue {
	ctx.report(
		"warning",
		"invalid-value",
		`Not a valid ${kind}, kept as written: ${excerpt(text)}`,
	);
	return { kind: "unknown", raw: text };
}
