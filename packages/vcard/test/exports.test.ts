import { expect, test } from "vitest";
import * as api from "../src/index.js";

const names = (table: string): string[] => table.trim().split(/\s+/);

// The runtime exports, pinned by hand in the tiers of the README's "Exports" tables.
const STABLE = names(`
	parseVCards upgradeTo40 serializeVCards VERSION
	COMMON_ISSUE_CODES PARSE_ISSUE_CODES UPGRADE_ISSUE_CODES SERIALIZE_ISSUE_CODES propertyId
	escapeText unescapeText splitEscaped foldLine caretEncode caretDecode
	encodeBase64 decodeBase64 decodeQuotedPrintable
	parseDateAndOrTime formatDateAndOrTime parseTimestamp formatTimestamp
	parseUtcOffset formatUtcOffset
	parseDataUri buildDataUri parseTelUri parseGeoUri guessImageType
`);
const FOR_SIBLINGS = names(`
	PROPERTY_REGISTRY COMMON_PARAMS defaultValueKind nearestValueKind isMediaProperty
	TEXT_FAMILY VALUE_TOKENS
	MEDIA_TYPE_NAMES mediaTypeFromName mediaTypeName declaredMediaType
	RELATION_MAPPINGS relationMappingForAndroid relationMappingForLabel
	URI_SCHEME
`);

test("the package exports the pinned names, and nothing else", () => {
	expect(Object.keys(api).sort()).toEqual([...STABLE, ...FOR_SIBLINGS].sort());
});
