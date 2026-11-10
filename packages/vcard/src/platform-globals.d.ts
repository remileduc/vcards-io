// Globals every browser and Node provide but TypeScript types only in lib.dom: the WHATWG
// Encoding classes and HTML's structuredClone. Declaring just these keeps the library off lib.dom.
declare class TextEncoder {
	encode(input?: string): Uint8Array;
	encodeInto(source: string, destination: Uint8Array): { read: number; written: number };
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

declare function structuredClone<T>(value: T): T;
