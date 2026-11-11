import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	COMMON_ISSUE_CODES,
	type IssueCode,
	PARSE_ISSUE_CODES,
	SERIALIZE_ISSUE_CODES,
	UPGRADE_ISSUE_CODES,
} from "../src/index.js";

/** Each list with the directory of the stage that may raise its codes. */
const STAGES: readonly (readonly [string, readonly IssueCode[]])[] = [
	["parse/", [...COMMON_ISSUE_CODES, ...PARSE_ISSUE_CODES]],
	["upgrade/", UPGRADE_ISSUE_CODES],
	["write/", SERIALIZE_ISSUE_CODES],
];
const ALL = STAGES.flatMap(([, codes]) => codes);

const SRC = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../src/`;

function sources(directory: string): string {
	return readdirSync(`${SRC}${directory}`, { recursive: true, encoding: "utf-8" })
		.filter((file) => file.endsWith(".ts"))
		.map((file) => readFileSync(`${SRC}${directory}${file}`, "utf-8"))
		.join("\n");
}

/** A call of a reporting helper with the code as its first argument, or second after a severity. */
function raised(code: string, source: string): boolean {
	const call = String.raw`\b(?:error|warn|info|report|issue)\(\s*(?:[^,()]*,\s*)?`;
	return new RegExp(`${call}"${code}"`).test(source);
}

describe("issue code lists", () => {
	test("a code belongs to one stage and is listed once", () => {
		expect(new Set(ALL).size).toBe(ALL.length);
	});

	// The helpers reject a code that is not in their stage's list; this is the other direction.
	test("every listed code is raised by its own stage, and by no other", () => {
		const misfiled: string[] = [];
		for (const [directory, codes] of STAGES) {
			const own = sources(directory);
			const others = STAGES.filter(([d]) => d !== directory).map(([d]) => sources(d));
			for (const code of codes) {
				if (!raised(code, own)) misfiled.push(`${code} is not raised in ${directory}`);
				if (others.some((source) => raised(code, source))) {
					misfiled.push(`${code} is raised outside ${directory}`);
				}
			}
		}
		expect(misfiled).toEqual([]);
	});

	test("the raise-site pattern ignores comments, messages and lookup tables", () => {
		expect(raised("geo-invalid", 'ctx.warn(\n\t"geo-invalid",')).toBe(true);
		expect(raised("geo-invalid", 'ctx.report(strict ? "warning" : "info", "geo-invalid"')).toBe(
			true,
		);
		expect(raised("geo-invalid", '// raises "geo-invalid"')).toBe(false);
		expect(raised("geo-invalid", 'warn("other", \'see "geo-invalid"\')')).toBe(false);
		expect(raised("geo-invalid", '["geo-invalid", "x"]')).toBe(false);
	});
});
