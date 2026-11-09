/** 2.1 / 3.0 TYPE media names on inline PHOTO/LOGO/SOUND/KEY and the media type each stands for. */
export const MEDIA_TYPE_NAMES: ReadonlyMap<string, string> = new Map([
	["jpeg", "image/jpeg"],
	["jpg", "image/jpeg"],
	["png", "image/png"],
	["gif", "image/gif"],
	["webp", "image/webp"],
	["bmp", "image/bmp"],
	["tiff", "image/tiff"],
	["wave", "audio/wav"],
	["wav", "audio/wav"],
	["mp3", "audio/mpeg"],
	["pgp", "application/pgp-keys"],
]);

/** RFC 2045 type/subtype, no parameters: what a MEDIATYPE value or a data: URI header may hold. */
export const MEDIA_TYPE = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/;

const MEDIA_TYPE_PARAM = /^[\w!#$&^.+-]+=(?:[\w!#$&^.+-]+|"[^"\\]*")$/;

/** A MEDIATYPE value (RFC 6350 5.7): type/subtype lowercased, `;attr=value` parameters kept. */
export function declaredMediaType(value: string): string | undefined {
	const [type = "", ...params] = value.split(";");
	const lower = type.trim().toLowerCase();
	if (!MEDIA_TYPE.test(lower)) return undefined;
	const kept = params.map((p) => p.trim());
	if (!kept.every((p) => MEDIA_TYPE_PARAM.test(p))) return undefined;
	return [lower, ...kept].join(";");
}

/** The media type a TYPE or MEDIATYPE value names: a full `image/png` or a legacy word such as `JPEG`. */
export function mediaTypeFromName(type: string): string | undefined {
	const lower = type.trim().toLowerCase();
	if (MEDIA_TYPE.test(lower)) return lower;
	return MEDIA_TYPE_NAMES.get(lower);
}
