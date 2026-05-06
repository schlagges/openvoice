export class DuplicateEmailError extends Error {
  public constructor() {
    super("Email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export class DuplicateWorkspaceNameError extends Error {
  public constructor() {
    super("Workspace name already exists.");
    this.name = "DuplicateWorkspaceNameError";
  }
}
