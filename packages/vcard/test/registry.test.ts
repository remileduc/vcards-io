import { describe, expect, test } from "vitest";
import { COMMON_PARAMS, defaultValueKind, PROPERTY_REGISTRY } from "../src/index.js";

describe("PROPERTY_REGISTRY", () => {
	test("default kinds follow the version", () => {
		// RFC 6350 6.4.1: TEL stays text unless VALUE=uri says otherwise
		expect(defaultValueKind("TEL", "3.0")).toBe("text");
		expect(defaultValueKind("TEL", "4.0")).toBe("text");
		expect(defaultValueKind("UID", "4.0")).toBe("uri");
		expect(defaultValueKind("PHOTO", "2.1")).toBe("binary");
		expect(defaultValueKind("PHOTO", "4.0")).toBe("uri");
		expect(defaultValueKind("TZ", "3.0")).toBe("utc-offset");
		expect(defaultValueKind("TZ", "4.0")).toBe("text");
		expect(defaultValueKind("fn", "2.1")).toBe("text");
	});

	test("properties absent from a version have no default there", () => {
		expect(defaultValueKind("NICKNAME", "2.1")).toBeUndefined();
		expect(defaultValueKind("LABEL", "4.0")).toBeUndefined();
		expect(defaultValueKind("ANNIVERSARY", "3.0")).toBeUndefined();
		expect(defaultValueKind("X-NOT-A-THING", "4.0")).toBeUndefined();
	});

	test("structured properties carry their component count and comma rule", () => {
		expect(PROPERTY_REGISTRY.get("N")).toMatchObject({ components: 5, cardinality: "*1" });
		expect(PROPERTY_REGISTRY.get("ADR")).toMatchObject({ components: 7 });
		expect(PROPERTY_REGISTRY.get("ORG")).toMatchObject({ commaIsLiteral: true });
		expect(PROPERTY_REGISTRY.get("N")?.commaIsLiteral).toBeUndefined();
		expect(PROPERTY_REGISTRY.get("X-ANDROID-CUSTOM")).toMatchObject({
			components: 16,
			commaIsLiteral: true,
		});
	});

	test("every entry is uppercase with a kind for each version it lists", () => {
		for (const [name, spec] of PROPERTY_REGISTRY) {
			expect(name).toBe(name.toUpperCase());
			expect(spec.versions.length).toBeGreaterThan(0);
			expect(Array.isArray(spec.params)).toBe(true);
			for (const version of spec.versions)
				expect(defaultValueKind(name, version)).toBeDefined();
		}
	});

	test("common parameters grow with the version", () => {
		expect(COMMON_PARAMS["2.1"]).toContain("CHARSET");
		expect(COMMON_PARAMS["4.0"]).not.toContain("CHARSET");
		expect(COMMON_PARAMS["4.0"]).toContain("PREF");
	});

	test("property-specific parameters are never also common", () => {
		for (const [name, spec] of PROPERTY_REGISTRY) {
			for (const version of spec.versions) {
				for (const param of spec.params ?? []) {
					expect(COMMON_PARAMS[version], `${name};${param} in ${version}`).not.toContain(
						param,
					);
				}
			}
		}
		expect(PROPERTY_REGISTRY.get("ADR")?.params).toContain("LABEL");
		expect(PROPERTY_REGISTRY.get("NOTE")?.params).toContain("AUTHOR");
	});
});
