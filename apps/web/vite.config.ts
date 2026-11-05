import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "../../workspace-alias.ts";

const csp = [
	"default-src 'self'",
	"img-src 'self' data: blob:",
	"media-src data: blob:",
	"connect-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
].join("; ");

// Only the built site gets the CSP: the dev server needs the HMR websocket and inline styles.
function cspMeta(): Plugin {
	return {
		name: "csp-meta",
		apply: "build",
		transformIndexHtml: () => [
			{
				tag: "meta",
				attrs: { "http-equiv": "Content-Security-Policy", content: csp },
				injectTo: "head-prepend",
			},
		],
	};
}

export default defineConfig({
	// GitHub Pages serves the site under /vcards-io/; dev and preview use the same path.
	base: "/vcards-io/",
	plugins: [cspMeta()],
	resolve: { alias: workspaceAlias },
	build: {
		target: "esnext",
		sourcemap: true,
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
});
