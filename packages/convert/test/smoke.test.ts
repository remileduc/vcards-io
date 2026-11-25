import { parseVCards } from "@vcards-io/vcard";
import { expect, test } from "vitest";
import manifest from "../package.json" with { type: "json" };
import { VERSION } from "../src/index.js";

test("VERSION matches package.json", () => {
	expect(VERSION).toBe(manifest.version);
});

// Without `resolve.tsconfigPaths` the workspace link answers with `dist`: stale code would pass.
test("a sibling package is read from its sources", () => {
	expect(() => parseVCards("", { maxInputBytes: 0 })).toThrow(
		expect.objectContaining({
			stack: expect.stringMatching(/packages[\\/]vcard[\\/]src[\\/]/),
		}),
	);
});
