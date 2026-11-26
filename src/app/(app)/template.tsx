import type { ReactNode } from "react";

/**
 * A template (unlike a layout) re-mounts on every navigation, so each page
 * comes in with the same short rise — the app feels like one piece.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
