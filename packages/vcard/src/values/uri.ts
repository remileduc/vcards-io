import { decodeBase64, encodeBase64 } from "../text/base64.js";

export interface DataUri {
	/** Lowercased media type, absent when the URI omits it. */
	mediaType?: string;
	/** Header parameters such as charset, lowercased keys. */
	parameters: Map<string, string>;
	base64: boolean;
	data: Uint8Array;
}

const DATA_URI = /^data:([^,]*),([\s\S]*)$/i;
const MEDIA_TYPE = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/;

function percentDecode(text: string): Uint8Array | null {
	const encoded = new TextEncoder().encode(text);
	const out = new Uint8Array(encoded.length);
	let n = 0;
	for (let i = 0; i < encoded.length; i++) {
		const b = encoded[i] ?? 0;
		if (b !== 0x25) {
			out[n++] = b;
			continue;
		}
		const hex = String.fromCharCode(encoded[i + 1] ?? 0, encoded[i + 2] ?? 0);
		if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
		out[n++] = Number.parseInt(hex, 16);
		i += 2;
	}
	return out.slice(0, n);
}

/** Parses an RFC 2397 data URI. Returns null on a malformed header, media type or payload. */
export function parseDataUri(uri: string): DataUri | null {
	const m = DATA_URI.exec(uri);
	if (!m) return null;
	const header = (m[1] ?? "").split(";");
	const mediaType = (header[0] ?? "").trim().toLowerCase();
	if (mediaType !== "" && !MEDIA_TYPE.test(mediaType)) return null;
	const parameters = new Map<string, string>();
	let base64 = false;
	for (let i = 1; i < header.length; i++) {
		const part = (header[i] ?? "").trim();
		if (i === header.length - 1 && part.toLowerCase() === "base64") {
			base64 = true;
			break;
		}
		const eq = part.indexOf("=");
		if (eq <= 0) return null;
		parameters.set(part.slice(0, eq).toLowerCase(), part.slice(eq + 1));
	}
	let data: Uint8Array;
	if (base64) {
		try {
			data = decodeBase64(m[2] ?? "");
		} catch {
			return null;
		}
	} else {
		const decoded = percentDecode(m[2] ?? "");
		if (!decoded) return null;
		data = decoded;
	}
	const result: DataUri = { parameters, base64, data };
	if (mediaType !== "") result.mediaType = mediaType;
	return result;
}

/** Builds a base64 data URI; the media type is left empty when unknown (valid per RFC 2397). */
export function buildDataUri(data: Uint8Array, mediaType?: string): string {
	return `data:${mediaType ?? ""};base64,${encodeBase64(data)}`;
}

export interface TelUri {
	/** The number as written, visual separators included. */
	number: string;
	extension?: string;
	/** Remaining parameters (phone-context, ...), lowercased keys, `ext` removed. */
	parameters: Map<string, string>;
}

const TEL_URI = /^tel:([^;]*)((?:;[^;]*)*)$/i;

/** Parses an RFC 3966 tel URI. Returns null when the scheme or number is missing. */
export function parseTelUri(uri: string): TelUri | null {
	const m = TEL_URI.exec(uri);
	if (!m) return null;
	const number = m[1] ?? "";
	if (number === "") return null;
	const parameters = parseUriParameters(m[2] ?? "");
	const result: TelUri = { number, parameters };
	const ext = parameters.get("ext");
	if (ext !== undefined) {
		result.extension = ext;
		parameters.delete("ext");
	}
	return result;
}

export interface GeoUri {
	latitude: number;
	longitude: number;
	altitude?: number;
	/** `crs`, `u` and anything else, lowercased keys. */
	parameters: Map<string, string>;
}

const GEO_URI = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?((?:;[^;]*)*)$/i;

/** Parses an RFC 5870 geo URI. Returns null on bad syntax or out-of-range coordinates. */
export function parseGeoUri(uri: string): GeoUri | null {
	const m = GEO_URI.exec(uri);
	if (!m) return null;
	const latitude = Number(m[1]);
	const longitude = Number(m[2]);
	if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
	const result: GeoUri = { latitude, longitude, parameters: parseUriParameters(m[4] ?? "") };
	if (m[3] !== undefined) result.altitude = Number(m[3]);
	return result;
}

function parseUriParameters(text: string): Map<string, string> {
	const parameters = new Map<string, string>();
	for (const part of text.split(";")) {
		if (part === "") continue;
		const eq = part.indexOf("=");
		if (eq === -1) parameters.set(part.toLowerCase(), "");
		else parameters.set(part.slice(0, eq).toLowerCase(), part.slice(eq + 1));
	}
	return parameters;
}
