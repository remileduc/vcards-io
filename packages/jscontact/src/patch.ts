// PatchObject (RFC 9553 section 1.4.3) and localizations (section 2.7.1). A PatchObject is
// checked whole before anything is applied, and applied to a copy.

import type { PatchIssueCode } from "./issue-codes.js";
import { type CardIssue, excerpt, IssueCollector, issue } from "./issues.js";
import {
	arrayIndex,
	type Container,
	cloneJson,
	escapeToken,
	isContainer,
	isRecord,
	member,
} from "./json.js";
import { parse } from "./pointer.js";
import type { Card, PatchObject } from "./types.js";

export interface PatchResult<T> {
	/** The patched copy, typed as the target though a patch may change its shape; null when invalid. */
	patched: T | null;
	/** `path` points into the PatchObject: `/` and the escaped key of the patch at fault. */
	issues: CardIssue[];
}

export interface LocalizeResult {
	/** The localized Card, for `validateCard` to type; null when it is no object or the patch is invalid. */
	card: Record<string, unknown> | null;
	/** `path` points into the Card: `/localizations/<tag>/<escaped key>`. */
	issues: CardIssue[];
}

type Patch = [key: string, value: unknown];

interface Pointer {
	key: string;
	tokens: string[];
}

/** Where a valid patch applies: `token` in `parent`, a container of the copy. */
interface Edit {
	parent: Container;
	token: string;
	value: unknown;
}

function error(code: PatchIssueCode, message: string, path: string): CardIssue {
	return issue("error", code, message, path);
}

function pathOf(key: string): string {
	return `/${escapeToken(key)}`;
}

/**
 * Applies a PatchObject to a copy of `target`, which is left untouched. A null value removes a
 * property; any other is copied in. Whether the values suit the properties is the validator's.
 */
export function applyPatchObject<T extends object>(target: T, patch: PatchObject): PatchResult<T> {
	const issues = new IssueCollector();
	let patched: T | null = null;
	if (!isContainer(target)) {
		issues.push(
			error("patch-target-not-an-object", "Only an object or an array is patched", ""),
		);
	} else if (!isRecord(patch)) {
		issues.push(error("patch-not-an-object", "A PatchObject must be a JSON object", ""));
	} else {
		patched = applyPatches(target, Object.entries(patch), issues);
	}
	return { patched, issues: issues.issues };
}

/**
 * The Card as it reads in `language`: a copy without `localizations`, patched, `language` set
 * to the tag. A Card with no patch for it is returned as it is, not copied.
 */
export function localize(card: Card, language: string): LocalizeResult {
	if (!isRecord(card)) {
		const message = "Only a Card, a JSON object, is localized";
		return { card: null, issues: [error("patch-target-not-an-object", message, "")] };
	}
	const localizations: unknown = card.localizations;
	if (!isRecord(localizations)) return { card, issues: [] };
	const wanted = language.toLowerCase();
	const tag = Object.keys(localizations).find((key) => key.toLowerCase() === wanted);
	if (tag === undefined) return { card, issues: [] };

	const issues = new IssueCollector();
	const patched = localizeWith(card, localizations[tag], issues);
	const base = `/localizations/${escapeToken(tag)}`;
	return {
		card: patched === null ? null : { ...patched, language: tag },
		issues: issues.issues.map((found) => ({ ...found, path: `${base}${found.path}` })),
	};
}

function localizeWith(
	card: Record<string, unknown>,
	patch: unknown,
	issues: IssueCollector,
): Record<string, unknown> | null {
	if (!isRecord(patch)) {
		issues.push(error("patch-not-an-object", "A localization must be a PatchObject", ""));
		return null;
	}
	const { localizations: _, ...base } = card;
	const patches = Object.entries(patch);
	const allowed: Patch[] = [];
	for (const [key, value] of patches) {
		if (key === "localizations" || key.startsWith("localizations/")) {
			const message = `${excerpt(key)}: a localization must not patch the localizations`;
			issues.push(error("patch-targets-localizations", message, pathOf(key)));
		} else {
			allowed.push([key, value]);
		}
	}
	const patched = applyPatches(base, allowed, issues);
	return allowed.length === patches.length ? patched : null;
}

