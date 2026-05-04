export class DuplicateEmailError extends Error {
  public constructor() {
    super("Email already exists.");
    this.name = "DuplicateEmailError";
  }
}
