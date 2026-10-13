import { getInitials } from "@pcobooster/planning-center-models/initials";
import { describe, expect, it } from "vitest";

describe(getInitials, () => {
  it.each([
    ["Jane Doe", "JD"],
    ["  Sam   Lee ", "SL"],
    ["dana", "DA"],
    ["Jo", "JO"],
    ["J", "J"],
    ["Christopher Alexander Montgomery III", "CM"],
    ["Martin Luther King Jr.", "MK"],
    ["Ólafur Darri Ólafsson", "ÓÓ"],
    ["Đặng Thị Ngọc Hân", "ĐH"],
    ["秀英 王", "秀王"],
    ["🦊 Fox", "FO"],
    ["👩🏽‍💻 Priya Shah", "PS"],
    ["", "?"],
    ["🎸", "?"],
  ])("%j gives %j", (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it("keeps a decomposed accent with its letter", () => {
    expect(getInitials("Élodie Martin")).toBe("ÉM");
  });
});
