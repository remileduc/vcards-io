/** Raised by any stage, once per code that went over the per-code cap. */
export const COMMON_ISSUE_CODES = ["issues-truncated"] as const;

/** Codes `parseVCards` raises, in pipeline order: bytes, lines, lexer, cards, values. */
export const PARSE_ISSUE_CODES = [
	"input-too-large",
	"bom-stripped",
	"utf16-transcoded",
	"line-too-long",
	"unindented-continuation",
	"qp-soft-break-dangling",
	"invalid-line",
	"invalid-property-name",
	"param-comma-separator",
	"empty-parameter",
	"malformed-quote",
	"comment-skipped",
	"agent-inline-vcard",
	"nested-begin",
	"unexpected-end",
	"line-outside-card",
	"missing-end",
	"version-unknown",
	"version-duplicate",
	"version-missing",
	"version-extras-dropped",
	"charset-ignored",
	"charset-unknown",
	"charset-fallback",
	"invalid-base64",
	"binary-empty",
	"encoding-unknown",
	"property-not-in-version",
	"value-type-unknown",
	"uri-escaped-colon",
	"binary-as-uri",
	"binary-without-encoding",
	"calscale-unsupported",
	"timestamp-incomplete",
	"invalid-value",
] as const;

/** Codes `upgradeTo40` raises: the standard rules, then the vendor rules. */
export const UPGRADE_ISSUE_CODES = [
	"version-dropped",
	"legacy-text-unescaped",
	"context-dropped",
	"pref-to-param",
	"binary-to-data-uri",
	"media-type-param",
	"geo-invalid",
	"geo-to-uri",
	"label-dropped",
	"label-merged",
	"label-to-adr",
	"sort-string-to-sort-as",
	"agent-to-related",
	"uid-to-uri",
	"content-id-to-uri",
	"type-dropped",
	"adr-extra-components",
	"adr-label-component",
	"value-param-rewritten",
	"android-custom-unknown-type",
	"android-nickname",
	"android-event",
	"android-relation",
	"vendor-date-invalid",
	"legacy-im-to-impp",
	"legacy-im-to-socialprofile",
	"legacy-im-to-tel",
	"impp-handle-invalid",
	"x-service-type",
	"omit-year",
	"omit-year-invalid",
	"abdate-to-anniversary",
	"abrelatednames-to-related",
	"x-socialprofile",
	"abadr-to-cc",
	"abadr-invalid",
	"abshowas-to-kind",
	"x-addressbookserver",
	"x-gender-to-gender",
	"x-gender-invalid",
	"ablabel-dropped",
	"ablabel-orphan",
	"ablabel-to-type",
] as const;

/** Codes `serializeVCards` raises: what vCard 3.0 cannot carry. */
export const SERIALIZE_ISSUE_CODES = [
	"param-not-in-30",
	"param-value-not-in-30",
	"pref-not-in-30",
	"components-not-in-30",
] as const;

export type CommonIssueCode = (typeof COMMON_ISSUE_CODES)[number];
export type ParseIssueCode = (typeof PARSE_ISSUE_CODES)[number];
export type UpgradeIssueCode = (typeof UPGRADE_ISSUE_CODES)[number];
export type SerializeIssueCode = (typeof SERIALIZE_ISSUE_CODES)[number];

export type IssueCode = CommonIssueCode | ParseIssueCode | UpgradeIssueCode | SerializeIssueCode;
