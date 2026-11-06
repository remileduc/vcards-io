// TextEncoder / TextDecoder are WHATWG Encoding globals present in every browser and in Node,
// but typed only in lib.dom. Declaring the subset used here keeps the library off the DOM lib.
declare class TextEncoder {
	encode(input?: string): Uint8Array;
}

interface TextDecoderOptions {
	fatal?: boolean;
	ignoreBOM?: boolean;
}

declare class TextDecoder {
	constructor(label?: string, options?: TextDecoderOptions);
	readonly encoding: string;
	readonly fatal: boolean;
	decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string;
}
