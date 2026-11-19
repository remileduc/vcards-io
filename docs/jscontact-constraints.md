JSContact constraint checklist
==============================

Every requirement RFC 9553 puts on a Card (sections 1 and 2), with the
change of RFC 9982 and the three properties of RFC 9555 section 2.15. It is
the work list of `validateCard` (milestone 3, checkpoint 3): each row has a
Card that breaks the rule, or that a validator must accept, under the same
name in `fixtures/jscontact/constraints-invalid.json` and
`constraints-valid.json`. A test keeps the tables and the two files in
step (`packages/jscontact/test/fixtures.test.ts`).

"Invalid" is the RFC's word. Which rows the validator reports as an `error`
and which as a `warning` is decided with its code list in checkpoint 3, and
written here in two more columns.

Cards a validator must report
-----------------------------

| Section         | Constraint                                                              | Case                                           |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 1.3             | Data MUST be valid I-JSON: no unpaired surrogate in a string            | `i-json-lone-surrogate`                        |
| 1.3.4           | The topmost object MUST have the @type property set                     | `type-missing-on-card`                         |
| 1.3.4           | @type MUST match the type name of the object it is set on               | `type-mismatch`                                |
| 1.3.4           | A Timestamp in Anniversary.date MUST have its @type set                 | `type-timestamp-missing`                       |
| 1.4.1           | An Id MUST be at least 1 octet long                                     | `id-empty`                                     |
| 1.4.1           | An Id MUST be at most 255 octets long                                   | `id-too-long`                                  |
| 1.4.1           | An Id MUST only contain A-Za-z0-9, hyphen and underscore                | `id-bad-character`                             |
| 1.4.2           | An UnsignedInt is an integer >= 0                                       | `unsigned-int-negative`                        |
| 1.4.2           | An UnsignedInt is an integer                                            | `unsigned-int-fraction`                        |
| 1.4.2           | An UnsignedInt is at most 2^53-1                                        | `unsigned-int-unsafe`                          |
| 1.4.2           | An UnsignedInt is a JSON Number                                         | `unsigned-int-string`                          |
| 1.4.3           | A patch ending in an array index MUST NOT have a null value             | `patch-array-index-null`                       |
| 1.4.3           | A pointer MUST NOT use "-" as an array index                            | `patch-array-append`                           |
| 1.4.3           | All reference tokens before the last MUST already exist                 | `patch-parent-missing`                         |
| 1.4.3           | A final array index MUST already exist in the array                     | `patch-array-index-missing`                    |
| 1.4.3           | No pointer of a PatchObject may be the prefix of another one            | `patch-prefix-conflict`                        |
| 1.4.3           | A patch value MUST be valid for the property being set                  | `patch-value-invalid`                          |
| 1.4.3           | A null patch value is only valid for an optional property               | `patch-null-on-mandatory`                      |
| 1.4.4           | @type MUST NOT be "Resource"                                            | `resource-type-resource`                       |
| 1.4.4           | Resource.uri is mandatory                                               | `resource-uri-missing`                         |
| 1.4.4           | Resource.uri MUST be a URI (RFC 3986)                                   | `resource-uri-not-a-uri`                       |
| 1.4.5           | The time offset MUST be "Z"                                             | `utc-date-time-offset`                         |
| 1.4.5           | Letters MUST be in uppercase                                            | `utc-date-time-lowercase`                      |
| 1.4.5           | Fractional seconds MUST NOT be included unless non-zero                 | `utc-date-time-zero-fraction`                  |
| 1.4.5           | Fractional seconds MUST NOT have trailing zeros                         | `utc-date-time-trailing-zero`                  |
| 1.4.5           | A UTCDateTime is in RFC 3339 "date-time" format                         | `utc-date-time-date-only`                      |
| 1.4.5           | A UTCDateTime is a valid RFC 3339 date-time                             | `utc-date-time-impossible`                     |
| 1.4.5           | A UTCDateTime is in RFC 3339 "date-time" format                         | `utc-date-time-hour-out-of-range`              |
| 1.5             | A common property MUST only be set where explicitly allowed             | `common-property-not-allowed`                  |
| 1.5.1           | contexts keys are enumerated: private, work                             | `context-unknown`                              |
| 1.5.1           | contexts is of type String[Boolean]                                     | `context-not-boolean`                          |
| 1.5.1           | A context set to false: the RFC demands true for an Address only        | `context-false`                                |
| 1.5.3           | pref MUST be in the range 1 to 100                                      | `pref-zero`                                    |
| 1.5.3           | pref MUST be in the range 1 to 100                                      | `pref-above-100`                               |
| 1.5.4           | phoneticScript MUST be a valid RFC 5646 script subtag                   | `phonetic-script-invalid`                      |
| 1.5.4           | phoneticSystem values are enumerated: ipa, jyut, piny                   | `phonetic-system-unknown`                      |
| 1.7             | A property value MUST adhere to the data type of the property           | `property-wrong-type`                          |
| 1.7             | A property value MUST adhere to the data type: null is no value         | `property-null`                                |
| 1.7.1           | A type name differing only in case from a known one is invalid          | `type-case-variant`                            |
| 1.7.1           | A property name differing only in case from a known one is invalid      | `property-case-variant`                        |
| 1.7.1           | A property name differing only in case is invalid in any object         | `property-case-variant-nested`                 |
| 1.7.1           | An enumerated value differing only in case from a known one is invalid  | `enum-case-variant`                            |
| 1.7.2           | Registered property names are notated in lower camel case               | `property-name-not-camel-case`                 |
| 1.7.3           | "id" is reserved in a Card (RFC 9610, JMAP for Contacts)                | `reserved-id`                                  |
| 1.7.3           | "addressBookIds" is reserved in a Card (RFC 9610)                       | `reserved-address-book-ids`                    |
| 1.7.3           | "blobId" is reserved in a Media (RFC 9610)                              | `reserved-blob-id`                             |
| 1.7.3.1         | An object with the reserved property "extra" is invalid                 | `reserved-extra`                               |
| 1.7.3.1         | "extra" is reserved in every JSContact object                           | `reserved-extra-nested`                        |
| 1.7.4           | A name neither of registered syntax nor a v-extension is no property    | `property-name-invalid`                        |
| 1.7.5           | An enumerated value MUST be IANA-registered or vendor-specific          | `enum-unknown-value`                           |
| 1.8.1           | A vendor property name MUST NOT contain the SOLIDUS                     | `vendor-property-name-solidus`                 |
| 1.8.1           | A vendor property name MUST NOT contain the TILDE                       | `vendor-property-name-tilde`                   |
| 1.8.1           | The vendor prefix MUST follow the v-prefix ABNF                         | `vendor-property-prefix-invalid`               |
| 1.8.1           | The name after the vendor prefix MUST NOT be empty                      | `vendor-property-name-empty`                   |
| 1.8.1           | A vendor property name MUST NOT contain the QUOTATION MARK              | `vendor-property-name-quotation-mark`          |
| 1.8.2           | A vendor-specific value MUST be a valid v-extension                     | `vendor-value-invalid`                         |
| 2.1.1           | Card @type MUST be "Card"                                               | `card-type-wrong`                              |
| 2.1.2           | Card.version is mandatory                                               | `version-missing`                              |
| 2.1.2           | version MUST be an IANA-registered JSContact version                    | `version-unregistered`                         |
| 2.1.2           | version is of type String                                               | `version-not-a-string`                         |
| 2.1.5           | language is an RFC 5646 language tag                                    | `language-not-a-language-tag`                  |
| 2.1.6           | Each value of members MUST be true                                      | `members-value-false`                          |
| 2.1.6           | If members is set, kind MUST be "group"                                 | `members-in-non-group`                         |
| 2.1.6           | If members is set, kind MUST be "group": the default is "individual"    | `members-without-kind`                         |
| 2.1.7           | prodId MUST be at least one character long                              | `prod-id-empty`                                |
| 2.1.8           | Each value of Relation.relation MUST be true                            | `relation-value-false`                         |
| 2.1.8           | Relation types are enumerated                                           | `relation-type-unknown`                        |
| 2.1.9           | uid is mandatory in a Card of version "1.0" (RFC 9982 section 4)        | `uid-missing-in-1.0`                           |
| 2.1.9           | uid is of type String                                                   | `uid-not-a-string`                             |
| 2.2.1.1         | components MUST be set if full is not set                               | `name-neither-components-nor-full`             |
| 2.2.1.1         | components MUST have at least one entry that is not a separator         | `name-components-empty`                        |
| 2.2.1.1         | components MUST have at least one entry that is not a separator         | `name-components-only-separators`              |
| 2.2.1.1         | If isOrdered is false, components MUST NOT contain a separator          | `name-unordered-with-separator`                |
| 2.2.1.1         | defaultSeparator MUST NOT be set if isOrdered is false                  | `name-default-separator-unordered`             |
| 2.2.1.1         | defaultSeparator MUST NOT be set if components is not set               | `name-default-separator-without-components`    |
| 2.2.1.1         | sortAs MUST NOT be set if components is not set                         | `name-sort-as-without-components`              |
| 2.2.1.1         | Each sortAs key MUST be a valid name component kind                     | `name-sort-as-key-not-a-kind`                  |
| 2.2.1.1         | For each sortAs key a component of that kind MUST exist                 | `name-sort-as-kind-not-in-components`          |
| 2.2.1.2         | Two consecutive separator components MUST NOT be inserted               | `name-consecutive-separators`                  |
| 2.2.1.2         | NameComponent.value is mandatory                                        | `name-component-value-missing`                 |
| 2.2.1.2         | NameComponent.kind is mandatory                                         | `name-component-kind-missing`                  |
| 2.2.1.2         | NameComponent.kind values are enumerated                                | `name-component-kind-unknown`                  |
| 2.2.1.2         | With phonetic set, Name phoneticSystem or phoneticScript MUST be set    | `name-phonetic-without-system-or-script`       |
| 2.2.2           | Nickname.name is mandatory                                              | `nickname-name-missing`                        |
| 2.2.3           | At least one of Organization name and units MUST be set                 | `organization-neither-name-nor-units`          |
| 2.2.3           | units, if set, MUST contain at least one entry                          | `organization-units-empty`                     |
| 2.2.3           | OrgUnit.name is mandatory                                               | `org-unit-name-missing`                        |
| 2.2.4           | At least one of grammaticalGender and pronouns MUST be set              | `speak-to-as-empty`                            |
| 2.2.4           | grammaticalGender values are enumerated                                 | `grammatical-gender-unknown`                   |
| 2.2.4           | Pronouns.pronouns is mandatory                                          | `pronouns-missing`                             |
| 2.2.5           | Title.organizationId is an Id                                           | `id-reference-bad-character`                   |
| 2.2.5           | Title.name is mandatory                                                 | `title-name-missing`                           |
| 2.2.5           | Title.kind values are enumerated: title, role                           | `title-kind-unknown`                           |
| 2.3.1           | EmailAddress.address is mandatory                                       | `email-address-missing`                        |
| 2.3.1           | address MUST be an RFC 5322 addr-spec                                   | `email-address-not-addr-spec`                  |
| 2.3.2           | At least uri or user MUST be set                                        | `online-service-neither-uri-nor-user`          |
| 2.3.2           | OnlineService.uri MUST be a URI                                         | `online-service-uri-not-a-uri`                 |
| 2.3.3           | Phone.number is mandatory                                               | `phone-number-missing`                         |
| 2.3.3           | Each value of features MUST be true                                     | `phone-feature-false`                          |
| 2.3.3           | Phone features are enumerated                                           | `phone-feature-unknown`                        |
| 2.3.4           | LanguagePref.language is mandatory                                      | `language-pref-language-missing`               |
| 2.3.4           | language MUST be an RFC 5646 language tag                               | `language-pref-not-a-language-tag`             |
| 2.4.1           | Calendar.kind is mandatory                                              | `calendar-kind-missing`                        |
| 2.4.1           | Calendar.kind values are enumerated: calendar, freeBusy                 | `calendar-kind-unknown`                        |
| 2.4.2           | SchedulingAddress.uri is mandatory                                      | `scheduling-address-uri-missing`               |
| 2.4.2           | SchedulingAddress.uri MUST be a URI                                     | `scheduling-address-uri-not-a-uri`             |
| 2.5.1.1         | billing and delivery are contexts of an Address only                    | `context-of-address-elsewhere`                 |
| 2.5.1.1         | One of components, coordinates, countryCode, full, timeZone MUST be set | `address-empty`                                |
| 2.5.1.1         | components MUST have at least one entry that is not a separator         | `address-components-only-separators`           |
| 2.5.1.1         | If isOrdered is false, components MUST NOT contain a separator          | `address-unordered-with-separator`             |
| 2.5.1.1         | defaultSeparator MUST NOT be set if isOrdered is false                  | `address-default-separator-unordered`          |
| 2.5.1.1         | defaultSeparator MUST NOT be set if components is not set               | `address-default-separator-without-components` |
| 2.5.1.1         | timeZone MUST be a name of the IANA Time Zone Database                  | `address-time-zone-unknown`                    |
| 2.5.1.1         | Each value of Address.contexts MUST be true                             | `address-context-false`                        |
| 2.5.1.1         | countryCode is an ISO 3166-1 alpha-2 code                               | `address-country-code-not-alpha-2`             |
| 2.5.1.1         | coordinates is a "geo:" URI                                             | `address-coordinates-not-a-geo-uri`            |
| 2.5.1.1         | components MUST have at least one entry that is not a separator         | `address-components-empty`                     |
| 2.5.1.2         | Two consecutive separator components MUST NOT be inserted               | `address-consecutive-separators`               |
| 2.5.1.2         | AddressComponent.value is mandatory                                     | `address-component-value-missing`              |
| 2.5.1.2         | AddressComponent.kind is mandatory                                      | `address-component-kind-missing`               |
| 2.5.1.2         | AddressComponent.kind values are enumerated                             | `address-component-kind-unknown`               |
| 2.5.1.2         | With phonetic set, Address phoneticSystem or phoneticScript MUST be set | `address-phonetic-without-system-or-script`    |
| 2.6.1           | No kind is registered for a CryptoKey: only a vendor value fits         | `crypto-key-kind-not-vendor`                   |
| 2.6.2           | Directory.kind is mandatory                                             | `directory-kind-missing`                       |
| 2.6.2           | Directory.kind values are enumerated: directory, entry                  | `directory-kind-unknown`                       |
| 2.6.2           | listAs, if set, MUST be higher than zero                                | `directory-list-as-zero`                       |
| 2.6.3           | Link.kind values are enumerated: contact                                | `link-kind-unknown`                            |
| 2.6.4           | Media.kind is mandatory                                                 | `media-kind-missing`                           |
| 2.6.4           | Media.kind values are enumerated: photo, sound, logo                    | `media-kind-unknown`                           |
| 2.7.1           | The localized Card is invalid: a Name without components or full        | `patch-result-invalid`                         |
| 2.7.1           | A patch MUST NOT target the localizations property                      | `patch-targets-localizations`                  |
| 2.7.1           | localizations is of type String[PatchObject]                            | `localizations-not-a-patch-object`             |
| 2.7.1           | The keys of localizations are RFC 5646 language tags                    | `localizations-key-not-a-language-tag`         |
| 2.8.1           | Anniversary.kind is mandatory                                           | `anniversary-kind-missing`                     |
| 2.8.1           | Anniversary.kind values are enumerated: birth, death, wedding           | `anniversary-kind-unknown`                     |
| 2.8.1           | Anniversary.date is mandatory                                           | `anniversary-date-missing`                     |
| 2.8.1           | date is a PartialDate or a Timestamp object                             | `anniversary-date-not-an-object`               |
| 2.8.1           | A PartialDate is a date, a year, a month in a year or a day in a month  | `partial-date-empty`                           |
| 2.8.1           | month is an integer from 1 to 12                                        | `partial-date-month-out-of-range`              |
| 2.8.1           | If month is set, year or day MUST be set                                | `partial-date-month-alone`                     |
| 2.8.1           | day is an integer from 1 to 31                                          | `partial-date-day-out-of-range`                |
| 2.8.1           | day depends on the validity within the month and year                   | `partial-date-day-invalid-in-month`            |
| 2.8.1           | If day is set, month MUST be set                                        | `partial-date-day-without-month`               |
| 2.8.1           | calendarScale is written in lowercase                                   | `partial-date-calendar-scale-uppercase`        |
| 2.8.1           | calendarScale MUST be a CLDR calendar name or a vendor value            | `partial-date-calendar-scale-unknown`          |
| 2.8.1           | Timestamp.utc is mandatory                                              | `timestamp-utc-missing`                        |
| 2.8.1           | month is an integer from 1 to 12                                        | `partial-date-month-zero`                      |
| 2.8.1           | day is an integer from 1 to 31                                          | `partial-date-day-zero`                        |
| 2.8.2           | Each value of keywords MUST be true                                     | `keyword-value-false`                          |
| 2.8.3           | Note.note is mandatory                                                  | `note-missing`                                 |
| 2.8.3           | At least one Author property other than @type MUST be set               | `author-empty`                                 |
| 2.8.4           | PersonalInfo.kind is mandatory                                          | `personal-info-kind-missing`                   |
| 2.8.4           | PersonalInfo.kind values are enumerated: expertise, hobby, interest     | `personal-info-kind-unknown`                   |
| 2.8.4           | PersonalInfo.value is mandatory                                         | `personal-info-value-missing`                  |
| 2.8.4           | PersonalInfo.level values are enumerated: high, medium, low             | `personal-info-level-unknown`                  |
| 2.8.4           | listAs, if set, MUST be higher than zero                                | `personal-info-list-as-zero`                   |
| RFC 9555 2.15.1 | A JCardProp has a name, parameters, a type and at least one value       | `vcard-props-entry-too-short`                  |
| RFC 9555 2.15.1 | vCardProps is of type JCardProp[]                                       | `vcard-props-not-an-array`                     |
| RFC 9555 2.15.2 | vCardParams MUST be a JSON object                                       | `vcard-params-not-an-object`                   |
| RFC 9555 2.15.2 | Each vCardParams value is a String or a String[]                        | `vcard-params-value-not-a-string`              |
| RFC 9555 2.15.3 | vCardName MUST be valid according to the "name" ABNF of RFC 6350        | `vcard-name-invalid`                           |

