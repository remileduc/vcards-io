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
	work.version = "4.0";
	return { card: work, issues: ctx.issues };
}
