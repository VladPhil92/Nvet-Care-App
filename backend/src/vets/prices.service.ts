import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CTG_TO_COP_RATE,
  SUGGESTED_SERVICE_CATALOG,
  findSuggestedService,
} from "./commercial-policy";

// Límites técnicos anti-error. No son precios sugeridos ni restricciones comerciales.
const MIN_PRICE_COP = 5_000;
const MAX_PRICE_COP = 10_000_000;

interface PriceInput {
  serviceCode?: string;
  serviceName: string;
  priceCop: number;
  priceCtg?: number;
}

@Injectable()
export class PricesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Catálogo orientativo de Nvet. Los rangos y valores NO son obligatorios:
   * el veterinario conserva la decisión sobre su precio final.
   */
  getSuggestedCatalog() {
    return {
      disclaimer:
        "Los precios de Nvet son referencias sugeridas. Cada veterinario define libremente el precio final de sus servicios.",
      ctgToCopRate: CTG_TO_COP_RATE,
      services: SUGGESTED_SERVICE_CATALOG,
    };
  }

  /** Get all prices for a vet. */
  async getVetPrices(vetProfileId: string, activeOnly = true) {
    return this.prisma.price.findMany({
      where: {
        vetId: vetProfileId,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { priceCop: "asc" },
    });
  }

  /** Get vet's own prices (authenticated). */
  async getMyPrices(userId: string, activeOnly = false) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");
    return this.getVetPrices(vet.id, activeOnly);
  }

  /**
   * Create a service price. Membership tier never limits the number of
   * services: Nvet monetizes through the tier commission and paid membership.
   */
  async createPrice(userId: string, data: PriceInput) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    this.validatePriceRange(data.priceCop);
    const normalized = this.normalizeService(
      data.serviceCode,
      data.serviceName,
    );

    await this.assertServiceIsUnique(
      vet.id,
      normalized.serviceName,
      normalized.serviceCode,
    );

    return this.prisma.price.create({
      data: {
        vetId: vet.id,
        serviceCode: normalized.serviceCode,
        serviceName: normalized.serviceName,
        priceCop: data.priceCop,
        priceCtg: data.priceCtg ?? this.convertCopToCtg(data.priceCop),
        isActive: true,
      },
    });
  }

  /** Update a service price. The final amount remains entirely vet-defined. */
  async updatePrice(
    userId: string,
    priceId: string,
    data: {
      serviceCode?: string;
      serviceName?: string;
      priceCop?: number;
      priceCtg?: number;
      isActive?: boolean;
    },
  ) {
    const price = await this.prisma.price.findUnique({
      where: { id: priceId },
      include: { vet: true },
    });

    if (!price) throw new NotFoundException("Price not found");
    if (price.vet.userId !== userId) {
      throw new BadRequestException("You can only update your own prices");
    }

    if (data.priceCop !== undefined) this.validatePriceRange(data.priceCop);

    const changingIdentity =
      data.serviceCode !== undefined || data.serviceName !== undefined;
    const normalized = changingIdentity
      ? this.normalizeService(
          data.serviceCode ?? price.serviceCode ?? undefined,
          data.serviceName ?? price.serviceName,
        )
      : { serviceCode: price.serviceCode, serviceName: price.serviceName };

    if (
      normalized.serviceName !== price.serviceName ||
      normalized.serviceCode !== price.serviceCode
    ) {
      await this.assertServiceIsUnique(
        price.vetId,
        normalized.serviceName,
        normalized.serviceCode ?? undefined,
        priceId,
      );
    }

    let priceCtg = data.priceCtg;
    if (data.priceCop !== undefined && priceCtg === undefined) {
      priceCtg = this.convertCopToCtg(data.priceCop);
    }

    return this.prisma.price.update({
      where: { id: priceId },
      data: {
        ...(changingIdentity && {
          serviceCode: normalized.serviceCode,
          serviceName: normalized.serviceName,
        }),
        ...(data.priceCop !== undefined && { priceCop: data.priceCop }),
        ...(priceCtg !== undefined && { priceCtg }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /** Delete price (soft delete by default). */
  async deletePrice(userId: string, priceId: string, hardDelete = false) {
    const price = await this.prisma.price.findUnique({
      where: { id: priceId },
      include: { vet: true },
    });
    if (!price) throw new NotFoundException("Price not found");
    if (price.vet.userId !== userId) {
      throw new BadRequestException("You can only delete your own prices");
    }

    if (hardDelete) return this.prisma.price.delete({ where: { id: priceId } });
    return this.prisma.price.update({
      where: { id: priceId },
      data: { isActive: false },
    });
  }

  /** Bulk create prices (onboarding). Unlimited across all membership tiers. */
  async bulkCreatePrices(userId: string, prices: PriceInput[]) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    const normalized = prices.map((price) => {
      this.validatePriceRange(price.priceCop);
      const service = this.normalizeService(
        price.serviceCode,
        price.serviceName,
      );
      return { ...price, ...service };
    });

    const hasDuplicateInRequest = normalized.some((candidate, index) =>
      normalized
        .slice(0, index)
        .some(
          (current) =>
            (candidate.serviceCode &&
              current.serviceCode === candidate.serviceCode) ||
            current.serviceName.toLowerCase() ===
              candidate.serviceName.toLowerCase(),
        ),
    );
    if (hasDuplicateInRequest) {
      throw new BadRequestException("Duplicate services in request");
    }

    const existing = await this.prisma.price.findMany({
      where: { vetId: vet.id },
    });
    const conflicts = normalized.filter((candidate) =>
      existing.some(
        (current) =>
          (candidate.serviceCode &&
            current.serviceCode === candidate.serviceCode) ||
          current.serviceName.toLowerCase() ===
            candidate.serviceName.toLowerCase(),
      ),
    );
    if (conflicts.length > 0) {
      throw new ConflictException(
        `Services already exist: ${conflicts.map((p) => p.serviceName).join(", ")}`,
      );
    }

    return this.prisma.price.createMany({
      data: normalized.map((p) => ({
        vetId: vet.id,
        serviceCode: p.serviceCode,
        serviceName: p.serviceName,
        priceCop: p.priceCop,
        priceCtg: p.priceCtg ?? this.convertCopToCtg(p.priceCop),
        isActive: true,
      })),
    });
  }

  async getPriceStats(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    const prices = await this.prisma.price.findMany({
      where: { vetId: vet.id, isActive: true },
    });

    if (prices.length === 0) {
      return {
        total: 0,
        avgPriceCop: 0,
        minPriceCop: 0,
        maxPriceCop: 0,
        tierLimit: "unlimited",
        remaining: "unlimited",
      };
    }

    const priceCops = prices.map((p) => p.priceCop);
    const sum = priceCops.reduce((a, b) => a + b, 0);
    return {
      total: prices.length,
      avgPriceCop: Math.round(sum / prices.length),
      minPriceCop: Math.min(...priceCops),
      maxPriceCop: Math.max(...priceCops),
      tierLimit: "unlimited",
      remaining: "unlimited",
    };
  }

  private normalizeService(
    serviceCode: string | undefined,
    serviceName: string,
  ) {
    const trimmedName = serviceName.trim();
    if (!trimmedName) throw new BadRequestException("Service name is required");

    if (!serviceCode) {
      return { serviceCode: null as string | null, serviceName: trimmedName };
    }

    const suggested = findSuggestedService(serviceCode);
    if (!suggested) {
      throw new BadRequestException(
        `Unknown Nvet service code: ${serviceCode}`,
      );
    }

    return {
      serviceCode: suggested.code,
      serviceName: suggested.name,
    };
  }

  private async assertServiceIsUnique(
    vetId: string,
    serviceName: string,
    serviceCode?: string | null,
    excludePriceId?: string,
  ) {
    const existing = await this.prisma.price.findFirst({
      where: {
        vetId,
        ...(excludePriceId && { id: { not: excludePriceId } }),
        OR: [
          { serviceName: { equals: serviceName, mode: "insensitive" } },
          ...(serviceCode ? [{ serviceCode }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException(
        `Service "${serviceName}" already exists. Update it instead.`,
      );
    }
  }

  private validatePriceRange(priceCop: number) {
    if (!Number.isFinite(priceCop)) {
      throw new BadRequestException("Price must be a finite number");
    }
    if (priceCop < MIN_PRICE_COP) {
      throw new BadRequestException(
        `Minimum technical price is ${MIN_PRICE_COP.toLocaleString("es-CO")} COP`,
      );
    }
    if (priceCop > MAX_PRICE_COP) {
      throw new BadRequestException(
        `Maximum technical price is ${MAX_PRICE_COP.toLocaleString("es-CO")} COP`,
      );
    }
  }

  private convertCopToCtg(priceCop: number): number {
    return Math.round((priceCop / CTG_TO_COP_RATE) * 100) / 100;
  }
}
