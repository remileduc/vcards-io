import { excerpt } from "../parse/issues.js";
import { FLOAT } from "../parse/properties.js";
import { isMediaProperty, nearestValueKind, TEXT_FAMILY, VALUE_TOKENS } from "../registry.js";
import { unescapeText21 } from "../text/escape.js";
import type { VProperty, VValue } from "../types.js";
import { mediaTypeFromName } from "../values/media.js";
import { buildDataUri, parseGeoUri, URI_SCHEME } from "../values/uri.js";
import {
	cloneParams,
	derive,
	firstParam,
	hasType,
	type Rule,
	removeTypes,
	rewrite,
	textOf,
} from "./context.js";

// A reference to another vCard: a hierarchical URI or one of the schemes a contact can point with.
const REFERENCE_URI = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|(?:urn|cid|mailto|tel|data|xmpp|sip):)/i;

/** RFC 9554 component counts; RFC 6350 had 5 and 7 and the registry keeps those. */
const COMPONENTS_40: ReadonlyMap<string, number> = new Map([
	["N", 7],
	["ADR", 18],
]);

// The parser keeps 2.1 text as written; resolving AOSP's escape set here (never `\n`, as AOSP)
// keeps the model equal to what a 3.0 writer meant. An inline AGENT vCard must stay verbatim.
const unescapeLegacyText: Rule = (card, ctx) => {
	if (card.version !== "2.1") return;
	for (const p of card.properties) {
		if (p.name === "AGENT" || p.value.kind !== "text") continue;
		const text = unescapeText21(p.value.value);
		if (text === p.value.value) continue;
		p.value = { kind: "text", value: text };
		ctx.info("legacy-text-unescaped", "vCard 2.1 escapes resolved", p);
	}
};

/** CHARSET and ENCODING described bytes the parser already decoded; CONTEXT (RFC 2425) has no 4.0 meaning. */
const dropTransportParams: Rule = (card, ctx) => {
	for (const p of card.properties) {
		p.params.delete("CHARSET");
		p.params.delete("ENCODING");
		if (p.params.delete("CONTEXT")) ctx.info("context-dropped", "CONTEXT parameter dropped", p);
	}
};

const prefToParam: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (removeTypes(p, (t) => t.toLowerCase() === "pref").length === 0) continue;
		if (!p.params.has("PREF")) p.params.set("PREF", ["1"]);
		ctx.info("pref-to-param", "TYPE=pref rewritten as PREF=1", p);
	}
};

/** Inline base64 becomes a `data:` URI; the media type the parser found travels inside it. */
const binaryToDataUri: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (p.value.kind !== "binary") continue;
		const { data, mediaType } = p.value;
		p.value = { kind: "uri", value: buildDataUri(data, mediaType) };
		if (firstParam(p, "VALUE")?.toLowerCase() === "binary") p.params.delete("VALUE");
		ctx.info(
			"binary-to-data-uri",
			`${data.length} bytes of inline ${mediaType ?? "data"} rewritten as a data: URI`,
			p,
		);
	}
};

/** `TYPE=JPEG` on a media property names the format; 4.0 says MEDIATYPE (or the data: URI). */
const mediaTypeParam: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (!isMediaProperty(p.name)) continue;
		const removed = removeTypes(p, (t) => mediaTypeFromName(t) !== undefined);
		if (removed.length === 0) continue;
		const mediaType = mediaTypeFromName(removed[0] ?? "");
		const inDataUri = p.value.kind === "uri" && /^data:/i.test(p.value.value);
		if (mediaType !== undefined && !inDataUri && !p.params.has("MEDIATYPE")) {
			p.params.set("MEDIATYPE", [mediaType]);
			ctx.info(
				"media-type-param",
				`TYPE=${excerpt(removed[0] ?? "")} rewritten as MEDIATYPE=${mediaType}`,
				p,
			);
		} else {
			ctx.info(
				"media-type-param",
				`TYPE=${excerpt(removed[0] ?? "")} dropped, the value carries its media type`,
				p,
			);
		}
	}
};

/** 3.0 `GEO:lat;lon` and 2.1 `GEO:lat,lon` become the RFC 5870 URI; unparseable numbers stay. */
const geoToUri: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (p.name !== "GEO" || p.value.kind !== "structured") continue;
		const flat = p.value.components.map((c) => c.join(","));
		const parts = flat.length === 1 ? (flat[0] ?? "").split(",") : flat;
		const [lat, lon] = parts.map((s) => s.trim());
		if (
			parts.length !== 2 ||
			lat === undefined ||
			lon === undefined ||
			!FLOAT.test(lat) ||
			!FLOAT.test(lon)
		) {
			ctx.warn("geo-invalid", "GEO is not two decimal numbers, kept as written", p);
			continue;
		}
		const uri = `geo:${lat.replace(/^\+/, "")},${lon.replace(/^\+/, "")}`;
		if (parseGeoUri(uri) === null) {
			ctx.warn("geo-invalid", "GEO coordinates out of range, kept as written", p);
			continue;
		}
		p.value = { kind: "uri", value: uri };
		ctx.info("geo-to-uri", `GEO rewritten as ${uri}`, p);
	}
};

