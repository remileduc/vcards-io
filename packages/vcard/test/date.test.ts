import { describe, expect, test } from "vitest";
import {
	type DateAndOrTime,
	formatDateAndOrTime,
	formatTimestamp,
	formatUtcOffset,
	parseDateAndOrTime,
	parseTimestamp,
	parseUtcOffset,
	type Timestamp,
	type UtcOffset,
} from "../src/index.js";

describe("parseDateAndOrTime", () => {
	test.each<[string, DateAndOrTime]>([
		// RFC 6350 4.3.1 date
		["19850412", { year: 1985, month: 4, day: 12 }],
		["1985-04", { year: 1985, month: 4 }],
		["1985", { year: 1985 }],
		["--0412", { month: 4, day: 12 }],
		["---12", { day: 12 }],
		["--04", { month: 4 }],
		// 4.3.2 time
		["T102200", { hour: 10, minute: 22, second: 0 }],
		["T1022", { hour: 10, minute: 22 }],
		["T10", { hour: 10 }],
		["T-2200", { minute: 22, second: 0 }],
		["T--00", { second: 0 }],
		["T102200Z", { hour: 10, minute: 22, second: 0, zone: "utc" }],
		[
			"T102200-0800",
			{ hour: 10, minute: 22, second: 0, zone: { sign: -1, hours: 8, minutes: 0 } },
		],
		["T1022+05", { hour: 10, minute: 22, zone: { sign: 1, hours: 5, minutes: 0 } }],
		// 4.3.3 date-time
		["19961022T140000", { year: 1996, month: 10, day: 22, hour: 14, minute: 0, second: 0 }],
		["--1022T1400", { month: 10, day: 22, hour: 14, minute: 0 }],
		["---22T14", { day: 22, hour: 14 }],
		// extended ISO (3.0, Apple) and fractional seconds dropped
		["1996-04-15", { year: 1996, month: 4, day: 15 }],
		[
			"1985-04-12T23:20:50.52Z",
			{ year: 1985, month: 4, day: 12, hour: 23, minute: 20, second: 50, zone: "utc" },
		],
		[
			"2013-03-12T10:00:00-05:00",
			{
				year: 2013,
				month: 3,
				day: 12,
				hour: 10,
				minute: 0,
				second: 0,
				zone: { sign: -1, hours: 5, minutes: 0 },
			},
		],
		["10:22:00", { hour: 10, minute: 22, second: 0 }],
		["T10:22", { hour: 10, minute: 22 }],
		// a bare hour or a bare day shows no form, so it pairs with either
		["1985-04-12T10", { year: 1985, month: 4, day: 12, hour: 10 }],
		["1985-04-12T10Z", { year: 1985, month: 4, day: 12, hour: 10, zone: "utc" }],
		["---22T14:00", { day: 22, hour: 14, minute: 0 }],
		["09850412", { year: 985, month: 4, day: 12 }],
		// Android yearless
		["--04-12", { month: 4, day: 12 }],
		// Apple placeholder year is kept as is; the normaliser handles it
		["1604-04-15", { year: 1604, month: 4, day: 15 }],
		// leap day without a year and leap second
		["--0229", { month: 2, day: 29 }],
		["20160229", { year: 2016, month: 2, day: 29 }],
		["T235960", { hour: 23, minute: 59, second: 60 }],
	])("parses %s", (text, expected) => {
		expect(parseDateAndOrTime(text)).toEqual(expected);
	});

	test.each([
		"",
		"abc",
		"198504",
		"19851340",
		"19850432",
		"20230230",
		"19000229",
		"--13",
		"---32",
		"1985-04-12T",
		"1985-04T10",
		"19850412T-2200",
		"T24",
		"T1060",
		"T102261",
		"T1022+0560",
		"T1022+5",
		"102200",
		"1985-4-12",
		"19850412 102200",
		"--04-12T10:00:00+01:00X",
		// mixed basic and extended forms
		"1985-0412",
		"198504-12",
		"--04-12T1000",
		"--0412T10:00",
		"19850412T10:22",
		"1985-04-12T102200",
		"1985-04-12T10+0530",
		"10:22:00+0530",
		"T102200+05:30",
		"-22:00",
		"T-22:00",
	])("rejects %j", (text) => {
		expect(parseDateAndOrTime(text)).toBeNull();
	});
});

