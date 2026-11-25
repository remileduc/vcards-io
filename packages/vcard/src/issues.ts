import type { IssueCode } from "./issue-codes.js";
import type { Issue, IssueSeverity } from "./types.js";

export const DEFAULT_MAX_ISSUES_PER_CODE = 1000;

// Headers and names are ASCII; a lossless single-byte decoding keeps odd bytes visible in diagnostics.
export const latin1 = new TextDecoder("windows-1252");

/** Anything with a `push`: a plain array in tests, the capped collector in the pipeline. */
export interface IssueSink {
	push(issue: Issue): void;
}

/** For lexing runs whose diagnostics are repeated or irrelevant elsewhere. */
export const discardIssues: IssueSink = { push() {} };

/** `line` and `property` are only set when given, so issues compare equal by content. */
export function issue(
	severity: IssueSeverity,
	code: IssueCode,
	message: string,
	line?: number,
	property?: string,
): Issue {
	const out: Issue = { severity, code, message };
	if (line !== undefined) out.line = line;
	if (property !== undefined) out.property = property;
	return out;
}

/** The start of a value for a message, quoted; bytes are shown as windows-1252. */
export function excerpt(value: string | Uint8Array): string {
	const text = typeof value === "string" ? value : latin1.decode(value.subarray(0, 40));
	return JSON.stringify(value.length > 40 ? `${text.slice(0, 40)}…` : text);
}

/**
 * Collects issues with a cap per code: a hostile file can trigger one warning per line, and
 * millions of messages would exhaust memory long before the 64 MiB input cap does. The first
 * occurrence past the cap is replaced by one `issues-truncated` warning for that code, on
 * its line: the notice then sorts where the recording stopped.
 */
export class IssueCollector implements IssueSink {
	readonly issues: Issue[] = [];
	private readonly counts = new Map<IssueCode, number>();

	constructor(private readonly maxPerCode = DEFAULT_MAX_ISSUES_PER_CODE) {
		if (!Number.isInteger(maxPerCode) || maxPerCode < 1) {
			throw new RangeError(`maxPerCode must be a positive integer, got ${maxPerCode}`);
		}
	}

	push(pushed: Issue): void {
		const count = (this.counts.get(pushed.code) ?? 0) + 1;
		this.counts.set(pushed.code, count);
		if (count <= this.maxPerCode) {
			this.issues.push(pushed);
		} else if (count === this.maxPerCode + 1) {
			const message = `More than ${this.maxPerCode} "${pushed.code}" issues, further ones not recorded`;
			this.issues.push(issue("warning", "issues-truncated", message, pushed.line));
		}
	}
}
