import { OPENVOICE_PHASE } from "@openvoice/shared";

export { createOpenVoiceApiServer } from "./server.js";

export interface ApiRuntimeInfo {
  readonly app: "api";
  readonly phase: typeof OPENVOICE_PHASE;
}

export function getApiRuntimeInfo(): ApiRuntimeInfo {
  return {
    app: "api",
    phase: OPENVOICE_PHASE,
  };
}
