import { defineConfig } from "vitest/config";
import { workspaceAlias } from "./workspace-alias.ts";

const libraries = ["vcard", "jscontact", "convert"];

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
			include: ["packages/*/src/**/*.ts", "apps/web/src/**/*.ts"],
			// The Lit shell and components are covered by Playwright (milestone 7), not Vitest.
			exclude: ["apps/web/src/main.ts", "apps/web/src/components/**"],
			thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
		},
	},
});
