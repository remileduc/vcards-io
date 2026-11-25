import { describe, expect, expectTypeOf, test } from "vitest";
import {
	ADDRESS_COMPONENT_KINDS,
	ADDRESS_CONTEXTS,
	type Address,
	type AddressComponent,
	type AddressComponentKind,
	type AddressContext,
	ANNIVERSARY_KINDS,
	type Anniversary,
	type AnniversaryKind,
	CALENDAR_KINDS,
	CARD_KINDS,
	CARD_VERSIONS,
	type Calendar,
	type CalendarKind,
	type Card,
	type CardKind,
	type CardVersion,
	CONTEXTS,
	type Context,
	type CryptoKey,
	DIRECTORY_KINDS,
	type Directory,
	type DirectoryKind,
	type EmailAddress,
	type FlagSet,
	GRAMMATICAL_GENDERS,
	type GrammaticalGender,
	type LanguagePref,
	LINK_KINDS,
	type Link,
	type LinkKind,
	MEDIA_KINDS,
	type Media,
	type MediaKind,
	NAME_COMPONENT_KINDS,
	type Name,
	type NameComponent,
	type NameComponentKind,
	type Nickname,
	type OnlineService,
	type Organization,
	PERSONAL_INFO_KINDS,
	PERSONAL_INFO_LEVELS,
	type PersonalInfo,
	type PersonalInfoKind,
	type PersonalInfoLevel,
	PHONE_FEATURES,
	PHONETIC_SYSTEMS,
	type Phone,
	type PhoneFeature,
	type PhoneticSystem,
	type Pronouns,
	RELATION_TYPES,
	type Relation,
	type RelationType,
	type SchedulingAddress,
	type SpeakToAs,
	TITLE_KINDS,
	type Title,
	type TitleKind,
	type VendorExtension,
} from "../src/index.js";
import { type Registry, readFixture } from "./helpers/fixtures.js";

const registry = readFixture<Registry>("rfc9553-registry.json");

/** Each table of RFC 9553 section 3.7.3, named by its property and first context, and our list. */
const LISTS = new Map<string, readonly string[]>([
	["contexts of Address", ADDRESS_CONTEXTS],
	["contexts of Calendar", CONTEXTS],
	["features of Phone", PHONE_FEATURES],
	["grammaticalGender of SpeakToAs", GRAMMATICAL_GENDERS],
	["kind of AddressComponent", ADDRESS_COMPONENT_KINDS],
	["kind of Anniversary", ANNIVERSARY_KINDS],
	["kind of Calendar", CALENDAR_KINDS],
	["kind of Card", CARD_KINDS],
	["kind of Directory", DIRECTORY_KINDS],
	["kind of Link", LINK_KINDS],
	["kind of Media", MEDIA_KINDS],
	["kind of NameComponent", NAME_COMPONENT_KINDS],
	["kind of PersonalInfo", PERSONAL_INFO_KINDS],
	["kind of Title", TITLE_KINDS],
	["level of PersonalInfo", PERSONAL_INFO_LEVELS],
	["phoneticSystem of Address", PHONETIC_SYSTEMS],
	["relation of Relation", RELATION_TYPES],
]);