// A LABEL joins the ADR of its group, else one with the same TYPE set, else a new empty ADR so
// the text is never lost. ADRs are indexed once: thousands of them must not be scanned per label.
const labelToAdrParam: Rule = (card, ctx) => {
	const labels = card.properties.filter((p) => p.name === "LABEL");
	if (labels.length === 0) return;
	const byGroup = new Map<string, VProperty>();
	const byTypes = new Map<string, VProperty[]>();
	for (const adr of card.properties) {
		if (adr.name !== "ADR" || adr.params.has("LABEL")) continue;
		if (adr.group !== null && !byGroup.has(adr.group)) byGroup.set(adr.group, adr);
		const key = typeKey(adr);
		const list = byTypes.get(key);
		if (list === undefined) byTypes.set(key, [adr]);
		else list.push(adr);
	}
	const taken = new Set<VProperty>();
	const replacement = new Map<VProperty, VProperty[]>();
	for (const label of labels) {
		const text = textOf(label);
		if (text === undefined) continue;
		if (text === "") {
			replacement.set(label, []);
			ctx.info("label-dropped", "Empty LABEL dropped", label);
			continue;
		}
		const grouped = label.group === null ? undefined : byGroup.get(label.group);
		const target =
			(grouped !== undefined && !taken.has(grouped) ? grouped : undefined) ??
			(byTypes.get(typeKey(label)) ?? []).find((adr) => !taken.has(adr));
		if (target !== undefined) {
			taken.add(target);
			target.params.set("LABEL", [text]);
			replacement.set(label, []);
			ctx.info("label-merged", "LABEL rewritten as the LABEL parameter of an ADR", label);
			continue;
		}
		const params = cloneParams(label.params);
		params.delete("VALUE");
		params.set("LABEL", [text]);
		replacement.set(label, [derive(label, "ADR", emptyStructured(7), params)]);
		ctx.info(
			"label-to-adr",
			"LABEL without a matching ADR rewritten as an ADR with only a LABEL",
			label,
		);
	}
	rewrite(card, (p) => replacement.get(p));
};

/** TYPE values as a set, folded and sorted, so two properties with the same types share a key. */
function typeKey(p: VProperty): string {
	return [...new Set((p.params.get("TYPE") ?? []).map((t) => t.toLowerCase()))].sort().join(",");
}

function emptyStructured(count: number): VValue {
	return { kind: "structured", components: Array.from({ length: count }, () => [""]) };
}

/** RFC 6350 says SORT-STRING is now SORT-AS on N; without an N it stays a legacy property. */
const sortStringToSortAs: Rule = (card, ctx) => {
	const sort = card.properties.find((p) => p.name === "SORT-STRING");
	const n = card.properties.find((p) => p.name === "N");
	if (sort === undefined || n === undefined || n.params.has("SORT-AS")) return;
	const text = textOf(sort);
	if (text === undefined) return;
	n.params.set("SORT-AS", [text]);
	card.properties.splice(card.properties.indexOf(sort), 1);
	ctx.info("sort-string-to-sort-as", "SORT-STRING rewritten as SORT-AS on N", sort);
};

/** An AGENT that points at a vCard becomes RELATED;TYPE=agent; an inline one stays text. */
const agentToRelated: Rule = (card, ctx) => {
	rewrite(card, (p) => {
		if (p.name !== "AGENT") return undefined;
		const text = textOf(p);
		if (text === undefined || p.value.kind === "unknown") return undefined;
		const uri = text.trim();
		if (p.value.kind !== "uri" && (!REFERENCE_URI.test(uri) || /\s/.test(uri)))
			return undefined;
		const params = cloneParams(p.params);
		params.delete("VALUE");
		params.set("TYPE", [...(params.get("TYPE") ?? []), "agent"]);
		const related = derive(p, "RELATED", { kind: "uri", value: uri }, params);
		ctx.info("agent-to-related", "AGENT URI rewritten as RELATED;TYPE=agent", p);
		return related;
	});
};

/** 2.1 / 3.0 read UID as text; one that carries a scheme (`urn:uuid:`) is the 4.0 URI value. */
const uidToUri: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (p.name !== "UID" || p.value.kind !== "text") continue;
		const uri = p.value.value.trim();
		if (!URI_SCHEME.test(uri) || /\s/.test(uri)) continue;
		p.value = { kind: "uri", value: uri };
		ctx.info("uid-to-uri", "UID with a scheme read as a URI", p);
	}
};

