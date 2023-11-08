import {PropertyIO, VCardIO} from "../lib/VcardIO";

// partially generated with chatGPT

describe("Vcard", () => {
	let vcard: VCardIO;

	beforeEach(() => { vcard = new VCardIO("3.0"); });

	it("should initialize with the specified version", () => { expect(vcard.version).toBe("3.0"); });

	it("should initialize with an empty fields map", () => { expect(vcard.properties.size).toBe(0); });

	describe("addField", () => {
		it("should add a field to the fields map", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			expect(vcard.getProperties("nickname")).toStrictEqual([field]);
			vcard.addProperty(field);
			expect(vcard.getProperties("nickname")).toStrictEqual([field, field]);
		});
	});

	describe("delFields", () => {
		it("should delete a field from the fields map", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			vcard.delProperties("nickname");
			expect(vcard.properties.size).toBe(0);
		});

		it("should return true when deleting an existing field", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			const result = vcard.delProperties("nickname");
			expect(result).toBe(true);
		});

		it("should return false when deleting a non-existing field", () => {
			const result = vcard.delProperties("nonExistentField");
			expect(result).toBe(false);
		});
	});

	describe("delFieldAt", () => {
		it("should delete a field from the fields map", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			vcard.delPropertyAt("nickname", 0);
			expect(vcard.properties.size).toBe(0);
		});

		it("should return the deleted field", () => {
			const field = new PropertyIO("nickname");
			vcard.setProperties("nickname", [new PropertyIO("nickname"), field]);
			const result = vcard.delPropertyAt("nickname", 1);
			expect(result).toBe(field);
			expect(vcard.properties.size).toBe(1);
		});

		it("should return undefined when deleting a non-existing field", () => {
			const result = vcard.delPropertyAt("nonExistentField", 0);
			expect(result).toBeUndefined();
		});
	});

	describe("hasField", () => {
		it("should return true when a field exists", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			expect(vcard.hasProperty("nickname")).toBe(true);
		});

		it("should return false when a field does not exist", () => { expect(vcard.hasProperty("nonExistentField")).toBe(false); });
	});

	describe("getFields", () => {
		it("should return the field when it exists", () => {
			const field = new PropertyIO("nickname");
			vcard.addProperty(field);
			expect(vcard.getProperties("nickname")).toStrictEqual([field]);
		});

		it("should return undefined when the field does not exist", () => { expect(vcard.getProperties("nonExistentField")).toBeUndefined(); });
	});

	describe("setFields", () => {
		it("should add the fields to the fields map", () => {
			const field = new PropertyIO("nickname");
			vcard.setProperties("nickname", [field]);
			expect(vcard.getProperties("nickname")).toStrictEqual([field]);
			vcard.setProperties("nickname", [field, field]);
			expect(vcard.getProperties("nickname")).toStrictEqual([field, field]);
		});
	});

	describe("getField", () => {
		it("should return a field from the fields map", () => {
			const field = new PropertyIO("email");
			vcard.addProperty(new PropertyIO("email"));
			vcard.addProperty(field);
			expect(vcard.getProperty("email", 1)).toBe(field);
		});

		it("should return the first index by default", () => {
			const field = new PropertyIO("email");
			vcard.addProperty(field);
			vcard.addProperty(new PropertyIO("email"));
			expect(vcard.getProperty("email")).toBe(field);
		});

		it("should return undefined when getting a non-existing field", () => {
			const result = vcard.getProperty("nonExistentField", 0);
			expect(result).toBeUndefined();
		});
	});

	describe("toString", () => {
		it("should return a valid string representation", () => {
			const field = new PropertyIO("name");
			field.addParam("param1", "p1");
			field.addParam("param2", "p2");
			field.addValue("value1");
			field.addValue("value2");
			const field2 = new PropertyIO("name2");
			field2.addValue("value");

			vcard.addProperty(field);
			vcard.addProperty(field);
			vcard.addProperty(field2);

			const expected = "BEGIN:VCARD\r\n" +
							 "VERSION:3.0\r\n" +
							 "NAME;PARAM1=p1;PARAM2=p2:value1;value2\r\n" +
							 "NAME;PARAM1=p1;PARAM2=p2:value1;value2\r\n" +
							 "NAME2:value\r\n" +
							 "END:VCARD\r\n";
			expect(vcard.toString()).toBe(expected);
			// static method should behave the same
			expect(VCardIO.toString(vcard)).toBe(expected);
		});

		it("should return a valid string representation without fields", () => {
			const expected = "BEGIN:VCARD\r\n" +
							 "VERSION:3.0\r\n" +
							 "END:VCARD\r\n";
			expect(vcard.toString()).toBe(expected);
			// static method should behave the same
			expect(VCardIO.toString(vcard)).toBe(expected);
		});

		it("should throw if no version", () => {
			vcard.version = "";
			expect(() => vcard.toString()).toThrow();
		});
	});

	describe("fromString", () => {
		it("should return a valid Vcard", () => {
			const input = "BEGIN:VCARD\r\n" +
						  "VERSION:3.0\r\n" +
						  "NAME;PARAM1=p1;PARAM2=p2:value1;value2\r\n" +
						  "END:VCARD\r\n";
			vcard.fromString(input);
			const svcard = VCardIO.fromString(input);

			expect(vcard.version).toBe("3.0");
			expect(svcard.version).toBe("3.0");
			expect(vcard.hasProperty("name")).toBe(true);
			expect(svcard.hasProperty("name")).toBe(true);
			expect(vcard.toString()).toBe(input);
			// static method should behave the same
			expect(VCardIO.toString(vcard)).toBe(input);
		});

		it("should supports empty lines", () => {
			const input = "BEGIN:VCARD\r\n" +
						  "VERSION:3.0\r\n" +
						  "\r\n" +
						  "   \t \r\n" +
						  "END:VCARD\r\n";
			const output = "BEGIN:VCARD\r\n" +
						   "VERSION:3.0\r\n" +
						   "END:VCARD\r\n";
			vcard.fromString(input);

			expect(vcard.version).toBe("3.0");
			expect(vcard.hasProperty("name")).toBe(false);
			expect(vcard.toString()).toBe(output);
		});

		it("should supports folded lines", () => {
			const input = "BEGIN:VCARD\r\n" +
						  "VERS\r\n ION:2.1\r\n" +
						  "NA\r\n ME;PARAM1=p1;PARAM\r\n 2=p2:value1\\nvalue1;v\r\n\talue2\r\n" +
						  "END:VCARD\r\n";
			const output = "BEGIN:VCARD\r\n" +
						   "VERSION:2.1\r\n" +
						   "NAME;PARAM1=p1;PARAM2=p2:value1\\nvalue1;value2\r\n" +
						   "END:VCARD\r\n";
			vcard.fromString(input);

			expect(vcard.version).toBe("2.1");
			expect(vcard.hasProperty("name")).toBe(true);
			expect(vcard.getProperty("name")?.getValue()).toBe("value1\nvalue1");
			expect(vcard.toString()).toBe(output);
		});

		it("should throw if bad format", () => {
			const input = "NAME:"
			expect(() => vcard.fromString(input)).toThrow();
		});

		it("should throw if no version", () => {
			const input = "BEGIN:VCARD\r\n" +
						  "NAME;PARAM1=p1;PARAM2=p2:value1;value2\r\n" +
						  "END:VCARD\r\n";
			expect(() => vcard.fromString(input)).toThrow();
		});

		it("should throw if bad version", () => {
			const input = "BEGIN:VCARD\r\n" +
						  "VERSION:2.1;3.0\r\n" +
						  "END:VCARD\r\n";
			expect(() => vcard.fromString(input)).toThrow();
		});
	});
});
