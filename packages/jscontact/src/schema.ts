// The properties of every JSContact object, in the order RFC 9553 defines them, with what each
// one holds and which are mandatory: what normalizeCard orders and validateCard checks.

import { NICKNAME_KIND, VENDOR_LABEL } from "./vendor.js";

export type ObjectType =
	| "Card"
	| "Relation"
	| "Name"
	| "NameComponent"
	| "Nickname"
	| "Organization"
	| "OrgUnit"
	| "SpeakToAs"
	| "Pronouns"
	| "Title"
	| "EmailAddress"
	| "OnlineService"
	| "Phone"
	| "LanguagePref"
	| "Calendar"
	| "SchedulingAddress"
	| "Address"
	| "AddressComponent"
	| "CryptoKey"
	| "Directory"
	| "Link"
	| "Media"
	| "Anniversary"
	| "PartialDate"
	| "Timestamp"
	| "Note"
	| "Author"
	| "PersonalInfo";

export type Shape =
	| "string"
	| "boolean"
	/** A non-negative safe integer. */
	| "unsignedInt"
	/** An Id held as a value: `Title.organizationId`. */
	| "id"
	/** `Card.vCardProps`: a list of jCard properties, kept as they are. */
	| "jCardProps"
	/** A set: a map whose every value is `true`. */
	| "set"
	/** A map of strings: `Name.sortAs`. */
	| "strings"
	/** `vCardParams`: a map of strings and lists of strings. */
	| "params"
	/** `Card.localizations`: language tags to PatchObjects. */
	| "patches"
	/** One object; of the type its `@type` names when several are possible, else of the first. */
	| { object: readonly [ObjectType, ...ObjectType[]] }
	| { list: ObjectType }
	/** Keyed by Id, unless `keys` says any string is one (`relatedTo` is keyed by uid). */
	| { map: ObjectType; keys?: "string" };

type Properties = Readonly<Record<string, Shape>>;

/** `@type` leads every object and the two RFC 9555 properties any object may carry end it. */
function object(own: Properties): Properties {
	return { "@type": "string", ...own, vCardName: "string", vCardParams: "params" };
}

const component = object({ value: "string", kind: "string", phonetic: "string" });

const resource = {
	kind: "string",
	uri: "string",
	mediaType: "string",
	contexts: "set",
	pref: "unsignedInt",
	label: "string",
} as const satisfies Properties;

export const PROPERTIES: Readonly<Record<ObjectType, Properties>> = {
	Card: object({
		version: "string",
		created: "string",
		kind: "string",
		language: "string",
		members: "set",
		prodId: "string",
		relatedTo: { map: "Relation", keys: "string" },
		uid: "string",
		updated: "string",
		name: { object: ["Name"] },
		nicknames: { map: "Nickname" },
		organizations: { map: "Organization" },
		speakToAs: { object: ["SpeakToAs"] },
		titles: { map: "Title" },
		emails: { map: "EmailAddress" },
		onlineServices: { map: "OnlineService" },
		phones: { map: "Phone" },
		preferredLanguages: { map: "LanguagePref" },
		calendars: { map: "Calendar" },
		schedulingAddresses: { map: "SchedulingAddress" },
		addresses: { map: "Address" },
		cryptoKeys: { map: "CryptoKey" },
		directories: { map: "Directory" },
		links: { map: "Link" },
		media: { map: "Media" },
		localizations: "patches",
		anniversaries: { map: "Anniversary" },
		keywords: "set",
		notes: { map: "Note" },
		personalInfo: { map: "PersonalInfo" },
		vCardProps: "jCardProps",
	}),
	Relation: object({ relation: "set", [VENDOR_LABEL]: "string" }),
	Name: object({
		components: { list: "NameComponent" },
		isOrdered: "boolean",
		defaultSeparator: "string",
		full: "string",
		sortAs: "strings",
		phoneticScript: "string",
		phoneticSystem: "string",
	}),
	NameComponent: component,
	Nickname: object({
		name: "string",
		contexts: "set",
		pref: "unsignedInt",
		[NICKNAME_KIND]: "string",
		[VENDOR_LABEL]: "string",
	}),
	Organization: object({
		name: "string",
		units: { list: "OrgUnit" },
		sortAs: "string",
		contexts: "set",
	}),
	OrgUnit: object({ name: "string", sortAs: "string" }),
	SpeakToAs: object({ grammaticalGender: "string", pronouns: { map: "Pronouns" } }),
	Pronouns: object({ pronouns: "string", contexts: "set", pref: "unsignedInt" }),
	Title: object({ name: "string", kind: "string", organizationId: "id" }),
	EmailAddress: object({
		address: "string",
		contexts: "set",
		pref: "unsignedInt",
		label: "string",
	}),
	OnlineService: object({
		service: "string",
		uri: "string",
		user: "string",
		contexts: "set",
		pref: "unsignedInt",
		label: "string",
	}),
	Phone: object({
		number: "string",
		features: "set",
		contexts: "set",
		pref: "unsignedInt",
		label: "string",
	}),
	LanguagePref: object({ language: "string", contexts: "set", pref: "unsignedInt" }),
	Calendar: object(resource),
	SchedulingAddress: object({
		uri: "string",
		contexts: "set",
		pref: "unsignedInt",
		label: "string",
	}),
	Address: object({
		components: { list: "AddressComponent" },
		isOrdered: "boolean",
		countryCode: "string",
		coordinates: "string",
		timeZone: "string",
		contexts: "set",
		full: "string",
		defaultSeparator: "string",
		pref: "unsignedInt",
		phoneticScript: "string",
		phoneticSystem: "string",
		[VENDOR_LABEL]: "string",
	}),
	AddressComponent: component,
	CryptoKey: object(resource),
	Directory: object({ ...resource, listAs: "unsignedInt" }),
	Link: object(resource),
	Media: object(resource),
	Anniversary: object({
		kind: "string",
		date: { object: ["PartialDate", "Timestamp"] },
		place: { object: ["Address"] },
		[VENDOR_LABEL]: "string",
	}),
	PartialDate: object({
		year: "unsignedInt",
		month: "unsignedInt",
		day: "unsignedInt",
		calendarScale: "string",
	}),
	Timestamp: object({ utc: "string" }),
	Note: object({ note: "string", created: "string", author: { object: ["Author"] } }),
	Author: object({ name: "string", uri: "string" }),
	PersonalInfo: object({
		kind: "string",
		value: "string",
		level: "string",
		listAs: "unsignedInt",
		label: "string",
	}),
};

/** The properties `types.ts` declares without `?`; a type that is not listed has none. */
export const MANDATORY: Readonly<Partial<Record<ObjectType, readonly string[]>>> = {
	Card: ["@type", "version"],
	NameComponent: ["value", "kind"],
	Nickname: ["name"],
	OrgUnit: ["name"],
	Pronouns: ["pronouns"],
	Title: ["name"],
	EmailAddress: ["address"],
	Phone: ["number"],
	LanguagePref: ["language"],
	Calendar: ["kind", "uri"],
	SchedulingAddress: ["uri"],
	AddressComponent: ["value", "kind"],
	CryptoKey: ["uri"],
	Directory: ["kind", "uri"],
	Link: ["uri"],
	Media: ["kind", "uri"],
	Anniversary: ["kind", "date"],
	Timestamp: ["@type", "utc"],
	Note: ["note"],
	PersonalInfo: ["kind", "value"],
};
