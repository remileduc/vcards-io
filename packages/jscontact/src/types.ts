// RFC 9553 as updated by RFC 9982 (version "2.0"), plus RFC 9555 section 2.15, in the RFC's order.
// The validator checks what these types say and no more: code reading a Card copes with the rest.

import type {
	AddressComponentKind,
	AddressContext,
	AnniversaryKind,
	CalendarKind,
	CardKind,
	CardVersion,
	Context,
	DirectoryKind,
	GrammaticalGender,
	LinkKind,
	MediaKind,
	NameComponentKind,
	PersonalInfoKind,
	PersonalInfoLevel,
	PhoneFeature,
	PhoneticSystem,
	RelationType,
	TitleKind,
} from "./enums.js";
import type { NicknameKind } from "./vendor.js";

/** 1 to 255 characters of `A-Za-z0-9`, `-` and `_` (section 1.4.1). */
export type Id = string;

/** RFC 3339 date-time in UTC: uppercase `T` and `Z`, no zero fraction (section 1.4.5). */
export type UTCDateTime = string;

/** A vendor property name or enum value, `domain:name` (the `v-extension` rule of section 1.8.1). */
export type VendorExtension = `${string}:${string}`;

/** A set written as a map: every listed key, standard or vendor, maps to `true`. */
export type FlagSet<Value extends string> = { [K in Value | VendorExtension]?: true };

export type Contexts = FlagSet<Context>;

/** Paths without their leading `/` (a subset of JSON Pointer) to the value to set; null removes. */
export type PatchObject = Record<string, unknown>;

export type JCardValue = string | number | boolean | JCardValue[];

/** vCard parameters as jCard writes them (RFC 7095 section 3.3): lowercase names. */
export type VCardParams = Record<string, string | string[]>;

/** A vCard property in jCard form: `["x-foo", { "group": "item1" }, "unknown", "bar"]`. */
export type JCardProp = [
	name: string,
	params: VCardParams,
	type: string,
	value: JCardValue,
	...values: JCardValue[],
];

/** What any JSContact object may carry besides its own properties. */
export interface JSContactObject {
	/** Name of the vCard property the object came from, when several map to its type. */
	vCardName?: string;
	/** Parameters of that vCard property with no JSContact equivalent. */
	vCardParams?: VCardParams;
	/** A registered property this version does not know has no colon, hence no type here. */
	[vendor: VendorExtension]: unknown;
}

export interface Card extends JSContactObject {
	"@type": "Card";
	version: CardVersion;
	created?: UTCDateTime;
	/** Absent means "individual". */
	kind?: CardKind | VendorExtension;
	/** RFC 5646 language tag of the text in the Card. */
	language?: string;
	/** Keys are the `uid` of the member Cards; only a Card of kind "group" has members. */
	members?: Record<string, true>;
	prodId?: string;
	/** Keys are the `uid` of the related Cards. */
	relatedTo?: Record<string, Relation>;
	/** Mandatory in version "1.0" only (RFC 9982 section 4). */
	uid?: string;
	updated?: UTCDateTime;

	name?: Name;
	nicknames?: Record<Id, Nickname>;
	organizations?: Record<Id, Organization>;
	speakToAs?: SpeakToAs;
	titles?: Record<Id, Title>;

	emails?: Record<Id, EmailAddress>;
	onlineServices?: Record<Id, OnlineService>;
	phones?: Record<Id, Phone>;
	preferredLanguages?: Record<Id, LanguagePref>;

	calendars?: Record<Id, Calendar>;
	schedulingAddresses?: Record<Id, SchedulingAddress>;

	addresses?: Record<Id, Address>;

	cryptoKeys?: Record<Id, CryptoKey>;
	directories?: Record<Id, Directory>;
	links?: Record<Id, Link>;
	media?: Record<Id, Media>;

	/** Keys are language tags; a patch never targets `localizations` itself. */
	localizations?: Record<string, PatchObject>;

