/**
 * @vcards-io/vcard: tolerant vCard 2.1 / 3.0 / 4.0 reader, 4.0 normaliser
 * and 3.0 / 4.0 writer. See docs/plan.md, "Package 1".
 */
export const VERSION = "0.1.0";

export { parseVCards } from "./parse/parser.js";
export {
	type Cardinality,
	COMMON_PARAMS,
	defaultValueKind,
	PROPERTY_REGISTRY,
	type PropertySpec,
} from "./registry.js";
export { decodeBase64, encodeBase64 } from "./text/base64.js";
export { caretDecode, caretEncode } from "./text/caret.js";
export { escapeText, splitEscaped, unescapeText } from "./text/escape.js";
export { type FoldOptions, foldLine, unfoldLines } from "./text/fold.js";
export {
	decodeQuotedPrintable,
	encodeQuotedPrintable,
	type QuotedPrintableOptions,
} from "./text/quoted-printable.js";
export type * from "./types.js";
export {
	type DateFormatOptions,
	formatDateAndOrTime,
	formatTimestamp,
	formatUtcOffset,
	parseDateAndOrTime,
	parseTimestamp,
	parseUtcOffset,
} from "./values/date.js";
export { guessImageType, type ImageType } from "./values/image.js";
export {
	buildDataUri,
	type DataUri,
	type GeoUri,
	parseDataUri,
	parseGeoUri,
	parseTelUri,
	type TelUri,
} from "./values/uri.js";
