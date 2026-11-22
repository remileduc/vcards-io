// Ids and uids. An Id is never random: the same input gives the same Card, see
// docs/decisions.md, "Ids are deterministic".

import type { Id } from "./types.js";

const ID = /^[A-Za-z0-9_-]{1,255}$/;

/** Whether a string is an Id: 1 to 255 characters of `A-Za-z0-9`, `-` and `_` (section 1.4.1). */
export function isId(value: string): boolean {
	return ID.test(value);
}

// Short enough that the number never takes the Id past its 255 characters.
const ID_PREFIX = /^[A-Za-z0-9_-]{0,200}$/;

/** The smallest unused `<prefix><n>` of a map, counting from 1: `p1`, `p2`, as RFC 9553 writes. */
export function nextId(map: Readonly<Record<string, unknown>> | undefined, prefix: string): Id {
	if (!ID_PREFIX.test(prefix)) {
		throw new RangeError(`nextId: ${JSON.stringify(prefix)} cannot start an Id`);
	}
	let n = 1;
	while (map !== undefined && Object.hasOwn(map, `${prefix}${n}`)) n++;
	return `${prefix}${n}`;
}

/** A new `urn:uuid:` uid. Only the app calls it: a library never invents a uid (RFC 9982). */
export function newUid(): string {
	return `urn:uuid:${crypto.randomUUID()}`;
}
