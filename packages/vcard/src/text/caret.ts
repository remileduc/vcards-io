/** RFC 6868 parameter value encoding: `^` → `^^`, newline → `^n`, `"` → `^'`. */
export function caretEncode(value: string): string {
	return value.replace(/[\^\n"]|\r\n?/g, (c) => (c === "^" ? "^^" : c === '"' ? "^'" : "^n"));
}

/** RFC 6868 decoding. A `^` followed by anything else is left untouched. */
export function caretDecode(value: string): string {
	return value.replace(/\^[\^n']/g, (seq) => (seq === "^^" ? "^" : seq === "^n" ? "\n" : '"'));
}
