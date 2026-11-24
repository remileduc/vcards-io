// The project's own JSContact extensions (RFC 9553 section 1.8): what the phone dialects carry
// and the standard has no word for. docs/plan.md, "Vendor extensions".

/** A domain the project controls, as section 1.8.1 requires, with the separating colon. */
export const VENDOR_PREFIX = "remileduc.github.io:";

/** A vendor property name or enum value of this project. */
export type VendorKey<Name extends string = string> = `${typeof VENDOR_PREFIX}${Name}`;

/** Property of a Nickname holding one of `NICKNAME_KINDS`; absent on a plain nickname. */
export const NICKNAME_KIND = `${VENDOR_PREFIX}kind` as const;

/** The Android nickname types other than the default one. */
export const NICKNAME_KINDS = ["maiden", "short", "initials", "other", "custom"] as const;
export type NicknameKind = (typeof NICKNAME_KINDS)[number];

/** Custom label of an Address, Anniversary, Nickname or Relation: RFC 9553 gives them none. */
export const VENDOR_LABEL = `${VENDOR_PREFIX}label` as const;

/** Relation names of the phones; the key in `Relation.relation` is `VENDOR_PREFIX` + name. */
export const VENDOR_RELATIONS = [
	"mother",
	"father",
	"brother",
	"sister",
	"domestic-partner",
	"partner",
	"assistant",
	"manager",
	"referred-by",
] as const;
export type VendorRelation = (typeof VENDOR_RELATIONS)[number];

/** Property `serializeCards` sets on each Card of a JSON backup and `parseCards` removes. */
export const FORMAT_STAMP = `${VENDOR_PREFIX}formatVersion` as const;

/** The format this version writes: raised when what a backup holds changes shape, not per release. */
export const FORMAT_VERSION = 1;
