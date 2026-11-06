import type { DateAndOrTime, Timestamp, UtcOffset } from "../types.js";

// Basic (RFC 6350) and extended (RFC 2426 / ISO 8601) forms are matched separately so a
// mixed `1985-0412` is rejected instead of silently normalised on export.
const DATE_FULL = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_FULL_EXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const DATE_YEAR = /^(\d{4})$/;
const DATE_MONTH_DAY = /^--(\d{2})(\d{2})$/;
// `--MM-DD` is Android's yearless form, not in the RFC grammar.
const DATE_MONTH_DAY_EXT = /^--(\d{2})-(\d{2})$/;
const DATE_MONTH = /^--(\d{2})$/;
const DATE_DAY = /^---(\d{2})$/;

const ZONE = "(Z|z|[+-]\\d{2}(?:\\d{2})?)?";
const ZONE_EXT = "(Z|z|[+-]\\d{2}(?::\\d{2})?)?";
// Fractional seconds (3.0, Apple) are accepted and dropped.
const TIME_FULL = new RegExp(`^(\\d{2})(?:(\\d{2})(?:(\\d{2})(?:[.,]\\d+)?)?)?${ZONE}$`);
const TIME_FULL_EXT = new RegExp(`^(\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,]\\d+)?)?)?${ZONE_EXT}$`);
// Truncated times only exist in the basic form.
const TIME_MINUTE = new RegExp(`^-(\\d{2})(\\d{2})?${ZONE}$`);
const TIME_SECOND = new RegExp(`^--(\\d{2})${ZONE}$`);

const TIMESTAMP = new RegExp(
	`^(\\d{4})(\\d{2})(\\d{2})[Tt](\\d{2})(\\d{2})(\\d{2})(?:[.,]\\d+)?${ZONE}$`,
);
const TIMESTAMP_EXT = new RegExp(
	`^(\\d{4})-(\\d{2})-(\\d{2})[Tt](\\d{2}):(\\d{2}):(\\d{2})(?:[.,]\\d+)?${ZONE_EXT}$`,
);
const UTC_OFFSET = /^([+-])(\d{2})(?::?(\d{2}))?$/;

