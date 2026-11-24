import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	applyPatchObject,
	type Card,
	jsonEqual,
	jsonPointer,
	localize,
	type PatchObject,
} from "../src/index.js";
import { hostileCase, hostileTree, memberPaths } from "./helpers/arbitraries.js";

const PROTOTYPES = [Object.prototype, Array.prototype, Function.prototype];
const prototypeKeys = (): string[][] => PROTOTYPES.map((p) => Object.getOwnPropertyNames(p));
const cleanPrototypes = prototypeKeys();

/** Runs the property, then checks that nothing was added to a shared prototype. */
function assertHarmless<T extends unknown[]>(property: fc.IProperty<T>, numRuns: number): void {
	fc.assert(property, { numRuns });
	expect(prototypeKeys()).toEqual(cleanPrototypes);
}

describe("jsonPointer on arbitrary input", () => {
	test("a token list written as a pointer is read back", () => {
		fc.assert(
			fc.property(fc.array(fc.string()), (tokens) => {
				const pointer = tokens.map((token) => `/${jsonPointer.escape(token)}`).join("");
				expect(jsonPointer.parse(pointer)).toEqual(tokens);
			}),
		);
	});

	test("nothing throws, and a pointer that was set is read back", () => {
		const anything = fc.tuple(
			fc.anything(),
			fc.oneof(
				fc.string(),
				fc.array(fc.string(), { maxLength: 4 }).map((tokens) => `/${tokens.join("/")}`),
			),
		);
		const made = hostileCase.map(([root, patch]) => [root, `/${Object.keys(patch)[0] ?? ""}`]);
		assertHarmless(
			fc.property(fc.oneof(anything, made), ([root, at]) => {
				const value = { set: true };
				jsonPointer.get(root, at as string);
				if (jsonPointer.set(root, at as string, value)) {
					expect(jsonPointer.get(root, at as string)).toBe(value);
					expect(jsonPointer.remove(root, at as string)).toBe(true);
					expect(jsonPointer.get(root, at as string)).not.toBe(value);
				}
				jsonPointer.remove(root, at as string);
			}),
			3000,
		);
	});
});

describe("applyPatchObject on arbitrary input", () => {
	test("nothing throws: a value is patched whole or not at all, and is left as it was", () => {
		assertHarmless(
			fc.property(
				fc.oneof(fc.tuple(fc.anything(), fc.anything()), hostileCase),
				([target, patch]) => {
					const before = fc.stringify(target);
					const { patched, issues } = applyPatchObject(
						target as object,
						patch as PatchObject,
					);
					expect(fc.stringify(target)).toBe(before);
					expect(patched === null).toBe(issues.length > 0);
					for (const issue of issues) expect(jsonPointer.parse(issue.path)).toBeDefined();
				},
			),
			3000,
		);
	});

	test("an applied PatchObject shows in the copy patch by patch, the rest being as it was", () => {
		const startsWith = (path: string[], prefix: string[]): boolean =>
			prefix.every((token, i) => path[i] === token);
		assertHarmless(
			fc.property(hostileCase, ([target, patch]) => {
				const { patched } = applyPatchObject(target as object, patch);
				fc.pre(patched !== null);
				const patches = Object.entries(patch);
				for (const [key, value] of patches) {
					const found = jsonPointer.get(patched, `/${key}`);
					if (value === null) expect(found).toBeUndefined();
					else expect(jsonEqual(found, value)).toBe(true);
				}
				const pointers = patches.map(([key]) => jsonPointer.parse(`/${key}`) ?? []);
				for (const path of memberPaths(target)) {
					// A member neither patched nor holding a patched one.
					if (pointers.some((p) => startsWith(path, p) || startsWith(p, path))) continue;
					const at = path.map((token) => `/${jsonPointer.escape(token)}`).join("");
					expect(
						jsonEqual(jsonPointer.get(patched, at), jsonPointer.get(target, at)),
					).toBe(true);
				}
			}),
			3000,
		);
	});

	test("localize does not throw either", () => {
		assertHarmless(
			fc.property(
				hostileTree,
				fc.anything(),
				fc.string(),
				(base, localizations, language) => {
					const bare = localize(base as Card, language);
					expect(bare.card === null).toBe(bare.issues.length > 0);
					fc.pre(typeof base === "object" && base !== null);
					const card = { ...base, localizations } as unknown as Card;
					const { card: localized, issues } = localize(card, language);
					expect(localized === null).toBe(issues.length > 0);
					for (const tag of Object.keys(Object(localizations))) localize(card, tag);
				},
			),
			2000,
		);
	});
});
