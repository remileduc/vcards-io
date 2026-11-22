// The properties of every JSContact object, in the order RFC 9553 defines them, with what each
// one holds. Only the shape is here; the JSON type of each value comes with the validator.

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
	/** A string, a number, a boolean, or JSON kept as it is (`vCardProps`). */
	| "value"
	/** A map of such values: a set, `Name.sortAs`, `vCardParams`. */
	| "values"
	/** `Card.localizations`: language tags to PatchObjects. */
	| "patches"
	/** One object; of the type its `@type` names when several are possible, else of the first. */
	| { object: readonly [ObjectType, ...ObjectType[]] }
	| { list: ObjectType }
	| { map: ObjectType };

type Properties = Readonly<Record<string, Shape>>;

/** `@type` leads every object and the two RFC 9555 properties any object may carry end it. */
function object(own: Properties): Properties {
	return { "@type": "value", ...own, vCardName: "value", vCardParams: "values" };
}

const component = object({ value: "value", kind: "value", phonetic: "value" });

const resource = {
	kind: "value",
	uri: "value",
	mediaType: "value",
	contexts: "values",
	pref: "value",
	label: "value",
} as const satisfies Properties;

export const PROPERTIES: Readonly<Record<ObjectType, Properties>> = {
	Card: object({
		version: "value",
		created: "value",
		kind: "value",
		language: "value",
		members: "values",
		prodId: "value",
		relatedTo: { map: "Relation" },
		uid: "value",
		updated: "value",
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
		keywords: "values",
		notes: { map: "Note" },
		personalInfo: { map: "PersonalInfo" },
		vCardProps: "value",
	}),
	Relation: object({ relation: "values" }),
	Name: object({
		components: { list: "NameComponent" },
		isOrdered: "value",
		defaultSeparator: "value",
		full: "value",
		sortAs: "values",
		phoneticScript: "value",
		phoneticSystem: "value",
	}),
	NameComponent: component,
	Nickname: object({ name: "value", contexts: "values", pref: "value" }),
	Organization: object({
		name: "value",
		units: { list: "OrgUnit" },
		sortAs: "value",
		contexts: "values",
	}),
	OrgUnit: object({ name: "value", sortAs: "value" }),
	SpeakToAs: object({ grammaticalGender: "value", pronouns: { map: "Pronouns" } }),
	Pronouns: object({ pronouns: "value", contexts: "values", pref: "value" }),
	Title: object({ name: "value", kind: "value", organizationId: "value" }),
	EmailAddress: object({ address: "value", contexts: "values", pref: "value", label: "value" }),
	OnlineService: object({
		service: "value",
		uri: "value",
		user: "value",
		contexts: "values",
		pref: "value",
		label: "value",
	}),
	Phone: object({
		number: "value",
		features: "values",
		contexts: "values",
		pref: "value",
		label: "value",
	}),
	LanguagePref: object({ language: "value", contexts: "values", pref: "value" }),
	Calendar: object(resource),
	SchedulingAddress: object({ uri: "value", contexts: "values", pref: "value", label: "value" }),
	Address: object({
		components: { list: "AddressComponent" },
		isOrdered: "value",
		countryCode: "value",
		coordinates: "value",
		timeZone: "value",
		contexts: "values",
		full: "value",
		defaultSeparator: "value",
		pref: "value",
		phoneticScript: "value",
		phoneticSystem: "value",
	}),
	AddressComponent: component,
	CryptoKey: object(resource),
	Directory: object({ ...resource, listAs: "value" }),
	Link: object(resource),
	Media: object(resource),
	Anniversary: object({
		kind: "value",
		date: { object: ["PartialDate", "Timestamp"] },
		place: { object: ["Address"] },
	}),
	PartialDate: object({ year: "value", month: "value", day: "value", calendarScale: "value" }),
	Timestamp: object({ utc: "value" }),
	Note: object({ note: "value", created: "value", author: { object: ["Author"] } }),
	Author: object({ name: "value", uri: "value" }),
	PersonalInfo: object({
		kind: "value",
		value: "value",
		level: "value",
		listAs: "value",
		label: "value",
	}),
};
