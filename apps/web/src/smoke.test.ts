import { parseVCards } from "@vcards-io/vcard";
import { expect, test } from "vitest";

// The app has its own Vite config: without `resolve.tsconfigPaths` there, stale `dist` would pass.
test("a workspace package is read from its sources", () => {
	expect(() => parseVCards("", { maxInputBytes: 0 })).toThrow(
		expect.objectContaining({
			stack: expect.stringMatching(/packages[\\/]vcard[\\/]src[\\/]/),
		}),
	);
});