/** The order the README promises, the RFC text's; the registry fixture is sorted and cannot tell. */
const ORDER = new Map<string, string>([
	["contexts of Address", "private work billing delivery"],
	["contexts of Calendar", "private work"],
	["features of Phone", "mobile voice text video main-number textphone fax pager"],
	["grammaticalGender of SpeakToAs", "animate common feminine inanimate masculine neuter"],
	[
		"kind of AddressComponent",
		"room apartment floor building number name block subdistrict district locality region postcode country direction landmark postOfficeBox separator",
	],
	["kind of Anniversary", "birth death wedding"],
	["kind of Calendar", "calendar freeBusy"],
	["kind of Card", "individual group org location device application"],
	["kind of Directory", "directory entry"],
	["kind of Link", "contact"],
	["kind of Media", "photo sound logo"],
	[
		"kind of NameComponent",
		"title given given2 surname surname2 credential generation separator",
	],
	["kind of PersonalInfo", "expertise hobby interest"],
	["kind of Title", "title role"],
	["level of PersonalInfo", "high medium low"],
	["phoneticSystem of Address", "ipa jyut piny"],
	[
		"relation of Relation",
		"acquaintance agent child co-resident co-worker colleague contact crush date emergency friend kin me met muse neighbor parent sibling spouse sweetheart",
	],
]);

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe("enumerated values", () => {
	const tables = registry.enumValues.map(
		(table) => [`${table.property} of ${table.contexts[0]}`, table] as const,
	);

	test("every table of the registry has a list, and every list a table", () => {
		expect(sorted(tables.map(([name]) => name))).toEqual(sorted([...LISTS.keys()]));
	});

	test.each(tables)("%s holds the registered values", (name, table) => {
		expect(sorted(LISTS.get(name) ?? [])).toEqual(sorted(table.values));
	});

	test("every list has an expected order, and every order a list", () => {
		expect(sorted([...ORDER.keys()])).toEqual(sorted([...LISTS.keys()]));
	});

	test.each([...LISTS])("%s keeps its order", (name, list) => {
		expect(list.join(" ")).toBe(ORDER.get(name));
	});

	test("the versions are the registered ones", () => {
		expect([...CARD_VERSIONS]).toEqual(registry.versions);
	});

	test("no list repeats a value or holds one that reads as a vendor value", () => {
		for (const [name, list] of LISTS) {
			expect(new Set(list).size, name).toBe(list.length);
			expect(
				list.filter((value) => value.includes(":")),
				name,
			).toEqual([]);
		}
	});

	test("contexts take the common values, with two more on an Address", () => {
		type Common =
			| Calendar
			| CryptoKey
			| Directory
			| EmailAddress
			| LanguagePref
			| Link
			| Media
			| Nickname
			| OnlineService
			| Organization
			| Phone
			| Pronouns
			| SchedulingAddress;
		expectTypeOf<NonNullable<Common["contexts"]>>().toEqualTypeOf<FlagSet<Context>>();
		expectTypeOf<NonNullable<Address["contexts"]>>().toEqualTypeOf<FlagSet<AddressContext>>();
		// The same thirteen types as the registry table of the common contexts.
		const common = registry.enumValues.find((table) => table.contexts.includes("Calendar"));
		expect(common?.contexts).toHaveLength(13);
	});

	test("every enumerated property takes its list or a vendor value, and nothing else", () => {
		type Vendor = VendorExtension;
		expectTypeOf<Card["kind"]>().toEqualTypeOf<CardKind | Vendor | undefined>();
		expectTypeOf<Card["version"]>().toEqualTypeOf<CardVersion>();
		expectTypeOf<Name["phoneticSystem"]>().toEqualTypeOf<PhoneticSystem | Vendor | undefined>();
		expectTypeOf<Address["phoneticSystem"]>().toEqualTypeOf<Name["phoneticSystem"]>();
		expectTypeOf<NameComponent["kind"]>().toEqualTypeOf<NameComponentKind | Vendor>();
		expectTypeOf<keyof NonNullable<Name["sortAs"]>>().toEqualTypeOf<
			NameComponentKind | Vendor
		>();
		expectTypeOf<SpeakToAs["grammaticalGender"]>().toEqualTypeOf<
			GrammaticalGender | Vendor | undefined
		>();
		expectTypeOf<Title["kind"]>().toEqualTypeOf<TitleKind | Vendor | undefined>();
		expectTypeOf<NonNullable<Phone["features"]>>().toEqualTypeOf<FlagSet<PhoneFeature>>();
		expectTypeOf<Calendar["kind"]>().toEqualTypeOf<CalendarKind | Vendor>();
		expectTypeOf<AddressComponent["kind"]>().toEqualTypeOf<AddressComponentKind | Vendor>();
		expectTypeOf<CryptoKey["kind"]>().toEqualTypeOf<Vendor | undefined>();
		expectTypeOf<Directory["kind"]>().toEqualTypeOf<DirectoryKind | Vendor>();
		expectTypeOf<Link["kind"]>().toEqualTypeOf<LinkKind | Vendor | undefined>();
		expectTypeOf<Media["kind"]>().toEqualTypeOf<MediaKind | Vendor>();
		expectTypeOf<Anniversary["kind"]>().toEqualTypeOf<AnniversaryKind | Vendor>();
		expectTypeOf<PersonalInfo["kind"]>().toEqualTypeOf<PersonalInfoKind | Vendor>();
		expectTypeOf<PersonalInfo["level"]>().toEqualTypeOf<
			PersonalInfoLevel | Vendor | undefined
		>();
		expectTypeOf<NonNullable<Relation["relation"]>>().toEqualTypeOf<FlagSet<RelationType>>();
		expectTypeOf<keyof FlagSet<"a" | "b">>().toEqualTypeOf<"a" | "b" | Vendor>();
	});
});
