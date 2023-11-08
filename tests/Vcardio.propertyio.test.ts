import {PropertyIO} from "../lib/VcardIO";

// partially generated with chatGPT

describe("Field", () => {
	let field: PropertyIO;

	beforeEach(() => { field = new PropertyIO("name"); });

	it("should initialize with the specified name", () => { expect(field.name).toBe("name"); });

	it("should initialize with an empty params map", () => { expect(field.params.size).toBe(0); });

	it("should initialize with an empty values array", () => { expect(field.values.length).toBe(0); });

	describe("addParam", () => {
		it("should add a param to the params map", () => {
			field.addParam("key", "param");
			expect(field.params.get("key")).toBe("param");
		});
	});

	describe("delParam", () => {
		it("should delete a param from the params map", () => {
			field.addParam("key", "param");
			field.delParam("key");
			expect(field.params.size).toBe(0);
		});

		it("should return true when deleting an existing param", () => {
			field.addParam("key", "param");
			const result = field.delParam("key");
			expect(result).toBe(true);
		});

		it("should return false when deleting a non-existing param", () => {
			const result = field.delParam("nonExistentKey");
			expect(result).toBe(false);
		});
	});

	describe("hasParam", () => {
		it("should return true when a param exists", () => {
			field.addParam("key", "param");
			expect(field.hasParam("key")).toBe(true);
		});

		it("should return false when a param does not exist", () => { expect(field.hasParam("nonExistentKey")).toBe(false); });
	});

	describe("getParam", () => {
		it("should return the param when it exists", () => {
			field.addParam("key", "param");
			expect(field.getParam("key")).toBe("param");
		});

		it("should return undefined when the param does not exist", () => { expect(field.getParam("nonExistentKey")).toBeUndefined(); });
	});

	describe("addValue", () => {
		it("should add a value to the values array", () => {
			field.addValue("value1");
			expect(field.values).toContain("value1");
		});
	});

	describe("delIndex", () => {
		it("should delete the value at index from the values array", () => {
			field.addValue("value1");
			field.addValue("value2");
			field.addValue("value3");
			field.delValueAt(1);
			expect(field.values).toHaveLength(2);
			expect(field.values.includes("value1")).toBe(true);
			expect(field.values.includes("value2")).toBe(false);
			expect(field.values.includes("value3")).toBe(true);
			field.delValueAt(1);
			expect(field.values).toHaveLength(1);
		});

		it("should return true when deleting an existing index", () => {
			field.addValue("value1");
			const result = field.delValueAt(0);
			expect(result).toBe(true);
		});

		it("should return false when deleting a non-existing index", () => {
			const result = field.delValueAt(0);
			expect(result).toBe(false);
		});
	});

	describe("delValue", () => {
		it("should delete a value from the values array", () => {
			field.addValue("value1");
			field.delValue("value1");
			expect(field.values).toHaveLength(0);
		});

		it("should return true when deleting an existing value", () => {
			field.addValue("value1");
			const result = field.delValue("value1");
			expect(result).toBe(true);
		});

		it("should return false when deleting a non-existing value", () => {
			const result = field.delValue("nonExistentValue");
			expect(result).toBe(false);
		});
	});

	describe("hasValue", () => {
		it("should return true when a value exists", () => {
			field.addValue("value1");
			expect(field.hasValue("value1")).toBe(true);
		});

		it("should return false when a value does not exist", () => { expect(field.hasValue("nonExistentValue")).toBe(false); });
	});

	describe("getValue", () => {
		it("should return the value at the specified index", () => {
			field.addValue("value1");
			field.addValue("value2");
			expect(field.getValue(1)).toBe("value2");
		});

		it("should return the first index by default", () => {
			field.addValue("value1");
			field.addValue("value2");
			expect(field.getValue()).toBe("value1");
		});

		it("should return undefined when the index is out of bounds", () => { expect(field.getValue(2)).toBeUndefined(); });
	});

	describe("toString", () => {
		it("should return a valid string representation", () => {
			field.addParam("param1", "p1");
			field.addParam("param2", "p2");
			field.addValue("value1");
			field.addValue("value2");
			const expected = "NAME;PARAM1=p1;PARAM2=p2:value1;value2"
			expect(field.toString()).toBe(expected);
			// static method should behave the same
			expect(PropertyIO.toString(field)).toBe(expected);
		});

		it("should return a valid string representation without params", () => {
			field.addValue("value1");
			field.addValue("value2");
			const expected = "NAME:value1;value2"
			expect(field.toString()).toBe(expected);
			// static method should behave the same
			expect(PropertyIO.toString(field)).toBe(expected);
		});

		it("should throw if no values", () => {
			field.addParam("param1", "p1");
			field.addParam("param2", "p2");
			expect(() => field.toString()).toThrow();
			// static method should behave the same
			expect(() => PropertyIO.toString(field)).toThrow();
		});

		it("should throw if no name", () => {
			field.name = "";
			field.addValue("value1");
			field.addValue("value2");
			expect(() => field.toString()).toThrow();
			// static method should behave the same
			expect(() => PropertyIO.toString(field)).toThrow();
		});

		it("should throw if bad parameters", () => {
			field.addParam("param2", "");
			field.addValue("value1");
			expect(() => field.toString()).toThrow();
			// static method should behave the same
			expect(() => PropertyIO.toString(field)).toThrow();
		});
	});

	describe("fromString", () => {
		it("should return a valid Field", () => {
			const input = "NAME;PARAM1=p1\\,p11;PARAM2=p2:value1;value2\\;value2"
			field.fromString(input);
			const sfield = PropertyIO.fromString(input);

			expect(field.name).toBe("NAME");
			expect(sfield.name).toBe("NAME");
			expect(field.getParam("param1")).toBe("p1,p11");
			expect(sfield.getParam("param1")).toBe("p1,p11");
			expect(field.getParam("param2")).toBe("p2");
			expect(sfield.getParam("param2")).toBe("p2");
			expect(field.getValue(0)).toBe("value1");
			expect(sfield.getValue(0)).toBe("value1");
			expect(field.getValue(1)).toBe("value2;value2");
			expect(sfield.getValue(1)).toBe("value2;value2");
			expect(field.toString()).toBe(input);
			// static method should behave the same
			expect(PropertyIO.toString(sfield)).toBe(input);
		});

		it("should return a valid Field if no params", () => {
			const input = "NAME:value1"
			field.fromString(input);

			expect(field.name).toBe("NAME");
			expect(field.params.size).toBe(0);
			expect(field.values).toHaveLength(1);
			expect(field.toString()).toBe(input);
		});

		it("should throw if no values", () => {
			const input = "NAME:"
			expect(() => field.fromString(input)).toThrow();
		});

		it("should throw if no name", () => {
			const input = ":value"
			expect(() => field.fromString(input)).toThrow();
		});

		it("should throw if bad parameters", () => {
			const input = "NAME;param:value"
			expect(() => field.fromString(input)).toThrow();
		});
	});
});
