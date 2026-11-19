// Globals of every browser and of Node that TypeScript types only in lib.dom. Declaring just
// these keeps the libraries off lib.dom: every library tsconfig lists this file.
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

// Web Crypto, global in every browser and in Node; only what the libraries call.
declare const crypto: { randomUUID(): string };
