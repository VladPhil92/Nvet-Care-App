import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { CTG_TO_COP_RATE } from "./commercial-policy";
import { PricesService } from "./prices.service";

const VET_USER_ID = "00000000-0000-4000-8000-000000000001";
const VET_PROFILE_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000003";
const PRICE_ID = "00000000-0000-4000-8000-000000000004";

// Technical guard rails from the service, restated so a silent widening of
// either bound fails here instead of in production.
const MIN_PRICE_COP = 5_000;
const MAX_PRICE_COP = 10_000_000;

describe("PricesService", () => {
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
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => data),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockImplementation(async (args) => args),
        delete: jest.fn().mockImplementation(async (args) => args),
      },
    };
    service = new PricesService(prisma);
  });

  // =========================================================================
  // Vet price autonomy: Nvet suggests, the veterinarian decides.
  // =========================================================================
  describe("getSuggestedCatalog", () => {
    it("presents the catalog as non-binding guidance", () => {
      const catalog = service.getSuggestedCatalog();

      expect(catalog.disclaimer).toMatch(/sugerid/i);
      expect(catalog.ctgToCopRate).toBe(CTG_TO_COP_RATE);
      expect(catalog.services.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // createPrice
  // =========================================================================
  describe("createPrice", () => {
    it("requires an existing vet profile", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createPrice(VET_USER_ID, {
          serviceName: "Consulta",
          priceCop: 90_000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.price.create).not.toHaveBeenCalled();
    });

    it("accepts any amount inside the technical bounds", async () => {
      for (const priceCop of [MIN_PRICE_COP, 90_000, MAX_PRICE_COP]) {
        prisma.price.create.mockClear();
        await service.createPrice(VET_USER_ID, {
          serviceName: "Consulta libre",
          priceCop,
        });
        expect(prisma.price.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ priceCop }),
          }),
        );
      }
    });

    it.each([
      ["below the technical minimum", MIN_PRICE_COP - 1],
      ["above the technical maximum", MAX_PRICE_COP + 1],
      ["zero", 0],
      ["negative", -1_000],
    ])("refuses an amount %s", async (_label, priceCop) => {
      await expect(
        service.createPrice(VET_USER_ID, { serviceName: "Consulta", priceCop }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.create).not.toHaveBeenCalled();
    });

    it("derives the CTG amount from the canonical rate when none is given", async () => {
      await service.createPrice(VET_USER_ID, {
        serviceName: "Consulta general",
        priceCop: 90_000,
      });

      expect(prisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceCtg: 90_000 / CTG_TO_COP_RATE,
          }),
        }),
      );
    });

    it("keeps an explicitly provided CTG amount", async () => {
      await service.createPrice(VET_USER_ID, {
        serviceName: "Consulta general",
        priceCop: 90_000,
        priceCtg: 42,
      });

      expect(prisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceCtg: 42 }),
        }),
      );
    });

    it("canonicalizes the name of a known Nvet service code", async () => {
      await service.createPrice(VET_USER_ID, {
        serviceCode: "GENERAL_CONSULTATION",
        serviceName: "lo que sea que el vet escriba",
        priceCop: 90_000,
      });

      expect(prisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serviceCode: "GENERAL_CONSULTATION",
            serviceName: "Consulta general",
          }),
        }),
      );
    });

    it("refuses an unknown service code instead of inventing one", async () => {
      await expect(
        service.createPrice(VET_USER_ID, {
          serviceCode: "NOT_A_REAL_CODE",
          serviceName: "Consulta",
          priceCop: 90_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.create).not.toHaveBeenCalled();
    });

    it("keeps a free-form service without a code", async () => {
      await service.createPrice(VET_USER_ID, {
        serviceName: "  Terapia personalizada  ",
        priceCop: 60_000,
      });

      expect(prisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serviceCode: null,
            serviceName: "Terapia personalizada",
          }),
        }),
      );
    });

    it("refuses a blank service name", async () => {
      await expect(
        service.createPrice(VET_USER_ID, {
          serviceName: "   ",
          priceCop: 60_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a service the vet already offers", async () => {
      prisma.price.findFirst.mockResolvedValue({ id: PRICE_ID });

      await expect(
        service.createPrice(VET_USER_ID, {
          serviceName: "Consulta general",
          priceCop: 90_000,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.price.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updatePrice / deletePrice — ownership is the boundary that matters
  // =========================================================================
  describe("updatePrice", () => {
    const ownedPrice = {
      id: PRICE_ID,
      vetId: VET_PROFILE_ID,
      serviceCode: null,
      serviceName: "Consulta",
      priceCop: 90_000,
      vet: { userId: VET_USER_ID },
    };

    it("reports a missing price", async () => {
      prisma.price.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePrice(VET_USER_ID, PRICE_ID, { priceCop: 100_000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses to let one vet change another vet's price", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await expect(
        service.updatePrice(OTHER_USER_ID, PRICE_ID, { priceCop: 100_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.update).not.toHaveBeenCalled();
    });

    it("enforces the technical bounds on an update too", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await expect(
        service.updatePrice(VET_USER_ID, PRICE_ID, {
          priceCop: MAX_PRICE_COP + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.update).not.toHaveBeenCalled();
    });

    it("recomputes CTG when only the COP amount changes", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await service.updatePrice(VET_USER_ID, PRICE_ID, { priceCop: 120_000 });

      expect(prisma.price.update).toHaveBeenCalledWith({
        where: { id: PRICE_ID },
        data: { priceCop: 120_000, priceCtg: 120_000 / CTG_TO_COP_RATE },
      });
    });

    it("leaves the amounts untouched when only toggling availability", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await service.updatePrice(VET_USER_ID, PRICE_ID, { isActive: false });

      expect(prisma.price.update).toHaveBeenCalledWith({
        where: { id: PRICE_ID },
        data: { isActive: false },
      });
    });

    it("re-checks uniqueness when the service identity changes", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);
      prisma.price.findFirst.mockResolvedValue({ id: "another-price" });

      await expect(
        service.updatePrice(VET_USER_ID, PRICE_ID, {
          serviceName: "Vacunación",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("excludes the row being edited from its own uniqueness check", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await service.updatePrice(VET_USER_ID, PRICE_ID, {
        serviceName: "Consulta renombrada",
      });

      expect(prisma.price.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: PRICE_ID } }),
        }),
      );
    });
  });

  describe("deletePrice", () => {
    const ownedPrice = {
      id: PRICE_ID,
      vetId: VET_PROFILE_ID,
      vet: { userId: VET_USER_ID },
    };

    it("refuses to let one vet delete another vet's price", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await expect(
        service.deletePrice(OTHER_USER_ID, PRICE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.update).not.toHaveBeenCalled();
      expect(prisma.price.delete).not.toHaveBeenCalled();
    });

    it("deactivates rather than destroying by default", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await service.deletePrice(VET_USER_ID, PRICE_ID);

      expect(prisma.price.update).toHaveBeenCalledWith({
        where: { id: PRICE_ID },
        data: { isActive: false },
      });
      expect(prisma.price.delete).not.toHaveBeenCalled();
    });

    it("destroys the row only when a hard delete is requested", async () => {
      prisma.price.findUnique.mockResolvedValue(ownedPrice);

      await service.deletePrice(VET_USER_ID, PRICE_ID, true);

      expect(prisma.price.delete).toHaveBeenCalledWith({
        where: { id: PRICE_ID },
      });
      expect(prisma.price.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // bulkCreatePrices — onboarding path
  // =========================================================================
  describe("bulkCreatePrices", () => {
    it("refuses a batch that repeats the same service twice", async () => {
      await expect(
        service.bulkCreatePrices(VET_USER_ID, [
          { serviceName: "Consulta", priceCop: 90_000 },
          { serviceName: "consulta", priceCop: 95_000 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.createMany).not.toHaveBeenCalled();
    });

    it("refuses a batch colliding with a service the vet already has", async () => {
      prisma.price.findMany.mockResolvedValue([
        { serviceCode: null, serviceName: "Consulta" },
      ]);

      await expect(
        service.bulkCreatePrices(VET_USER_ID, [
          { serviceName: "CONSULTA", priceCop: 90_000 },
        ]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.price.createMany).not.toHaveBeenCalled();
    });

    it("rejects the whole batch when any single amount is out of bounds", async () => {
      await expect(
        service.bulkCreatePrices(VET_USER_ID, [
          { serviceName: "Consulta", priceCop: 90_000 },
          { serviceName: "Vacunación", priceCop: MIN_PRICE_COP - 1 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.price.createMany).not.toHaveBeenCalled();
    });

    it("creates every service with a derived CTG amount", async () => {
      await service.bulkCreatePrices(VET_USER_ID, [
        { serviceName: "Consulta", priceCop: 90_000 },
        { serviceName: "Vacunación", priceCop: 60_000 },
      ]);

      const [payload] = prisma.price.createMany.mock.calls[0];
      expect(payload.data).toHaveLength(2);
      expect(payload.data[0]).toMatchObject({
        vetId: VET_PROFILE_ID,
        priceCop: 90_000,
        priceCtg: 90,
        isActive: true,
      });
    });
  });

  // =========================================================================
  // getPriceStats — membership tier must never cap the service count
  // =========================================================================
  describe("getPriceStats", () => {
    it("returns a zeroed summary with no prices, without dividing by zero", async () => {
      prisma.price.findMany.mockResolvedValue([]);

      await expect(service.getPriceStats(VET_USER_ID)).resolves.toEqual({
        total: 0,
        avgPriceCop: 0,
        minPriceCop: 0,
        maxPriceCop: 0,
        tierLimit: "unlimited",
        remaining: "unlimited",
      });
    });

    it("summarizes the active prices and keeps the tier unlimited", async () => {
      prisma.price.findMany.mockResolvedValue([
        { priceCop: 50_000 },
        { priceCop: 90_000 },
        { priceCop: 130_000 },
      ]);

      await expect(service.getPriceStats(VET_USER_ID)).resolves.toEqual({
        total: 3,
        avgPriceCop: 90_000,
        minPriceCop: 50_000,
        maxPriceCop: 130_000,
        tierLimit: "unlimited",
        remaining: "unlimited",
      });
    });

    it("requires an existing vet profile", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(service.getPriceStats(VET_USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // read paths
  // =========================================================================
  describe("getMyPrices", () => {
    it("requires an existing vet profile", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyPrices(VET_USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns inactive prices too so the vet can re-enable them", async () => {
      await service.getMyPrices(VET_USER_ID);

      expect(prisma.price.findMany).toHaveBeenCalledWith({
        where: { vetId: VET_PROFILE_ID },
        orderBy: { priceCop: "asc" },
      });
    });
  });

  describe("getVetPrices", () => {
    it("shows only active prices to the public by default", async () => {
      await service.getVetPrices(VET_PROFILE_ID);

      expect(prisma.price.findMany).toHaveBeenCalledWith({
        where: { vetId: VET_PROFILE_ID, isActive: true },
        orderBy: { priceCop: "asc" },
      });
    });
  });
});
