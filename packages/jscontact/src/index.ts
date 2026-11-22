/**
 * @vcards-io/jscontact: JSContact 2.0 types, validator, pointer/patch
 * utilities, vendor extensions and structured diff. See docs/plan.md,
 * "Package 2".
 */
export const VERSION = "0.1.0";

export { cardDisplayName } from "./display-name.js";
export {
	ADDRESS_COMPONENT_KINDS,
	ADDRESS_CONTEXTS,
	type AddressComponentKind,
	type AddressContext,
	ANNIVERSARY_KINDS,
	type AnniversaryKind,
	CALENDAR_KINDS,
	CARD_KINDS,
	CARD_VERSIONS,
	type CalendarKind,
	type CardKind,
	type CardVersion,
	CONTEXTS,
	type Context,
	DIRECTORY_KINDS,
	type DirectoryKind,
	GRAMMATICAL_GENDERS,
	type GrammaticalGender,
	isListed,
	LINK_KINDS,
	type LinkKind,
	MEDIA_KINDS,
	type MediaKind,
	NAME_COMPONENT_KINDS,
	type NameComponentKind,
	PERSONAL_INFO_KINDS,
	PERSONAL_INFO_LEVELS,
	type PersonalInfoKind,
	type PersonalInfoLevel,
	PHONE_FEATURES,
	PHONETIC_SYSTEMS,
	type PhoneFeature,
	type PhoneticSystem,
	RELATION_TYPES,
	type RelationType,
	TITLE_KINDS,
	type TitleKind,
} from "./enums.js";
export { newUid, nextId } from "./ids.js";
export {
	type CardIssueCode,
	COMMON_ISSUE_CODES,
	type CommonIssueCode,
	PATCH_ISSUE_CODES,
	type PatchIssueCode,
} from "./issue-codes.js";
export type { CardIssue, CardIssueSeverity } from "./issues.js";
export { equal } from "./json.js";
export { normalizeCard } from "./normalize.js";
export { applyPatchObject, type LocalizeResult, localize, type PatchResult } from "./patch.js";
export * as jsonPointer from "./pointer.js";
export type * from "./types.js";
export {
	NICKNAME_KIND,
	NICKNAME_KINDS,
	type NicknameKind,
	VENDOR_PREFIX,
	VENDOR_RELATIONS,
	type VendorKey,
	type VendorRelation,
} from "./vendor.js";
