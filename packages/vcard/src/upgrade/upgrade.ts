import type { Issue, VCard } from "../types.js";
import { UpgradeContext } from "./context.js";
import { FINAL_RULES, STANDARD_RULES } from "./rules.js";
import { VENDOR_RULES } from "./vendor.js";

export interface UpgradeOptions {
	/** Apply the Android / Apple / Google vendor rules too. Default true. */
	vendor?: boolean;
}

export interface UpgradeResult {
	card: VCard;
	issues: Issue[];
}

// Lifts a card of any version to 4.0 semantics so the converter only knows 4.0. Pure and
// idempotent; every rewrite is an `info`, a `warning` kept a malformed property (docs/plan.md).
export function upgradeTo40(card: VCard, options: UpgradeOptions = {}): UpgradeResult {
	const ctx = new UpgradeContext();
	const work: VCard = structuredClone(card);
	for (const rule of STANDARD_RULES) rule(work, ctx);
	if (options.vendor ?? true) for (const rule of VENDOR_RULES) rule(work, ctx);
	for (const rule of FINAL_RULES) rule(work, ctx);
	setVersion(work, ctx);
	return { card: work, issues: ctx.issues };
}

/** One VERSION:4.0 first; a card with several VERSION lines (the parser warned) keeps only one. */
function setVersion(card: VCard, ctx: UpgradeContext): void {
	card.version = "4.0";
	const versions = card.properties.filter((p) => p.name === "VERSION");
	for (const extra of versions.slice(1))
		ctx.info("version-dropped", "Extra VERSION dropped", extra);
	card.properties = card.properties.filter((p) => p.name !== "VERSION");
	card.properties.unshift({
		group: null,
		name: "VERSION",
		params: new Map(),
		value: { kind: "text", value: "4.0" },
		...(versions[0]?.line === undefined ? {} : { line: versions[0].line }),
	});
}
