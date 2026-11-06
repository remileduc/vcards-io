/** Escapes a text value the vCard 3.0/4.0 way: backslash, comma, semicolon, newline. */
export function escapeText(text: string): string {
	return text.replace(/\r\n?|[\\,;\n]/g, (c) =>
		c === "\\" || c === "," || c === ";" ? `\\${c}` : "\\n",
	);
}

/**
 * Unescapes a text value: `\\` `\,` `\;` and `\n`/`\N`. Any other `\x` becomes `x` (so
 * Google's `http\://` reads fine). A trailing lone backslash is kept.
 */
export function unescapeText(text: string): string {
	if (!text.includes("\\")) return text;
	let out = "";
	for (let i = 0; i < text.length; i++) {
		const c = text.charAt(i);
		if (c !== "\\") {
			out += c;
			continue;
		}
		if (i + 1 === text.length) {
			out += c;
			break;
		}
		const next = text.charAt(i + 1);
		out += next === "n" || next === "N" ? "\n" : next;
		i++;
	}
	return out;
}

/**
 * Splits on every separator not preceded by a backslash. Escapes are kept so each piece
 * can still be unescaped exactly once.
 */
export function splitEscaped(text: string, separator: string): string[] {
	const parts: string[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charAt(i);
		if (c === "\\") {
			i++;
		} else if (c === separator) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}