/** 2.1 `VALUE=CONTENT-ID:<id>` references a MIME part; RFC 2392 spells that `cid:id`. */
const contentIdToUri: Rule = (card, ctx) => {
	for (const p of card.properties) {
		const declared = firstParam(p, "VALUE")?.toLowerCase();
		if ((declared !== "cid" && declared !== "content-id") || p.value.kind !== "uri") continue;
		const m = /^<(.+)>$/.exec(p.value.value.trim());
		if (m === null || URI_SCHEME.test(m[1] ?? "")) continue;
		p.value = { kind: "uri", value: `cid:${m[1]}` };
		ctx.info("content-id-to-uri", "Content-ID reference rewritten as a cid: URI", p);
	}
};

/** `TYPE=internet` on EMAIL is the only possible value and Android turns it into a custom label. */
const dropInternetType: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (p.name !== "EMAIL" || !hasType(p, "internet")) continue;
		removeTypes(p, (t) => t.toLowerCase() === "internet");
		ctx.info("type-dropped", "TYPE=internet dropped from EMAIL", p);
	}
};

// Google writes the formatted address as an 8th 3.0 ADR component, 4.0's LABEL parameter.
// In a 4.0 card an 8th component is RFC 9554's room and is left alone.
const adrFormattedComponent: Rule = (card, ctx) => {
	if (card.version === "4.0") return;
	for (const p of card.properties) {
		if (p.name !== "ADR" || p.value.kind !== "structured") continue;
		const { components } = p.value;
		if (components.length <= 7 || components.length >= 18) continue;
		const extra = components.slice(7).map((c) => c.join(","));
		if (extra.every((text) => text === "")) {
			p.value = { kind: "structured", components: components.slice(0, 7) };
			continue;
		}
		if (components.length !== 8 || p.params.has("LABEL")) {
			ctx.warn(
				"adr-extra-components",
				`ADR has ${components.length} components, kept as written`,
				p,
			);
			continue;
		}
		p.params.set("LABEL", [extra[0] ?? ""]);
		p.value = { kind: "structured", components: components.slice(0, 7) };
		ctx.info("adr-label-component", "8th ADR component rewritten as the LABEL parameter", p);
	}
};

// VALUE is absent for the property's 4.0 default kind and set from the kind otherwise, so two
// cards with the same meaning have the same model (docs/decisions.md, upgrade normaliser).
const canonicalValueParam: Rule = (card, ctx) => {
	for (const p of card.properties) {
		const declared = firstParam(p, "VALUE");
		const expected = nearestValueKind(p.name, "4.0");
		const kind = p.value.kind;
		if (expected === undefined || kind === "unknown" || kind === "binary") {
			if (declared === undefined) continue;
			const normalised = normaliseValueToken(declared);
			if (normalised !== declared) {
				p.params.set("VALUE", [normalised]);
				ctx.info(
					"value-param-rewritten",
					`VALUE=${excerpt(declared)} rewritten as VALUE=${normalised}`,
					p,
				);
			}
			continue;
		}
		const same = kind === expected || (TEXT_FAMILY.has(kind) && TEXT_FAMILY.has(expected));
		if (same) {
			p.params.delete("VALUE");
			continue;
		}
		const token = VALUE_TOKENS.get(kind);
		if (token !== undefined && declared !== token) p.params.set("VALUE", [token]);
	}
};

function normaliseValueToken(token: string): string {
	const lower = token.toLowerCase();
	if (lower === "url" || lower === "cid" || lower === "content-id") return "uri";
	return lower;
}

/** RFC 9554 component counts for N and ADR; shorter legacy values get empty components. */
const padComponents: Rule = (card) => {
	for (const p of card.properties) {
		const count = COMPONENTS_40.get(p.name);
		if (count === undefined || p.value.kind !== "structured") continue;
		const { components } = p.value;
		if (components.length >= count) continue;
		p.value = {
			kind: "structured",
			components: [
				...components,
				...Array.from({ length: count - components.length }, () => [""]),
			],
		};
	}
};

/** Standard rules, in the order they run; vendor rules follow, then FINAL_RULES. */
export const STANDARD_RULES: readonly Rule[] = [
	unescapeLegacyText,
	dropTransportParams,
	prefToParam,
	binaryToDataUri,
	mediaTypeParam,
	geoToUri,
	labelToAdrParam,
	sortStringToSortAs,
	agentToRelated,
	uidToUri,
	contentIdToUri,
	dropInternetType,
	adrFormattedComponent,
];

/** Run last so properties the vendor rules create are canonical too. */
export const FINAL_RULES: readonly Rule[] = [canonicalValueParam, padComponents];
