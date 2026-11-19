Fixtures
========

Real-world and specification vCard samples used by the golden tests. Every
file under `fixtures/**/*.vcf` must parse with zero `error` issues, and its
reviewed `.model.json` / `.jscontact.json` snapshots live next to it.

`.model.json` is the `parseVCards` result (cards and issues; parameter maps
as objects, binary data as base64), written by `toMatchFileSnapshot` in
`packages/vcard/test/parse-fixtures.test.ts`. After an intended parser
change run `pnpm test -- --project vcard -u` and review the diff before
committing it. `.jscontact.json` arrives with the converter (M4).

| Folder       | Content                                                    |
| ------------ | ---------------------------------------------------------- |
| `rfc/`       | Examples embedded in the vCard specifications, see below   |
| `android/`   | AOSP-style 2.1 exports (stock / Google / Samsung Contacts) |
| `apple/`     | iOS / macOS Contacts 3.0 exports                           |
| `google/`    | contacts.google.com "vCard for iOS" 3.0 exports            |
| `other/`     | Outlook, Thunderbird, Nextcloud, DAVx5, Fossify, ...       |
| `jscontact/` | JSContact Cards as JSON, see the last section              |

Files prefixed `cozy-` come from the cozy/cozy-vcard test suite
(Copyright 2012 Cozy Cloud, MIT/X11 licence, see `COZY-LICENSE`).

Add your own anonymised exports with a short prefix naming the source and
the OS version, e.g. `pixel8-android15.vcf`. Strip photos you do not want
in the repository; a tiny 1x1 JPEG is enough to exercise the code paths.

Specification examples
----------------------

`rfc/` holds the examples printed in the specifications, cut from the
specification text with the document indentation removed and CRLF line
endings added; the vCard folding is kept as printed. `rfc6350-author.vcf`
(section 8), `rfc6350-kind.vcf`, `rfc6350-member.vcf`, `rfc6350-sync.vcf`
(section 7, the complete cards only), `rfc2426-examples.vcf` and
`versit21-examples.vcf` (the three MIME transport examples of section 3)
are complete cards as printed. The other files wrap property-level examples
in a synthetic `BEGIN:VCARD` / `VERSION:4.0` card (`3.0` for RFC 2426,
`2.1` for versit), with an `FN` added where the examples have none, so they
carry several `N` or `BDAY` lines on purpose:

| File                      | Source                                           |
| ------------------------- | ------------------------------------------------ |
| `versit21-properties.vcf` | vCard 2.1 section 2, one example per property    |
| `rfc2426-properties.vcf`  | RFC 2426 section 3, one example per property     |
| `rfc6350-properties.vcf`  | RFC 6350 section 6, one example per property     |
| `rfc6868-caret.vcf`       | RFC 6868 3.2, GEO with a caret-encoded parameter |
| `rfc9554-properties.vcf`  | RFC 9554 sections 2 to 5                         |
| `rfc9555-figures.vcf`     | RFC 9555, the vCard side of the figures          |
| `rfc-extensions.vcf`      | RFC 6474, 6715 and 8605 property examples        |

Three misprints are corrected: `BDAY;19531015T231000Z` in RFC 6350 (and the
same `DEATHDATE` line in RFC 6474) reads `BDAY:` / `DEATHDATE:`, the folded
RELATED text in RFC 6350 6.6.6 keeps the space between "Jane" and "Doe" that
the fold swallows in the RFC, and the RFC 2426 3.7.2 KEY example gets back
the `v` of `IENvbW11bmlj` that its second line drops (the PHOTO example in
the same RFC has it, and without it the base64 does not decode). Examples
with truncated base64 (`<...remainder of base64-encoded data...>`) are left
out. The parsed values are pinned by the `.model.json` beside each file; the
parser rules these examples exercise are asserted in
`packages/vcard/test/rfc-examples.test.ts`.

vCard 2.1 is not an RFC. Its specification (versit Consortium, 1996) is
linked from the main README; the examples were cut from a text conversion
of the RTF. Left out: the text/x-vCard copy of the Martin card,
which the RTF misprints as `VERSION:2.1N:Martin;Stephen`, and the
hypothetical `X-DL` extension that nests vCards outside AGENT, which no
importer reads. The inline GIF and WAVE values are the first three base64
lines the spec prints, so they decode to truncated files with intact magic
bytes. The `PHOTO;GIF;MIME:<<…>` content-id reference in the transport
example parses with a `binary-without-encoding` warning on purpose.

JSContact
---------

`jscontact/` is not vCard: its files are JSON, each an object keyed by a
name, used by the tests of `@vcards-io/jscontact` and later by the
converter.

| File                       | Content                                         |
| -------------------------- | ----------------------------------------------- |
| `rfc9553-figures.json`     | RFC 9553 figures, each as a complete Card       |
| `rfc9553-registry.json`    | RFC 9553 section 3: types, properties, enums    |
| `constraints-invalid.json` | one Card per rule of the RFC, breaking it       |
| `constraints-valid.json`   | Cards a validator must accept                   |

`rfc9553-figures.json` holds the JSON of every figure of RFC 9553, cut
from the RFC text and re-indented. Most figures print the members of a
Card without the Card: those are wrapped in `"@type": "Card"` and
`"version": "2.0"`, which a figure's own members override (figure 6 keeps
its "1.0" and its uid). Figure 18 prints a member of a Name and is wrapped
in `name` as well. Left out: figures 2 and 5 (ABNF), and figure 7, a lone
`"version": "1.0"`, which as a Card would lack the uid that version
requires. Two misprints are corrected: the `data:` URI of figure 35, which
the RFC breaks over eleven lines "only for demonstration purposes", is
joined, and figure 36 gets the closing brace of `directories` back. The
rest is as printed, the leading space of `" Watthana"` (figure 32), the
language tag `jp` (figure 33) and the truncated photo of figure 38
included.

`rfc9553-registry.json` is section 3 of RFC 9553 turned inside out: for
each object type its properties with their type signature (Table 2, plus
`vCardName`, `vCardParams` and `vCardProps` from RFC 9555 section 5.3),
the type names (Tables 4 and 5, plus `JCardProp`), the enum values (Tables
6 to 22) and the versions (with "2.0" from RFC 9982). `reservedProperties`
maps each reserved name to the types it is reserved in, `*` for `extra`,
which is reserved everywhere; `id`, `addressBookIds` (Card) and `blobId`
(Media) come from RFC 9610, JMAP for Contacts. The file was compared with
the live registry at iana.org on 2026-11-19 (last updated 2026-09-22):
nothing else has been registered since the RFCs. Table 2 contradicts
sections 1 and 2 in four places, and the sections are the definition:
`cryptoKeys` of Card and `pronouns` of Pronouns are missing and were
added; `preferredLanguages` reads `String[LanguagePref]` and
`organizationId` reads `String` where the sections say `Id[LanguagePref]`
and `Id`. The live registry carries the same four slips.

The two `constraints-*.json` files are written by hand. Each entry has the
`section` and the `rule` it illustrates and a `card`; the same names are
the rows of `docs/jscontact-constraints.md`, and a test keeps both in
step. Add a case to the file and its row to the document together.