function applyPatches<T extends object>(
	target: T,
	patches: Patch[],
	issues: IssueCollector,
): T | null {
	const copy = cloneJson(target);
	const pointers: Pointer[] = [];
	const edits: Edit[] = [];
	for (const [key, value] of patches) {
		const tokens = parse(`/${key}`);
		const last = tokens?.at(-1);
		if (tokens === undefined || last === undefined) {
			const message = `${excerpt(key)} is not a JSON Pointer: "~" must be written "~0", "/" in a name "~1"`;
			issues.push(error("patch-pointer-invalid", message, pathOf(key)));
			continue;
		}
		pointers.push({ key, tokens });
		const edit = resolve(copy as Container, key, tokens.slice(0, -1), last, value, issues);
		if (edit !== undefined) edits.push(edit);
	}
	const conflict = reportPrefixConflicts(pointers, issues);
	if (conflict || edits.length < patches.length) return null;

	// No pointer is the prefix of another, so no edit moves what another one resolved.
	for (const { parent, token, value } of edits) {
		if (value === null) delete parent[token];
		else parent[token] = cloneJson(value);
	}
	return copy;
}

/** Finds where one patch applies in `root`, or reports why it is invalid. */
function resolve(
	root: Container,
	key: string,
	parents: string[],
	last: string,
	value: unknown,
	issues: IssueCollector,
): Edit | undefined {
	const fail = (code: PatchIssueCode, message: string): undefined => {
		issues.push(error(code, `${excerpt(key)}: ${message}`, pathOf(key)));
	};
	const append = 'an array is replaced whole, "-" cannot add a member to it';

	let parent = root;
	for (const token of parents) {
		if (Array.isArray(parent) && token === "-") return fail("patch-array-append", append);
		const next = member(parent, token);
		if (!isContainer(next)) {
			return fail("patch-parent-missing", `${excerpt(token)} is not an object or an array`);
		}
		parent = next;
	}
	if (Array.isArray(parent)) {
		if (last === "-") return fail("patch-array-append", append);
		if (arrayIndex(parent, last) === undefined) {
			return fail("patch-array-index-missing", `the array has no member ${excerpt(last)}`);
		}
		if (value === null) {
			return fail("patch-array-index-null", "null cannot remove a member of an array");
		}
	} else if (last === "__proto__") {
		return fail("patch-prototype-key", "a property cannot be named __proto__");
	}
	if (value === undefined) {
		return fail("patch-value-undefined", "undefined is no JSON value, null removes a property");
	}
	return { parent, token: last, value };
}

/**
 * Section 1.4.3, condition 3: reports each pointer another one is the prefix of. Sorted token
 * by token, whatever starts with a pointer follows it directly.
 */
function reportPrefixConflicts(pointers: Pointer[], issues: IssueCollector): boolean {
	let conflict = false;
	let prefix: Pointer | undefined;
	for (const pointer of pointers.toSorted((a, b) => compareTokens(a.tokens, b.tokens))) {
		if (prefix?.tokens.every((token, i) => pointer.tokens[i] === token)) {
			const message = `${excerpt(pointer.key)} patches inside ${excerpt(prefix.key)}, which is patched too`;
			issues.push(error("patch-prefix-conflict", message, pathOf(pointer.key)));
			conflict = true;
		} else {
			prefix = pointer;
		}
	}
	return conflict;
}

function compareTokens(a: readonly string[], b: readonly string[]): number {
	for (const [i, token] of a.entries()) {
		const other = b[i];
		if (other === undefined) return 1;
		if (token !== other) return token < other ? -1 : 1;
	}
	return a.length - b.length;
}
