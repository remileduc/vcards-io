import type { Issue, IssueSeverity } from "../types.js";
import type { IssueSink } from "./lines.js";

export const DEFAULT_MAX_ISSUES_PER_CODE = 1000;

// Headers and names are ASCII; a lossless single-byte decoding keeps odd bytes visible in diagnostics.
export const latin1 = new TextDecoder("windows-1252");

/** For lexing runs whose diagnostics are repeated or irrelevant elsewhere. */
export const discardIssues: IssueSink = { push() {} };

/** `line` and `property` are only set when given, so issues compare equal by content. */
export function issue(
	severity: IssueSeverity,
	code: string,
	message: string,
	line?: number,
	property?: string,
): Issue {
	const out: Issue = { severity, code, message };
	if (line !== undefined) out.line = line;
	if (property !== undefined) out.property = property;
	return out;
}

export function warn(code: string, message: string, line?: number): Issue {
	return issue("warning", code, message, line);
}

export function info(code: string, message: string, line?: number): Issue {
	return issue("info", code, message, line);
}

/** The start of a value for a message, quoted; bytes are shown as windows-1252. */
export function excerpt(value: string | Uint8Array): string {
	const text = typeof value === "string" ? value : latin1.decode(value.subarray(0, 40));
	return JSON.stringify(value.length > 40 ? `${text.slice(0, 40)}…` : text);
}

/**
 * Collects issues with a cap per code: a hostile file can trigger one warning per line, and
 * millions of messages would exhaust memory long before the 64 MiB input cap does. The first
 * occurrence past the cap is replaced by one `issues-truncated` warning for that code.
 */
export class IssueCollector implements IssueSink {
	readonly issues: Issue[] = [];
	private readonly counts = new Map<string, number>();

	constructor(private readonly maxPerCode = DEFAULT_MAX_ISSUES_PER_CODE) {
		if (!Number.isInteger(maxPerCode) || maxPerCode < 1) {
			throw new RangeError(`maxPerCode must be a positive integer, got ${maxPerCode}`);
		}
	}

	push(issue: Issue): void {
		const count = (this.counts.get(issue.code) ?? 0) + 1;
		this.counts.set(issue.code, count);
		if (count <= this.maxPerCode) {
			this.issues.push(issue);
		} else if (count === this.maxPerCode + 1) {
			this.issues.push({
				severity: "warning",
				code: "issues-truncated",
				message: `More than ${this.maxPerCode} "${issue.code}" issues, further ones not recorded`,
			});
		}
	}
}
