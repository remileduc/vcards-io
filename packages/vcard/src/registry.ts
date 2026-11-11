import type { VCardVersion, VValueKind } from "./types.js";

/** RFC 6350 cardinalities: exactly one, at most one, at least one, any number. */
export type Cardinality = "1" | "*1" | "1*" | "*";

export interface PropertySpec {
	/** Default value kind when no VALUE parameter is given, one for all versions or per version. */
	readonly kind: VValueKind | Readonly<Partial<Record<VCardVersion, VValueKind>>>;
	readonly versions: readonly VCardVersion[];
	readonly cardinality: Cardinality;
	/** Structured values: the component count the current RFC defines (N 5, ADR 7, ...). */
	readonly components?: number;
	/** Structured values whose components are never comma lists (ORG, GEO, X-ANDROID-CUSTOM). */
	readonly commaIsLiteral?: boolean;
	/** Property-specific parameters on top of the version's common set. */
	readonly params: readonly string[];
}

const ALL: readonly VCardVersion[] = ["2.1", "3.0", "4.0"];
const V3_UP: readonly VCardVersion[] = ["3.0", "4.0"];
const V4: readonly VCardVersion[] = ["4.0"];
const LEGACY: readonly VCardVersion[] = ["2.1", "3.0"];

/** Media properties: inline binary before 4.0, URI from 4.0 on. */
const MEDIA = { "2.1": "binary", "3.0": "binary", "4.0": "uri" } as const;
// versit 2.7.1: a KEY is clear text unless ENCODING says otherwise; RFC 2426 made it binary.
const KEY_KIND = { "2.1": "text", "3.0": "binary", "4.0": "uri" } as const;
const URI_FROM_40 = { "2.1": "text", "3.0": "text", "4.0": "uri" } as const;
const INDEXED = ["LEVEL", "INDEX"];

const MEDIATYPE = ["MEDIATYPE"];
const DATE_PARAMS = ["CALSCALE"];
const V3_LEGACY_IM = [
	"X-AIM",
	"X-MSN",
	"X-YAHOO",
	"X-ICQ",
	"X-JABBER",
	"X-SKYPE",
	"X-SKYPE-USERNAME",
	"X-GOOGLE-TALK",
	"X-GTALK",
	"X-GOOGLE TALK",
	"X-QQ",
	"X-NETMEETING",
	"X-TWITTER",
	"X-SIP",
];

const text = (
	versions: readonly VCardVersion[],
	cardinality: Cardinality = "*",
	params: readonly string[] = [],
): PropertySpec => ({ kind: "text", versions, cardinality, params });
const uri = (
	versions: readonly VCardVersion[],
	cardinality: Cardinality = "*",
	params: readonly string[] = MEDIATYPE,
): PropertySpec => ({ kind: "uri", versions, cardinality, params });

/**
 * Known properties, uppercased, with their defaults per version. Vendor entries cover what
 * the Android, Apple and Google exporters write (docs/interop.md). Unknown properties are
 * not an error: the parser keeps their value raw as `unknown`.
 */
