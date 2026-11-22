import { describe, expect, expectTypeOf, test } from "vitest";
import type {
	Address,
	AddressComponent,
	Anniversary,
	Author,
	Calendar,
	Card,
	CryptoKey,
	Directory,
	EmailAddress,
	JCardProp,
	JSContactObject,
	LanguagePref,
	Link,
	Media,
	Name,
	NameComponent,
	Nickname,
	Note,
	OnlineService,
	Organization,
	OrgUnit,
	PartialDate,
	PatchObject,
	PersonalInfo,
	Phone,
	Pronouns,
	Relation,
	Resource,
	SchedulingAddress,
	SpeakToAs,
	Timestamp,
	Title,
	VendorExtension,
} from "../src/index.js";
import { FIGURES } from "./helpers/figures.js";
import { type Registry, readFixture } from "./helpers/fixtures.js";
import { MANDATORY } from "./helpers/mandatory.js";

interface ObjectTypes {
	Address: Address;
	AddressComponent: AddressComponent;
	Anniversary: Anniversary;
	Author: Author;
	Calendar: Calendar;
	Card: Card;
	CryptoKey: CryptoKey;
	Directory: Directory;
	EmailAddress: EmailAddress;
	LanguagePref: LanguagePref;
	Link: Link;
	Media: Media;
	Name: Name;
	NameComponent: NameComponent;
	Nickname: Nickname;
	Note: Note;
	OnlineService: OnlineService;
	OrgUnit: OrgUnit;
	Organization: Organization;
	PartialDate: PartialDate;
	PersonalInfo: PersonalInfo;
	Phone: Phone;
	Pronouns: Pronouns;
	Relation: Relation;
	SchedulingAddress: SchedulingAddress;
	SpeakToAs: SpeakToAs;
	Timestamp: Timestamp;
	Title: Title;
}

