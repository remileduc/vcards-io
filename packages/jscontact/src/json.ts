// What the pointer, patch and utility code shares to read and copy JSON values. Own properties
// only, and loops, not recursion: JSON.parse accepts a nesting far deeper than the call stack.

/** An object or an array, typed so that a member is read by its key. */
export type Container = Record<string, unknown>;

export function isContainer(value: unknown): value is Container {
	return typeof value === "object" && value !== null;
}

/** A JSON object: neither null nor an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return isContainer(value) && !Array.isArray(value);
}

/** A reference token as a JSON Pointer writes it: `~` becomes `~0` and `/` becomes `~1`. */
export function escapeToken(token: string): string {
	return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

/** The position of an existing element; undefined for "-", "length", "01" or one past the end. */
export function arrayIndex(array: readonly unknown[], token: string): number | undefined {
	if (!ARRAY_INDEX.test(token)) return undefined;
	const index = Number(token);
	return index < array.length ? index : undefined;
}

/** The own property or the array element `token` names, undefined when there is none. */
export function member(container: unknown, token: string): unknown {
	if (Array.isArray(container)) {
		const index = arrayIndex(container, token);
		return index === undefined ? undefined : container[index];
	}
	return isRecord(container) && Object.hasOwn(container, token) ? container[token] : undefined;
}

/** Sets an object property or replaces an existing array element; false when it cannot. */
export function setMember(container: unknown, token: string, value: unknown): boolean {
	if (Array.isArray(container)) {
		const index = arrayIndex(container, token);
		if (index !== undefined) container[index] = value;
		return index !== undefined;
	}
	// Assigning `__proto__` would change the prototype instead of adding a property.
	if (!isRecord(container) || token === "__proto__") return false;
	container[token] = value;
	return true;
}

/** Creates an own property without running a setter, so a `__proto__` key is copied as data. */
function define(target: Container, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true,
	});
}

function emptyLike(value: Container): Container {
	return (Array.isArray(value) ? [] : {}) as Container;
}

/** A deep copy of a JSON value, keys in the same order. */
export function cloneJson<T>(value: T): T {
	if (!isContainer(value)) return value;
	const copy = emptyLike(value);
	const pending: [source: Container, target: Container][] = [[value, copy]];
	for (let pair = pending.pop(); pair !== undefined; pair = pending.pop()) {
		const [source, target] = pair;
		for (const key of Object.keys(source)) {
			const item = source[key];
			if (isContainer(item)) {
				const child = emptyLike(item);
				define(target, key, child);
				pending.push([item, child]);
			} else {
				define(target, key, item);
			}
		}
	}
	return copy as T;
}

/** Deep equality of two JSON values; the order of the keys of an object does not count. */
export function equal(a: unknown, b: unknown): boolean {
	const pending: [left: unknown, right: unknown][] = [[a, b]];
	for (let pair = pending.pop(); pair !== undefined; pair = pending.pop()) {
		const [left, right] = pair;
		if (left === right) continue;
		if (!isContainer(left) || !isContainer(right)) return false;
		if (Array.isArray(left) !== Array.isArray(right)) return false;
		const keys = Object.keys(left);
		if (keys.length !== Object.keys(right).length) return false;
		for (const key of keys) {
			if (!Object.hasOwn(right, key)) return false;
			pending.push([left[key], right[key]]);
		}
	}
	return true;
}
