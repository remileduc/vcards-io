/**
 * @module stringutils
 * Utility functions to manipulate strings, mainly based on special actions required by the RFC6350,
 * like escaping or folding a string.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3
 */

interface EscapedStringIterator {
	escaped: boolean,
	value: string
}

/**
 * Iterator over a string that supports escaped characters according to the VCard format.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.4
 * @param str the string to iterate over
 * @yields next characters, telling if it was escaped or not
 */
function* escapedStringIterator(str: string): Generator<EscapedStringIterator>
{
	let escaped = false;
	for (let i = 0; i < str.length; i++)
	{
		escaped = false;
		if (str[i] === "\\" && (i + 1) < str.length && [",", ";", "\\", "n"].includes(str[i + 1]))
		{
			escaped = true;
			i++;
			if (str[i].toLowerCase() === "n") // special case \n
			{
				yield { escaped: true, value: "\n" };
				continue;
			}
		}
		yield { escaped: escaped, value: str[i] };
	}
	return "";
}

/**
 * A Map that supports case-insensitive keys.
 * All keys are stored in lower case, so it is not possible to retreive the exact original casing of a key.
 */
export class ICaseMap<U> extends Map<string, U>
{
	override set(key: string, value: U): this { return super.set(key.toLowerCase(), value); }

	override get(key: string): U|undefined { return super.get(key.toLowerCase()); }

	override has(key: string): boolean { return super.has(key.toLowerCase()); }

	override delete(key: string): boolean { return super.delete(key.toLowerCase()); }
}

/**
 * Escape a string, according to the VCard format.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.4
 * @param str the string to escape
 * @returns the string with special characters escaped
 * @see unescape
 */
export function escape(str: string): string
{
	return str.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/**
 * Unescape a string, according to the VCard format.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.4
 * @param str the string to unescape
 * @returns the string with special characters unescaped
 * @see escape
 */
export function unescape(str: string)
{
	let result = "";
	for (const c of escapedStringIterator(str))
		result += c.value;
	return result;
}

/**
 * Fold a string so its can be represented in maxLength columns, according to the VCard format.
 * By default, the line is folded at 75 characters, as recommended by the RFC6350
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.2
 * @param str the string to fold
 * @returns a multi-line folded string
 * @note during folding, the new line characters are not taken into account for the length of the line. Thus, each line may be maxLength + 2 characters length.
 * @see unfold
 */
export function fold(str: string, maxLength = 75): string // max length doesn't take into account the new line characters
{
	if (str.length <= maxLength)
		return str;

	const result = [str.slice(0, maxLength)];
	str = str.slice(maxLength);
	while (str.length > maxLength)
	{
		result.push(" " + str.slice(0, maxLength - 1));
		str = str.slice(maxLength - 1);
	}
	if (str.length !== 0)
		result.push(" " + str);
	return result.join("\r\n");
}

/**
 * Unfold a text, according to the VCard format.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.2
 * @param str the text to unfold
 * @returns a text with unfolded lines
 * @note some lines may be very long (especially for base64 encoded media)
 * @see fold
 */
export function unfold(str: string): string
{
	return str.split(/\r\n[ \t]/).join("");
}

/**
 * Tell if a string includes the given character.
 * This is similar to String.prototype.includes(). Escaped characters are not taken into account.
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.4
 * @param str the string with potentially escaped character
 * @param char the character to find
 * @returns true if the character exists in str and is not escaped
 */
export function includes(str: string, char: string): boolean
{
	for (const c of escapedStringIterator(str))
	{
		if (!c.escaped && c.value === char)
			return true;
	}
	return false;
}

/**
 * Split the string into an array of strings, based on the given character.
 * This is similar to String.prototype.split(). Escaped characters are not taken into account
 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-3.4
 * @param str the string with potentially escaped character
 * @param separator the character to use to split the string
 * @returns an array of strings without the separator
 */
export function split(str: string, separator: string)
{
	const result = [""];
	for (const c of escapedStringIterator(str))
	{
		if (!c.escaped && c.value === separator)
		{
			result.push("");
			continue;
		}
		result[result.length - 1] += c.value;
	}
	return result;
}
