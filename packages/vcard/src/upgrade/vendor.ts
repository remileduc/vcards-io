import { excerpt } from "../parse/issues.js";
import type { VProperty, VValue } from "../types.js";
import { formatDateAndOrTime, parseDateAndOrTime } from "../values/date.js";
import { URI_SCHEME } from "../values/uri.js";
import {
	addType,
	derive,
	drop,
	findProperty,
	firstParam,
	groupAllocator,
	groupIndex,
	hasProperty,
	labelOf,
	membersOf,
	type Rule,
	removeTypes,
	rewrite,
	textOf,
	type UpgradeContext,
} from "./context.js";
import { relationTypeForAndroid, relationTypeForLabel } from "./relations.js";

const ANDROID_MIME = "vnd.android.cursor.item/";
const APPLE_BUILTIN = /^_\$!<(.*)>!\$_$/;
const APPLE_PLACEHOLDER_YEAR = 1604;
// RFC 3986 pchar plus `/`: what a handle may contain verbatim in the path of its IMPP URI.
const HANDLE_SAFE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/;

/** `vnd.android.cursor.item/nickname` type numbers and the vendor Nickname kind each means. */
const ANDROID_NICKNAME_KINDS: ReadonlyMap<number, string | null> = new Map([
	[1, null],
	[2, "other"],
	[3, "maiden"],
	[4, "short"],
	[5, "initials"],
]);

/** `vnd.android.cursor.item/contact_event` type numbers; only two have a 4.0 property. */
const ANDROID_EVENT_TARGETS: ReadonlyMap<number, string | null> = new Map([
	[0, null],
	[1, "ANNIVERSARY"],
	[2, null],
	[3, "BDAY"],
]);

/** Legacy IM properties: the URI scheme and SERVICE-TYPE each becomes; X-SIP's scheme says it all. */
const LEGACY_IM: ReadonlyMap<string, { scheme: string; service?: string }> = new Map([
	["X-SIP", { scheme: "sip" }],
	["X-AIM", { service: "AIM", scheme: "aim" }],
	["X-MSN", { service: "MSN", scheme: "msnim" }],
	["X-YAHOO", { service: "Yahoo", scheme: "ymsgr" }],
	["X-ICQ", { service: "ICQ", scheme: "icq" }],
	["X-JABBER", { service: "Jabber", scheme: "xmpp" }],
	["X-SKYPE", { service: "Skype", scheme: "skype" }],
	["X-SKYPE-USERNAME", { service: "Skype", scheme: "skype" }],
	["X-GOOGLE-TALK", { service: "GoogleTalk", scheme: "xmpp" }],
	["X-GTALK", { service: "GoogleTalk", scheme: "xmpp" }],
	["X-GOOGLE TALK", { service: "GoogleTalk", scheme: "xmpp" }],
	["X-QQ", { service: "QQ", scheme: "qq" }],
	["X-NETMEETING", { service: "NetMeeting", scheme: "callto" }],
]);

/** Apple `X-SOCIALPROFILE;type=` words whose SERVICE-TYPE spelling is not a plain capital. */
const SOCIAL_SERVICES: ReadonlyMap<string, string> = new Map([
	["linkedin", "LinkedIn"],
	["sinaweibo", "Sina Weibo"],
	["myspace", "Myspace"],
]);

/** TYPE words that say where, not which service, so they are never a SERVICE-TYPE. */
const PLACE_TYPES: ReadonlySet<string> = new Set(["home", "work", "other"]);

/** Apple built-in labels that mean a TYPE; HomePage and Other carry nothing a TYPE can say. */
const APPLE_LABEL_TYPES: ReadonlyMap<string, string | null> = new Map([
	["home", "home"],
	["work", "work"],
	["mobile", "cell"],
	["main", "main"],
	["homepage", null],
	["other", null],
]);

/** Properties Apple writes with the 1604 placeholder year; REV and the like are left alone. */
const PLACEHOLDER_DATE_PROPERTIES: ReadonlySet<string> = new Set([
	"BDAY",
	"ANNIVERSARY",
	"DEATHDATE",
	"X-ABDATE",
	"X-ALTBDAY",
]);

