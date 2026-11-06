import { describe, expect, test } from "vitest";
import { caretDecode, caretEncode } from "../src/index.js";

describe("RFC 6868 caret encoding", () => {
	test("decodes the RFC example", () => {
		expect(caretDecode("Pittsburgh Pirates^n115 Federal St^nPittsburgh, PA 15212")).toBe(
			"Pittsburgh Pirates\n115 Federal St\nPittsburgh, PA 15212",
		);
		expect(caretDecode("^'Bob^' Smith")).toBe('"Bob" Smith');
		expect(caretDecode("a^^b")).toBe("a^b");
	});

	test("leaves any other caret sequence untouched", () => {
		expect(caretDecode("a^xb^")).toBe("a^xb^");
		expect(caretDecode("^^n")).toBe("^n");
	});

	test("encodes caret, newline and double quote", () => {
		expect(caretEncode('"Bob" ^ Smith\nline')).toBe("^'Bob^' ^^ Smith^nline");
		expect(caretEncode("a\r\nb\rc")).toBe("a^nb^nc");
	});

	test("round trips", () => {
		const text = '^n ^^ ^\' "x"\ny';
		expect(caretDecode(caretEncode(text))).toBe(text);
	});
});
