import { expect, test } from "vitest";
import manifest from "../package.json" with { type: "json" };
import { VERSION } from "../src/index.js";

test("VERSION matches package.json", () => {
	expect(VERSION).toBe(manifest.version);
});
