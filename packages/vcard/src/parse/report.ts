import type { ParseIssueCode } from "../issue-codes.js";
import { issue } from "../issues.js";
import type { Issue } from "../types.js";

export function error(code: ParseIssueCode, message: string, line?: number): Issue {
	return issue("error", code, message, line);
}

/** `card` is for what the grouper reports on a line two cards share; the rest is placed by line. */
export function warn(code: ParseIssueCode, message: string, line?: number, card?: number): Issue {
	const out = issue("warning", code, message, line);
	if (card !== undefined) out.card = card;
	return out;
}

export function info(code: ParseIssueCode, message: string, line?: number): Issue {
	return issue("info", code, message, line);
}
