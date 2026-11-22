import { cloneJson, isRecord } from "./json.js";
import { type ObjectType, PROPERTIES, type Shape } from "./schema.js";
import type { Card } from "./types.js";

/**
 * A copy of the Card as the JSON export writes it: properties in the order of RFC 9553, unknown
 * ones after by name, `media` last, empty maps left out. docs/plan.md, "Utilities".
 */
export function normalizeCard(card: Card): Card {
	// A localization patch may land in an empty map: a Card that has patches keeps them all.
	const localizations: unknown = card.localizations;
	const hasPatches = isRecord(localizations) && Object.keys(localizations).length > 0;
	return normalizeObject(card, "Card", !hasPatches);
}

function normalizeObject<T extends object>(source: T, type: ObjectType, strip: boolean): T {
	const shapes = PROPERTIES[type];
	const known = Object.keys(shapes).filter((name) => Object.hasOwn(source, name));
	const unknown = Object.keys(source).filter((name) => !Object.hasOwn(shapes, name));
	// As PHOTO in a .vcf: a picture is one very long line, the readable part comes first.
	const isLast = (name: string) => type === "Card" && name === "media";
	const names = [
		...known.filter((name) => !isLast(name)),
		...unknown.sort(),
		...known.filter(isLast),
	];

	const entries: [string, unknown][] = [];
	for (const name of names) {
		const shape = Object.hasOwn(shapes, name) ? shapes[name] : undefined;
		const value = normalizeValue((source as Record<string, unknown>)[name], shape, strip);
		const isEmptyMap = isMap(shape) && isRecord(value) && Object.keys(value).length === 0;
		if (!(strip && isEmptyMap)) entries.push([name, value]);
	}
	// Not assignments: an own `__proto__` key has to stay data.
	return Object.fromEntries(entries) as T;
}

function isMap(shape: Shape | undefined): boolean {
	return (
		shape === "values" || shape === "patches" || (typeof shape === "object" && "map" in shape)
	);
}

function normalizeValue(value: unknown, shape: Shape | undefined, strip: boolean): unknown {
	if (shape === undefined || typeof shape === "string") return cloneJson(value);
	const member = (item: unknown, type: ObjectType): unknown =>
		isRecord(item) ? normalizeObject(item, type, strip) : cloneJson(item);
	if ("object" in shape) {
		const type = shape.object.find((name) => isRecord(value) && value["@type"] === name);
		return member(value, type ?? shape.object[0]);
	}
	if ("list" in shape && Array.isArray(value)) {
		return value.map((item) => member(item, shape.list));
	}
	if ("map" in shape && isRecord(value)) {
		const entries = Object.entries(value);
		return Object.fromEntries(entries.map(([key, item]) => [key, member(item, shape.map)]));
	}
	return cloneJson(value);
}
