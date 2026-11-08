/**
 * One-shot message carried across a client navigation ("3 ta so'z
 * qo'shildi" shown on the home page after the Add page). sessionStorage, so
 * it never outlives the tab and is read exactly once.
 */
const KEY = "ll.flash";

export interface Flash {
  tone: "success" | "warning";
  text: string;
}

export function setFlash(flash: Flash): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(flash));
  } catch {
    // private mode: the message is only a nicety
  }
}

export function takeFlash(): Flash | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const f = JSON.parse(raw) as Flash;
    return typeof f?.text === "string" ? f : null;
  } catch {
    return null;
  }
}
