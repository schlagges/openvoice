export const OPENVOICE_PHASE = 9 as const;

export * from "./channels/index.js";
export * from "./gateway/index.js";
export * from "./messages/index.js";
export * from "./moderation/index.js";
export * from "./observability/index.js";
export * from "./permissions/index.js";
export * from "./voice/index.js";

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
