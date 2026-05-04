import { OPENVOICE_PHASE } from "@openvoice/shared";

export function formatWebTitle(phase: typeof OPENVOICE_PHASE): string {
  return `OpenVoice Phase ${phase}`;
}

export function mountWebApp(app: Pick<HTMLDivElement, "textContent"> | null): void {
  if (app) {
    app.textContent = formatWebTitle(OPENVOICE_PHASE);
  }
}

if (typeof document !== "undefined") {
  mountWebApp(document.querySelector<HTMLDivElement>("#app"));
}
