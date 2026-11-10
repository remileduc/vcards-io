/**
 * One relation kind as the three worlds name it. Shared by the Android and Apple upgrade
 * rules, the JSContact converter and the export profiles (docs/plan.md, "Relation mapping").
 */
export interface RelationType {
	/** RELATED TYPE value in vCard 4.0; `x-` prefixed when RFC 6350 has no word for it. */
	readonly type: string;
	/** `vnd.android.cursor.item/relation` type number (`data2`). */
	readonly android: number;
	/** Apple built-in label (`_$!<Name>!$_`) or Google text label, matched case-insensitively. */
	readonly label?: string;
}

export const RELATION_TYPES: readonly RelationType[] = [
	{ type: "x-assistant", android: 1, label: "Assistant" },
	{ type: "x-brother", android: 2, label: "Brother" },
	{ type: "child", android: 3, label: "Child" },
	{ type: "x-domestic-partner", android: 4, label: "Domestic Partner" },
	{ type: "x-father", android: 5, label: "Father" },
	{ type: "friend", android: 6, label: "Friend" },
	{ type: "x-manager", android: 7, label: "Manager" },
	{ type: "x-mother", android: 8, label: "Mother" },
	{ type: "parent", android: 9, label: "Parent" },
	{ type: "x-partner", android: 10, label: "Partner" },
	{ type: "x-referred-by", android: 11, label: "Referred By" },
	{ type: "kin", android: 12, label: "Relative" },
	{ type: "x-sister", android: 13, label: "Sister" },
	{ type: "spouse", android: 14, label: "Spouse" },
	/** Android type 0 and any label the table does not know; the label text is kept beside it. */
	{ type: "x-custom", android: 0 },
];

export function relationTypeForAndroid(type: number): RelationType | undefined {
	return RELATION_TYPES.find((r) => r.android === type);
}

/** Matches Apple's `Mother` and Google's `REFERRED_BY` alike: case, `_` and `-` do not count. */
export function relationTypeForLabel(label: string): RelationType | undefined {
	const wanted = foldLabel(label);
	return RELATION_TYPES.find((r) => r.label !== undefined && foldLabel(r.label) === wanted);
}

function foldLabel(label: string): string {
	return label.toLowerCase().replace(/[_-]+/g, " ").trim();
}
