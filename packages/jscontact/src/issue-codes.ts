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

export type CardIssueCode = CommonIssueCode | PatchIssueCode;
