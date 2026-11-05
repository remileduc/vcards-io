import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("package exports its version", () => {
	expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
