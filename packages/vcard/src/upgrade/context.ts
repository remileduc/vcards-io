import type { UpgradeIssueCode } from "../issue-codes.js";
import { IssueCollector, issue } from "../issues.js";
import { cloneParams, propertyId, textOf } from "../model.js";
import type { Issue, VCard, VParams, VProperty, VValue } from "../types.js";

/** One normalisation step over a whole card: may rewrite, add or remove properties in place. */
export type Rule = (card: VCard, ctx: UpgradeContext) => void;

/** Collects what the rules rewrote, with the source property's line and `group.NAME`. */
export class UpgradeContext {
	// Same cap as the parser: a card with a million rewritten lines must not cost a million strings.
	private readonly collector = new IssueCollector();

	get issues(): Issue[] {
		return this.collector.issues;
	}

	info(code: UpgradeIssueCode, message: string, source: VProperty): void {
		this.collector.push(issue("info", code, message, source.line, propertyId(source)));
	}

	warn(code: UpgradeIssueCode, message: string, source: VProperty): void {
		this.collector.push(issue("warning", code, message, source.line, propertyId(source)));
	}
}

// The callback returns nothing to keep a property, or its replacements (none removes it).
// The card is updated once at the end, so a one-per-card rule keeps its own flag.
export function rewrite(
	card: VCard,
	fn: (p: VProperty) => VProperty | readonly VProperty[] | undefined,
): void {
	const out: VProperty[] = [];
	for (const p of card.properties) {
		const result = fn(p);
		if (result === undefined) out.push(p);
		else if (Array.isArray(result)) for (const r of result as readonly VProperty[]) out.push(r);
		else out.push(result as VProperty);
	}
	card.properties = out;
}

/** Removes a set of properties in one pass; rules collect what to drop and call this once. */
export function drop(card: VCard, doomed: ReadonlySet<VProperty>): void {
	if (doomed.size > 0) card.properties = card.properties.filter((p) => !doomed.has(p));
}

/** A new property in the source's group and line, with its own copy of the parameters. */
export function derive(
	source: VProperty,
	name: string,
	value: VValue,
	params: VParams = cloneParams(source.params),
): VProperty {
	const p: VProperty = { group: source.group, name, params, value };
	if (source.line !== undefined) p.line = source.line;
	return p;
}

export function hasProperty(card: VCard, name: string): boolean {
	return card.properties.some((p) => p.name === name);
}

export function findProperty(card: VCard, name: string): VProperty | undefined {
	return card.properties.find((p) => p.name === name);
}

/** Case-insensitive TYPE membership; X- labels keep their case but still compare folded. */
export function hasType(p: VProperty, type: string): boolean {
	return (p.params.get("TYPE") ?? []).some((t) => t.toLowerCase() === type.toLowerCase());
}

export function addType(p: VProperty, type: string): void {
	if (hasType(p, type)) return;
	const types = p.params.get("TYPE");
	if (types === undefined) p.params.set("TYPE", [type]);
	else types.push(type);
}

/** Removes the TYPE values the predicate accepts; drops the parameter when none is left. */
export function removeTypes(p: VProperty, drop: (type: string) => boolean): string[] {
	const types = p.params.get("TYPE");
	if (types === undefined) return [];
	const removed = types.filter(drop);
	if (removed.length === 0) return [];
	const kept = types.filter((t) => !drop(t));
	if (kept.length === 0) p.params.delete("TYPE");
	else p.params.set("TYPE", kept);
	return removed;
}

/** A group as the Apple rules read it; Apple writes one label and at most one ADR per group. */
export interface Group {
	/** Every member but the X-ABLABEL and X-ABADR helpers that annotate the others. */
	members: VProperty[];
	/** The one non-empty X-ABLABEL; with several, none is interpreted and all stay as written. */
	label?: VProperty;
	/** The first ADR, the one an X-ABADR country code is about. */
	adr?: VProperty;
}

/** Groups by name, built once per rule: a rule never scans a group per property it visits. */
export type GroupIndex = ReadonlyMap<string, Group>;

export function groupIndex(card: VCard): GroupIndex {
	const index = new Map<string, Group>();
	const ambiguous = new Set<Group>();
	for (const p of card.properties) {
		if (p.group === null) continue;
		let group = index.get(p.group);
		if (group === undefined) {
			group = { members: [] };
			index.set(p.group, group);
		}
		if (p.name === "X-ABLABEL") {
			// An empty label is dropped by the label rule: it must not hide the real one.
			if (textOf(p)?.trim() === "") continue;
			if (group.label === undefined) group.label = p;
			else ambiguous.add(group);
		} else if (p.name !== "X-ABADR") group.members.push(p);
		if (p.name === "ADR") group.adr ??= p;
	}
	// Reading the first of several would let a second pass read the next one differently.
	for (const group of ambiguous) delete group.label;
	return index;
}

export function groupOf(index: GroupIndex, p: VProperty): Group | undefined {
	return p.group === null ? undefined : index.get(p.group);
}

/** Hands out unused `itemN` groups, for properties that need a label of their own. */
export function groupAllocator(card: VCard): () => string {
	let max = 0;
	for (const p of card.properties) {
		const m = p.group === null ? null : /^item(\d{1,9})$/.exec(p.group);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return () => `item${++max}`;
}
