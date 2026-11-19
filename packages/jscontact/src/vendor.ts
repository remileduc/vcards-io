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
