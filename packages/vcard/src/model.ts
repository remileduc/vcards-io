import type { VParams, VProperty } from "./types.js";

/** RFC 6350 `name = 1*(ALPHA / DIGIT / "-")` after uppercasing; reader and writer check the same. */
export const NAME_RE = /^[A-Z0-9-]+$/;

/** `group.NAME`, or `NAME` without a group: how `Issue.property` names a property. */
export function propertyId(p: Pick<VProperty, "group" | "name">): string {
	return p.group === null ? p.name : `${p.group}.${p.name}`;
}

export function cloneParams(params: VParams): VParams {
	return new Map([...params].map(([name, values]) => [name, [...values]]));
}

export function firstParam(p: VProperty, name: string): string | undefined {
	return p.params.get(name)?.[0];
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
