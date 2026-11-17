import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Issue, upgradeTo40, type VCard } from "../../src/index.js";

export const fixtureRoot = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../../fixtures/`;

// Every .vcf present, so an untracked local export is tested too without being named here.
export const fixtureFiles = readdirSync(fixtureRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((dir) => readdirSync(`${fixtureRoot}${dir.name}`).map((f) => `${dir.name}/${f}`))
	.filter((f) => f.endsWith(".vcf"))
	.sort();

export function upgradeAll(cards: readonly VCard[]): { cards: VCard[]; issues: Issue[] } {
	const out: VCard[] = [];
	const issues: Issue[] = [];
	for (const card of cards) {
		const result = upgradeTo40(card);
		out.push(result.card);
		issues.push(...result.issues);
	}
	return { cards: out, issues };
}
