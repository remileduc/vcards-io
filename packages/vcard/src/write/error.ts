/**
 * Raised inside the writer for a property no line can hold. It never leaves `serializeVCards`:
 * the engine leaves the property out and reports a `property-not-written` error.
 */
export class SerializeError extends Error {
	override readonly name = "SerializeError";
}
