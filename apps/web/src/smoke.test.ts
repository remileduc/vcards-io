import { VERSION } from "@vcards-io/vcard";
import { expect, test } from "vitest";

test("workspace packages resolve from the app", () => {
	expect(VERSION).toBeTypeOf("string");
});
