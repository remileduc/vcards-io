// JSON Pointer (RFC 6901) over JSON values, exported as `jsonPointer`. A token names an own
// property or an existing array element, so no pointer reaches a prototype.

import { arrayIndex, isContainer, isRecord, member, setMember } from "./json.js";

const INVALID_ESCAPE = /~(?![01])/;

// `escape` is a legacy global, which a function declared under that name would shadow.
export { escapeToken as escape } from "./json.js";

/** The reference tokens of a pointer, none for the root `""`; undefined when it is not one. */
export function parse(pointer: string): string[] | undefined {
	if (pointer === "") return [];
	if (!pointer.startsWith("/") || INVALID_ESCAPE.test(pointer)) return undefined;
	return pointer
		.slice(1)
		.split("/")
		.map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** The value at `pointer`; undefined when a token names no member or the pointer is invalid. */
export function get(root: unknown, pointer: string): unknown {
	const tokens = parse(pointer);
	if (tokens === undefined) return undefined;
	let value = root;
	for (const token of tokens) value = member(value, token);
	return value;
}

/**
 * Sets an object property, new or not, or an existing array element, in place. False, with
 * nothing changed, for the root, a missing parent, a new array index or a `__proto__` key.
 */
export function set(root: unknown, pointer: string, value: unknown): boolean {
	const place = locate(root, pointer);
	return place !== undefined && setMember(place.parent, place.token, value);
}

/** Removes the member at `pointer` in place, an array closing the gap; false when there is none. */
export function remove(root: unknown, pointer: string): boolean {
	const place = locate(root, pointer);
	if (place === undefined) return false;
	const { parent, token } = place;
	if (Array.isArray(parent)) {
		const index = arrayIndex(parent, token);
		if (index !== undefined) parent.splice(index, 1);
		return index !== undefined;
	}
	return isRecord(parent) && Object.hasOwn(parent, token) && delete parent[token];
}

/** The container the last token of `pointer` is looked up in; undefined when there is none. */
function locate(root: unknown, pointer: string): { parent: unknown; token: string } | undefined {
	const tokens = parse(pointer);
	const token = tokens?.pop();
	if (tokens === undefined || token === undefined) return undefined;
	let parent = root;
	for (const step of tokens) parent = member(parent, step);
	return isContainer(parent) ? { parent, token } : undefined;
}
