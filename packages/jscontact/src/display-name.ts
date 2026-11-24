import type { Card, Name, NameComponent } from "./types.js";

/** Reading order of the kinds, for a Name whose components are in no stated order. */
const UNORDERED_KINDS: readonly string[] = [
	"title",
	"given",
	"given2",
	"surname",
	"surname2",
	"generation",
	"credential",
];

// No `pref` is the least preferred (section 1.5.3), whatever number another entry has. Not
// Infinity: two of them would compare as NaN.
const NO_PREF = Number.MAX_VALUE;

/**
 * The line a contact list shows for a valid Card, as Android picks it: the name, else a
 * nickname, an organization, a job title, a phone number, an email address, "(no name)".
 */
export function cardDisplayName(card: Card): string {
	// Android reads the job title only: its importer drops ROLE.
	const titles = Object.values(card.titles ?? {}).filter(
		(title) => (title.kind ?? "title") === "title",
	);
	return (
		firstText([card.name?.full, componentsName(card.name)]) ??
		firstText(byPreference(card.nicknames).map((nickname) => nickname.name)) ??
		firstText(
			Object.values(card.organizations ?? {}).map((organization) => organization.name),
		) ??
		firstText(titles.map((title) => title.name)) ??
		firstText(byPreference(card.phones).map((phone) => phone.number)) ??
		firstText(byPreference(card.emails).map((email) => email.address)) ??
		"(no name)"
	);
}

function firstText(values: readonly (string | undefined)[]): string | undefined {
	return values
		.map((value) => value?.trim())
		.find((value) => value !== undefined && value !== "");
}

function byPreference<Entry extends { pref?: number }>(map: Record<string, Entry> | undefined) {
	return Object.values(map ?? {}).toSorted((a, b) => (a.pref ?? NO_PREF) - (b.pref ?? NO_PREF));
}

function hasText({ kind, value }: NameComponent): boolean {
	return kind !== "separator" && value.trim() !== "";
}

function componentsName(name: Name | undefined): string {
	const components = name?.components ?? [];
	// Separators alone name nobody.
	if (!components.some(hasText)) return "";
	if (name?.isOrdered !== true) {
		// A kind outside the list, a vendor one, goes last.
		const rank = (kind: string) => {
			const index = UNORDERED_KINDS.indexOf(kind);
			return index === -1 ? UNORDERED_KINDS.length : index;
		};
		return components
			.filter(hasText)
			.toSorted((a, b) => rank(a.kind) - rank(b.kind))
			.map(({ value }) => value)
			.join(" ");
	}
	// Section 2.2.1.2: a separator component is verbatim and takes the place of the default one.
	let text = "";
	let afterValue = false;
	for (const { kind, value } of components) {
		if (kind !== "separator" && value.trim() === "") continue;
		if (kind !== "separator" && afterValue) text += name.defaultSeparator ?? " ";
		text += value;
		afterValue = kind !== "separator";
	}
	return text;
}
