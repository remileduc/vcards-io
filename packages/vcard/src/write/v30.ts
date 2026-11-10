import { excerpt } from "../parse/issues.js";
import { isMediaProperty, VALUE_TOKENS } from "../registry.js";
import type { DateAndOrTime, VParams, VProperty, VValue } from "../types.js";
import { declaredMediaType, mediaTypeName } from "../values/media.js";
import { parseDataUri } from "../values/uri.js";
import {
	hasControlChar,
	type Prepared,
	quoteIfNeeded,
	type SyntaxTable,
	TRANSPORT_PARAMS,
	type Warn,
} from "./syntax.js";

/**
 * RFC 2426 defines TYPE, VALUE, LANGUAGE (ENCODING is the writer's, CHARSET is never written);
 * CALSCALE is kept because Apple's own 3.0 export puts it on X-ALTBDAY and the date is garbage
 * without it. X- parameters pass; every other 4.0 parameter is dropped and reported.
 */
const PARAMS_30: ReadonlySet<string> = new Set(["TYPE", "VALUE", "LANGUAGE", "CALSCALE"]);

/** RFC 2426 component counts. RFC 9554's extra components repeat what these already hold. */
const COMPONENTS_30: ReadonlyMap<string, number> = new Map([
	["N", 5],
	["ADR", 7],
]);

/**
 * RFC 2426 syntax as the phones read it (docs/interop.md): repeated uppercase `TYPE=`,
 * `TYPE=PREF`, inline base64 with `ENCODING=b;TYPE=JPEG`, extended ISO dates, no parameter
 * 3.0 does not define (Apple hides a card whose PHOTO carries a 4.0 one).
 */
export const V30: SyntaxTable = {
	version: "3.0",
	dateFormat: { extended: true },

	prepare(p: VProperty, warn: Warn): Prepared {
		const value = inlineMedia(p);
		const params: VParams = new Map();
		if (value.kind === "binary") params.set("ENCODING", ["b"]);
		const types: string[] = [];
		const dropped: string[] = [];
		let preferred = false;
		for (const [name, values] of p.params) {
			if (name === "TYPE") {
				for (const type of values) {
					if (type.toLowerCase() === "pref") preferred = true;
					else types.push(/^x-/i.test(type) ? type : type.toUpperCase());
				}
			} else if (name === "PREF") {
				if (isMostPreferred(values, warn)) preferred = true;
			} else if (name === "MEDIATYPE" && isMediaProperty(p.name)) {
				// The inverse of the normaliser's TYPE=JPEG → MEDIATYPE rule; the value's own type wins.
				const mediaType = declaredMediaType(values[0] ?? "")?.split(";")[0];
				if (!hasMediaType(value) && mediaType !== undefined) {
					types.push(mediaTypeName(mediaType) ?? mediaType);
				}
			} else if (PARAMS_30.has(name) || name.startsWith("X-")) {
				params.set(name, values);
			} else if (!TRANSPORT_PARAMS.has(name)) {
				dropped.push(name);
			}
		}
		if (dropped.length > 0) {
			warn(
				"param-not-in-30",
				`${dropped.join(", ")} dropped: vCard 3.0 has no such parameter`,
			);
		}
		if (value.kind === "binary" && value.mediaType !== undefined) {
			types.unshift(mediaTypeName(value.mediaType) ?? value.mediaType);
		}
		// Apple writes `type=pref` last; keeping it there makes a re-read card write the same.
		if (preferred) types.push("PREF");
		if (types.length > 0) params.set("TYPE", dedupe(types));
		return { params, value: fitComponents(p.name, value, warn) };
	},

	valueToken(value) {
		if (value.kind === "binary") return "binary";
		if (value.kind === "timestamp") return "date-time";
		if (value.kind === "date-and-or-time") return dateToken(value.value);
		return VALUE_TOKENS.get(value.kind);
	},

	repeats(name) {
		return name === "TYPE";
	},

	encodeParamValue(name, value, warn) {
		// RFC 2426 has no escape for a quote or a newline inside a parameter value.
		if (value.includes('"') || hasControlChar(value)) {
			warn(
				"param-value-not-in-30",
				`${name}=${excerpt(value)} dropped: vCard 3.0 cannot carry a quote or a control character`,
			);
			return undefined;
		}
		return quoteIfNeeded(value);
	},
};

/** Only the top rank has a 3.0 form: TYPE=PREF on every ranked property would mark them all. */
function isMostPreferred(values: readonly string[], warn: Warn): boolean {
	const rank = values[0] ?? "";
	if (Number(rank) === 1) return true;
	if (rank !== "") {
		warn(
			"pref-not-in-30",
			`PREF=${excerpt(rank)} dropped: vCard 3.0 only marks the most preferred (PREF=1) as TYPE=PREF`,
		);
	}
	return false;
}

function hasMediaType(value: VValue): boolean {
	return value.kind === "binary" && value.mediaType !== undefined;
}

/** A `data:` URI on PHOTO/LOGO/SOUND/KEY goes back to inline base64; anything else is left alone. */
function inlineMedia(p: VProperty): VValue {
	if (p.value.kind !== "uri" || !isMediaProperty(p.name)) return p.value;
	const parsed = parseDataUri(p.value.value);
	if (parsed === null) return p.value;
	const value: VValue = { kind: "binary", data: parsed.data };
	if (parsed.mediaType !== undefined) value.mediaType = parsed.mediaType;
	return value;
}

/** Exactly 5 N / 7 ADR components: Apple drops a card when a fold lands in an empty 4.0 tail. */
function fitComponents(name: string, value: VValue, warn: Warn): VValue {
	const count = COMPONENTS_30.get(name);
	if (count === undefined || value.kind !== "structured") return value;
	const { components } = value;
	if (components.length === count) return value;
	const lost = components.slice(count).filter((c) => c.some((v) => v !== "")).length;
	if (lost > 0) {
		warn(
			"components-not-in-30",
			`${name} has ${count} components in vCard 3.0, ${lost} non-empty extra dropped`,
		);
	}
	const fitted = components.slice(0, count);
	while (fitted.length < count) fitted.push([""]);
	return { kind: "structured", components: fitted };
}

function dateToken(d: DateAndOrTime): string {
	const hasDate = d.year !== undefined || d.month !== undefined || d.day !== undefined;
	const hasTime = d.hour !== undefined || d.minute !== undefined || d.second !== undefined;
	if (hasDate && hasTime) return "date-time";
	return hasTime ? "time" : "date";
}

/** Case-insensitive, first spelling wins: the media word may repeat a TYPE already there. */
function dedupe(types: readonly string[]): string[] {
	const seen = new Set<string>();
	return types.filter((t) => {
		const key = t.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
