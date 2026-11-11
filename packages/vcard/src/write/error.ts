/**
 * Thrown by `serializeVCards` for a model no version can write: a binary value in 4.0, a date
 * shape outside the grammar, a VERSION property, a name or value that would break the line
 * structure, a value without the fields of its kind. Always a defect of the caller's model, never of input that went through the
 * parser and the normaliser; what a version merely cannot carry is dropped and reported as
 * an issue.
 */
export class SerializeError extends Error {
	override readonly name = "SerializeError";

	constructor(
		message: string,
		/** Index of the card in the `cards` argument. */
		readonly card?: number,
		/** `group.NAME` of the property, when the failure is tied to one. */
		readonly property?: string,
	) {
		super(message);
	}
}