/** X-WAB-GENDER (Windows Address Book) numbers and X-GENDER words, to RFC 6350 sex codes. */
const GENDER_CODES: ReadonlyMap<string, string> = new Map([
	["1", "F"],
	["2", "M"],
	["female", "F"],
	["f", "F"],
	["male", "M"],
	["m", "M"],
	["other", "O"],
	["o", "O"],
	["none", "N"],
	["n", "N"],
	["unknown", "U"],
	["u", "U"],
]);

function component(p: VProperty, index: number): string {
	return p.value.kind === "structured" ? (p.value.components[index]?.join(",") ?? "") : "";
}

/** `data2` of an X-ANDROID-CUSTOM row; Android writes a number, an empty slot means the default. */
function androidType(p: VProperty, fallback: number): number | undefined {
	const text = component(p, 2).trim();
	if (text === "") return fallback;
	return /^\d{1,3}$/.test(text) ? Number(text) : undefined;
}

function dateValue(text: string): VValue | undefined {
	const trimmed = text.trim();
	const date = parseDateAndOrTime(trimmed);
	return date === null ? undefined : { kind: "date-and-or-time", value: date, raw: trimmed };
}

function builtinLabel(label: VProperty | undefined): string | undefined {
	const text = label === undefined ? undefined : textOf(label);
	return text === undefined ? undefined : APPLE_BUILTIN.exec(text)?.[1];
}

// `X-ANDROID-CUSTOM:<mime>;data1;...;data15` rows (docs/interop.md): nickname, contact_event and
// relation have a 4.0 property; other MIME types and rows a cardinality rule cannot place stay raw.
const androidCustom: Rule = (card, ctx) => {
	const placed = new Set(["ANNIVERSARY", "BDAY"].filter((name) => hasProperty(card, name)));
	const nextGroup = groupAllocator(card);
	rewrite(card, (p) => {
		if (p.name !== "X-ANDROID-CUSTOM" || p.value.kind !== "structured") return undefined;
		const mime = component(p, 0).trim().toLowerCase();
		if (!mime.startsWith(ANDROID_MIME)) return undefined;
		switch (mime.slice(ANDROID_MIME.length)) {
			case "nickname":
				return androidNickname(p, ctx);
			case "contact_event":
				return androidEvent(p, placed, ctx);
			case "relation":
				return androidRelation(p, nextGroup, ctx);
			default:
				return undefined;
		}
	});
};

function androidNickname(p: VProperty, ctx: UpgradeContext): VProperty | undefined {
	const name = component(p, 1);
	if (name.trim() === "") return undefined;
	const type = androidType(p, 1);
	if (type === undefined || (type !== 0 && !ANDROID_NICKNAME_KINDS.has(type))) {
		ctx.warn(
			"android-custom-unknown-type",
			`Unknown nickname type ${excerpt(component(p, 2))}, kept as written`,
			p,
		);
		return undefined;
	}
	const nickname = derive(p, "NICKNAME", { kind: "text-list", values: [name] });
	const label = component(p, 3);
	const kind =
		type === 0
			? label === ""
				? "custom"
				: `custom:${label}`
			: ANDROID_NICKNAME_KINDS.get(type);
	if (kind != null) nickname.params.set("X-KIND", [kind]);
	ctx.info(
		"android-nickname",
		`Android nickname rewritten as NICKNAME${kind == null ? "" : `;X-KIND=${excerpt(kind)}`}`,
		p,
	);
	return nickname;
}

function androidEvent(
	p: VProperty,
	placed: Set<string>,
	ctx: UpgradeContext,
): VProperty | undefined {
	const type = androidType(p, 2);
	const target = type === undefined ? undefined : ANDROID_EVENT_TARGETS.get(type);
	if (target === undefined) {
		ctx.warn(
			"android-custom-unknown-type",
			`Unknown event type ${excerpt(component(p, 2))}, kept as written`,
			p,
		);
		return undefined;
	}
	const value = dateValue(component(p, 1));
	if (value === undefined) {
		ctx.warn(
			"vendor-date-invalid",
			`Event date ${excerpt(component(p, 1))} is not a date, kept as written`,
			p,
		);
		return undefined;
	}
	if (target === null || placed.has(target)) return undefined;
	placed.add(target);
	ctx.info("android-event", `Android event rewritten as ${target}`, p);
	return derive(p, target, value);
}

