import { describe, expect, test } from "vitest";
import { groupCards } from "../src/parse/cards.js";
import { IssueCollector } from "../src/parse/issues.js";
import { readLogicalLines } from "../src/parse/lines.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("IssueCollector", () => {
	test("keeps the first N issues per code and one truncation marker", () => {
		const sink = new IssueCollector(2);
		for (let i = 0; i < 5; i++) {
			sink.push({ severity: "warning", code: "a", message: `a${i}` });
			sink.push({ severity: "info", code: "b", message: `b${i}` });
		}
		expect(sink.issues.map((i) => `${i.code}:${i.message.slice(0, 2)}`)).toEqual([
			"a:a0",
			"b:b0",
			"a:a1",
			"b:b1",
			"issues-truncated:Mo",
			"issues-truncated:Mo",
		]);
		expect(sink.issues[4]?.message).toContain('"a"');
	});

	test("bounds memory on a file that warns on every line", () => {
		const sink = new IssueCollector();
		const input = utf8(`BEGIN:VCARD\n${"x\n".repeat(300000)}`);
		groupCards(readLogicalLines(input, sink), sink);
		const codes = new Map<string, number>();
		for (const i of sink.issues) codes.set(i.code, (codes.get(i.code) ?? 0) + 1);
		expect(Object.fromEntries(codes)).toEqual({
			"invalid-line": 1000,
			"issues-truncated": 1,
			"missing-end": 1,
			"version-missing": 1,
		});
	});

	test("rejects a nonsensical cap", () => {
		expect(() => new IssueCollector(0)).toThrow(RangeError);
	});
});
