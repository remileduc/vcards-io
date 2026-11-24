// The enumerated values of RFC 9553 (section 3.7.3), in the order the RFC text lists them: the
// UI builds its dropdowns from these lists. All but the versions also accept a vendor value.

/** RFC 9553 registers "1.0"; RFC 9982 adds "2.0", which is what this project writes. */
export const CARD_VERSIONS = ["1.0", "2.0"] as const;
export type CardVersion = (typeof CARD_VERSIONS)[number];

export const CARD_KINDS = [
	"individual",
	"group",
	"org",
	"location",
	"device",
	"application",
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CONTEXTS = ["private", "work"] as const;
export type Context = (typeof CONTEXTS)[number];

export const ADDRESS_CONTEXTS = [...CONTEXTS, "billing", "delivery"] as const;
export type AddressContext = (typeof ADDRESS_CONTEXTS)[number];

export const PHONETIC_SYSTEMS = ["ipa", "jyut", "piny"] as const;
export type PhoneticSystem = (typeof PHONETIC_SYSTEMS)[number];

export const RELATION_TYPES = [
	"acquaintance",
	"agent",
	"child",
	"co-resident",
	"co-worker",
	"colleague",
	"contact",
	"crush",
	"date",
	"emergency",
	"friend",
	"kin",
	"me",
	"met",
	"muse",
	"neighbor",
	"parent",
	"sibling",
	"spouse",
	"sweetheart",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const NAME_COMPONENT_KINDS = [
	"title",
	"given",
	"given2",
	"surname",
	"surname2",
	"credential",
	"generation",
	"separator",
] as const;
export type NameComponentKind = (typeof NAME_COMPONENT_KINDS)[number];

export const GRAMMATICAL_GENDERS = [
	"animate",
	"common",
	"feminine",
	"inanimate",
	"masculine",
	"neuter",
] as const;
export type GrammaticalGender = (typeof GRAMMATICAL_GENDERS)[number];

export const TITLE_KINDS = ["title", "role"] as const;
export type TitleKind = (typeof TITLE_KINDS)[number];

export const PHONE_FEATURES = [
	"mobile",
	"voice",
	"text",
	"video",
	"main-number",
	"textphone",
	"fax",
	"pager",
] as const;
export type PhoneFeature = (typeof PHONE_FEATURES)[number];

export const CALENDAR_KINDS = ["calendar", "freeBusy"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const ADDRESS_COMPONENT_KINDS = [
	"room",
	"apartment",
	"floor",
	"building",
	"number",
	"name",
	"block",
	"subdistrict",
	"district",
	"locality",
	"region",
	"postcode",
	"country",
	"direction",
	"landmark",
	"postOfficeBox",
	"separator",
] as const;
export type AddressComponentKind = (typeof ADDRESS_COMPONENT_KINDS)[number];

export const DIRECTORY_KINDS = ["directory", "entry"] as const;
export type DirectoryKind = (typeof DIRECTORY_KINDS)[number];

export const LINK_KINDS = ["contact"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const MEDIA_KINDS = ["photo", "sound", "logo"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ANNIVERSARY_KINDS = ["birth", "death", "wedding"] as const;
export type AnniversaryKind = (typeof ANNIVERSARY_KINDS)[number];

export const PERSONAL_INFO_KINDS = ["expertise", "hobby", "interest"] as const;
export type PersonalInfoKind = (typeof PERSONAL_INFO_KINDS)[number];

export const PERSONAL_INFO_LEVELS = ["high", "medium", "low"] as const;
export type PersonalInfoLevel = (typeof PERSONAL_INFO_LEVELS)[number];

/** Whether `value` is one of an `as const` list: the way to read an enumerated property. */
export function isListed<const Value extends string>(
	list: readonly Value[],
	value: unknown,
): value is Value {
	return (list as readonly unknown[]).includes(value);
}