function androidRelation(
	p: VProperty,
	nextGroup: () => string,
	ctx: UpgradeContext,
): VProperty[] | undefined {
	const name = component(p, 1);
	if (name.trim() === "") return undefined;
	const type = androidType(p, 0);
	const relation = type === undefined ? undefined : relationTypeForAndroid(type);
	if (relation === undefined) {
		ctx.warn(
			"android-custom-unknown-type",
			`Unknown relation type ${excerpt(component(p, 2))}, kept as written`,
			p,
		);
		return undefined;
	}
	const related = derive(p, "RELATED", { kind: "text", value: name });
	addType(related, relation.type);
	const out = [related];
	const label = component(p, 3);
	if (relation.android === 0 && label.trim() !== "") {
		// The Apple shape, so the converter has one place to look for a relation's label.
		related.group = p.group ?? nextGroup();
		out.push(derive(related, "X-ABLABEL", { kind: "text", value: label }, new Map()));
	}
	ctx.info("android-relation", `Android relation rewritten as RELATED;TYPE=${relation.type}`, p);
	return out;
}

// The handle is literal text: `#`, `?` and `%` are encoded too, so the URI decodes back to it.
// A lone surrogate has no UTF-8 form and makes encodeURIComponent throw.
function handleToUri(scheme: string, handle: string): string | undefined {
	const trimmed = handle.trim();
	if (trimmed.toLowerCase().startsWith(`${scheme}:`)) return trimmed;
	try {
		let path = "";
		for (const ch of trimmed) path += HANDLE_SAFE.test(ch) ? ch : encodeURIComponent(ch);
		return `${scheme}:${path}`;
	} catch {
		return undefined;
	}
}

/** The non-empty handle of a legacy IM property, trimmed. */
function handleOf(p: VProperty): string | undefined {
	const handle = textOf(p)?.trim();
	return handle === undefined || handle === "" ? undefined : handle;
}

function twitterToSocialProfile(p: VProperty, ctx: UpgradeContext): VProperty | undefined {
	const handle = handleOf(p);
	if (handle === undefined) return undefined;
	const social = derive(p, "SOCIALPROFILE", { kind: "text", value: handle });
	social.params.set("SERVICE-TYPE", ["Twitter"]);
	ctx.info(
		"legacy-im-to-socialprofile",
		"X-TWITTER rewritten as SOCIALPROFILE;SERVICE-TYPE=Twitter",
		p,
	);
	return social;
}

function skypeNumberToTel(p: VProperty, ctx: UpgradeContext): VProperty | undefined {
	const handle = handleOf(p);
	if (handle === undefined) return undefined;
	const tel = derive(p, "TEL", { kind: "text", value: handle });
	addType(tel, "x-skype");
	ctx.info("legacy-im-to-tel", "X-SKYPE-PSTNNUMBER rewritten as TEL;TYPE=x-skype", p);
	return tel;
}

/** X-AIM and friends become IMPP, X-TWITTER a SOCIALPROFILE, X-SKYPE-PSTNNUMBER a TEL. */
const legacyIm: Rule = (card, ctx) => {
	rewrite(card, (p) => {
		if (p.name === "X-TWITTER") return twitterToSocialProfile(p, ctx);
		if (p.name === "X-SKYPE-PSTNNUMBER") return skypeNumberToTel(p, ctx);
		const im = LEGACY_IM.get(p.name);
		if (im === undefined) return undefined;
		const handle = handleOf(p);
		if (handle === undefined) return undefined;
		const uri = handleToUri(im.scheme, handle);
		if (uri === undefined) {
			ctx.warn("impp-handle-invalid", `${p.name} handle cannot be a URI, kept as written`, p);
			return undefined;
		}
		const impp = derive(p, "IMPP", { kind: "uri", value: uri });
		if (im.service !== undefined) impp.params.set("SERVICE-TYPE", [im.service]);
		ctx.info("legacy-im-to-impp", `${p.name} rewritten as IMPP ${im.scheme}: URI`, p);
		return impp;
	});
};

