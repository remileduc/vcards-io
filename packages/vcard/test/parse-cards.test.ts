import { describe, expect, test } from "vitest";
import type { Issue } from "../src/index.js";
import { groupCards } from "../src/parse/cards.js";
import { readLogicalLines } from "../src/parse/lines.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function cards(input: string, issues: Issue[] = []) {
	return groupCards(readLogicalLines(utf8(input), issues), issues).map((c) => ({
		version: c.version,
		versionSource: c.versionSource,
		line: c.line,
		endLine: c.endLine,
		names: c.lines.map((l) => l.name),
	}));
}
const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe("groupCards", () => {
	test("groups BEGIN..END case-insensitively, VERSION is read and not kept as a line", () => {
		const issues: Issue[] = [];
		expect(
			cards(
				"begin:vcard\nVERSION:4.0\nFN:A\nEnd:VCard\n\nBEGIN:VCARD\nFN:B\nVERSION:2.1\nEND:VCARD",
				issues,
			),
		).toEqual([
			{ version: "4.0", versionSource: "explicit", line: 1, endLine: 4, names: ["FN"] },
			{ version: "2.1", versionSource: "explicit", line: 6, endLine: 9, names: ["FN"] },
		]);
		expect(issues).toEqual([]);
	});

	test("skips # comment lines like AOSP, with an info", () => {
		const issues: Issue[] = [];
		const result = cards(
			"BEGIN:VCARD\nVERSION:2.1\n# exported by foo\n# note: bar\nFN:x\nEND:VCARD",
			issues,
		);
		expect(result[0]?.names).toEqual(["FN"]);
		expect(issues.map((i) => [i.severity, i.code])).toEqual([
			["info", "comment-skipped"],
			["info", "comment-skipped"],
		]);
	});

	test("tolerates whitespace in the VERSION value, unlike AOSP", () => {
		expect(cards("BEGIN:VCARD\nVERSION: 3.0 \nEND:VCARD")[0]?.version).toBe("3.0");
	});

	test("closes a card without END at end of input with a warning", () => {
		const issues: Issue[] = [];
		const result = cards("BEGIN:VCARD\nVERSION:3.0\nFN:A\n", issues);
		expect(result.map((c) => c.endLine)).toEqual([Number.POSITIVE_INFINITY]);
		expect(issues).toEqual([expect.objectContaining({ code: "missing-end", line: 3 })]);
	});

	test("reports lines outside cards and stray END lines, and skips unparsable lines", () => {
		const issues: Issue[] = [];
		const result = cards(
			"FN:lost\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\ngarbage\nFN:A\nEND:VCARD",
			issues,
		);
		expect(result[0]?.names).toEqual(["FN"]);
		expect(codes(issues)).toEqual(["line-outside-card", "unexpected-end", "invalid-line"]);
	});

	describe("version detection", () => {
		test("guesses 2.1 from bare parameters or quoted-printable", () => {
			const issues: Issue[] = [];
			expect(cards("BEGIN:VCARD\nTEL;CELL:1\nEND:VCARD", issues)[0]).toMatchObject({
				version: "2.1",
				versionSource: "guessed",
			});
			expect(cards("BEGIN:VCARD\nN;ENCODING=QUOTED-PRINTABLE:a\nEND:VCARD")[0]?.version).toBe(
				"2.1",
			);
			expect(issues).toEqual([expect.objectContaining({ code: "version-missing", line: 1 })]);
		});

		test("guesses 3.0 otherwise", () => {
			expect(cards("BEGIN:VCARD\nTEL;TYPE=cell:1\nEND:VCARD")[0]).toMatchObject({
				version: "3.0",
				versionSource: "guessed",
			});
		});

		test("reports the group and parameters lost with the VERSION line", () => {
			for (const version of [
				"item1.VERSION:3.0",
				"VERSION;X-FOO=bar:3.0",
				"VERSION;FOO:3.0",
			]) {
				const issues: Issue[] = [];
				const [card] = cards(`BEGIN:VCARD\n${version}\nFN:A\nEND:VCARD`, issues);
				expect(card).toMatchObject({
					version: "3.0",
					versionSource: "explicit",
					names: ["FN"],
				});
				expect(issues).toEqual([
					expect.objectContaining({
						severity: "info",
						code: "version-extras-dropped",
						line: 2,
					}),
				]);
			}
		});

		test("ignores an unknown VERSION and a duplicate one", () => {
			const issues: Issue[] = [];
			expect(
				cards("BEGIN:VCARD\nVERSION:5.0\nVERSION:3.0\nVERSION:4.0\nEND:VCARD", issues)[0],
			).toMatchObject({
				version: "3.0",
				versionSource: "explicit",
			});
			expect(codes(issues)).toEqual(["version-unknown", "version-duplicate"]);
			const guessed: Issue[] = [];
			expect(cards("BEGIN:VCARD\nVERSION:x\nEND:VCARD", guessed)[0]?.version).toBe("3.0");
			expect(codes(guessed)).toEqual(["version-unknown", "version-missing"]);
		});

		test("mixed versions in one file are fine", () => {
			const input =
				"BEGIN:VCARD\nVERSION:2.1\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nEND:VCARD\nBEGIN:VCARD\nVERSION:4.0\nEND:VCARD";
			expect(cards(input).map((c) => c.version)).toEqual(["2.1", "3.0", "4.0"]);
		});
	});

	describe("nested BEGIN", () => {
		test("a 2.1 AGENT with an inline vCard keeps it as raw text", () => {
			const input = [
				"BEGIN:VCARD",
				"VERSION:2.1",
				"FN:Boss",
				"AGENT:",
				"BEGIN:VCARD",
				"VERSION:2.1",
				"FN:Assistant",
				"TEL;WORK:+1",
				"END:VCARD",
				"NOTE:after",
				"END:VCARD",
			].join("\r\n");
			const issues: Issue[] = [];
			const [card] = groupCards(readLogicalLines(utf8(input), issues), issues);
			expect(card?.lines.map((l) => l.name)).toEqual(["FN", "AGENT", "NOTE"]);
			expect(text(card?.lines[1]?.value ?? new Uint8Array())).toBe(
				"BEGIN:VCARD\nVERSION:2.1\nFN:Assistant\nTEL;WORK:+1\nEND:VCARD",
			);
			expect(issues).toEqual([
				expect.objectContaining({ code: "agent-inline-vcard", line: 5 }),
			]);
		});

		test("the grammar form AGENT:BEGIN:VCARD nests the card after the colon", () => {
			const input = [
				"BEGIN:VCARD",
				"VERSION:2.1",
				"N:Public;John",
				"AGENT:BEGIN:VCARD",
				"VERSION:2.1",
				"N:Friday;Fred",
				"TEL;WORK;VOICE:+1-213-555-1234",
				"END:VCARD",
				"TEL;HOME:+1",
				"END:VCARD",
			].join("\r\n");
			const issues: Issue[] = [];
			const result = groupCards(readLogicalLines(utf8(input), issues), issues);
			expect(result).toHaveLength(1);
			expect(result[0]?.lines.map((l) => l.name)).toEqual(["N", "AGENT", "TEL"]);
			expect(text(result[0]?.lines[1]?.value ?? new Uint8Array())).toBe(
				"BEGIN:VCARD\nVERSION:2.1\nN:Friday;Fred\nTEL;WORK;VOICE:+1-213-555-1234\nEND:VCARD",
			);
			expect(issues).toEqual([
				expect.objectContaining({ code: "agent-inline-vcard", line: 4 }),
			]);
			// The 3.0 escaped form is one logical line and is not a nested card.
			expect(
				cards("BEGIN:VCARD\nAGENT:BEGIN:VCARD\\nFN:a\\nEND:VCARD\\n\nTEL:1\nEND:VCARD")[0]
					?.names,
			).toEqual(["AGENT", "TEL"]);
		});

		test("the nested card's VERSION and lowercase end:vcard stay inside the AGENT", () => {
			const input =
				"BEGIN:VCARD\nAGENT:\nbegin:vcard\nVERSION:2.1\nFN:a\nend:vcard\nTEL;TYPE=cell:1\nEND:VCARD";
			const result = cards(input);
			expect(result[0]).toMatchObject({ version: "3.0", versionSource: "guessed" });
			expect(result[0]?.names).toEqual(["AGENT", "TEL"]);
		});

		test("stays linear on a long chain of nested BEGIN lines", () => {
			const start = Date.now();
			expect(cards("BEGIN:VCARD\nVERSION:3.0\n".repeat(100000))).toHaveLength(100000);
			expect(Date.now() - start).toBeLessThan(3000);
		});

		test("lines kept verbatim inside an AGENT raise no lexer diagnostics", () => {
			const issues: Issue[] = [];
			cards(
				"BEGIN:VCARD\nVERSION:2.1\nAGENT:\nBEGIN:VCARD\nX-GOOGLE TALK:x\ngarbage\nEND:VCARD\nEND:VCARD",
				issues,
			);
			expect(codes(issues)).toEqual(["agent-inline-vcard"]);
		});

		test("an unterminated AGENT vCard is closed at end of input", () => {
			const issues: Issue[] = [];
			const result = cards("BEGIN:VCARD\nVERSION:2.1\nAGENT:\nBEGIN:VCARD\nFN:x\n", issues);
			expect(result[0]?.names).toEqual(["AGENT"]);
			expect(codes(issues)).toEqual(["agent-inline-vcard", "missing-end", "missing-end"]);
		});

		test("any other nested BEGIN closes the previous card", () => {
			const issues: Issue[] = [];
			const result = cards(
				"BEGIN:VCARD\nVERSION:3.0\nFN:A\nBEGIN:VCARD\nVERSION:3.0\nFN:B\nEND:VCARD",
				issues,
			);
			expect(result.map((c) => c.names)).toEqual([["FN"], ["FN"]]);
			// The first card ends on the BEGIN that closed it, so the warning is filed under it.
			expect(result.map((c) => [c.line, c.endLine])).toEqual([
				[1, 4],
				[4, 7],
			]);
			expect(issues).toEqual([expect.objectContaining({ code: "nested-begin", line: 4 })]);
		});

		test("a VERSION between an empty AGENT and a BEGIN keeps them apart", () => {
			const issues: Issue[] = [];
			const result = cards(
				"BEGIN:VCARD\nAGENT:\nVERSION:2.1\nBEGIN:VCARD\nVERSION:2.1\nFN:B\nEND:VCARD",
				issues,
			);
			expect(result.map((c) => c.names)).toEqual([["AGENT"], ["FN"]]);
			expect(codes(issues)).toEqual(["nested-begin"]);
		});
	});
});
