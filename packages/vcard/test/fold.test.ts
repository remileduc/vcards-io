import { describe, expect, test } from "vitest";
import { foldLine } from "../src/index.js";

const octets = (s: string) => new TextEncoder().encode(s).length;
/** Undoes the folds `foldLine` writes: CRLF and one space. */
const unfold = (s: string) => s.replaceAll("\r\n ", "");

describe("foldLine", () => {
	test("leaves lines of 75 octets or less alone", () => {
		const line = `NOTE:${"x".repeat(70)}`;
		expect(foldLine(line)).toBe(line);
	});

	test("breaks before a space inside the window so no line ends with whitespace", () => {
		const line =
			"NOTE:This is a long description that exists on a long line and keeps going on and on";
		const folded = foldLine(line);
		const physical = folded.split("\r\n");
		expect(physical.length).toBeGreaterThan(1);
		for (const p of physical) {
			expect(octets(p)).toBeLessThanOrEqual(75);
			expect(p.endsWith(" ")).toBe(false);
		}
		expect(physical[1]?.startsWith("  ")).toBe(true);
		expect(unfold(folded)).toBe(line);
	});

	test("folds at octets without splitting a UTF-8 sequence", () => {
		const line = `NOTE:${"é".repeat(60)}`;
		const folded = foldLine(line);
		for (const p of folded.split("\r\n")) expect(octets(p)).toBeLessThanOrEqual(75);
		expect(folded).not.toContain("�");
		expect(unfold(folded)).toBe(line);
	});

	test("never splits a backslash escape", () => {
		// 74 characters, then "\;" straddling the 75-octet boundary
		const line = `${"a".repeat(74)}\\;b`;
		const folded = foldLine(line);
		expect(folded.split("\r\n")[0]).toBe("a".repeat(74));
		expect(unfold(folded)).toBe(line);
	});

	test("keeps an escaped backslash pair together but allows a break after it", () => {
		const line = `${"a".repeat(73)}\\\\b`;
		const folded = foldLine(line);
		expect(folded.split("\r\n")[0]).toBe(`${"a".repeat(73)}\\\\`);
	});

	test("folds base64 without spaces at exactly the limit", () => {
		const line = `PHOTO;ENCODING=b;TYPE=JPEG:${"A".repeat(300)}`;
		const physical = foldLine(line).split("\r\n");
		expect(octets(physical[0] ?? "")).toBe(75);
		expect(octets(physical[1] ?? "")).toBe(75);
		expect(physical.slice(1).every((p) => p.startsWith(" "))).toBe(true);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("keeps a U+FEFF that lands at a segment start", () => {
		const line = `NOTE:${"x".repeat(70)}\uFEFFabc`;
		expect(unfold(foldLine(line))).toBe(line);
		const leading = `\uFEFFNOTE:${"x".repeat(80)}`;
		expect(unfold(foldLine(leading))).toBe(leading);
	});

	test("breaks at a space that is only reachable in a later segment", () => {
		const line = `NOTE:${"x".repeat(69)} ${"y".repeat(80)}`;
		const physical = foldLine(line).split("\r\n");
		expect(physical[0]).toBe(`NOTE:${"x".repeat(69)}`);
		expect(physical[1]).toBe(`  ${"y".repeat(73)}`);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("backs up over a whitespace run so no line ends with a space or tab", () => {
		for (const line of [
			`NOTE:${"x".repeat(68)}  ${"y".repeat(20)}`,
			`NOTE:${"x".repeat(60)} \t ${"y".repeat(30)}`,
			`NOTE:${"x".repeat(69)} \t${"y".repeat(30)}`,
		]) {
			const physical = foldLine(line).split("\r\n");
			expect(physical.length).toBeGreaterThan(1);
			for (const p of physical) expect(/[ \t]$/.test(p)).toBe(false);
			expect(unfold(foldLine(line))).toBe(line);
		}
	});

	test("never separates a backslash from the space it escapes", () => {
		const line = `${"a".repeat(74)}\\ b`;
		const physical = foldLine(line).split("\r\n");
		expect(physical[0]).toBe("a".repeat(74));
		expect(physical[1]).toBe(" \\ b");
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("a continuation that is all whitespace still makes progress", () => {
		const line = `NOTE:${"x".repeat(70)}${" ".repeat(200)}end`;
		const physical = foldLine(line).split("\r\n");
		for (const p of physical) expect(octets(p)).toBeLessThanOrEqual(75);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("a tab at the boundary and an escaped space survive", () => {
		for (const line of [
			`${"a".repeat(74)}\tb`,
			`${"a".repeat(74)}\\ b`,
			`${"a".repeat(75)}\\ b`,
		]) {
			expect(unfold(foldLine(line))).toBe(line);
		}
	});

	test("folds a photo-sized line without spaces in linear time", () => {
		const line = `PHOTO:${"A".repeat(4 * 1024 * 1024)}`;
		const started = Date.now();
		const folded = foldLine(line);
		expect(Date.now() - started).toBeLessThan(2000);
		expect(folded.length).toBe(line.length + 3 * Math.ceil((line.length - 75) / 74));
	});

	test("honours foldAt and 'none', always with CRLF", () => {
		const line = "X".repeat(30);
		expect(foldLine(line, { foldAt: 10 })).toBe(
			`${"X".repeat(10)}\r\n ${"X".repeat(9)}\r\n ${"X".repeat(9)}\r\n XX`,
		);
		expect(foldLine(line, { foldAt: "none" })).toBe(line);
	});

	test("rejects a limit too small to make progress", () => {
		expect(() => foldLine("abc", { foldAt: 4 })).toThrow(RangeError);
		expect(() => foldLine("abc", { foldAt: 7.5 })).toThrow(RangeError);
	});
});
