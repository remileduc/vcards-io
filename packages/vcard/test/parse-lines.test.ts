import { describe, expect, test } from "vitest";
import type { Issue } from "../src/index.js";
import { readLogicalLines } from "../src/parse/lines.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function lines(input: string, issues: Issue[] = [], max?: number) {
	return readLogicalLines(utf8(input), issues, max).map((l) => [l.line, text(l.bytes)]);
}

describe("readLogicalLines", () => {
	test("splits on CRLF, LF and CR and numbers physical lines", () => {
		expect(lines("A:1\r\nB:2\nC:3\rD:4")).toEqual([
			[1, "A:1"],
			[2, "B:2"],
			[3, "C:3"],
			[4, "D:4"],
		]);
	});

	test("skips blank lines and a trailing line break without inventing lines", () => {
		expect(lines("A:1\r\n\r\n\r\nB:2\r\n")).toEqual([
			[1, "A:1"],
			[4, "B:2"],
		]);
		expect(lines("")).toEqual([]);
		expect(lines("\r\n\n")).toEqual([]);
	});

	test("unfolds RFC 6350 continuations, dropping exactly one space or tab", () => {
		expect(lines("NOTE:abc\r\n def\r\n\t ghi\r\nFN:x")).toEqual([
			[1, "NOTE:abcdef ghi"],
			[4, "FN:x"],
		]);
	});

	test("keeps a leading-whitespace first line as its own line", () => {
		expect(lines(" FN:x\r\nN:y")).toEqual([
			[1, " FN:x"],
			[2, "N:y"],
		]);
	});

	test("reassembles a UTF-8 sequence split by a careless folder", () => {
		const bytes = new Uint8Array([
			...utf8("FN:Zo"),
			0xc3,
			0x0d,
			0x0a,
			0x20,
			0xab,
			...utf8("\r\nN:x"),
		]);
		const out = readLogicalLines(bytes, []);
		expect(text(out[0]?.bytes ?? new Uint8Array())).toBe("FN:Zoë");
	});

	describe("quoted-printable", () => {
		test("joins an unindented AOSP soft break and consumes the '='", () => {
			const input =
				"N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=35;;=72=\r\n;;=34=36;=46\r\nFN:x\r\n";
			expect(lines(input)).toEqual([
				[1, "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=35;;=72;;=34=36;=46"],
				[3, "FN:x"],
			]);
		});

		test("joins several soft breaks in a row, bare 2.1 form included", () => {
			expect(lines("ADR;HOME;QUOTED-PRINTABLE:a=\r\nb=\r\nc\r\nEND:VCARD")).toEqual([
				[1, "ADR;HOME;QUOTED-PRINTABLE:abc"],
				[4, "END:VCARD"],
			]);
		});

		test("tolerates transport whitespace after the soft-break '='", () => {
			expect(lines("NOTE;ENCODING=QUOTED-PRINTABLE:a= \t\r\nb")).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:ab"],
			]);
		});

		test("keeps a leading space after a soft break: the RFC 2045 6.7 example, as AOSP does", () => {
			const input =
				"NOTE;ENCODING=QUOTED-PRINTABLE:Now's the time =\r\nfor all folk to come=\r\n to the aid of their country.";
			expect(lines(input)).toEqual([
				[
					1,
					"NOTE;ENCODING=QUOTED-PRINTABLE:Now's the time for all folk to come to the aid of their country.",
				],
			]);
		});

		test("a soft break followed by a whitespace-only line then content", () => {
			expect(lines("NOTE;ENCODING=QUOTED-PRINTABLE:a=\r\n \r\n b")).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:a b"],
			]);
		});

		test("stays linear on a soft break followed by many whitespace-only lines", () => {
			const input = `NOTE;ENCODING=QUOTED-PRINTABLE:a=\r\n${"   \r\n".repeat(100000)}FN:x`;
			const start = Date.now();
			const out = lines(input);
			expect(Date.now() - start).toBeLessThan(2000);
			expect(out).toEqual([
				// first blank line follows the soft break verbatim, the others are plain folds
				[1, `NOTE;ENCODING=QUOTED-PRINTABLE:a${" ".repeat(3 + 2 * 99999)}`],
				[100002, "FN:x"],
			]);
		});

		test("does not swallow a card delimiter after a dangling soft break", () => {
			const issues: Issue[] = [];
			expect(lines("NOTE;ENCODING=QUOTED-PRINTABLE:a=\r\nEND:VCARD\r\n", issues)).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:a"],
				[2, "END:VCARD"],
			]);
			expect(issues).toEqual([
				expect.objectContaining({ code: "qp-soft-break-dangling", line: 2 }),
			]);
		});

		test("a soft break before a blank line or EOF just ends the value", () => {
			expect(lines("NOTE;ENCODING=QUOTED-PRINTABLE:a=\r\n\r\nFN:x", [])).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:a"],
				[3, "FN:x"],
			]);
			expect(lines("NOTE;ENCODING=QUOTED-PRINTABLE:a=")).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:a="],
			]);
		});

		test("a trailing '=' on a line that is not quoted-printable is content", () => {
			expect(lines("NOTE:a=\r\nFN:x")).toEqual([
				[1, "NOTE:a="],
				[2, "FN:x"],
			]);
			expect(lines('NOTE;X-FOO="QUOTED-PRINTABLE":a=\r\nFN:x')).toEqual([
				[1, 'NOTE;X-FOO="QUOTED-PRINTABLE":a='],
				[2, "FN:x"],
			]);
			expect(lines('NOTE;X-FOO="a,QUOTED-PRINTABLE":a=\r\nFN:x')).toEqual([
				[1, 'NOTE;X-FOO="a,QUOTED-PRINTABLE":a='],
				[2, "FN:x"],
			]);
		});

		test("reads the header exactly as the lexer does, quotes included", () => {
			// an unbalanced quote is plain text to the lexer, so ENCODING is still seen
			expect(lines('NOTE;X-A="b;ENCODING=QUOTED-PRINTABLE:a=\r\nb')).toEqual([
				[1, 'NOTE;X-A="b;ENCODING=QUOTED-PRINTABLE:ab'],
			]);
			// text after a closing quote makes it plain too: the value starts at the first ":"
			expect(lines('X;A="a:b"c;ENCODING=QUOTED-PRINTABLE:v=\r\nw')).toEqual([
				[1, 'X;A="a:b"c;ENCODING=QUOTED-PRINTABLE:v='],
				[2, "w"],
			]);
			expect(lines("LABEL;INTL;PARCEL,ENCODING=QUOTED-PRINTABLE:x=\r\ny")).toEqual([
				[1, "LABEL;INTL;PARCEL,ENCODING=QUOTED-PRINTABLE:xy"],
			]);
		});

		test("stays linear on a header of many folded quoted values", () => {
			const input = `X;A="a:b"\r\n${' ,"c:d"\r\n'.repeat(100000)}FN:x`;
			const start = Date.now();
			const out = lines(input);
			expect(Date.now() - start).toBeLessThan(2000);
			expect(out).toHaveLength(2);
		});

		test("finds the encoding even when the header itself was folded", () => {
			expect(lines("NOTE;ENCODING=\r\n QUOTED-PRINTABLE:a=\r\nb")).toEqual([
				[1, "NOTE;ENCODING=QUOTED-PRINTABLE:ab"],
			]);
			expect(lines('X;A="a\r\n b:c";ENCODING=QUOTED-PRINTABLE:v=\r\nw')).toEqual([
				[1, 'X;A="ab:c";ENCODING=QUOTED-PRINTABLE:vw'],
			]);
		});
	});

	describe("base64", () => {
		test("appends unindented base64 lines (Outlook) until a property line", () => {
			const input = "PHOTO;ENCODING=BASE64;JPEG:/9j/4AAQ\r\nSkZJRg==\r\nEND:VCARD";
			expect(lines(input)).toEqual([
				[1, "PHOTO;ENCODING=BASE64;JPEG:/9j/4AAQSkZJRg=="],
				[3, "END:VCARD"],
			]);
		});

		test("a blank line ends the block (AOSP)", () => {
			const input = "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ\r\n SkZJ\r\n\r\nRg==\r\n";
			const issues: Issue[] = [];
			expect(lines(input, issues)).toEqual([
				[1, "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJ"],
				[4, "Rg=="],
			]);
		});

		test("only continues with base64 characters", () => {
			expect(lines("PHOTO;ENCODING=B:abc\r\nd/e+f=\r\nwhat is this\r\nFN:x")).toEqual([
				[1, "PHOTO;ENCODING=B:abcd/e+f="],
				[3, "what is this"],
				[4, "FN:x"],
			]);
			expect(lines("NOTE:abc\r\ndef")).toEqual([
				[1, "NOTE:abc"],
				[2, "def"],
			]);
		});
	});

	test("joins an unindented line without ':' to N, ADR or ORG (AOSP), not to others", () => {
		const issues: Issue[] = [];
		expect(
			lines("ADR;TYPE=HOME:;;678 Plain\r\n834;;;;\r\nNOTE:a\r\nb c\r\nFN:x", issues),
		).toEqual([
			[1, "ADR;TYPE=HOME:;;678 Plain834;;;;"],
			[3, "NOTE:a"],
			[4, "b c"],
			[5, "FN:x"],
		]);
		expect(issues).toEqual([
			expect.objectContaining({ code: "unindented-continuation", line: 2 }),
		]);
		expect(lines("item1.N:a;b\r\nc;d")).toEqual([[1, "item1.N:a;bc;d"]]);
	});

	test("leaves a # comment after N, ADR or ORG alone", () => {
		const issues: Issue[] = [];
		expect(lines("N:a;b\r\n# comment\r\nFN:x", issues)).toEqual([
			[1, "N:a;b"],
			[2, "# comment"],
			[3, "FN:x"],
		]);
		expect(issues).toEqual([]);
	});

	test("drops an over-long physical line and its continuations with one error issue", () => {
		const issues: Issue[] = [];
		expect(
			lines("FN:x\r\nNOTE:0123456789abcdef\r\n more\r\n\tmore\r\nN:y\r\n z", issues, 10),
		).toEqual([
			[1, "FN:x"],
			[5, "N:yz"],
		]);
		expect(issues).toEqual([
			expect.objectContaining({ severity: "error", code: "line-too-long", line: 2 }),
		]);
	});

	test("an over-long continuation drops the line it continues too", () => {
		for (const continuation of [` ${"A".repeat(31)}`, "A".repeat(32)]) {
			const issues: Issue[] = [];
			expect(
				lines(`PHOTO;ENCODING=B:abcd\r\n${continuation}\r\n ef\r\nFN:x`, issues, 30),
			).toEqual([[4, "FN:x"]]);
			expect(issues).toEqual([
				expect.objectContaining({
					severity: "error",
					code: "line-too-long",
					line: 2,
					message: expect.stringContaining("PHOTO line 1"),
				}),
			]);
		}
	});

	test("folds in a CR-only file", () => {
		expect(lines("N:a;b\r c\rFN:x\r")).toEqual([
			[1, "N:a;bc"],
			[3, "FN:x"],
		]);
	});

	test("stays fast on a million tiny continuation lines", () => {
		const start = Date.now();
		const out = lines(`NOTE:a\n${" \n".repeat(1000000)}FN:x`);
		expect(Date.now() - start).toBeLessThan(3000);
		expect(out).toEqual([
			[1, "NOTE:a"],
			[1000002, "FN:x"],
		]);
	});

	test("throws on a nonsensical limit", () => {
		expect(() => readLogicalLines(utf8("FN:x"), [], 0)).toThrow(RangeError);
	});

	test("stays linear on a large folded photo", () => {
		const chunk = "A".repeat(74);
		const input = `PHOTO;ENCODING=B:${chunk}\r\n${` ${chunk}\r\n`.repeat(20000)}END:VCARD\r\n`;
		const start = Date.now();
		const out = lines(input);
		expect(Date.now() - start).toBeLessThan(2000);
		expect(out[0]?.[1]).toHaveLength("PHOTO;ENCODING=B:".length + 74 * 20001);
		expect(out[1]).toEqual([20002, "END:VCARD"]);
	});
});
