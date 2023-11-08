import * as stringutils from "../lib/stringutils";

// partially generated with chatGPT

describe("ICaseMap", () => {
	it("should set and get values in a case-insensitive manner", () => {
		const icaseMap = new stringutils.ICaseMap<number>();
		icaseMap.set("Key1", 42);

		expect(icaseMap.get("key1")).toBe(42);
		expect(icaseMap.get("KEY1")).toBe(42);
	});

	it("should correctly check if a key exists in a case-insensitive manner", () => {
		const icaseMap = new stringutils.ICaseMap<string>();
		icaseMap.set("KEY1", "Value1");

		expect(icaseMap.has("key1")).toBe(true);
		expect(icaseMap.has("Key1")).toBe(true);
		expect(icaseMap.has("nonExistentKey")).toBe(false);
	});

	it("should delete keys in a case-insensitive manner", () => {
		const icaseMap = new stringutils.ICaseMap<string>();
		icaseMap.set("key1", "Value1");

		expect(icaseMap.delete("KEY1")).toBe(true);
		expect(icaseMap.has("key1")).toBe(false);
	});

	it("should handle keys with different cases", () => {
		const icaseMap = new stringutils.ICaseMap<string>();
		icaseMap.set("Key1", "Value1");
		icaseMap.set("key2", "Value2");

		expect(icaseMap.get("key1")).toBe("Value1");
		expect(icaseMap.has("Key2")).toBe(true);
		expect(icaseMap.delete("kEy2")).toBe(true);
	});
});

describe("escape", () => {
	it("should escape a backslash", () => {
		const input = "\\";
		const expectedOutput = "\\\\";
		expect(stringutils.escape(input)).toBe(expectedOutput);
	});

	it("should escape a comma in the string", () => {
		const input = "This is a, test";
		const expectedOutput = "This is a\\, test";
		expect(stringutils.escape(input)).toBe(expectedOutput);
	});

	it("should escape a semicolon in the string", () => {
		const input = "Semicolon; test";
		const expectedOutput = "Semicolon\\; test";
		expect(stringutils.escape(input)).toBe(expectedOutput);
	});

	it("should escape a newline character in the string", () => {
		const input = "New\nline";
		const expectedOutput = "New\\nline";
		expect(stringutils.escape(input)).toBe(expectedOutput);
	});

	it("should escape multiple instances of characters", () => {
		const input = "Comma,,, \\Semicolon;; New\n\nline";
		const expectedOutput = "Comma\\,\\,\\, \\\\Semicolon\\;\\; New\\n\\nline";
		expect(stringutils.escape(input)).toBe(expectedOutput);
	});

	it("should not escape characters that are not present", () => {
		const input = "No special characters here";
		expect(stringutils.escape(input)).toBe(input);
	});

	it("should not escape characters that are not special", () => {
		const input = "No special\tcharacters here";
		expect(stringutils.escape(input)).toBe(input);
	});
});

describe("unescape", () => {
	it("should unescape a backslash", () => {
		const input = "Slash \\\\ test";
		const expectedOutput = "Slash \\ test";
		expect(stringutils.unescape(input)).toBe(expectedOutput);
	});

	it("should unescape a comma", () => {
		const input = "Comma\\, test";
		const expectedOutput = "Comma, test";
		expect(stringutils.unescape(input)).toBe(expectedOutput);
	});

	it("should unescape a semicolon", () => {
		const input = "Semicolon\\; test";
		const expectedOutput = "Semicolon; test";
		expect(stringutils.unescape(input)).toBe(expectedOutput);
	});

	it("should unescape a newline character", () => {
		const input = "New\\nLine";
		const expectedOutput = "New\nLine";
		expect(stringutils.unescape(input)).toBe(expectedOutput);
	});

	it("should not unescape characters that are not special", () => {
		const input = "No special\tcharacters here";
		expect(stringutils.unescape(input)).toBe(input);
	});
});

describe("fold", () => {
	it("should not modify the string if it is within the max length", () => {
		const input = "This is a short string.";
		const maxLength = 50;
		expect(stringutils.fold(input, maxLength)).toBe(input);
	});

	it("should fold the string into lines within the max length", () => {
		const input = "This is a long string that needs folding to multiple lines to fit within the max length.";
		const maxLength = 21;
		const expectedOutput = "This is a long string\r\n  that needs folding \r\n to multiple lines to\r\n  fit within the max \r\n length.";
		expect(stringutils.fold(input, maxLength)).toBe(expectedOutput);
	});

	it("should fold at 75 by default", () => {
		const input = "This is a long string that needs folding to multiple lines to fit within the max length.";
		const expectedOutput = "This is a long string that needs folding to multiple lines to fit within th\r\n e max length.";
		expect(stringutils.fold(input)).toBe(expectedOutput);
	});
});

describe("unfold", () => {
	it("should remove folded line breaks with spaces", () => {
		const input = "This is a long string\r\n  that needs folding \r\n to multiple lines to\r\n  fit within the max \r\n length.";
		const expectedOutput = "This is a long string that needs folding to multiple lines to fit within the max length.";
		expect(stringutils.unfold(input)).toBe(expectedOutput);
	});

	it("should remove folded line breaks with tabs", () => {
		const input = "This is a long string\r\n\t that needs folding \r\n\tto multiple lines to\r\n\t fit within the max \r\n\tlength.";
		const expectedOutput = "This is a long string that needs folding to multiple lines to fit within the max length.";
		expect(stringutils.unfold(input)).toBe(expectedOutput);
	});

	it("should not modify the string if there are no folded line breaks", () => {
		const input = "This is a short string.";
		expect(stringutils.unfold(input)).toBe(input);
	});
});

describe("includes", () => {
	it("should correctly identify the presence of a character", () => {
		const input = "This is a test string.";
		const char = "s";
		expect(stringutils.includes(input, char)).toBe(true);
	});

	it("should correctly identify the absence of a character", () => {
		const input = "This is a test string.";
		const char = "x";
		expect(stringutils.includes(input, char)).toBe(false);
	});

	it("should correctly handle escaped characters", () => {
		const input = "This\\, is a test string.";
		const char = ",";
		expect(stringutils.includes(input, char)).toBe(false);
	});

	it("should correctly handle unescaped characters", () => {
		const input = "This, is a test string.";
		const char = ",";
		expect(stringutils.includes(input, char)).toBe(true);
	});
});

describe("split", () => {
	it("should split the string using the separator", () => {
		const input = "apple,banana,cherry";
		const separator = ",";
		const expectedOutput = ["apple", "banana", "cherry"];
		expect(stringutils.split(input, separator)).toEqual(expectedOutput);
	});

	it("should handle escaped separators", () => {
		const input = "apple\\,banana,cherry";
		const separator = ",";
		const expectedOutput = ["apple,banana", "cherry"];
		expect(stringutils.split(input, separator)).toEqual(expectedOutput);
	});
});
