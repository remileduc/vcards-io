// The issue shape of this package. It mirrors the one of @vcards-io/vcard, which this package
// does not depend on: `convert` wraps one into the other.

import type { CardIssueCode } from "./issue-codes.js";

export type CardIssueSeverity = "error" | "warning" | "info";

export interface CardIssue {
	severity: CardIssueSeverity;
	code: CardIssueCode;
	message: string;
	/** JSON Pointer to what the issue is about, from the root of the value checked; `""` is the root. */
	path: string;
	/** Position of the Card in the input of `parseJSContact`, which alone sets it. */
	card?: number;
}

export const MAX_ISSUES_PER_CODE = 1000;

export function issue(
	severity: CardIssueSeverity,
	code: CardIssueCode,
	message: string,
	path: string,
): CardIssue {
	return { severity, code, message, path };
}

/** The start of a string for a message, quoted. */
export function excerpt(text: string): string {
	return JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);
}

/** What a value is, for a message: its JSON type, with the text of a scalar. */
export function describeValue(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (Array.isArray(value)) return "an array";
	switch (typeof value) {
		case "string":
			return `the string ${excerpt(value)}`;
		case "number":
		case "boolean":
			return `the ${typeof value} ${value}`;
		case "object":
			return "an object";
		default:
			return `a ${typeof value}`;
	}
}

/**
 * Collects issues with a cap per code: hostile JSON can trigger one issue per member. The first
 * occurrence past the cap is replaced by one `issues-truncated` warning for that code.
 */
export class IssueCollector {
	readonly issues: CardIssue[] = [];
	private readonly counts = new Map<CardIssueCode, number>();

	push(pushed: CardIssue): void {
		const count = (this.counts.get(pushed.code) ?? 0) + 1;
		this.counts.set(pushed.code, count);
		if (count <= MAX_ISSUES_PER_CODE) {
			this.issues.push(pushed);
		} else if (count === MAX_ISSUES_PER_CODE + 1) {
			const message = `More than ${MAX_ISSUES_PER_CODE} "${pushed.code}" issues, further ones not recorded`;
			this.issues.push(issue("warning", "issues-truncated", message, ""));
		}
	}
}
