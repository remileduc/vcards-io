import { expect, test } from "vitest";
import * as api from "../src/index.js";

const names = (table: string): string[] => table.trim().split(/\s+/);

// The runtime exports, pinned by hand in the tiers of the README's "Exports" tables.
const STABLE = names(`
	CARD_VERSIONS CARD_KINDS CONTEXTS ADDRESS_CONTEXTS PHONETIC_SYSTEMS RELATION_TYPES
	NAME_COMPONENT_KINDS GRAMMATICAL_GENDERS TITLE_KINDS PHONE_FEATURES CALENDAR_KINDS
	ADDRESS_COMPONENT_KINDS DIRECTORY_KINDS LINK_KINDS MEDIA_KINDS ANNIVERSARY_KINDS
	PERSONAL_INFO_KINDS PERSONAL_INFO_LEVELS isListed
	validateCard
	parseCards serializeCards normalizeCard FORMAT_STAMP FORMAT_VERSION DEFAULT_MAX_TEXT_LENGTH
	jsonPointer applyPatchObject localize
	jsonEqual cardDisplayName isId nextId newUid VERSION
	COMMON_ISSUE_CODES VALIDATION_ISSUE_CODES PATCH_ISSUE_CODES BACKUP_ISSUE_CODES
	VENDOR_PREFIX
`);
const FOR_SIBLINGS = names("NICKNAME_KIND NICKNAME_KINDS VENDOR_LABEL VENDOR_RELATIONS");

test("the package exports the pinned names, and nothing else", () => {
	expect(Object.keys(api).sort()).toEqual([...STABLE, ...FOR_SIBLINGS].sort());
	expect(Object.keys(api.jsonPointer).sort()).toEqual(names("escape get parse remove set"));
});
