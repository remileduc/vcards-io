import { describe, expect, test } from "vitest";
import { buildDataUri, parseDataUri, parseGeoUri, parseTelUri } from "../src/index.js";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("data URIs", () => {
	test("parses the RFC 2397 base64 example", () => {
		const parsed = parseDataUri("data:image/gif;base64,R0lGODdhMAAwAPAAAAAAAP///ywAAAAAMAAw");
		expect(parsed?.mediaType).toBe("image/gif");
		expect(parsed?.base64).toBe(true);
		expect(Array.from(parsed?.data.subarray(0, 6) ?? [])).toEqual([
			0x47, 0x49, 0x46, 0x38, 0x37, 0x61,
		]);
	});

	test("parses percent-encoded text data with parameters", () => {
		const parsed = parseDataUri("data:text/plain;charset=iso-8859-7,%be%fg%be");
		expect(parsed).toBeNull();
		const ok = parseDataUri("data:text/plain;charset=iso-8859-7,%be%fe%be");
		expect(ok?.mediaType).toBe("text/plain");
		expect(ok?.parameters.get("charset")).toBe("iso-8859-7");
		expect(Array.from(ok?.data ?? [])).toEqual([0xbe, 0xfe, 0xbe]);
		expect(text(parseDataUri("data:,A%20brief%20note")?.data ?? new Uint8Array())).toBe(
			"A brief note",
		);
	});

	test("accepts parameters together with base64 and an empty payload", () => {
		const parsed = parseDataUri("data:text/plain;charset=utf-8;base64,aGk=");
		expect(parsed?.parameters.get("charset")).toBe("utf-8");
		expect(text(parsed?.data ?? new Uint8Array())).toBe("hi");
		expect(parseDataUri("data:image/jpeg;base64,")?.data.length).toBe(0);
	});

	test("lowercases the media type and omits it when absent", () => {
		expect(parseDataUri("DATA:Image/JPEG;BASE64,/9j/")?.mediaType).toBe("image/jpeg");
		expect(parseDataUri("data:;base64,/9j/")).not.toHaveProperty("mediaType");
	});

	test("rejects bad scheme, media type, parameters and payload", () => {
		expect(parseDataUri("http://example.com")).toBeNull();
		expect(parseDataUri("data:image jpeg;base64,/9j/")).toBeNull();
		expect(parseDataUri("data:image/jpeg;novalue;base64,/9j/")).toBeNull();
		expect(parseDataUri("data:image/jpeg;base64,/9j/***")).toBeNull();
		expect(parseDataUri("data:image/jpeg;base64")).toBeNull();
	});

	test("buildDataUri round trips through parseDataUri", () => {
		const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
		const uri = buildDataUri(bytes, "image/jpeg");
		expect(uri).toBe("data:image/jpeg;base64,/9j/4AA=");
		expect(Array.from(parseDataUri(uri)?.data ?? [])).toEqual(Array.from(bytes));
		expect(buildDataUri(bytes)).toBe("data:;base64,/9j/4AA=");
	});
});

describe("tel URIs", () => {
	test("parses RFC 3966 examples", () => {
		expect(parseTelUri("tel:+1-201-555-0123")).toEqual({
			number: "+1-201-555-0123",
			parameters: new Map(),
		});
		expect(parseTelUri("tel:7042;phone-context=example.com")).toEqual({
			number: "7042",
			parameters: new Map([["phone-context", "example.com"]]),
		});
		expect(parseTelUri("TEL:+1-555-555-5555;ext=5555")).toEqual({
			number: "+1-555-555-5555",
			extension: "5555",
			parameters: new Map(),
		});
	});

	test("lowercases parameter names and keeps unknown ones", () => {
		expect(parseTelUri("tel:+1-555;ISUB=1234;Ext=9")).toEqual({
			number: "+1-555",
			extension: "9",
			parameters: new Map([["isub", "1234"]]),
		});
	});

	test("rejects other schemes and empty numbers", () => {
		expect(parseTelUri("+1-555")).toBeNull();
		expect(parseTelUri("tel:")).toBeNull();
		expect(parseTelUri("tel:;ext=1")).toBeNull();
	});
});

describe("geo URIs", () => {
	test("parses RFC 5870 examples", () => {
		expect(parseGeoUri("geo:37.386013,-122.082932")).toEqual({
			latitude: 37.386013,
			longitude: -122.082932,
			parameters: new Map(),
		});
		expect(parseGeoUri("geo:48.2010,16.3695,183;crs=wgs84;u=40")).toEqual({
			latitude: 48.201,
			longitude: 16.3695,
			altitude: 183,
			parameters: new Map([
				["crs", "wgs84"],
				["u", "40"],
			]),
		});
	});

	test("rejects out-of-range and malformed coordinates", () => {
		expect(parseGeoUri("geo:91,0")).toBeNull();
		expect(parseGeoUri("geo:0,181")).toBeNull();
		expect(parseGeoUri("geo:37.386013")).toBeNull();
		expect(parseGeoUri("37.386013;-122.082932")).toBeNull();
	});
});
