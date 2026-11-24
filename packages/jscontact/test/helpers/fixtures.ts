import { readFileSync } from "node:fs";

const repoRoot = new URL("../../../../", import.meta.url);

/** `fixtures/jscontact/rfc9553-registry.json`: the IANA tables of RFC 9553 section 3. */
export interface Registry {
	versions: string[];
	types: string[];
	reservedTypes: string[];
	/** Reserved name, then the object types it is reserved in; `*` is every object. */
	reservedProperties: Record<string, string[]>;
	/** Object type, then property name, then the type signature as the RFC writes it. */
	properties: Record<string, Record<string, string>>;
	enumValues: { property: string; contexts: string[]; values: string[] }[];
}

/** One row of `docs/jscontact-constraints.md` with the Card that shows it. */
export interface ConstraintCase {
	section: string;
	rule: string;
	card: unknown;
}

export function readFixture<T>(name: string): T {
	return JSON.parse(readFileSync(new URL(`fixtures/jscontact/${name}`, repoRoot), "utf-8")) as T;
}

export function readDoc(name: string): string {
	return readFileSync(new URL(`docs/${name}`, repoRoot), "utf-8");
}
