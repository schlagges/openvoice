import argon2 from "argon2";

export interface PasswordHasher {
  hashPassword(password: string): Promise<string>;
  verifyPassword(hash: string, password: string): Promise<boolean>;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly pepper: string;

  public constructor(pepper: string) {
    this.pepper = pepper;
  }

  public async hashPassword(password: string): Promise<string> {
    return argon2.hash(this.applyPepper(password), {
      memoryCost: 19456,
      parallelism: 1,
      timeCost: 2,
      type: argon2.argon2id,
    });
  }

  public async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, this.applyPepper(password));
  }

  private applyPepper(password: string): string {
    return `${password}${this.pepper}`;
  }
}