function daysInMonth(month: number, year: number | undefined): number {
	if (month === 2) {
		if (year === undefined) return 29;
		return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
	}
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function inRange(n: number | undefined, min: number, max: number): boolean {
	return n === undefined || (Number.isInteger(n) && n >= min && n <= max);
}

function validDate(d: DateAndOrTime): boolean {
	if (!inRange(d.year, 0, 9999) || !inRange(d.month, 1, 12)) return false;
	return inRange(d.day, 1, daysInMonth(d.month ?? 1, d.year));
}

function validTime(t: DateAndOrTime): boolean {
	// 60 allows leap seconds.
	if (!inRange(t.hour, 0, 23) || !inRange(t.minute, 0, 59) || !inRange(t.second, 0, 60))
		return false;
	return t.zone === undefined || t.zone === "utc" || validUtcOffset(t.zone);
}

function validUtcOffset(o: UtcOffset): boolean {
	return (o.sign === 1 || o.sign === -1) && inRange(o.hours, 0, 23) && inRange(o.minutes, 0, 59);
}

function parseZone(s: string | undefined): UtcOffset | "utc" | null | undefined {
	if (s === undefined) return undefined;
	if (s === "Z" || s === "z") return "utc";
	return parseUtcOffset(s);
}

type Field = Exclude<keyof DateAndOrTime, "zone">;
/** A grammar form: the regex and the field each capture group fills; a group past the last field is the zone. */
type Form = readonly [RegExp, readonly Field[]];

const DATE_FORMS: readonly Form[] = [
	[DATE_FULL, ["year", "month", "day"]],
	[DATE_FULL_EXT, ["year", "month", "day"]],
	[DATE_YEAR_MONTH, ["year", "month"]],
	[DATE_YEAR, ["year"]],
	[DATE_MONTH_DAY, ["month", "day"]],
	[DATE_MONTH_DAY_EXT, ["month", "day"]],
	[DATE_MONTH, ["month"]],
	[DATE_DAY, ["day"]],
];

const TIME_FORMS: readonly Form[] = [
	[TIME_FULL, ["hour", "minute", "second"]],
	[TIME_FULL_EXT, ["hour", "minute", "second"]],
	[TIME_MINUTE, ["minute", "second"]],
	[TIME_SECOND, ["second"]],
];

function parsePart(s: string, forms: readonly Form[]): DateAndOrTime | null {
	for (const [regex, fields] of forms) {
		const m = regex.exec(s);
		if (!m) continue;
		const zone = parseZone(m[fields.length + 1]);
		if (zone === null) return null;
		const part: DateAndOrTime = {};
		fields.forEach((field, i) => {
			const group = m[i + 1];
			if (group !== undefined) part[field] = Number(group);
		});
		if (zone !== undefined) part.zone = zone;
		return part;
	}
	return null;
}

/**
 * Parses an RFC 6350 date-and-or-time in basic or extended form, plus the yearless
 * `--MM-DD` Android writes and 3.0-style `YYYY-MM-DD[THH:MM:SS]`. Both parts of a date-time
 * must use the same form. Returns null when the text does not match or a field is out of
 * range; callers keep the raw text and report.
 */
export function parseDateAndOrTime(text: string): DateAndOrTime | null {
	if (text.startsWith("T") || text.startsWith("t")) {
		const time = parsePart(text.slice(1), TIME_FORMS);
		return time && validTime(time) ? time : null;
	}
	const t = text.search(/[Tt]/);
	if (t === -1) {
		const date = parsePart(text, DATE_FORMS);
		if (date) return validDate(date) ? date : null;
		// A bare extended time (`10:22:00`) is unambiguous; a bare basic one is not.
		if (!text.includes(":")) return null;
		const time = parsePart(text, TIME_FORMS);
		return time && validTime(time) ? time : null;
	}
	const datePart = text.slice(0, t);
	const timePart = text.slice(t + 1);
	// `---DD` and a bare hour (with Z or ±HH) show no form; every other pair must agree.
	const dateNeutral = /^---\d{2}$/.test(datePart);
	const timeNeutral = /^\d{2}(?:[Zz]|[+-]\d{2})?$/.test(timePart);
	const dateExtended = datePart.replace(/^-+/, "").includes("-");
	const timeExtended = timePart.includes(":");
	if (!dateNeutral && !timeNeutral && dateExtended !== timeExtended) return null;
	const date = parsePart(datePart, DATE_FORMS);
	const time = parsePart(timePart, TIME_FORMS);
	// A date-time needs a complete day and a time starting with the hour.
	if (!date || !time || date.day === undefined || time.hour === undefined) return null;
	if (!validDate(date) || !validTime(time)) return null;
	return { ...date, ...time };
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function pad4(n: number): string {
	return String(n).padStart(4, "0");
}

export interface DateFormatOptions {
	/** Extended ISO form with separators (3.0 style). Default is the 4.0 basic form. */
	extended?: boolean;
}

/** "YMD" / "HMS" with "-" for each absent field, so a shape is one switch case. */
function shape(fields: readonly (number | undefined)[], letters: string): string {
	return fields.map((v, i) => (v === undefined ? "-" : letters.charAt(i))).join("");
}

/**
 * Formats a date-and-or-time. Throws a RangeError for a field out of range or a shape the
 * grammar cannot express (year with day but no month, a date-time without a day or hour,
 * a time without hour but with second and no minute, a zone on a date without time).
 */
export function formatDateAndOrTime(value: DateAndOrTime, options: DateFormatOptions = {}): string {
	const { extended = false } = options;
	const { year, month, day, hour, minute, second, zone } = value;
	if (!validDate(value) || !validTime(value)) {
		throw new RangeError(`Date-and-or-time field out of range: ${JSON.stringify(value)}`);
	}
	const Y = year === undefined ? "" : pad4(year);
	const M = month === undefined ? "" : pad2(month);
	const D = day === undefined ? "" : pad2(day);
	const h = hour === undefined ? "" : pad2(hour);
	const m = minute === undefined ? "" : pad2(minute);
	const s = second === undefined ? "" : pad2(second);
	const dateShape = shape([year, month, day], "YMD");
	const timeShape = shape([hour, minute, second], "HMS");
	const dsep = extended ? "-" : "";
	const tsep = extended ? ":" : "";

	let date: string;
	switch (dateShape) {
		case "YMD":
			date = `${Y}${dsep}${M}${dsep}${D}`;
			break;
		case "YM-":
			date = `${Y}-${M}`;
			break;
		case "Y--":
			date = Y;
			break;
		case "-MD":
			date = `--${M}${dsep}${D}`;
			break;
		case "-M-":
			date = `--${M}`;
			break;
		case "--D":
			date = `---${D}`;
			break;
		case "---":
			date = "";
			break;
		default:
			throw new RangeError(
				`Date shape ${dateShape} has no vCard form (a year and a day need a month)`,
			);
	}

	let time: string;
	switch (timeShape) {
		case "HMS":
			time = `${h}${tsep}${m}${tsep}${s}`;
			break;
		case "HM-":
			time = `${h}${tsep}${m}`;
			break;
		case "H--":
			time = h;
			break;
		case "-MS":
			time = `-${m}${s}`;
			break;
		case "-M-":
			time = `-${m}`;
			break;
		case "--S":
			time = `--${s}`;
			break;
		case "---":
			time = "";
			break;
		default:
			throw new RangeError(
				`Time shape ${timeShape} has no vCard form (a second needs a minute)`,
			);
	}

	if (time === "") {
		if (date === "") throw new RangeError("Empty date-and-or-time");
		if (zone !== undefined) throw new RangeError("A zone needs a time");
		return date;
	}
	if (zone !== undefined) time += zone === "utc" ? "Z" : formatUtcOffset(zone, { extended });
	if (date === "") return `T${time}`;
	// A date-time is a complete day followed by a time that starts with the hour.
	if (day === undefined || hour === undefined) {
		throw new RangeError(`Date-time ${dateShape}T${timeShape} needs a day and an hour`);
	}
	return `${date}T${time}`;
}

/** Parses `YYYYMMDDTHHMMSS[Z|±HHMM]` or the extended ISO equivalent. Date-only input is rejected. */
export function parseTimestamp(text: string): Timestamp | null {
	const m = TIMESTAMP.exec(text) ?? TIMESTAMP_EXT.exec(text);
	if (!m) return null;
	const zone = parseZone(m[7]);
	if (zone === null) return null;
	const ts: Timestamp = {
		year: Number(m[1]),
		month: Number(m[2]),
		day: Number(m[3]),
		hour: Number(m[4]),
		minute: Number(m[5]),
		second: Number(m[6]),
	};
	if (zone !== undefined) ts.zone = zone;
	return validDate(ts) && validTime(ts) ? ts : null;
}

/** Formats a complete date-time. Throws a RangeError when a field is missing or out of range. */
export function formatTimestamp(value: Timestamp, options: DateFormatOptions = {}): string {
	for (const field of ["year", "month", "day", "hour", "minute", "second"] as const) {
		if (value[field] === undefined) throw new RangeError(`Timestamp without ${field}`);
	}
	return formatDateAndOrTime(value, options);
}

/** Parses `±HH`, `±HHMM` or `±HH:MM`. */
export function parseUtcOffset(text: string): UtcOffset | null {
	const m = UTC_OFFSET.exec(text);
	if (!m) return null;
	const hours = Number(m[2]);
	const minutes = m[3] === undefined ? 0 : Number(m[3]);
	if (hours > 23 || minutes > 59) return null;
	return { sign: m[1] === "-" ? -1 : 1, hours, minutes };
}

/** Formats `±HHMM` (or `±HH:MM` extended). Throws a RangeError for an invalid offset. */
export function formatUtcOffset(value: UtcOffset, options: DateFormatOptions = {}): string {
	if (!validUtcOffset(value)) {
		throw new RangeError(`UTC offset out of range: ${JSON.stringify(value)}`);
	}
	const sign = value.sign < 0 ? "-" : "+";
	const sep = options.extended ? ":" : "";
	return `${sign}${pad2(value.hours)}${sep}${pad2(value.minutes)}`;
}
