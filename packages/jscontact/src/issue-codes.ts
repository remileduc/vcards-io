/** Raised by anything that reports issues, once per code that went over the per-code cap. */
export const COMMON_ISSUE_CODES = ["issues-truncated"] as const;
export type CommonIssueCode = (typeof COMMON_ISSUE_CODES)[number];

/** Codes `applyPatchObject` and `localize` raise: any of them rejects the whole PatchObject. */
export const PATCH_ISSUE_CODES = [
	"patch-target-not-an-object",
	"patch-not-an-object",
	"patch-targets-localizations",
	"patch-pointer-invalid",
	"patch-parent-missing",
	"patch-array-append",
	"patch-array-index-missing",
	"patch-array-index-null",
	"patch-prototype-key",
	"patch-value-undefined",
	"patch-prefix-conflict",
] as const;
export type PatchIssueCode = (typeof PATCH_ISSUE_CODES)[number];

/** Codes `validateCard` raises, all errors: any of them refuses the Card. */
export const VALIDATION_ISSUE_CODES = [
	"card-not-an-object",
	"card-too-deep",
	"card-too-large",
	"prototype-key",
	"value-not-json",
	"at-type-mismatch",
	"version-unsupported",
	"property-wrong-type",
	"property-missing",
	"set-value-not-true",
	"id-invalid",
	"jcard-prop-invalid",
] as const;
export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];

/** Codes `parseCards` adds to the validator's: the text, the format stamp, the version. */
export const BACKUP_ISSUE_CODES = [
	"json-too-large",
	"json-syntax",
	"format-version-invalid",
	"format-version-newer",
	"version-upgraded",
] as const;
export type BackupIssueCode = (typeof BACKUP_ISSUE_CODES)[number];

export type CardIssueCode =
	| CommonIssueCode
	| PatchIssueCode
	| ValidationIssueCode
	| BackupIssueCode;
