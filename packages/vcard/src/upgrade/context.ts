import { IssueCollector, issue } from "../parse/issues.js";
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

	info(code: string, message: string, source: VProperty): void {
		this.collector.push(issue("info", code, message, source.line, propertyId(source)));
	}

	warn(code: string, message: string, source: VProperty): void {
		this.collector.push(issue("warning", code, message, source.line, propertyId(source)));
	}
}

export function propertyId(p: VProperty): string {
	return p.group === null ? p.name : `${p.group}.${p.name}`;
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

export function cloneParams(params: VParams): VParams {
	return new Map([...params].map(([name, values]) => [name, [...values]]));
}

export function firstParam(p: VProperty, name: string): string | undefined {
	return p.params.get(name)?.[0];
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

/** The plain text of a text, uri or unknown value; other kinds have none. */
export function textOf(p: VProperty): string | undefined {
	switch (p.value.kind) {
		case "text":
		case "uri":
			return p.value.value;
		case "unknown":
			return p.value.raw;
		default:
			return undefined;
	}
}

/** Properties by group, built once per rule so a card with many groups stays linear. */
export type GroupIndex = ReadonlyMap<string, readonly VProperty[]>;

export function groupIndex(card: VCard): GroupIndex {
	const index = new Map<string, VProperty[]>();
	for (const p of card.properties) {
		if (p.group === null) continue;
		const members = index.get(p.group);
		if (members === undefined) index.set(p.group, [p]);
		else members.push(p);
	}
	return index;
}

/** Members of a group other than the Apple label and country helpers that annotate them. */
export function membersOf(index: GroupIndex, group: string | null): VProperty[] {
	if (group === null) return [];
	return (index.get(group) ?? []).filter((p) => p.name !== "X-ABLABEL" && p.name !== "X-ABADR");
}

export function labelOf(index: GroupIndex, group: string | null): VProperty | undefined {
	if (group === null) return undefined;
	return index.get(group)?.find((p) => p.name === "X-ABLABEL");
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