Cards a validator must accept
-----------------------------

| Section       | Constraint                                                              | Case                           |
| ------------- | ----------------------------------------------------------------------- | ------------------------------ |
| 1.3.4         | An object MAY have @type set where the property implies it              | `type-set-on-every-object`     |
| 1.4.1         | An Id has 1 to 255 octets of A-Za-z0-9, hyphen and underscore           | `id-longest-and-full-alphabet` |
| 1.4.3         | A patch may replace an array member, set a property or remove one       | `patch-forms`                  |
| 1.4.3         | A pointer is the prefix of another by whole reference tokens only       | `patch-sibling-pointers`       |
| 1.4.5         | Non-zero fractional seconds without trailing zeros are valid            | `utc-date-time-fraction`       |
| 1.5.3         | pref is in the range 1 to 100                                           | `pref-bounds`                  |
| 1.7.4         | An unknown property with a valid name MUST NOT be treated as invalid    | `unknown-property`             |
| 1.8           | The extensions of this project: Nickname kind and vendor relation types | `project-vendor-extensions`    |
| 1.8.1         | A vendor property MAY be set in any object, with any JSON value         | `vendor-property`              |
| 1.8.2         | An enumerated property accepts a vendor-specific value                  | `vendor-values`                |
| 2.1.2         | Any valid version "1.0" Card is also valid in "2.0" (RFC 9982)          | `version-1.0-with-uid`         |
| 2.1.6         | A group Card is not required to have members                            | `group-without-members`        |
| 2.1.8         | The relationship is undefined if relation is empty or absent            | `relation-undefined`           |
| 2.1.9         | A Card without uid MUST NOT be rejected, unless of version "1.0"        | `uid-absent-in-2.0`            |
| 2.1.9         | uid MAY be a URI or a free-text value                                   | `uid-free-text`                |
| 2.2.1.2       | A separator value is verbatim, even an empty string                     | `name-ordered-with-separators` |
| 2.3.2         | At least uri or user MUST be set                                        | `online-service-user-only`     |
| 2.3.3         | A phone number is either a URI or free text                             | `phone-number-free-text`       |
| 2.5.1.1       | One of components, coordinates, countryCode, full, timeZone is enough   | `address-one-member-each`      |
| 2.8.1         | A PartialDate is a date, a year, a month in a year or a day in a month  | `partial-date-forms`           |
| RFC 9555 2.15 | vCardProps, vCardParams and vCardName as RFC 9555 writes them           | `vcard-extensions`             |

