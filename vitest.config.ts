import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "./workspace-alias.ts";

const libraries = ["vcard", "jscontact", "convert"];
const sourceRoots = ["apps/web", ...libraries.map((name) => `packages/${name}`)];
const gate = { lines: 80, functions: 80, branches: 80, statements: 80 };
// The Lit shell and components are covered by Playwright (milestone 7), not Vitest.
const webExcludes = ["src/main.ts", "src/components/**"];

// A threshold glob that matches no file passes, so a misnamed root has to fail here.
for (const root of sourceRoots) {
	if (!existsSync(new URL(`${root}/src`, import.meta.url))) {
		throw new Error(`vitest.config.ts: coverage source root "${root}/src" does not exist`);
	}
}

export default defineConfig({
	resolve: { alias: workspaceAlias },
	test: {
		projects: [
			"apps/web",
			...libraries.map((name) => ({
				extends: true as const,
				test: { name, root: `packages/${name}`, include: ["test/**/*.test.ts"] },
			})),
		],
		coverage: {
			provider: "v8",
			// json-summary feeds the README coverage badge written by ci.yml.
			reporter: ["text", "html", "json-summary"],
			// Matched from the repo root, or from the project root under --project: both forms.
			include: [...sourceRoots.map((root) => `${root}/src/**/*.ts`), "src/**/*.ts"],
			exclude: webExcludes.flatMap((path) => [`apps/web/${path}`, path]),
			thresholds: {
				...gate,
				// Per package too, so a well-covered library cannot mask a weak one.
				...Object.fromEntries(sourceRoots.map((root) => [`${root}/src/**`, gate])),
			},
		},
	},
});
