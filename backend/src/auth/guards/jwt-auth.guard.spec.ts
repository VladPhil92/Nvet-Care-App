import { Test } from "@nestjs/testing";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard NestJS 12 composition", () => {
  it("constructs without requiring AuthModuleOptions in a consuming module", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [JwtAuthGuard],
    }).compile();

    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);

    await moduleRef.close();
  });
});