describe("formatDateAndOrTime", () => {
	test.each([
		"19850412",
		"1985-04",
		"1985",
		"--0412",
		"--04",
		"---12",
		"T102200",
		"T1022",
		"T10",
		"T-2200",
		"T-22",
		"T--00",
		"T102200Z",
		"T102200-0800",
		"19961022T140000",
		"--1022T1400",
		"---22T14",
		"19961022T140000+0530",
		"09850412",
		"0985-04",
		"0985",
	])("round trips the basic form %s", (text) => {
		const parsed = parseDateAndOrTime(text);
		expect(parsed).not.toBeNull();
		expect(formatDateAndOrTime(parsed ?? {})).toBe(text);
	});

	test("extended form uses separators", () => {
		expect(formatDateAndOrTime({ year: 1985, month: 4, day: 12 }, { extended: true })).toBe(
			"1985-04-12",
		);
		expect(formatDateAndOrTime({ month: 4, day: 12 }, { extended: true })).toBe("--04-12");
		expect(
			formatDateAndOrTime(
				{
					year: 1985,
					month: 4,
					day: 12,
					hour: 10,
					minute: 22,
					second: 0,
					zone: { sign: 1, hours: 1, minutes: 0 },
				},
				{ extended: true },
			),
		).toBe("1985-04-12T10:22:00+01:00");
	});

	test("rejects shapes the grammar cannot express", () => {
		expect(() => formatDateAndOrTime({})).toThrow(RangeError);
		expect(() => formatDateAndOrTime({ year: 1985, day: 12 })).toThrow(RangeError);
		expect(() => formatDateAndOrTime({ year: 1985, month: 4, hour: 10 })).toThrow(RangeError);
		expect(() => formatDateAndOrTime({ year: 1985, month: 4, day: 12, minute: 10 })).toThrow(
			RangeError,
		);
		expect(() => formatDateAndOrTime({ hour: 10, second: 5 })).toThrow(RangeError);
		expect(() => formatDateAndOrTime({ year: 1985, month: 4, day: 12, zone: "utc" })).toThrow(
			RangeError,
		);
	});

	test("rejects fields out of range instead of emitting unparseable text", () => {
		const bad: DateAndOrTime[] = [
			{ year: 12345, month: 1, day: 1 },
			{ year: -5, month: 1, day: 1 },
			{ year: 1985, month: 13 },
			{ year: 2023, month: 2, day: 30 },
			{ month: 0, day: 1 },
			{ day: 32 },
			{ hour: 99 },
			{ hour: 10, minute: 60 },
			{ hour: 10, minute: 5, second: 61 },
			{ hour: 10.5 },
			{ year: 1985.5 },
			{ hour: 10, zone: { sign: 1, hours: 123, minutes: 0 } },
			{ hour: 10, zone: { sign: 1, hours: 1, minutes: 60 } },
			{ hour: 10, zone: { sign: 0 as 1, hours: 1, minutes: 0 } },
		];
		for (const value of bad) expect(() => formatDateAndOrTime(value)).toThrow(RangeError);
	});

	test("every accepted value formats to text that parses back equal", () => {
		for (const value of [
			{ year: 0, month: 1, day: 1 },
			{ year: 9999 },
			{ hour: 23, minute: 59, second: 60 },
			{ hour: 0, zone: { sign: -1 as const, hours: 23, minutes: 59 } },
		]) {
			expect(parseDateAndOrTime(formatDateAndOrTime(value))).toEqual(value);
		}
	});
});

describe("timestamps", () => {
	test("parses basic and extended forms", () => {
		expect(parseTimestamp("19951031T222710Z")).toEqual({
			year: 1995,
			month: 10,
			day: 31,
			hour: 22,
			minute: 27,
			second: 10,
			zone: "utc",
		});
		expect(parseTimestamp("1995-10-31T22:27:10.123+01:00")).toEqual({
			year: 1995,
			month: 10,
			day: 31,
			hour: 22,
			minute: 27,
			second: 10,
			zone: { sign: 1, hours: 1, minutes: 0 },
		});
		expect(parseTimestamp("19951031t222710")).toEqual({
			year: 1995,
			month: 10,
			day: 31,
			hour: 22,
			minute: 27,
			second: 10,
		});
	});

	test("rejects partial dates, bad fields and bad zones", () => {
		expect(parseTimestamp("1995-10-31")).toBeNull();
		expect(parseTimestamp("19951031T2227")).toBeNull();
		expect(parseTimestamp("19951331T222710Z")).toBeNull();
		expect(parseTimestamp("19951031T222710+2500")).toBeNull();
	});

	test("formats back to the basic form", () => {
		expect(
			formatTimestamp({
				year: 1995,
				month: 10,
				day: 31,
				hour: 22,
				minute: 27,
				second: 10,
				zone: "utc",
			}),
		).toBe("19951031T222710Z");
		expect(
			formatTimestamp(
				{ year: 1995, month: 10, day: 31, hour: 22, minute: 27, second: 10 },
				{ extended: true },
			),
		).toBe("1995-10-31T22:27:10");
		expect(
			formatTimestamp({ year: 985, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
		).toBe("09850101T000000");
	});

	test("rejects a missing field or one out of range", () => {
		const base = { year: 1995, month: 10, day: 31, hour: 22, minute: 27, second: 10 };
		expect(() =>
			formatTimestamp({ ...base, second: undefined } as unknown as Timestamp),
		).toThrow(RangeError);
		expect(() => formatTimestamp({ ...base, month: 13 })).toThrow(RangeError);
		expect(() =>
			formatTimestamp({ ...base, zone: { sign: 1, hours: 24, minutes: 0 } }),
		).toThrow(RangeError);
	});
});

describe("utc offsets", () => {
	test("parses the three accepted shapes", () => {
		expect(parseUtcOffset("-0500")).toEqual({ sign: -1, hours: 5, minutes: 0 });
		expect(parseUtcOffset("+05:30")).toEqual({ sign: 1, hours: 5, minutes: 30 });
		expect(parseUtcOffset("+05")).toEqual({ sign: 1, hours: 5, minutes: 0 });
	});

	test("rejects everything else", () => {
		for (const bad of ["0500", "+5", "+0560", "+2400", "Z", "", "+05:3", "+05:"]) {
			expect(parseUtcOffset(bad)).toBeNull();
		}
	});

	test("formats basic and extended", () => {
		expect(formatUtcOffset({ sign: -1, hours: 5, minutes: 0 })).toBe("-0500");
		expect(formatUtcOffset({ sign: 1, hours: 5, minutes: 30 }, { extended: true })).toBe(
			"+05:30",
		);
	});

	test("refuses to format an offset it would not parse", () => {
		for (const bad of [
			{ sign: 1, hours: 123, minutes: 0 },
			{ sign: 1, hours: 1, minutes: 60 },
			{ sign: 1, hours: 1.5, minutes: 0 },
			{ sign: -1, hours: -1, minutes: 0 },
		] as UtcOffset[]) {
			expect(() => formatUtcOffset(bad)).toThrow(RangeError);
		}
	});
});
