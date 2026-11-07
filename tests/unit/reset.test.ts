import { describe, expect, it, vi } from "vitest";
import { isResetConfirmed, RESET_CONFIRM_WORD, resetMyData } from "@/lib/account/reset";

describe("reset confirmation", () => {
  it("needs the exact word (case and spaces forgiven)", () => {
    expect(isResetConfirmed(RESET_CONFIRM_WORD)).toBe(true);
    expect(isResetConfirmed("  tozalash ")).toBe(true);
    expect(isResetConfirmed("tozala")).toBe(false);
    expect(isResetConfirmed("")).toBe(false);
  });
});

describe("resetMyData", () => {
  it("calls the transactional RPC with the chosen mode", async () => {
    const summary = {
      mode: "all",
      items: 3,
      cards: 6,
      reviews: 9,
      productions: 1,
      texts: 0,
      settings: false,
    };
    const rpc = vi.fn(async () => ({ data: summary, error: null }));
    const r = await resetMyData({ rpc } as never, "all", false);
    expect(rpc).toHaveBeenCalledWith("reset_my_data", { p_mode: "all", p_reset_settings: false });
    expect(r).toEqual(summary);
  });

  it("surfaces server errors (nothing is changed server-side)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "not signed in" } }));
    await expect(resetMyData({ rpc } as never, "progress", true)).rejects.toThrow("not signed in");
  });
});