/** Apple's X-SERVICE-TYPE on IMPP is RFC 9554's SERVICE-TYPE. */
const appleServiceType: Rule = (card, ctx) => {
	for (const p of card.properties) {
		const service = p.params.get("X-SERVICE-TYPE");
		if (p.name !== "IMPP" || service === undefined) continue;
		if (!p.params.has("SERVICE-TYPE")) p.params.set("SERVICE-TYPE", service);
		p.params.delete("X-SERVICE-TYPE");
		ctx.info("x-service-type", "X-SERVICE-TYPE rewritten as SERVICE-TYPE", p);
	}
};

/** Apple stores a yearless date in year 1604, flagged by X-APPLE-OMIT-YEAR on recent iOS. */
const appleOmitYear: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (!PLACEHOLDER_DATE_PROPERTIES.has(p.name) || p.value.kind !== "date-and-or-time")
			continue;
		const omit = firstParam(p, "X-APPLE-OMIT-YEAR");
		const { year, month } = p.value.value;
		const placeholder = omit === undefined ? APPLE_PLACEHOLDER_YEAR : Number(omit);
		if (year !== placeholder || month === undefined) continue;
		const { year: _dropped, ...rest } = p.value.value;
		let raw: string;
		try {
			raw = formatDateAndOrTime(rest);
		} catch {
			// Only a hand-built model gets here: the parser never yields a date with no vCard form.
			ctx.warn("omit-year-invalid", "Date has no form without its year, kept as written", p);
			continue;
		}
		p.value = { kind: "date-and-or-time", value: rest, raw };
		p.params.delete("X-APPLE-OMIT-YEAR");
		ctx.info("omit-year", `Placeholder year ${placeholder} dropped, date is ${raw}`, p);
	}
};

/** `itemN.X-ABDATE` labelled Anniversary is the ANNIVERSARY; other dates have no 4.0 property. */
const appleDates: Rule = (card, ctx) => {
	if (!hasProperty(card, "X-ABDATE")) return;
	const index = groupIndex(card);
	const doomed = new Set<VProperty>();
	let placed = hasProperty(card, "ANNIVERSARY");
	for (const p of card.properties) {
		if (p.name !== "X-ABDATE" || p.value.kind !== "date-and-or-time" || placed) continue;
		const label = labelOf(index, p.group);
		if (builtinLabel(label)?.toLowerCase() !== "anniversary") continue;
		p.name = "ANNIVERSARY";
		placed = true;
		if (label !== undefined) doomed.add(label);
		ctx.info(
			"abdate-to-anniversary",
			"X-ABDATE labelled Anniversary rewritten as ANNIVERSARY",
			p,
		);
	}
	drop(card, doomed);
};

/** `itemN.X-ABRELATEDNAMES` with its label becomes RELATED;VALUE=text with the mapped TYPE. */
const appleRelatedNames: Rule = (card, ctx) => {
	if (!hasProperty(card, "X-ABRELATEDNAMES")) return;
	const index = groupIndex(card);
	const doomed = new Set<VProperty>();
	for (const p of card.properties) {
		if (p.name !== "X-ABRELATEDNAMES") continue;
		const name = textOf(p);
		if (name === undefined || p.value.kind === "unknown") continue;
		const label = labelOf(index, p.group);
		const text = label === undefined ? undefined : textOf(label);
		const builtin = builtinLabel(label);
		const relation = text === undefined ? undefined : relationTypeForLabel(builtin ?? text);
		p.name = "RELATED";
		p.value = { kind: "text", value: name };
		let type: string | undefined;
		if (relation !== undefined) {
			type = relation.type;
			if (label !== undefined) doomed.add(label);
		} else if (builtin?.toLowerCase() === "other") {
			if (label !== undefined) doomed.add(label);
		} else if (text !== undefined) {
			type = "x-custom";
		}
		if (type !== undefined) addType(p, type);
		ctx.info(
			"abrelatednames-to-related",
			`X-ABRELATEDNAMES rewritten as RELATED${type === undefined ? "" : `;TYPE=${type}`}`,
			p,
		);
	}
	drop(card, doomed);
};

