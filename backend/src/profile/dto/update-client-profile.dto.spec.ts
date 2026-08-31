import { validate } from "class-validator";
import { UpdateClientProfileDto } from "./update-client-profile.dto";

describe("UpdateClientProfileDto", () => {
  it.each(["firstName", "lastName", "phone"] as const)(
    "rejects explicit null for %s",
    async (field) => {
      const dto = new UpdateClientProfileDto();
      (dto as any)[field] = null;

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === field)).toBe(true);
    },
  );

  it("keeps omitted fields optional", async () => {
    const errors = await validate(new UpdateClientProfileDto());
    expect(errors).toHaveLength(0);
  });
});
