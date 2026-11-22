import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
	BACKUP_ISSUE_CODES,
	type CardIssueCode,
	COMMON_ISSUE_CODES,
	PATCH_ISSUE_CODES,
	VALIDATION_ISSUE_CODES,
} from "../src/index.js";

/** Each list with the file that may raise its codes. */
const STAGES: readonly (readonly [string, readonly CardIssueCode[]])[] = [
	["issues.ts", COMMON_ISSUE_CODES],
	["patch.ts", PATCH_ISSUE_CODES],
	["validate.ts", VALIDATION_ISSUE_CODES],
	["backup.ts", BACKUP_ISSUE_CODES],
];
const ALL = STAGES.flatMap(([, codes]) => codes);

const source = (file: string): string =>
	readFileSync(new URL(`../src/${file}`, import.meta.url), "utf-8");

/** A call of a reporting helper with the code as its first argument, or second after a severity. */
function raised(code: string, text: string): boolean {
	const call = String.raw`\b(?:error|fail|issue)\(\s*(?:[^,()]*,\s*)?`;
	return new RegExp(`${call}"${code}"`).test(text);
}

describe("issue code lists", () => {
	test("a code belongs to one list and is listed once", () => {
		expect(new Set(ALL).size).toBe(ALL.length);
	});

	// The helpers reject a code that is not in their list; this is the other direction.
	test("every listed code is raised by its own file, and by no other", () => {
		const misfiled: string[] = [];
		for (const [file, codes] of STAGES) {
			const others = STAGES.filter(([other]) => other !== file).map(([other]) =>
				source(other),
			);
			for (const code of codes) {
				if (!raised(code, source(file))) misfiled.push(`${code} is not raised in ${file}`);
				if (others.some((text) => raised(code, text))) {
					misfiled.push(`${code} is raised outside ${file}`);
				}
			}
		}
		expect(misfiled).toEqual([]);
	});

	test("the raise-site pattern ignores comments, messages and lookup tables", () => {
		expect(raised("patch-array-append", 'return fail(\n\t"patch-array-append",')).toBe(true);
		expect(raised("issues-truncated", 'issue("warning", "issues-truncated", message')).toBe(
			true,
		);
		expect(raised("patch-array-append", '// "patch-array-append" is raised below')).toBe(false);
		expect(raised("patch-array-append", '["patch-array-append", "error"]')).toBe(false);
	});
});
