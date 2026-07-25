/**
 * Thrown when an operation cannot be applied to a document.
 *
 * Op application is all-or-nothing: the store catches this, discards the
 * partially-built result, and leaves the document untouched. In the AI path the
 * message is fed back to the model for one repair attempt, so it should read as
 * an instruction to a model, not as an internal assertion.
 */
export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpError";
  }
}
