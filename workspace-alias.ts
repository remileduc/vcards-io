import { fileURLToPath } from "node:url";

// Mirrors the `paths` entry in tsconfig.base.json: Vite and Vitest resolve
// workspace packages from source, so dev and tests never need a prior build.
export const workspaceAlias = [
	{
		find: /^@vcards-io\/([^/]+)$/,
		replacement: fileURLToPath(new URL("packages/$1/src/index.ts", import.meta.url)),
	},
];
