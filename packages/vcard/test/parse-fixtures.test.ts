import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { Issue } from "../src/index.js";
import { toUtf8Bytes } from "../src/parse/bytes.js";
import { groupCards } from "../src/parse/cards.js";
import { readLogicalLines } from "../src/parse/lines.js";

const root = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../fixtures/`;
// Every .vcf present, so an untracked local export is tested too without being named here.
const files = readdirSync(root, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((dir) => readdirSync(`${root}${dir.name}`).map((f) => `${dir.name}/${f}`))
	.filter((f) => f.endsWith(".vcf"))
	.sort();

describe("fixtures reach the card layer", () => {
	test.each(files)("%s", (file) => {
		const bytes = readFileSync(`${root}${file}`);
		const source = new TextDecoder().decode(bytes);
		// No cozy fixture nests a vCard in AGENT, so counting BEGIN lines is exact here.
		const expected = (source.match(/^BEGIN:VCARD/gim) ?? []).length;
		const issues: Issue[] = [];
		const input = toUtf8Bytes(bytes);
		issues.push(...input.issues);
		const cards = groupCards(readLogicalLines(input.bytes, issues), issues);
		expect(cards).toHaveLength(expected);
		expect(issues.filter((i) => i.severity === "error")).toEqual([]);
		expect(issues.map((i) => i.code)).not.toContain("invalid-line");
		for (const card of cards) {
			expect(card.versionSource).toBe("explicit");
			expect(card.lines.map((l) => l.name)).toContain("FN");
		}
	});
});