export const PROPERTY_REGISTRY: ReadonlyMap<string, PropertySpec> = new Map<string, PropertySpec>([
	// RFC 6350 section 6, with the 2.1 / 3.0 differences
	["SOURCE", uri(V3_UP)],
	["KIND", text(V4, "*1")],
	["XML", text(V4)],
	["FN", text(ALL, "1*")],
	[
		"N",
		{
			kind: "structured",
			versions: ALL,
			cardinality: "*1",
			components: 5,
			params: ["SORT-AS", "PHONETIC", "SCRIPT", "JSCOMPS"],
		},
	],
	["NICKNAME", { kind: "text-list", versions: V3_UP, cardinality: "*", params: [] }],
	["PHOTO", { kind: MEDIA, versions: ALL, cardinality: "*", params: MEDIATYPE }],
	["BDAY", { kind: "date-and-or-time", versions: ALL, cardinality: "*1", params: DATE_PARAMS }],
	[
		"ANNIVERSARY",
		{ kind: "date-and-or-time", versions: V4, cardinality: "*1", params: DATE_PARAMS },
	],
	[
		"GENDER",
		{
			kind: "structured",
			versions: V4,
			cardinality: "*1",
			components: 2,
			commaIsLiteral: true,
			params: [],
		},
	],
	[
		"ADR",
		{
			kind: "structured",
			versions: ALL,
			cardinality: "*",
			components: 7,
			params: ["LABEL", "GEO", "TZ", "CC", "PHONETIC", "SCRIPT", "JSCOMPS"],
		},
	],
	// RFC 6350 6.4.1: free-form text unless VALUE=uri, "for backward compatibility with vCard 3".
	["TEL", text(ALL, "*", MEDIATYPE)],
	["EMAIL", text(ALL)],
	["IMPP", uri(V3_UP, "*", ["MEDIATYPE", "SERVICE-TYPE", "USERNAME"])],
	["LANG", { kind: "language-tag", versions: V4, cardinality: "*", params: [] }],
	[
		"TZ",
		{
			kind: { "2.1": "utc-offset", "3.0": "utc-offset", "4.0": "text" },
			versions: ALL,
			cardinality: "*",
			params: MEDIATYPE,
		},
	],
	[
		"GEO",
		{
			kind: { "2.1": "structured", "3.0": "structured", "4.0": "uri" },
			versions: ALL,
			cardinality: "*",
			components: 2,
			commaIsLiteral: true,
			params: MEDIATYPE,
		},
	],
	["TITLE", text(ALL)],
	["ROLE", text(ALL)],
	["LOGO", { kind: MEDIA, versions: ALL, cardinality: "*", params: MEDIATYPE }],
	[
		"ORG",
		{
			kind: "structured",
			versions: ALL,
			cardinality: "*",
			commaIsLiteral: true,
			params: ["SORT-AS"],
		},
	],
	["MEMBER", uri(V4)],
	["RELATED", { kind: "uri", versions: V4, cardinality: "*", params: MEDIATYPE }],
	["CATEGORIES", { kind: "text-list", versions: V3_UP, cardinality: "*", params: [] }],
	["NOTE", text(ALL, "*", ["AUTHOR", "AUTHOR-NAME"])],
	["PRODID", text(V3_UP, "*1")],
	["REV", { kind: "timestamp", versions: ALL, cardinality: "*1", params: [] }],
	// versit 2.1 2.6.3: SOUND is a pronunciation string unless ENCODING or VALUE says otherwise.
	[
		"SOUND",
		{
			kind: { "2.1": "text", "3.0": "binary", "4.0": "uri" },
			versions: ALL,
			cardinality: "*",
			params: MEDIATYPE,
		},
	],
	["UID", { kind: URI_FROM_40, versions: ALL, cardinality: "*1", params: [] }],
	[
		"CLIENTPIDMAP",
		{
			kind: "structured",
			versions: V4,
			cardinality: "*",
			components: 2,
			commaIsLiteral: true,
			params: [],
		},
	],
	["URL", uri(ALL)],
	["KEY", { kind: KEY_KIND, versions: ALL, cardinality: "*", params: MEDIATYPE }],
	["FBURL", uri(V3_UP)],
	["CALADRURI", uri(V3_UP)],
	["CALURI", uri(V3_UP)],
	// 2.1 / 3.0 only; the upgrade normaliser rewrites or keeps them
	["LABEL", text(LEGACY)],
	["MAILER", text(LEGACY, "*1")],
	["AGENT", text(LEGACY)],
	["NAME", text(["3.0"], "*1")],
	["PROFILE", text(["3.0"], "*1")],
	["SORT-STRING", text(["3.0"], "*1")],
	["CLASS", text(["3.0"], "*1")],
	// RFC 6474, 6715, 8605, 9554
	["BIRTHPLACE", text(V4, "*1")],
	["DEATHPLACE", text(V4, "*1")],
	[
		"DEATHDATE",
		{ kind: "date-and-or-time", versions: V4, cardinality: "*1", params: DATE_PARAMS },
	],
	["EXPERTISE", text(V4, "*", INDEXED)],
	["HOBBY", text(V4, "*", INDEXED)],
	["INTEREST", text(V4, "*", INDEXED)],
	["ORG-DIRECTORY", uri(V4, "*", ["INDEX"])],
	["CONTACT-URI", uri(V4)],
	["CREATED", { kind: "timestamp", versions: V4, cardinality: "*1", params: [] }],
	["GRAMGENDER", text(V4, "*1")],
	["LANGUAGE", { kind: "language-tag", versions: V4, cardinality: "*1", params: [] }],
	["PRONOUNS", text(V4)],
	["SOCIALPROFILE", uri(V4, "*", ["SERVICE-TYPE", "USERNAME"])],
	["JSPROP", text(V4, "*", ["JSPTR"])],
	// Android (AOSP com.android.vcard)
	[
		"X-ANDROID-CUSTOM",
		{
			kind: "structured",
			versions: ALL,
			cardinality: "*",
			components: 16,
			commaIsLiteral: true,
			params: [],
		},
	],
	["X-NICKNAME", text(ALL)],
	["X-PHONETIC-FIRST-NAME", text(ALL, "*1")],
	["X-PHONETIC-MIDDLE-NAME", text(ALL, "*1")],
	["X-PHONETIC-LAST-NAME", text(ALL, "*1")],
	["X-SKYPE-PSTNNUMBER", text(ALL)],
	...V3_LEGACY_IM.map((name): [string, PropertySpec] => [name, text(ALL)]),
	// Apple (iOS / macOS Contacts) and Google "vCard for iOS"
	["X-ABLABEL", text(ALL)],
	["X-ABADR", text(ALL)],
	["X-ABSHOWAS", text(ALL, "*1")],
	["X-ABUID", text(ALL, "*1")],
	["X-ABDATE", { kind: "date-and-or-time", versions: ALL, cardinality: "*", params: [] }],
	["X-ALTBDAY", { kind: "date-and-or-time", versions: ALL, cardinality: "*1", params: [] }],
	["X-ABRELATEDNAMES", text(ALL)],
	["X-SOCIALPROFILE", uri(ALL, "*", ["X-USER", "X-USERIDENTIFIER"])],
	["X-ADDRESSBOOKSERVER-KIND", text(ALL, "*1")],
	["X-ADDRESSBOOKSERVER-MEMBER", uri(ALL)],
	["X-ACTIVITY-ALERT", text(ALL)],
	// Outlook / Windows
	["X-WAB-GENDER", text(ALL, "*1")],
	["X-GENDER", text(ALL, "*1")],
]);

