// The runtime form of types.ts: a value validateCard accepts can be read as the Card the types
// describe. It is no RFC 9553 conformance check, see docs/plan.md, "Validator".

import { CARD_VERSIONS, isListed } from "./enums.js";
import { isId } from "./ids.js";
import type { ValidationIssueCode } from "./issue-codes.js";
import { type CardIssue, describeValue, excerpt, IssueCollector, issue } from "./issues.js";
import { type Container, escapeToken, isContainer, isRecord, member } from "./json.js";
import { MANDATORY, type ObjectType, PROPERTIES, type Shape } from "./schema.js";
import type { Card } from "./types.js";

export interface ValidationResult {
	/** The value given, typed, when no issue is an error; null otherwise. */
	card: Card | null;
	/** `path` is a JSON Pointer from the root of the Card. */
	issues: CardIssue[];
}

/** Levels of nesting a Card may have, itself included: the types need eight. */
export const MAX_CARD_DEPTH = 64;

/** Members a Card may have in all, at every level. */
export const MAX_CARD_NODES = 100_000;

/** UTF-16 code units a member name may have: every issue under it repeats the name in its path. */
export const MAX_KEY_LENGTH = 1024;

function error(code: ValidationIssueCode, message: string, path: string): CardIssue {
	return issue("error", code, message, path);
}

function wrongType(expected: string, value: unknown, path: string, issues: IssueCollector): void {
	const message = `Expected ${expected}, found ${describeValue(value)}`;
	issues.push(error("property-wrong-type", message, path));
}

/** Checks that a value has the JSON types `Card` declares. Never throws, changes nothing. */
export function validateCard(value: unknown): ValidationResult {
	const issues = new IssueCollector();
	if (!isRecord(value)) {
		const message = `A Card is a JSON object, found ${describeValue(value)}`;
		issues.push(error("card-not-an-object", message, ""));
	} else if (scan(value, issues)) {
		// From here on a JSON value: no hole in an array, nothing too deep to recurse into.
		checkObject(value, ["Card"], "", issues);
		const version = member(value, "version");
		if (typeof version === "string" && !isListed(CARD_VERSIONS, version)) {
			const message = `Version ${excerpt(version)} is not one of ${CARD_VERSIONS.join(", ")}`;
			issues.push(error("version-unsupported", message, "/version"));
		}
	}
	const refused = issues.issues.some((found) => found.severity === "error");
	return { card: refused ? null : (value as Card), issues: issues.issues };
}

/**
 * Walks the whole value, typed or not: whatever a Card holds is later copied, stored and
 * written as JSON. False when a cap stopped the walk or a member is no JSON value.
 */
function scan(card: Container, issues: IssueCollector): boolean {
	let nodes = 0;
	let isJson = true;
	const pending: [container: Container, depth: number, path: string][] = [[card, 1, ""]];
	for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
		const [container, depth, path] = next;
		if (depth > MAX_CARD_DEPTH) {
			const message = `Nested deeper than ${MAX_CARD_DEPTH} levels`;
			issues.push(error("card-too-deep", message, path));
			return false;
		}
		// By index in an array: the hole of a sparse one is a member too, and undefined.
		const keys = Array.isArray(container) ? container.keys() : Object.keys(container);
		for (const key of keys) {
			nodes += 1;
			if (nodes > MAX_CARD_NODES) {
				const message = `More than ${MAX_CARD_NODES} values in one Card`;
				issues.push(error("card-too-large", message, ""));
				return false;
			}
			if (typeof key === "string" && key.length > MAX_KEY_LENGTH) {
				const message = `The name ${excerpt(key)} is longer than ${MAX_KEY_LENGTH} characters`;
				issues.push(error("card-too-large", message, path));
				return false;
			}
			const item = container[key];
			const at = (): string => `${path}/${escapeToken(String(key))}`;
			if (key === "__proto__") {
				issues.push(error("prototype-key", "A property cannot be named __proto__", at()));
			}
			if (isContainer(item)) {
				pending.push([item, depth + 1, at()]);
			} else if (!isJsonScalar(item)) {
				const message = `A Card holds JSON values only, found ${describeValue(item)}`;
				issues.push(error("value-not-json", message, at()));
				isJson = false;
			}
		}
	}
	return isJson;
}

/** JSON.stringify writes NaN and the infinities as null, drops undefined, throws on a bigint. */
function isJsonScalar(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value);
	return value === null || typeof value === "string" || typeof value === "boolean";
}

