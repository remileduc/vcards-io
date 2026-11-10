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

| Folder     | Content                                                     |
|------------|-------------------------------------------------------------|
| `rfc/`     | Examples embedded in the vCard specifications, see below    |
| `android/` | AOSP-style 2.1 exports (stock / Google / Samsung Contacts)  |
| `apple/`   | iOS / macOS Contacts 3.0 exports                            |
| `google/`  | contacts.google.com "vCard for iOS" 3.0 exports             |
| `other/`   | Outlook, Thunderbird, Nextcloud, DAVx5, Fossify, ...        |

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
