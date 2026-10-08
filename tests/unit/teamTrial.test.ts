import { expect, it } from "vitest";
import { add } from "@/lib/teamTrial";


it("adds two numbers", () => {
  expect(add(2, 2)).toBe(4);
});