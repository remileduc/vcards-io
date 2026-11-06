export type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
	if (bytes.length < offset + prefix.length) return false;
	return prefix.every((b, i) => bytes[offset + i] === b);
}

/** Sniffs the media type from magic bytes; the only formats phone importers display. */
export function guessImageType(bytes: Uint8Array): ImageType | undefined {
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	// "GIF87a" / "GIF89a"
	if (
		startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
	}
	// "RIFF" .... "WEBP"
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	) {
		return "image/webp";
	}
	return undefined;
}