/**
 * Parameters any property may carry, per version. Property-specific ones (SORT-AS, LABEL,
 * CALSCALE, ...) live in `PropertySpec.params` and never appear here, so the two tables
 * union to the allowed set. TYPE is restricted per property in 4.0 but phones ignore that.
 */
export const COMMON_PARAMS: Readonly<Record<VCardVersion, readonly string[]>> = {
	"2.1": ["TYPE", "VALUE", "ENCODING", "CHARSET", "LANGUAGE"],
	"3.0": ["TYPE", "VALUE", "ENCODING", "CHARSET", "LANGUAGE"],
	// RFC 6350 5.1-5.6 and the RFC 9554 "any property" parameters; MEDIATYPE (5.7) is per property
	"4.0": ["LANGUAGE", "VALUE", "PREF", "ALTID", "PID", "TYPE", "CREATED", "DERIVED", "PROP-ID"],
};

/** Kinds VALUE=text covers: N;VALUE=text is still structured, NICKNAME;VALUE=text still a list. */
export const TEXT_FAMILY: ReadonlySet<VValueKind> = new Set(["text", "text-list", "structured"]);

/** PHOTO, LOGO, SOUND, KEY: inline binary in some version, so a base64 payload is the media itself. */
export function isMediaProperty(name: string): boolean {
	const kind = PROPERTY_REGISTRY.get(name)?.kind;
	return typeof kind === "object" && Object.values(kind).includes("binary");
}

/** Default value kind of a known property for a version, undefined when unknown or not defined in that version. */
export function defaultValueKind(name: string, version: VCardVersion): VValueKind | undefined {
	const spec = PROPERTY_REGISTRY.get(name.toUpperCase());
	if (!spec?.versions.includes(version)) return undefined;
	return typeof spec.kind === "string" ? spec.kind : spec.kind[version];
}

/**
 * Default kind for a version, falling back to the last version the property is defined in
 * (NICKNAME in 2.1, LABEL in 4.0), so a property outside its versions still has a type.
 */
export function nearestValueKind(name: string, version: VCardVersion): VValueKind | undefined {
	const kind = defaultValueKind(name, version);
	if (kind !== undefined) return kind;
	const spec = PROPERTY_REGISTRY.get(name.toUpperCase());
	if (spec === undefined) return undefined;
	const nearest = spec.versions.at(-1) ?? version;
	return typeof spec.kind === "string" ? spec.kind : spec.kind[nearest];
}

/** VALUE token naming each value kind in vCard 4.0; list and structured values are text. */
export const VALUE_TOKENS: ReadonlyMap<VValueKind, string> = new Map([
	["text", "text"],
	["text-list", "text"],
	["structured", "text"],
	["uri", "uri"],
	["date-and-or-time", "date-and-or-time"],
	["timestamp", "timestamp"],
	["utc-offset", "utc-offset"],
	["language-tag", "language-tag"],
	["integer", "integer"],
	["float", "float"],
	["boolean", "boolean"],
]);
