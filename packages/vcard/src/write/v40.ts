import { VALUE_TOKENS } from "../registry.js";
import { caretEncode } from "../text/caret.js";
import type { VProperty } from "../types.js";
import { SerializeError } from "./error.js";
import {
	hasControlChar,
	type Prepared,
	quoteIfNeeded,
	type SyntaxTable,
	TRANSPORT_PARAMS,
} from "./syntax.js";

/**
 * RFC 6350 syntax: parameters as given (caret-encoded, quoted when needed, comma lists), basic
 * ISO dates, `data:` URIs for media. A `binary` value has no 4.0 form: the normaliser turns it
 * into a `data:` URI, so meeting one here is a programming error.
 */
export const V40: SyntaxTable = {
	version: "4.0",
	dateFormat: {},

	prepare(p: VProperty): Prepared {
		if (p.value.kind === "binary") {
			throw new SerializeError(
				"vCard 4.0 has no inline binary values, upgrade the card first",
			);
		}
		for (const name of TRANSPORT_PARAMS) p.params.delete(name);
		return { params: p.params, value: p.value };
	},

	valueToken(value) {
		return VALUE_TOKENS.get(value.kind);
	},

	repeats() {
		return false;
	},

	encodeParamValue(name, value) {
		const encoded = caretEncode(value);
		if (hasControlChar(encoded)) {
			throw new SerializeError(`Control character in parameter ${name}`);
		}
		return quoteIfNeeded(encoded);
	},
};