Requirements with no Card to show
---------------------------------

Rules about what a program does, or about the JSON text, not about one
parsed Card. Listed so that none is forgotten; the last column says where
each one lands.

| Section    | Requirement                                                      | Where                                   |
| ---------- | ---------------------------------------------------------------- | --------------------------------------- |
| 1.3        | I-JSON: no duplicate member name in an object                    | `parseJSContact`: `JSON.parse` keeps    |
|            |                                                                  | the last one silently, to be decided    |
| 1.3        | I-JSON: UTF-8 text; no unpaired surrogate in a member name       | `parseJSContact`, with the case above   |
| 1.4.1      | Map keys MUST be preserved across versions of an object          | editor, merge (`nextId` only for new)   |
| 1.4.3      | A PatchObject is rejected in its entirety, never applied in part | `applyPatchObject`                      |
| 1.4.3      | @type in a patch MUST be handled as any other patched value      | `applyPatchObject`                      |
| 1.5.3      | No pref MUST be read as least preferred                          | whatever sorts by pref                  |
| 1.5.4      | A script subtag in Card.language MUST be ignored for phonetics   | converter                               |
| 1.6.1      | Bidirectional text complies with the Unicode algorithm; adjacent | not checked; the UI renders each value  |
|            | values MUST NOT be assumed to be displayed as one string         | in its own element                      |
| 1.6.2      | URIs MUST be percent-encoded where needed                        | converter, editor                       |
| 1.7.4      | Unknown properties MUST be preserved                             | everything that copies a Card           |
| 1.7.4      | Only registered or vendor properties MUST be set                 | converter, editor                       |
| 1.8.1      | Vendor properties MUST be preserved and their value never        | everything that copies a Card; the      |
|            | rejected, unless the vendor is this project                      | validator checks `remileduc.github.io:` |
| 1.8.1      | The vendor prefix MUST be a domain under the vendor's control    | `VENDOR_PREFIX`                         |
| 1.8.1      | The prefix ietf.org and its subdomains are reserved for the IETF | never set; not checked on input         |
| 2.2.1.1    | Components in name order MUST set isOrdered to true; the same    | converter (`JSCOMPS`), editor           |
| 2.5.1.1    | for an Address                                                   |                                         |
| 2.3.2      | Service names MUST be compared case-insensitively                | converter, card matching                |
| 2.7.1      | Localizing: copy without localizations, then apply the patches   | `localize`                              |
| 2.8.1      | year, month and day MUST be Gregorian whatever the calendarScale | converter, editor                       |
| RFC 9982 3 | Created data MUST be of version "2.0" and say so                 | converter, `parseJSContact` (1.0 input) |
| RFC 9982 5 | No uid MUST be generated for a vCard without UID                 | converter; only the app assigns one     |