/** `X-SOCIALPROFILE;type=twitter;x-user=u:url` is RFC 9554's SOCIALPROFILE;SERVICE-TYPE;USERNAME. */
const appleSocialProfile: Rule = (card, ctx) => {
	for (const p of card.properties) {
		if (p.name !== "X-SOCIALPROFILE") continue;
		const text = textOf(p);
		if (text === undefined) continue;
		p.name = "SOCIALPROFILE";
		p.value = URI_SCHEME.test(text)
			? { kind: "uri", value: text }
			: { kind: "text", value: text };
		const service = (p.params.get("TYPE") ?? []).find((t) => !PLACE_TYPES.has(t.toLowerCase()));
		if (service !== undefined && !p.params.has("SERVICE-TYPE")) {
			removeTypes(p, (t) => t === service);
			p.params.set("SERVICE-TYPE", [serviceName(service)]);
		}
		const user = p.params.get("X-USER");
		if (user !== undefined) {
			if (!p.params.has("USERNAME")) p.params.set("USERNAME", user);
			p.params.delete("X-USER");
		}
		ctx.info("x-socialprofile", "X-SOCIALPROFILE rewritten as SOCIALPROFILE", p);
	}
};

function serviceName(type: string): string {
	const lower = type.toLowerCase();
	return SOCIAL_SERVICES.get(lower) ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** `itemN.X-ABADR:fr` is the country code of the ADR in the group (RFC 8605 CC). */
const appleCountryCode: Rule = (card, ctx) => {
	if (!hasProperty(card, "X-ABADR")) return;
	const index = groupIndex(card);
	const doomed = new Set<VProperty>();
	for (const p of card.properties) {
		if (p.name !== "X-ABADR" || p.group === null) continue;
		const code = textOf(p)?.trim() ?? "";
		if (!/^[A-Za-z]{2}$/.test(code)) {
			ctx.warn(
				"abadr-invalid",
				`X-ABADR ${excerpt(code)} is not a country code, kept as written`,
				p,
			);
			continue;
		}
		const adr = membersOf(index, p.group).find((m) => m.name === "ADR");
		if (adr === undefined) continue;
		if (!adr.params.has("CC")) adr.params.set("CC", [code.toUpperCase()]);
		doomed.add(p);
		ctx.info("abadr-to-cc", `X-ABADR rewritten as CC=${code.toUpperCase()} on the ADR`, p);
	}
	drop(card, doomed);
};

/** `X-ABShowAs:COMPANY` is KIND:org. */
const appleShowAs: Rule = (card, ctx) => {
	const show = findProperty(card, "X-ABSHOWAS");
	if (show === undefined || textOf(show)?.trim().toUpperCase() !== "COMPANY") return;
	const kind = findProperty(card, "KIND");
	if (kind === undefined) {
		const org = derive(show, "KIND", { kind: "text", value: "org" }, new Map());
		card.properties.splice(card.properties.indexOf(show), 1, org);
		ctx.info("abshowas-to-kind", "X-ABShowAs:COMPANY rewritten as KIND:org", show);
	} else if (textOf(kind)?.toLowerCase() === "org") {
		drop(card, new Set([show]));
		ctx.info("abshowas-to-kind", "X-ABShowAs:COMPANY dropped, KIND:org already present", show);
	}
};

/** Apple group cards: `X-ADDRESSBOOKSERVER-KIND:group` and `-MEMBER:urn:uuid:…` are KIND and MEMBER. */
const addressBookServer: Rule = (card, ctx) => {
	let hasKind = hasProperty(card, "KIND");
	rewrite(card, (p) => {
		if (p.name === "X-ADDRESSBOOKSERVER-KIND") {
			const text = textOf(p);
			if (text === undefined || hasKind) return undefined;
			hasKind = true;
			ctx.info("x-addressbookserver", "X-ADDRESSBOOKSERVER-KIND rewritten as KIND", p);
			return derive(p, "KIND", { kind: "text", value: text.trim().toLowerCase() });
		}
		if (p.name === "X-ADDRESSBOOKSERVER-MEMBER") {
			const text = textOf(p);
			if (text === undefined || p.value.kind === "unknown") return undefined;
			ctx.info("x-addressbookserver", "X-ADDRESSBOOKSERVER-MEMBER rewritten as MEMBER", p);
			return derive(p, "MEMBER", { kind: "uri", value: text.trim() });
		}
		return undefined;
	});
};

/** Outlook's X-WAB-GENDER (1 female, 2 male) and X-GENDER words become GENDER. */
const legacyGender: Rule = (card, ctx) => {
	let hasGender = hasProperty(card, "GENDER");
	rewrite(card, (p) => {
		if ((p.name !== "X-WAB-GENDER" && p.name !== "X-GENDER") || hasGender) return undefined;
		const text = textOf(p)?.trim() ?? "";
		const code = GENDER_CODES.get(text.toLowerCase());
		if (code === undefined) {
			if (text !== "0" && text !== "") {
				ctx.warn(
					"x-gender-invalid",
					`${p.name} ${excerpt(text)} is not a known gender, kept as written`,
					p,
				);
			}
			return undefined;
		}
		hasGender = true;
		ctx.info("x-gender-to-gender", `${p.name} rewritten as GENDER:${code}`, p);
		return derive(p, "GENDER", { kind: "structured", components: [[code]] });
	});
};

// Apple labels, last: built-ins that mean a TYPE move onto the grouped property, HomePage /
// Other / empty / IMPP-service labels say nothing and go, custom text stays for the converter.
const appleLabels: Rule = (card, ctx) => {
	if (!hasProperty(card, "X-ABLABEL")) return;
	const index = groupIndex(card);
	const doomed = new Set<VProperty>();
	for (const label of card.properties) {
		if (label.name !== "X-ABLABEL") continue;
		const text = textOf(label)?.trim();
		if (text === undefined) continue;
		if (text === "") {
			doomed.add(label);
			ctx.info("ablabel-dropped", "Empty X-ABLabel dropped", label);
			continue;
		}
		const members = membersOf(index, label.group);
		if (members.length === 0) {
			ctx.warn(
				"ablabel-orphan",
				`X-ABLabel ${excerpt(text)} has no property in its group, kept`,
				label,
			);
			continue;
		}
		// A label on a property kept raw (X-ABDATE "Other", unknown X-) is re-emitted with it.
		if (members.every((m) => m.name.startsWith("X-"))) continue;
		const builtin = APPLE_BUILTIN.exec(text)?.[1];
		if (builtin === undefined) {
			const service = members.find(
				(m) =>
					m.name === "IMPP" &&
					firstParam(m, "SERVICE-TYPE")?.toLowerCase() === text.toLowerCase(),
			);
			if (service !== undefined) {
				doomed.add(label);
				ctx.info(
					"ablabel-dropped",
					`X-ABLabel ${excerpt(text)} repeats the IMPP service, dropped`,
					label,
				);
			}
			continue;
		}
		const type = APPLE_LABEL_TYPES.get(builtin.toLowerCase());
		if (type === undefined) continue;
		doomed.add(label);
		if (type === null) {
			ctx.info(
				"ablabel-dropped",
				`X-ABLabel ${excerpt(text)} dropped, it has no TYPE equivalent`,
				label,
			);
			continue;
		}
		for (const member of members) addType(member, type);
		ctx.info("ablabel-to-type", `X-ABLabel ${excerpt(text)} rewritten as TYPE=${type}`, label);
	}
	drop(card, doomed);
};

/** Vendor rules in the order they run; `appleLabels` must stay last. */
export const VENDOR_RULES: readonly Rule[] = [
	androidCustom,
	legacyIm,
	appleServiceType,
	appleOmitYear,
	appleDates,
	appleRelatedNames,
	appleSocialProfile,
	appleCountryCode,
	appleShowAs,
	addressBookServer,
	legacyGender,
	appleLabels,
];
