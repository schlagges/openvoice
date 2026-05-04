export const OPENVOICE_PHASE = 1 as const;

export * from "./permissions/index.js";

export interface OpenVoicePackageInfo {
  readonly name: string;
  readonly phase: typeof OPENVOICE_PHASE;
}

export function createPackageInfo(name: string): OpenVoicePackageInfo {
  return {
    name,
    phase: OPENVOICE_PHASE,
  };
}
