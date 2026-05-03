import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VetTier } from '@prisma/client';

// ============================================
// CONSTANTS
// ============================================

// Max prices per tier
const TIER_PRICE_LIMITS = {
  [VetTier.FREE]: 5,
  [VetTier.PRO]: 20,
  [VetTier.ELITE]: Infinity,
};

// CTG to COP exchange rate (should come from service/config)
const CTG_TO_COP_RATE = 30; // 1 CTG = 30 COP

// Min/Max price (COP)
const MIN_PRICE_COP = 5000;  // 5,000 COP minimum
const MAX_PRICE_COP = 10_000_000; // 10M COP maximum

@Injectable()
export class PricesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all prices for a vet
   */
  async getVetPrices(vetProfileId: string, activeOnly = true) {
    return this.prisma.price.findMany({
      where: {
        vetId: vetProfileId,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { priceCop: 'asc' },
    });
  }

  /**
   * Get vet's own prices (authenticated)
   */
  async getMyPrices(userId: string, activeOnly = false) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException('Vet profile not found');
    }

    return this.getVetPrices(vet.id, activeOnly);
  }

  /**
   * Create new price
   */
  async createPrice(
    userId: string,
    data: {
      serviceName: string;
      priceCop: number;
      priceCtg?: number;
      description?: string;
    },
  ) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: {
        _count: {
          select: {
            prices: { where: { isActive: true } },
          },
        },
      },
    });

    if (!vet) {
      throw new NotFoundException('Vet profile not found');
    }

    // Check tier limit
    const limit = TIER_PRICE_LIMITS[vet.tier];
    if (vet._count.prices >= limit) {
      throw new ForbiddenException(
        `Your ${vet.tier} tier allows max ${limit} active prices. Upgrade to add more.`,
      );
    }

    // Validate price range
    this.validatePriceRange(data.priceCop);

    // Check for duplicate service name
    const existing = await this.prisma.price.findFirst({
      where: {
        vetId: vet.id,
        serviceName: data.serviceName,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Service "${data.serviceName}" already exists. Update it instead.`,
      );
    }

    // Auto-calculate CTG price if not provided
    const priceCtg = data.priceCtg ?? this.convertCopToCtg(data.priceCop);

    return this.prisma.price.create({
      data: {
        vetId: vet.id,
        serviceName: data.serviceName,
        priceCop: data.priceCop,
        priceCtg,
        isActive: true,
      },
    });
  }

  /**
   * Update price
   */
  async updatePrice(
    userId: string,
    priceId: string,
    data: {
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

    if (!price) {
      throw new NotFoundException('Price not found');
    }

    // Ownership verification
    if (price.vet.userId !== userId) {
      throw new ForbiddenException('You can only update your own prices');
    }

    if (data.priceCop !== undefined) {
      this.validatePriceRange(data.priceCop);
    }

    // Check duplicate name if changing
    if (data.serviceName && data.serviceName !== price.serviceName) {
      const duplicate = await this.prisma.price.findFirst({
        where: {
          vetId: price.vetId,
          serviceName: data.serviceName,
          id: { not: priceId },
        },
      });

      if (duplicate) {
        throw new ConflictException('Service name already exists');
      }
    }

    // Auto-update CTG if only COP changed
    let priceCtg = data.priceCtg;
    if (data.priceCop !== undefined && priceCtg === undefined) {
      priceCtg = this.convertCopToCtg(data.priceCop);
    }

    return this.prisma.price.update({
      where: { id: priceId },
      data: {
        ...(data.serviceName && { serviceName: data.serviceName }),
        ...(data.priceCop !== undefined && { priceCop: data.priceCop }),
        ...(priceCtg !== undefined && { priceCtg }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Delete price (soft delete via isActive = false)
   */
  async deletePrice(userId: string, priceId: string, hardDelete = false) {
    const price = await this.prisma.price.findUnique({
      where: { id: priceId },
      include: { vet: true },
    });

    if (!price) {
      throw new NotFoundException('Price not found');
    }

    if (price.vet.userId !== userId) {
      throw new ForbiddenException('You can only delete your own prices');
    }

    if (hardDelete) {
      return this.prisma.price.delete({ where: { id: priceId } });
    }

    // Soft delete
    return this.prisma.price.update({
      where: { id: priceId },
      data: { isActive: false },
    });
  }

  /**
   * Bulk create prices (for onboarding)
   */
  async bulkCreatePrices(
    userId: string,
    prices: Array<{
      serviceName: string;
      priceCop: number;
      priceCtg?: number;
    }>,
  ) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: {
        _count: { select: { prices: { where: { isActive: true } } } },
      },
    });

    if (!vet) {
      throw new NotFoundException('Vet profile not found');
    }

    const limit = TIER_PRICE_LIMITS[vet.tier];
    if (vet._count.prices + prices.length > limit) {
      throw new ForbiddenException(
        `Adding ${prices.length} prices exceeds your ${vet.tier} limit of ${limit}`,
      );
    }

    // Validate all prices
    for (const p of prices) {
      this.validatePriceRange(p.priceCop);
    }

    // Check duplicates within request
    const names = prices.map((p) => p.serviceName);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Duplicate service names in request');
    }

    // Check existing duplicates
    const existing = await this.prisma.price.findMany({
      where: {
        vetId: vet.id,
        serviceName: { in: names },
      },
    });

    if (existing.length > 0) {
      throw new ConflictException(
        `Services already exist: ${existing.map((e) => e.serviceName).join(', ')}`,
      );
    }

    // Bulk insert
    const data = prices.map((p) => ({
      vetId: vet.id,
      serviceName: p.serviceName,
      priceCop: p.priceCop,
      priceCtg: p.priceCtg ?? this.convertCopToCtg(p.priceCop),
      isActive: true,
    }));

    return this.prisma.price.createMany({ data });
  }

  /**
   * Get price statistics for vet
   */
  async getPriceStats(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException('Vet profile not found');
    }

    const prices = await this.prisma.price.findMany({
      where: { vetId: vet.id, isActive: true },
    });

    if (prices.length === 0) {
      return {
        total: 0,
        avgPriceCop: 0,
        minPriceCop: 0,
        maxPriceCop: 0,
        tierLimit: TIER_PRICE_LIMITS[vet.tier],
        remaining: TIER_PRICE_LIMITS[vet.tier],
      };
    }

    const priceCops = prices.map((p) => p.priceCop);
    const sum = priceCops.reduce((a, b) => a + b, 0);
    const limit = TIER_PRICE_LIMITS[vet.tier];

    return {
      total: prices.length,
      avgPriceCop: Math.round(sum / prices.length),
      minPriceCop: Math.min(...priceCops),
      maxPriceCop: Math.max(...priceCops),
      tierLimit: limit === Infinity ? 'unlimited' : limit,
      remaining: limit === Infinity ? 'unlimited' : limit - prices.length,
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private validatePriceRange(priceCop: number) {
    if (priceCop < MIN_PRICE_COP) {
      throw new BadRequestException(
        `Minimum price is ${MIN_PRICE_COP.toLocaleString('es-CO')} COP`,
      );
    }

    if (priceCop > MAX_PRICE_COP) {
      throw new BadRequestException(
        `Maximum price is ${MAX_PRICE_COP.toLocaleString('es-CO')} COP`,
      );
    }
  }

  private convertCopToCtg(priceCop: number): number {
    return Math.round(priceCop / CTG_TO_COP_RATE);
  }
}