/** RFC 9553 Table 2: each object, its properties, their type signature. RFC 9555 is added below. */
const PROPERTIES = {
	Address: {
		"@type": "String",
		components: "AddressComponent[]",
		contexts: "String[Boolean]",
		coordinates: "String",
		countryCode: "String",
		defaultSeparator: "String",
		full: "String",
		isOrdered: "Boolean",
		phoneticScript: "String",
		phoneticSystem: "String",
		pref: "UnsignedInt",
		timeZone: "String",
	},
	AddressComponent: {
		"@type": "String",
		kind: "String",
		phonetic: "String",
		value: "String",
	},
	Anniversary: {
		"@type": "String",
		date: "PartialDate|Timestamp",
		kind: "String",
		place: "Address",
	},
	Author: {
		"@type": "String",
		name: "String",
		uri: "String",
	},
	Calendar: {
		"@type": "String",
		contexts: "String[Boolean]",
		kind: "String",
		label: "String",
		mediaType: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	Card: {
		"@type": "String",
		addresses: "Id[Address]",
		anniversaries: "Id[Anniversary]",
		calendars: "Id[Calendar]",
		created: "UTCDateTime",
		cryptoKeys: "Id[CryptoKey]",
		directories: "Id[Directory]",
		emails: "Id[EmailAddress]",
		keywords: "String[Boolean]",
		kind: "String",
		language: "String",
		links: "Id[Link]",
		localizations: "String[PatchObject]",
		media: "Id[Media]",
		members: "String[Boolean]",
		name: "Name",
		nicknames: "Id[Nickname]",
		notes: "Id[Note]",
		onlineServices: "Id[OnlineService]",
		organizations: "Id[Organization]",
		personalInfo: "Id[PersonalInfo]",
		phones: "Id[Phone]",
		preferredLanguages: "Id[LanguagePref]",
		prodId: "String",
		relatedTo: "String[Relation]",
		schedulingAddresses: "Id[SchedulingAddress]",
		speakToAs: "SpeakToAs",
		titles: "Id[Title]",
		uid: "String",
		updated: "UTCDateTime",
		version: "String",
	},
	CryptoKey: {
		"@type": "String",
		contexts: "String[Boolean]",
		kind: "String",
		label: "String",
		mediaType: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	Directory: {
		"@type": "String",
		contexts: "String[Boolean]",
		kind: "String",
		label: "String",
		listAs: "UnsignedInt",
		mediaType: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	EmailAddress: {
		"@type": "String",
		address: "String",
		contexts: "String[Boolean]",
		label: "String",
		pref: "UnsignedInt",
	},
	LanguagePref: {
		"@type": "String",
		contexts: "String[Boolean]",
		language: "String",
		pref: "UnsignedInt",
	},
	Link: {
		"@type": "String",
		contexts: "String[Boolean]",
		kind: "String",
		label: "String",
		mediaType: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	Media: {
		"@type": "String",
		contexts: "String[Boolean]",
		kind: "String",
		label: "String",
		mediaType: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	Name: {
		"@type": "String",
		components: "NameComponent[]",
		defaultSeparator: "String",
		full: "String",
		isOrdered: "Boolean",
		phoneticScript: "String",
		phoneticSystem: "String",
		sortAs: "String[String]",
	},
	NameComponent: {
		"@type": "String",
		kind: "String",
		phonetic: "String",
		value: "String",
	},
	Nickname: {
		"@type": "String",
		contexts: "String[Boolean]",
		name: "String",
		pref: "UnsignedInt",
	},
	Note: {
		"@type": "String",
		author: "Author",
		created: "UTCDateTime",
		note: "String",
	},
	OnlineService: {
		"@type": "String",
		contexts: "String[Boolean]",
		label: "String",
		pref: "UnsignedInt",
		service: "String",
		uri: "String",
		user: "String",
	},
	OrgUnit: {
		"@type": "String",
		name: "String",
		sortAs: "String",
	},
	Organization: {
		"@type": "String",
		contexts: "String[Boolean]",
		name: "String",
		sortAs: "String",
		units: "OrgUnit[]",
	},
	PartialDate: {
		"@type": "String",
		calendarScale: "String",
		day: "UnsignedInt",
		month: "UnsignedInt",
		year: "UnsignedInt",
	},
	PersonalInfo: {
		"@type": "String",
		kind: "String",
		label: "String",
		level: "String",
		listAs: "UnsignedInt",
		value: "String",
	},
	Phone: {
		"@type": "String",
		contexts: "String[Boolean]",
		features: "String[Boolean]",
		label: "String",
		number: "String",
		pref: "UnsignedInt",
	},
	Pronouns: {
		"@type": "String",
		contexts: "String[Boolean]",
		pref: "UnsignedInt",
		pronouns: "String",
	},
	Relation: {
		"@type": "String",
		relation: "String[Boolean]",
	},
	SchedulingAddress: {
		"@type": "String",
		contexts: "String[Boolean]",
		label: "String",
		pref: "UnsignedInt",
		uri: "String",
	},
	SpeakToAs: {
		"@type": "String",
		grammaticalGender: "String",
		pronouns: "Id[Pronouns]",
	},
	Timestamp: {
		"@type": "String",
		utc: "UTCDateTime",
	},
	Title: {
		"@type": "String",
		kind: "String",
		name: "String",
		organizationId: "Id",
	},
} as const satisfies Record<keyof ObjectTypes, Record<string, string>>;

type OfRfc9555<Type> = "vCardName" | "vCardParams" | (Type extends "Card" ? "vCardProps" : never);

interface Named extends ObjectTypes {
	String: string;
	Boolean: boolean;
	UnsignedInt: number;
	UTCDateTime: string;
	Id: string;
	PatchObject: PatchObject;
	"PartialDate|Timestamp": PartialDate | Timestamp;
}

/** The loosest TypeScript type a signature of the RFC allows: `Id[Phone]`, `OrgUnit[]`, `String`. */
type Of<Signature> = Signature extends keyof Named
	? Named[Signature]
	: Signature extends `${infer Item}[]`
		? Of<Item>[]
		: Signature extends `${"String" | "Id"}[${infer Value}]`
			? { [key: string]: Of<Value> | undefined }
			: never;

/** The properties of an object whose declared type does not fit their signature. */
type Mistyped<T extends keyof ObjectTypes> = {
	[P in keyof (typeof PROPERTIES)[T]]: P extends keyof ObjectTypes[T]
		? NonNullable<ObjectTypes[T][P]> extends Of<(typeof PROPERTIES)[T][P]>
			? never
			: P
		: P;
}[keyof (typeof PROPERTIES)[T]];

/** Property names an interface declares: its vendor index signature and vendor keys left out. */
type DeclaredKeys<T> = keyof { [K in keyof T as K extends VendorExtension ? never : K]: T[K] };
type RequiredKeys<T> = keyof {
	[K in keyof T as K extends VendorExtension
		? never
		: object extends Pick<T, K>
			? never
			: K]: T[K];
};

const card = (value: Card): Card => value;
const phone = (value: Phone): Phone => value;
const name = (value: Name): Name => value;
const link = (value: Link): Link => value;

describe("object types against the registry", () => {
	const registry = readFixture<Registry>("rfc9553-registry.json");
	const rfc9555 = (type: string) => ({
		vCardName: "String",
		vCardParams: "String[String|String[]]",
		...(type === "Card" ? { vCardProps: "JCardProp[]" } : {}),
	});

	test("the table above is the property registry of the RFC", () => {
		const listed = Object.entries(PROPERTIES).map(([type, properties]) => [
			type,
			{ ...properties, ...rfc9555(type) },
		]);
		expect(Object.fromEntries(listed)).toEqual(registry.properties);
	});

	test("every interface declares the registered properties, no more and no less", () => {
		type Listed = {
			[T in keyof ObjectTypes]: keyof (typeof PROPERTIES)[T] | OfRfc9555<T>;
		};
		type Actual = { [T in keyof ObjectTypes]: DeclaredKeys<ObjectTypes[T]> };
		expectTypeOf<Actual>().toEqualTypeOf<Listed>();
	});

	test("every property has a type its signature allows", () => {
		expectTypeOf<{ [T in keyof ObjectTypes]: Mistyped<T> }[keyof ObjectTypes]>().toBeNever();
		expectTypeOf<Of<"Id[Phone]">>().toEqualTypeOf<{ [key: string]: Phone | undefined }>();
		expectTypeOf<Of<"OrgUnit[]">>().toEqualTypeOf<OrgUnit[]>();
		expectTypeOf<Of<"String[Boolean]">>().toEqualTypeOf<{
			[key: string]: boolean | undefined;
		}>();
		expectTypeOf<Of<"NoSuchType">>().toBeNever();
	});

	test("the RFC 9555 properties and vendor properties are those of every object", () => {
		expectTypeOf<ObjectTypes[keyof ObjectTypes]>().toExtend<JSContactObject>();
		expectTypeOf<JSContactObject["vCardName"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<JSContactObject["vCardParams"]>().toEqualTypeOf<
			Record<string, string | string[]> | undefined
		>();
		expectTypeOf<Card["vCardProps"]>().toEqualTypeOf<JCardProp[] | undefined>();
		expectTypeOf<Phone[VendorExtension]>().toBeUnknown();
	});

	test("the mandatory properties are required, every other one is optional", () => {
		type Listed = { [T in keyof ObjectTypes]: (typeof MANDATORY)[T][number] };
		type Actual = { [T in keyof ObjectTypes]: RequiredKeys<ObjectTypes[T]> };
		expectTypeOf<Actual>().toEqualTypeOf<Listed>();
		for (const [type, names] of Object.entries(MANDATORY)) {
			expect(Object.keys(registry.properties[type] ?? {})).toEqual(
				expect.arrayContaining([...names]),
			);
		}
	});

	test("the resource types share the properties of Resource", () => {
		expectTypeOf<Calendar | CryptoKey | Directory | Link | Media>().toExtend<Resource>();
		expectTypeOf<DeclaredKeys<Link>>().toEqualTypeOf<DeclaredKeys<Resource>>();
	});
});

describe("RFC 9553 figures", () => {
	test("the literals the compiler checked are the fixture file", () => {
		expect(FIGURES).toEqual(readFixture("rfc9553-figures.json"));
	});

	test("every figure holding JSON is there, but the lone version of figure 7", () => {
		const numbers = Object.keys(FIGURES).map((name) => Number(name.replace("figure-", "")));
		const notCards = [2, 5, 7];
		expect(numbers).toEqual(
			Array.from({ length: 44 }, (_, i) => i + 1).filter((n) => !notCards.includes(n)),
		);
	});
});

describe("what the types refuse", () => {
	test("a misspelt standard property, having no colon, is not a vendor property", () => {
		// @ts-expect-error: "nmae" is neither declared nor a vendor name
		card({ "@type": "Card", version: "2.0", nmae: { full: "John Doe" } });
		// @ts-expect-error: the same inside a nested object
		phone({ number: "tel:+1-555-555-5555", lable: "home" });
	});

	test("a mandatory property left out", () => {
		// @ts-expect-error: version is missing
		card({ "@type": "Card" });
		// @ts-expect-error: number is missing
		phone({ features: { voice: true } });
	});

	test("an enumerated value that is neither registered nor vendor", () => {
		// @ts-expect-error: unknown value
		card({ "@type": "Card", version: "2.0", kind: "robot" });
		// @ts-expect-error: values are case-sensitive
		card({ "@type": "Card", version: "2.0", kind: "Individual" });
		// @ts-expect-error: unknown key of a set
		phone({ number: "tel:+1-555-555-5555", features: { cell: true } });
		// @ts-expect-error: billing is a context of an Address only
		phone({ number: "tel:+1-555-555-5555", contexts: { billing: true } });
		// @ts-expect-error: no such name component kind
		name({ full: "John Doe", sortAs: { family: "Doe" } });
	});

	test("a set whose value is not true", () => {
		// @ts-expect-error: false is not a way to leave a feature out
		phone({ number: "tel:+1-555-555-5555", features: { voice: false } });
		// @ts-expect-error: the same for keywords
		card({ "@type": "Card", version: "2.0", keywords: { internet: false } });
		// @ts-expect-error: and for members
		card({ "@type": "Card", version: "2.0", kind: "group", members: { "urn:uuid:x": false } });
	});

	test("a wrong @type, a version that is not registered", () => {
		// @ts-expect-error: a Phone is not a Nickname
		phone({ "@type": "Nickname", number: "tel:+1-555-555-5555" });
		// @ts-expect-error: Resource is not a type of its own
		link({ "@type": "Resource", uri: "https://example.com/" });
		// @ts-expect-error: no such version
		card({ "@type": "Card", version: "3.0" });
	});

	test("a jCard property without a value", () => {
		const full: JCardProp = ["x-foo", { group: "item1" }, "unknown", "bar"];
		expect(full).toHaveLength(4);
		// @ts-expect-error: name, parameters and type only
		const short: JCardProp = ["x-foo", {}, "unknown"];
		expect(short).toHaveLength(3);
	});
});

describe("what the types accept", () => {
	test("a vendor property on any object, with any value", () => {
		const extended = card({
			"@type": "Card",
			version: "2.0",
			"example.com:foo": { bar: [1, null] },
			phones: { p1: { number: "tel:+1-555-555-5555", "example.com:carrier": "ACME" } },
		});
		expectTypeOf(extended["example.com:foo"]).toBeUnknown();
	});

	test("a vendor value wherever a value is enumerated", () => {
		card({
			"@type": "Card",
			version: "2.0",
			kind: "example.com:baz",
			name: {
				components: [{ kind: "example.com:clan", value: "MacLeod" }],
				sortAs: { "example.com:clan": "MacLeod" },
				phoneticSystem: "example.com:sampa",
			},
			phones: { p1: { number: "1", features: { "example.com:satellite": true } } },
			addresses: {
				a1: { full: "x", contexts: { billing: true, "example.com:depot": true } },
			},
			cryptoKeys: { k1: { uri: "https://example.com/key", kind: "example.com:pgp" } },
		});
		expectTypeOf<Card["kind"]>().toEqualTypeOf<
			| "individual"
			| "group"
			| "org"
			| "location"
			| "device"
			| "application"
			| VendorExtension
			| undefined
		>();
	});

	test("a Card without uid, as RFC 9982 allows", () => {
		expectTypeOf<Card["uid"]>().toEqualTypeOf<string | undefined>();
		expect(card({ "@type": "Card", version: "2.0" }).uid).toBeUndefined();
	});

	test("the date of an Anniversary narrows on @type", () => {
		const date = { year: 1953 } as Anniversary["date"];
		if (date["@type"] === "Timestamp") expectTypeOf(date).toEqualTypeOf<Timestamp>();
		else expectTypeOf(date).toEqualTypeOf<PartialDate>();
		// @ts-expect-error: a Timestamp must say so, PartialDate being the default
		const implicit: Timestamp = { utc: "2019-10-15T23:10:00Z" };
		expect(implicit.utc).toBeDefined();
	});
});
