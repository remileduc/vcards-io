import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { encodeBase64, type ParseResult, PROPERTY_REGISTRY, parseVCards } from "../src/index.js";

const root = `${fileURLToPath(import.meta.url).replace(/[^/]*$/, "")}../../../fixtures/`;
// Every .vcf present, so an untracked local export is tested too without being named here.
const files = readdirSync(root, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((dir) => readdirSync(`${root}${dir.name}`).map((f) => `${dir.name}/${f}`))
	.filter((f) => f.endsWith(".vcf"))
	.sort();

// Every warning a fixture is allowed to raise, each a defect of the input itself.
// A fixture not listed here must parse without a warning.
const EXPECTED_WARNINGS: Record<string, string[]> = {
	// `http\://` URLs, a `\NARBITRARY_STRING` property and an unindented continuation.
	"google/cozy-google-full.vcf": [
		"invalid-property-name",
		"unindented-continuation",
		...Array<string>(5).fill("uri-escaped-colon"),
	],
	"google/cozy-google.vcf": ["uri-escaped-colon"],
	// A BEGIN:VLIST block between the cards.
	"other/cozy-contactA-sogo.vcf": Array<string>(6).fill("line-outside-card"),
	// NOTE declares UTF-8 but holds latin-1 bytes.
	"other/cozy-contactA-thundersync.vcf": ["charset-fallback"],
	// A photo referenced by MIME content id, which no importer can use.
	"rfc/versit21-examples.vcf": ["binary-without-encoding"],
};

// A registry property may only end up untyped when the parser said why on that line.
const UNTYPED_REASONS = new Set([
	"binary-without-encoding",
	"calscale-unsupported",
	"invalid-value",
	"timestamp-incomplete",
]);

/** The model as reviewed JSON: parameter maps as objects, binary data as base64. */
function toModelJson(result: ParseResult): string {
	const json = JSON.stringify(
		result,
		(_key, value: unknown) => {
			if (value instanceof Map) return Object.fromEntries(value);
			if (value instanceof Uint8Array) return encodeBase64(value);
			return value;
		},
		"\t",
	);
	return `${json}\n`;
}

describe("fixtures parse without errors", () => {
	test.each(files)("%s", async (file) => {
		const bytes = readFileSync(`${root}${file}`);
		const source = new TextDecoder().decode(bytes);
		// A BEGIN right after an empty AGENT: line is the 2.1 inline agent, not a card.
		const lines = source.split(/\r?\n/);
		const expected = lines.filter(
			(l, i) => /^BEGIN:VCARD$/i.test(l) && !/^AGENT:\s*$/i.test(lines[i - 1] ?? ""),
		).length;
		const result = parseVCards(bytes);
		const { cards, issues } = result;
		expect(cards).toHaveLength(expected);
		expect(issues.filter((i) => i.severity === "error")).toEqual([]);
		expect(
			issues
				.filter((i) => i.severity === "warning")
				.map((i) => i.code)
				.sort(),
		).toEqual([...(EXPECTED_WARNINGS[file] ?? [])].sort());
		for (const card of cards) {
			// FN is optional in 2.1 (versit 2.2.1); N is what every 2.1 writer emits.
			const name = card.properties.find(
				(p) => p.name === (card.version === "2.1" ? "N" : "FN"),
			);
			expect(
				name,
				`${file}: card at line ${card.properties[0]?.line} has no name`,
			).toBeDefined();
			if (name?.value.kind === "text") expect(name.value.value).not.toBe("");
			for (const p of card.properties) {
				if (p.value.kind !== "unknown" || !PROPERTY_REGISTRY.has(p.name)) continue;
				const reasons = issues.filter(
					(i) => i.line === p.line && UNTYPED_REASONS.has(i.code),
				);
				expect(reasons, `${file}:${p.line} ${p.name}`).not.toEqual([]);
			}
		}
		// Reviewed snapshot beside the fixture; `vitest -u` rewrites it after an intended change.
		await expect(toModelJson(result)).toMatchFileSnapshot(
			`${root}${file.replace(/\.vcf$/, ".model.json")}`,
		);
	});
});