Where the RFC leaves room
-------------------------

Points the validator has to settle, noted while extracting the rules:

- `common-property-not-allowed`: section 1.5 forbids `pref` on an
  Organization, section 1.7.4 says a property unknown in its context is
  not invalid. Either way it is reported and kept.
- `type-timestamp-missing`: read by the letter of section 1.3.4, a date
  without `@type` is a PartialDate with an unknown property `utc` and no
  date part, so the rule is only caught through `partial-date-empty` or
  by recognising `utc`.
- `patch-result-invalid`: every patch is valid on its own (`full` is
  optional, so null may remove it); only the localized Card is not. The
  RFC does not say the result must validate.
- `context-false`: `contexts` is `String[Boolean]` and "MUST be true" is
  written for an Address only. The types take `true` alone everywhere.
- `crypto-key-kind-not-vendor`: the RFC lists no kind for a CryptoKey and
  does not say what another word is.
- `property-name-invalid`, `property-name-not-camel-case`: section 1.7.4
  says what to do with an unknown name that follows the syntax of
  registered names, not what one that does not is. By exclusion (section
  1.7 knows registered, unknown and vendor properties) it is no property.
- "MUST be a URI", addr-spec, language tag, script subtag: how strict a
  syntax check is worth its code. `Intl.getCanonicalLocales` and
  `Intl.supportedValuesOf("timeZone" | "calendar")` cover language tags,
  time zones and calendar scales without a table of our own.
- `partial-date-empty`, `address-country-code-not-alpha-2`,
  `address-coordinates-not-a-geo-uri`, `language-not-a-language-tag`,
  `localizations-key-not-a-language-tag`: the definition says what the
  value is without the word MUST. The same goes for a
  `Title.organizationId` naming no entry of `organizations`, which has no
  case.
- Table 2 of RFC 9553 (the property registry) disagrees with sections 1
  and 2 in four places, see `fixtures/README.md`; the sections win.
