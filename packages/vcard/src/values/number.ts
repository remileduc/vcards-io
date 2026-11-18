/** A FLOAT value, also the shape of each GEO coordinate the upgrade turns into a geo: URI. */
export const FLOAT = /^[+-]?\d+(?:\.\d+)?$/;

/** Parses a FLOAT. Returns null when malformed or beyond what a double holds. */
export function parseFloatValue(text: string): number | null {
	if (!FLOAT.test(text)) return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

/** Formats a FLOAT in plain digits, which `parseFloatValue` reads back. Throws RangeError unless finite. */
export function formatFloatValue(value: number): string {
	if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
	const text = String(value);
	const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!m) return text;
	const [, sign = "", unit = "", fraction = "", exponent = ""] = m;
	const digits = unit + fraction;
	const point = 1 + Number(exponent);
	// String() only uses an exponent below 1e-6 and from 1e21: the point never falls inside the digits.
	return point <= 0
		? `${sign}0.${"0".repeat(-point)}${digits}`
		: sign + digits.padEnd(point, "0");
}
