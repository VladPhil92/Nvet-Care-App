import { ProfileController } from "./profile.controller";

describe("Profile controller ownership contract", () => {
  it("does not expose a caller-selectable user id parameter", () => {
    const source = ProfileController.toString();
    expect(source).not.toContain("ownerId");
  });
});