/** The schema nests a few levels only, so this recursion is bounded whatever the input. */
function checkObject(
	value: unknown,
	types: readonly [ObjectType, ...ObjectType[]],
	path: string,
	issues: IssueCollector,
): void {
	if (!isRecord(value)) {
		wrongType("an object", value, path, issues);
		return;
	}
	const declared = member(value, "@type");
	const named = types.find((name) => name === declared);
	if (named === undefined && Object.hasOwn(value, "@type")) {
		const expected = types.map((name) => `"${name}"`).join(" or ");
		const message = `Expected @type ${expected}, found ${describeValue(declared)}`;
		issues.push(error("type-mismatch", message, `${path}/@type`));
	}
	// As section 1.3.4 reads an object without @type: the first type the property holds.
	const type = named ?? types[0];
	const shapes = PROPERTIES[type];
	for (const name of Object.keys(value)) {
		const shape = Object.hasOwn(shapes, name) ? shapes[name] : undefined;
		if (shape === undefined || name === "@type") continue;
		checkValue(value[name], shape, `${path}/${escapeToken(name)}`, issues);
	}
	for (const name of MANDATORY[type] ?? []) {
		if (Object.hasOwn(value, name)) continue;
		const message = `A ${type} must have the property "${name}"`;
		issues.push(error("property-missing", message, `${path}/${escapeToken(name)}`));
	}
}

function checkValue(value: unknown, shape: Shape, path: string, issues: IssueCollector): void {
	if (typeof shape === "string") {
		checkPlain(value, shape, path, issues);
	} else if ("object" in shape) {
		checkObject(value, shape.object, path, issues);
	} else if ("list" in shape) {
		for (const [item, at] of listEntries(value, path, issues)) {
			checkObject(item, [shape.list], at, issues);
		}
	} else {
		for (const [key, item, at] of mapEntries(value, path, issues)) {
			if (shape.keys !== "string") checkId(key, at, issues);
			checkObject(item, [shape.map], at, issues);
		}
	}
}

function checkPlain(
	value: unknown,
	shape: Extract<Shape, string>,
	path: string,
	issues: IssueCollector,
): void {
	switch (shape) {
		case "string":
			if (typeof value !== "string") wrongType("a string", value, path, issues);
			break;
		case "boolean":
			if (typeof value !== "boolean") wrongType("a boolean", value, path, issues);
			break;
		case "unsignedInt":
			if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
				wrongType("a non-negative integer", value, path, issues);
			}
			break;
		case "id":
			if (typeof value !== "string") wrongType("a string", value, path, issues);
			else checkId(value, path, issues);
			break;
		case "jCardProps":
			for (const [entry, at] of listEntries(value, path, issues)) {
				if (isJCardProp(entry)) continue;
				const message =
					"Expected a jCard property: a name, parameters, a type and at least one value";
				issues.push(error("jcard-prop-invalid", message, at));
			}
			break;
		case "set":
			for (const [, item, at] of mapEntries(value, path, issues)) {
				if (item === true) continue;
				const message = `A member of a set is true, found ${describeValue(item)}`;
				issues.push(error("set-value-not-true", message, at));
			}
			break;
		case "strings":
			for (const [, item, at] of mapEntries(value, path, issues)) {
				if (typeof item !== "string") wrongType("a string", item, at, issues);
			}
			break;
		case "params":
			for (const [, item, at] of mapEntries(value, path, issues)) {
				if (!isParamValue(item)) {
					wrongType("a string or an array of strings", item, at, issues);
				}
			}
			break;
		case "patches":
			for (const [, item, at] of mapEntries(value, path, issues)) {
				if (!isRecord(item)) wrongType("a PatchObject, a JSON object", item, at, issues);
			}
			break;
	}
}

type MapEntry = [key: string, item: unknown, path: string];

/** The members of a map with the path of each; none, and an issue, for what is no map. */
function mapEntries(value: unknown, path: string, issues: IssueCollector): MapEntry[] {
	if (!isRecord(value)) {
		wrongType("an object", value, path, issues);
		return [];
	}
	return Object.keys(value).map((key) => [key, value[key], `${path}/${escapeToken(key)}`]);
}

/** The same for a list. */
function listEntries(
	value: unknown,
	path: string,
	issues: IssueCollector,
): [item: unknown, path: string][] {
	if (!Array.isArray(value)) {
		wrongType("an array", value, path, issues);
		return [];
	}
	return value.map((item, index) => [item, `${path}/${index}`]);
}

function checkId(id: string, path: string, issues: IssueCollector): void {
	if (isId(id)) return;
	const message = `${excerpt(id)} is not an Id: 1 to 255 characters of A-Z, a-z, 0-9, "-" and "_"`;
	issues.push(error("id-invalid", message, path));
}

function isParamValue(value: unknown): boolean {
	const isString = (item: unknown): boolean => typeof item === "string";
	return isString(value) || (Array.isArray(value) && value.every(isString));
}

function isJCardProp(value: unknown): boolean {
	if (!Array.isArray(value) || value.length < 4) return false;
	const [name, params, type, ...values] = value;
	return (
		typeof name === "string" &&
		isRecord(params) &&
		Object.values(params).every(isParamValue) &&
		typeof type === "string" &&
		values.every(isJCardValue)
	);
}

const JCARD_SCALARS: readonly string[] = ["string", "number", "boolean"];

/** A structured value nests arrays; the scan has capped how deep before this recursion runs. */
function isJCardValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.every(isJCardValue);
	return JCARD_SCALARS.includes(typeof value);
}
