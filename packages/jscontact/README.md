@vcards-io/jscontact
====================

JSContact 2.0 (RFC 9553 as updated by RFC 9982) in TypeScript: the types
of a Card, a validator that is the runtime form of those types, JSON
Pointer, PatchObject and localizations, and the reader and writer of a
JSON backup of Cards. Vanilla TypeScript, ES2025, no runtime dependency.
Part of [vcards-io](https://github.com/remileduc/vcards-io); the full
specification is `docs/plan.md` at the repository root.

Card matching, structured diff and merge are planned (milestone 4.5) and
not there yet.

Install
-------

```
npm install @vcards-io/jscontact
```

ESM only. Needs Node 24 or later, or a current browser: the output is
ES2025 with no down-levelling and no polyfill. `newUid` relies on the
platform `crypto.randomUUID`.

Usage
-----

```ts
import {
	cardDisplayName,
	localize,
	parseJSContact,
	stringifyCards,
	validateCard,
} from "@vcards-io/jscontact";

// Text or a parsed value in: one Card or an array. Never throws on input.
const { cards, issues } = parseJSContact(await file.text());

// Stable, human-readable JSON out: properties in RFC order, pictures last.
const backup = stringifyCards(cards);

// A value from anywhere else: `card` is the value itself, typed, or null.
const { card, issues: found } = validateCard(JSON.parse(text));
if (card !== null) {
	console.log(cardDisplayName(card));
	// The Card as it reads in German; validate the result before reading it.
	const german = validateCard(localize(card, "de").card).card;
}
```

`validateCard`, `parseJSContact`, `applyPatchObject`, `localize` and the
`jsonPointer` functions take any value, hostile JSON included, and
report through `CardIssue` objects instead of throwing. `cardDisplayName`,
`normalizeCard` and `stringifyCards` expect a Card the validator
accepted.

```ts
interface CardIssue { severity: "error" | "warning" | "info"; code: CardIssueCode; message: string; path: string; card?: number }
```

`path` is a JSON Pointer from the root of the value checked, `""` being
the root. `code` is a union of string literals built from one exported
list per source (`VALIDATION_ISSUE_CODES`, `PATCH_ISSUE_CODES`,
`BACKUP_ISSUE_CODES`, plus `COMMON_ISSUE_CODES` for the cap of 1000
issues per code), so a `Record<CardIssueCode, string>` is a complete
string table and `message` is only the English fallback. `card` is set by
`parseJSContact` alone: the position of the Card in the input.

The types
---------

One interface per object of RFC 9553, the three properties of RFC 9555
(`vCardProps`, `vCardParams`, `vCardName`) and one `as const` list per
enumerated property (`CARD_KINDS`, `PHONE_FEATURES`, `RELATION_TYPES`,
...), in the order the RFC lists the values.

- An enumerated property is `Kind | VendorExtension`. A vendor value
  (`example.com:x`) fits anywhere; a misspelt word does not compile.
- A set (`contexts`, `features`, `relation`, `members`, `keywords`) maps
  its keys to `true`.
- `uid` is optional, as RFC 9982 has it.
- "At least one of" and the other rules between properties are not in
  the types: they stay optional properties with a comment.

At runtime an enumerated property may hold a word its list does not
have: a later JSContact version may register one, and such a Card must
still load. Read these properties with `isListed(list, value)`, never by
looking for a colon.

Validation
----------

`validateCard(value)` answers one question: can this value be read as the
`Card` the types describe? It is not an RFC 9553 conformance checker.
Every issue it raises is an `error`, and one is enough for `card` to be
`null`.

| Checked                                  | Code                             |
| ---------------------------------------- | -------------------------------- |
| the value is a JSON object               | `card-not-an-object`             |
| every value, at any depth, is JSON: no   | `value-not-json`                 |
| `undefined`, `NaN`, infinity or bigint   |                                  |
| a known property has its JSON type;      | `property-wrong-type`            |
| `null` is no value                       |                                  |
| a mandatory property is there            | `property-missing`               |
| `@type`, where set, is the expected type | `type-mismatch`                  |
| `version` is "1.0" or "2.0"              | `version-unsupported`            |
| a set holds `true` only                  | `set-value-not-true`             |
| an Id has 1 to 255 of `A-Za-z0-9-_`      | `id-invalid`                     |
| a `vCardProps` entry is a jCard property | `jcard-prop-invalid`             |
| nesting of 64 levels at most             | `card-too-deep`                  |
| 100 000 members at most, and no member   | `card-too-large`                 |
| name over 1024 characters                |                                  |
| no own `__proto__` key, anywhere         | `prototype-key`                  |

Not checked, and kept as they are: unknown and miscased properties,
enumerated values, reserved names, vendor name syntax, formats (dates,
URIs, language tags, time zones), ranges (`pref`, month, day) and every
rule between properties. A Card that passes may still have a Name with
neither `full` nor `components`: code reading a Card copes with it. The
patches of `localizations` are not applied either; `localize` reports
one that cannot apply, and its result goes through `validateCard` before
it is read.

Patches and pointers
--------------------

| Function                          | What it does                                     |
| --------------------------------- | ------------------------------------------------ |
| `jsonPointer.parse` / `escape`    | RFC 6901 pointer to tokens; a token escaped      |
| `jsonPointer.get`                 | the value at a pointer, `undefined` when none    |
| `jsonPointer.set` / `remove`      | change in place; `false` when they cannot        |
| `applyPatchObject(target, patch)` | RFC 9553 section 1.4.3 on a copy, all or nothing |
| `localize(card, language)`        | section 2.7.1: the Card in one of its languages  |

Pointers follow own properties only and never reach a prototype. A
PatchObject is checked whole before anything is applied; one invalid
patch rejects it, and every invalid one is reported.

JSON backup
-----------

`stringifyCards(cards)` writes an array of Cards as two-space JSON:
properties in the order of RFC 9553, unknown and vendor ones after by
name, `media` last, empty maps left out (`normalizeCard` does the same
for one Card). Each Card is stamped with
`"remileduc.github.io:formatVersion": 1`, the format of the file, so a
later version can repair what an earlier one wrote.

`parseJSContact(input, options?)` takes that text, or any JSON text or
parsed value holding one Card or an array, removes the stamp and
validates each Card. Refused Cards are left out, counted in `refused`
and reported with their index, up to the cap of 1000 issues per code. A
Card of version "1.0" comes back as "2.0" with an `info`. A stamp that
is no positive integer is an error; a stamp from a later format is a
warning and the Card is read as it stands. A byte order mark before the
text is skipped.

Text over 64 Mi characters is not parsed, unless `maxTextLength` says
otherwise (a value that is no positive integer throws a `RangeError`).
`stringifyCards` has no such cap: to read back a backup that may be
larger, pass a `maxTextLength` that fits it.

Exports
-------

Two tiers. The stable contract follows semver: a breaking change is a
major release.

| Stable contract | Exports                                                       |
| --------------- | ------------------------------------------------------------- |
| Types           | `Card` and every object type of RFC 9553, `Resource`,         |
|                 | `JSContactObject`, `JCardProp`, `JCardValue`, `VCardParams`,  |
|                 | `PatchObject`, `Id`, `UTCDateTime`, `FlagSet`, `Contexts`,    |
|                 | `VendorExtension`                                             |
| Enumerations    | the eighteen `as const` lists and their union types,          |
|                 | `isListed`                                                    |
| Validation      | `validateCard`, `ValidationResult`                            |
| Backup          | `parseJSContact`, `ParseJSContactOptions`,                    |
|                 | `ParseJSContactResult`, `stringifyCards`, `normalizeCard`,    |
|                 | `FORMAT_STAMP`, `FORMAT_VERSION`                              |
| Patches         | `jsonPointer`, `applyPatchObject`, `PatchResult`, `localize`, |
|                 | `LocalizeResult`                                              |
| Utilities       | `equal`, `cardDisplayName`, `isId`, `nextId`, `newUid`,       |
|                 | `VERSION`                                                     |
| Issues          | `CardIssue`, `CardIssueSeverity`, `CardIssueCode`, the four   |
|                 | `*_ISSUE_CODES` lists and their types                         |
| Vendor          | `VENDOR_PREFIX`, `VendorKey`                                  |

Adding, renaming or removing an issue code is a major release: a
`Record<CardIssueCode, string>` table stops compiling when the union
changes. A value added to an enumerated list follows the IANA registry
and is a minor release.

The rest is exported for the sibling `@vcards-io` packages and carries no
stability promise. It is the vocabulary of the phone importers, which may
change in any release; pin an exact version if you depend on it.

| For sibling packages | Exports                                             |
| -------------------- | --------------------------------------------------- |
| Nickname kinds       | `NICKNAME_KIND`, `NICKNAME_KINDS`, `NicknameKind`   |
| Relations            | `VENDOR_RELATIONS`, `VendorRelation`                |

Ids are never random: `nextId(map, prefix)` gives the smallest unused
`<prefix><n>`, so the same input gives the same Card. No function of
this package generates a `uid`; `newUid` is there for the application to
call.
