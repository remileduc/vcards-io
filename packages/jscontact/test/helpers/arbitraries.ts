import fc from "fast-check";
import { jsonPointer } from "../../src/index.js";

// Few names, so that pointers and values meet. Array indexes, the empty name and the two
// characters a pointer escapes are among them.
const NAMES = ["a", "b", "c", "0", "1", "2", "", "a/b", "m~n"];

/** Names a prototype answers to and the array words: what a pointer must not follow. */
const HOSTILE_NAMES = ["__proto__", "constructor", "prototype", "toString", "length", "-"];

/** A value to patch with a PatchObject made for it. */
export type PatchCase = [target: unknown, patch: Record<string, unknown>];

/** The path of every member of a value, the members of its members included. */
export function memberPaths(value: unknown, path: string[] = []): string[][] {
	if (typeof value !== "object" || value === null) return [];
	return Object.entries(value).flatMap(([key, item]) => [
		[...path, key],
		...memberPaths(item, [...path, key]),
	]);
}

function tree(names: string[]): fc.Arbitrary<unknown> {
	const name = fc.constantFrom(...names);
	return fc.letrec<{ value: unknown }>((tie) => ({
		value: fc.oneof(
			{ depthSize: "small", withCrossShrink: true },
			fc.oneof(
				fc.constant(null),
				fc.boolean(),
				fc.integer({ min: 0, max: 9 }),
				fc.constant("s"),
			),
			fc.array(tie("value"), { maxLength: 3 }),
			fc.dictionary(name, tie("value"), { maxKeys: 4 }),
		),
	})).value;
}

/**
 * Most pointers are taken from the target, to replace or remove a member or to add one beside
 * it; the others are made of the same names, and now and then a key is no pointer at all.
 */
function patchCase(names: string[]): fc.Arbitrary<PatchCase> {
	const name = fc.constantFrom(...names);
	const value = tree(names);
	const target = fc.oneof(
		{ weight: 8, arbitrary: fc.dictionary(name, value, { minKeys: 1, maxKeys: 4 }) },
		{ weight: 1, arbitrary: fc.array(value, { minLength: 1, maxLength: 3 }) },
		{ weight: 1, arbitrary: value },
	);
	return target.chain((root) => {
		const anywhere = fc.array(name, { minLength: 1, maxLength: 4 });
		const existing = memberPaths(root);
		const member = existing.length === 0 ? anywhere : fc.constantFrom(...existing);
		const tokens = fc.oneof(
			{ weight: 5, arbitrary: member },
			{ weight: 3, arbitrary: fc.tuple(member, name).map(([path, last]) => [...path, last]) },
			{ weight: 1, arbitrary: name.map((only) => [only]) },
			{ weight: 1, arbitrary: anywhere },
		);
		const key = fc.oneof(
			{ weight: 19, arbitrary: tokens.map((path) => path.map(jsonPointer.escape).join("/")) },
			{ weight: 1, arbitrary: fc.string() },
		);
		const patched = fc.oneof(
			{ weight: 3, arbitrary: value },
			{ weight: 1, arbitrary: fc.constant(null) },
		);
		return fc
			.dictionary(key, patched, { minKeys: 1, maxKeys: 4 })
			.map((patch): PatchCase => [root, patch]);
	});
}

/** A JSON value over a small set of names, and a case built of such values. */
export const jsonTree = tree(NAMES);
export const jsonCase = patchCase(NAMES);

/** The same two, with the hostile names among the others. */
export const hostileTree = tree([...NAMES, ...HOSTILE_NAMES]);
export const hostileCase = patchCase([...NAMES, ...HOSTILE_NAMES]);
