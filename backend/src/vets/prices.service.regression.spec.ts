import { BadRequestException } from "@nestjs/common";
import { PricesService } from "./prices.service";

const VET_USER_ID = "00000000-0000-4000-8000-000000000001";
const VET_PROFILE_ID = "00000000-0000-4000-8000-000000000002";

describe("PricesService regression coverage", () => {
  let prisma: any;
  let service: PricesService;

  beforeEach(() => {
    prisma = {
      vetProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: VET_PROFILE_ID,
          userId: VET_USER_ID,
        }),
      },
      price: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        createMany: jest.fn(),
      },
    };
    service = new PricesService(prisma);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite COP price: %s",
    async (priceCop) => {
      await expect(
        service.createPrice(VET_USER_ID, {
          serviceName: "Consulta",
          priceCop,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.price.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a mixed coded/free-form duplicate inside one bulk request", async () => {
    await expect(
      service.bulkCreatePrices(VET_USER_ID, [
        {
          serviceCode: "GENERAL_CONSULTATION",
          serviceName: "ignored by canonicalization",
          priceCop: 90_000,
        },
        {
          serviceName: "consulta general",
          priceCop: 95_000,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.price.findMany).not.toHaveBeenCalled();
    expect(prisma.price.createMany).not.toHaveBeenCalled();
  });
});