	anniversaries?: Record<Id, Anniversary>;
	keywords?: Record<string, true>;
	notes?: Record<Id, Note>;
	personalInfo?: Record<Id, PersonalInfo>;

	/** vCard properties with no JSContact mapping, kept so nothing is lost (RFC 9555 2.15.1). */
	vCardProps?: JCardProp[];
}

export interface Relation extends JSContactObject {
	"@type"?: "Relation";
	/** Absent or empty: related, in an unspecified way. */
	relation?: FlagSet<RelationType>;
}

/** At least one of `components` and `full`. */
export interface Name extends JSContactObject {
	"@type"?: "Name";
	/** At least one entry that is not a separator. */
	components?: NameComponent[];
	/** Absent means false: no separator component and no `defaultSeparator` then. */
	isOrdered?: boolean;
	defaultSeparator?: string;
	full?: string;
	/** Each key is the kind of at least one entry of `components`. */
	sortAs?: { [K in NameComponentKind | VendorExtension]?: string };
	/** RFC 5646 script subtag of the components' `phonetic` values. */
	phoneticScript?: string;
	phoneticSystem?: PhoneticSystem | VendorExtension;
}

export interface NameComponent extends JSContactObject {
	"@type"?: "NameComponent";
	value: string;
	kind: NameComponentKind | VendorExtension;
	/** Needs `phoneticSystem` or `phoneticScript` on the Name. */
	phonetic?: string;
}

export interface Nickname extends JSContactObject {
	"@type"?: "Nickname";
	name: string;
	contexts?: Contexts;
	pref?: number;
	/** Project extension, `NICKNAME_KIND` in vendor.ts: the Android nickname type. */
	"remileduc.github.io:kind"?: NicknameKind;
}

/** At least one of `name` and `units`. */
export interface Organization extends JSContactObject {
	"@type"?: "Organization";
	name?: string;
	/** Never empty; from the widest unit to the narrowest. */
	units?: OrgUnit[];
	sortAs?: string;
	contexts?: Contexts;
}

export interface OrgUnit extends JSContactObject {
	"@type"?: "OrgUnit";
	name: string;
	sortAs?: string;
}

/** At least one of `grammaticalGender` and `pronouns`. */
export interface SpeakToAs extends JSContactObject {
	"@type"?: "SpeakToAs";
	grammaticalGender?: GrammaticalGender | VendorExtension;
	pronouns?: Record<Id, Pronouns>;
}

export interface Pronouns extends JSContactObject {
	"@type"?: "Pronouns";
	pronouns: string;
	contexts?: Contexts;
	pref?: number;
}

export interface Title extends JSContactObject {
	"@type"?: "Title";
	name: string;
	/** Absent means "title". */
	kind?: TitleKind | VendorExtension;
	/** Key of the entry of `organizations` the title is held in. */
	organizationId?: Id;
}

export interface EmailAddress extends JSContactObject {
	"@type"?: "EmailAddress";
	/** RFC 5322 addr-spec. */
	address: string;
	contexts?: Contexts;
	pref?: number;
	label?: string;
}

/** At least one of `uri` and `user`. */
export interface OnlineService extends JSContactObject {
	"@type"?: "OnlineService";
	/** Compared case-insensitively. */
	service?: string;
	uri?: string;
	user?: string;
	contexts?: Contexts;
	pref?: number;
	label?: string;
}

export interface Phone extends JSContactObject {
	"@type"?: "Phone";
	/** A URI (`tel:`, `sip:`...) or free text. */
	number: string;
	features?: FlagSet<PhoneFeature>;
	contexts?: Contexts;
	pref?: number;
	label?: string;
}

export interface LanguagePref extends JSContactObject {
	"@type"?: "LanguagePref";
	/** RFC 5646 language tag. */
	language: string;
	contexts?: Contexts;
	pref?: number;
}

/** Common base of Calendar, CryptoKey, Directory, Link and Media; never a type of its own. */
export interface Resource extends JSContactObject {
	"@type"?: "Calendar" | "CryptoKey" | "Directory" | "Link" | "Media";
	kind?: string;
	uri: string;
	mediaType?: string;
	contexts?: Contexts;
	pref?: number;
	label?: string;
}

export interface Calendar extends Resource {
	"@type"?: "Calendar";
	kind: CalendarKind | VendorExtension;
}

export interface SchedulingAddress extends JSContactObject {
	"@type"?: "SchedulingAddress";
	uri: string;
	contexts?: Contexts;
	pref?: number;
	label?: string;
}

/** At least one of `components`, `coordinates`, `countryCode`, `full` and `timeZone`. */
export interface Address extends JSContactObject {
	"@type"?: "Address";
	/** At least one entry that is not a separator. */
	components?: AddressComponent[];
	/** Absent means false: no separator component and no `defaultSeparator` then. */
	isOrdered?: boolean;
	/** ISO 3166-1 alpha-2. */
	countryCode?: string;
	/** A `geo:` URI. */
	coordinates?: string;
	/** A name of the IANA Time Zone Database. */
	timeZone?: string;
	contexts?: FlagSet<AddressContext>;
	full?: string;
	defaultSeparator?: string;
	pref?: number;
	/** RFC 5646 script subtag of the components' `phonetic` values. */
	phoneticScript?: string;
	phoneticSystem?: PhoneticSystem | VendorExtension;
}

export interface AddressComponent extends JSContactObject {
	"@type"?: "AddressComponent";
	value: string;
	kind: AddressComponentKind | VendorExtension;
	/** Needs `phoneticSystem` or `phoneticScript` on the Address. */
	phonetic?: string;
}

export interface CryptoKey extends Resource {
	"@type"?: "CryptoKey";
	/** The RFC registers no kind for a key. */
	kind?: VendorExtension;
}

export interface Directory extends Resource {
	"@type"?: "Directory";
	kind: DirectoryKind | VendorExtension;
	/** Position among the directories of the same kind, from 1. */
	listAs?: number;
}

export interface Link extends Resource {
	"@type"?: "Link";
	kind?: LinkKind | VendorExtension;
}

export interface Media extends Resource {
	"@type"?: "Media";
	kind: MediaKind | VendorExtension;
}

export interface Anniversary extends JSContactObject {
	"@type"?: "Anniversary";
	kind: AnniversaryKind | VendorExtension;
	/** A PartialDate unless `@type` says "Timestamp". */
	date: PartialDate | Timestamp;
	place?: Address;
}

/** A date, a year, a year and month, or a month and day, always in the Gregorian calendar. */
export interface PartialDate extends JSContactObject {
	"@type"?: "PartialDate";
	year?: number;
	/** 1 to 12; needs `year` or `day`. */
	month?: number;
	/** 1 to 31; needs `month`. */
	day?: number;
	/** Lowercase CLDR calendar name the date was entered in, or a vendor value. */
	calendarScale?: string;
}

export interface Timestamp extends JSContactObject {
	/** Mandatory here: `Anniversary.date` defaults to PartialDate (section 1.3.4). */
	"@type": "Timestamp";
	utc: UTCDateTime;
}

export interface Note extends JSContactObject {
	"@type"?: "Note";
	note: string;
	created?: UTCDateTime;
	author?: Author;
}

/** At least one of `name` and `uri`. */
export interface Author extends JSContactObject {
	"@type"?: "Author";
	name?: string;
	uri?: string;
}

export interface PersonalInfo extends JSContactObject {
	"@type"?: "PersonalInfo";
	kind: PersonalInfoKind | VendorExtension;
	value: string;
	level?: PersonalInfoLevel | VendorExtension;
	/** Position among the entries of the same kind, from 1. */
	listAs?: number;
	label?: string;
}
