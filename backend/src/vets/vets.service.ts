import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  VetTier,
  VerificationStatus,
  AppointmentStatus,
} from "@prisma/client";
import { SearchVetsDto } from "./dto/search-vets.dto";
import { UpdateVetProfileDto } from "./dto/update-vet-profile.dto";

// ============================================
// CONSTANTS
// ============================================

// Tier boost scores for ranking (ELITE > PRO > FREE)
const TIER_BOOST = {
  [VetTier.ELITE]: 3.0,
  [VetTier.PRO]: 2.0,
  [VetTier.FREE]: 1.0,
};

// Earth radius for Haversine formula
const EARTH_RADIUS_KM = 6371;

// Max results per search
const MAX_SEARCH_RESULTS = 100;
const DEFAULT_SEARCH_RADIUS_KM = 20;

@Injectable()
export class VetsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // SEARCH & DISCOVERY
  // ============================================

  /**
   * Advanced vet search with geolocation, tier-weighted ranking,
   * availability filtering, and multi-criteria scoring.
   *
   * Algorithm:
   * 1. Filter by hard constraints (verified, active)
   * 2. Apply user filters (tier, specialty, rating)
   * 3. Calculate distance using Haversine formula
   * 4. Compute composite score: tier_boost * rating * availability_factor / distance_penalty
   * 5. Sort by composite score descending
   */
  async searchVets(filters: SearchVetsDto) {
    const {
      latitude,
      longitude,
      radiusKm = DEFAULT_SEARCH_RADIUS_KM,
      specialty,
      tier,
      minRating,
      availableNow,
      availableDate,
      city,
      search,
      limit = 20,
      offset = 0,
      sortBy = "relevance",
    } = filters;

    // Build base where clause
    const where: Prisma.VetProfileWhereInput = {
      isActive: true,
      isVerified: true,
      verificationStatus: VerificationStatus.APPROVED,
    };

    // Apply filters
    if (tier) {
      where.tier = tier;
    }

    if (specialty) {
      where.specialties = { has: specialty };
    }

    if (minRating !== undefined) {
      where.rating = { gte: minRating };
    }

    if (availableNow) {
      where.isAvailableNow = true;
    }

    if (city) {
      where.city = { equals: city, mode: "insensitive" };
    }

    // Text search on name/bio
    if (search) {
      where.OR = [
        { bio: { contains: search, mode: "insensitive" } },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    // Fetch candidates (oversample for scoring)
    const fetchLimit = Math.min(limit * 3, MAX_SEARCH_RESULTS);

    const vets = await this.prisma.vetProfile.findMany({
      where,
      take: fetchLimit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
          },
        },
        prices: {
          where: { isActive: true },
          take: 3,
          orderBy: { priceCop: "asc" },
        },
        _count: {
          select: {
            appointments: {
              where: { status: AppointmentStatus.COMPLETED },
            },
            reviews: true,
          },
        },
      },
    });

    // Calculate distances and scores if geolocation provided
    const hasGeolocation = latitude !== undefined && longitude !== undefined;

    let scoredVets = vets.map((vet) => {
      let distance: number | null = null;
      let distanceScore = 1.0;

      // Haversine distance calculation
      if (hasGeolocation && vet.latitude && vet.longitude) {
        distance = this.calculateHaversineDistance(
          latitude,
          longitude,
          vet.latitude,
          vet.longitude,
        );

        // Distance penalty: closer = higher score
        distanceScore = Math.max(0.1, 1 - distance / (radiusKm * 2));
      }

      // Composite scoring formula
      const tierBoost = TIER_BOOST[vet.tier];
      const ratingScore = (vet.rating || 0) / 5; // Normalize 0-1
      const experienceScore = Math.min(1, (vet.yearsExperience || 0) / 10);
      const reviewCountScore = Math.min(1, vet._count.reviews / 50);
      const availabilityBonus = vet.isAvailableNow ? 1.2 : 1.0;

      const compositeScore =
        tierBoost *
        (0.4 * ratingScore +
          0.2 * experienceScore +
          0.2 * reviewCountScore +
          0.2 * distanceScore) *
        availabilityBonus;

      return {
        ...vet,
        distance,
        compositeScore,
        completedAppointments: vet._count.appointments,
        totalReviews: vet._count.reviews,
      };
    });

    // Filter by radius if geolocation provided
    if (hasGeolocation) {
      scoredVets = scoredVets.filter(
        (vet) => vet.distance === null || vet.distance <= radiusKm,
      );
    }

    // Filter by availability on specific date
    if (availableDate) {
      const date = new Date(availableDate);
      scoredVets = await this.filterByDateAvailability(scoredVets, date);
    }

    // Sort by specified criteria
    scoredVets = this.applySorting(scoredVets, sortBy);

    // Apply limit
    const results = scoredVets.slice(0, limit);
    const total = scoredVets.length;

    return {
      results: results.map(this.stripInternalFields),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get vet details by ID with full profile information
   */
  async getVetDetails(id: string, requesterUserId?: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            email: true,
          },
        },
        prices: {
          where: { isActive: true },
          orderBy: { priceCop: "asc" },
        },
        schedules: {
          where: { isActive: true },
          orderBy: { dayOfWeek: "asc" },
        },
        reviews: {
          include: {
            client: {
              select: {
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            appointments: {
              where: { status: AppointmentStatus.COMPLETED },
            },
            reviews: true,
          },
        },
      },
    });

    if (!vet) {
      throw new NotFoundException("Veterinarian not found");
    }

    // Hide unverified vets from public
    if (
      !vet.isVerified ||
      vet.verificationStatus !== VerificationStatus.APPROVED
    ) {
      // Allow the vet to see their own profile
      if (!requesterUserId || vet.userId !== requesterUserId) {
        throw new NotFoundException("Veterinarian not found");
      }
    }

    return {
      ...vet,
      completedAppointments: vet._count.appointments,
      totalReviews: vet._count.reviews,
      _count: undefined,
    };
  }

  /**
   * Get vet profile by userId (for authenticated vet's own profile)
   */
  async getMyVetProfile(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
        prices: true,
        schedules: true,
        verificationDocuments: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    return vet;
  }

  // ============================================
  // PROFILE MANAGEMENT
  // ============================================

  /**
   * Create vet profile (first-time setup)
   * Called automatically when user registers as VET
   */
  async createVetProfile(
    userId: string,
    data: {
      licenseNumber: string;
      specialties?: string[];
      bio?: string;
      yearsExperience?: number;
      comvezcolNumber?: string;
      universityName?: string;
      graduationYear?: number;
    },
  ) {
    const existing = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new BadRequestException("Vet profile already exists");
    }

    // Check license uniqueness
    const licenseExists = await this.prisma.vetProfile.findUnique({
      where: { licenseNumber: data.licenseNumber },
    });

    if (licenseExists) {
      throw new BadRequestException("License number already registered");
    }

    const vetProfile = await this.prisma.vetProfile.create({
      data: {
        userId,
        licenseNumber: data.licenseNumber,
        specialties: data.specialties || [],
        bio: data.bio,
        yearsExperience: data.yearsExperience,
        comvezcolNumber: data.comvezcolNumber,
        universityName: data.universityName,
        graduationYear: data.graduationYear,
        tier: VetTier.FREE,
        verificationStatus: VerificationStatus.NONE,
        isVerified: false,
        isActive: false, // Activated after verification
      },
      include: {
        user: true,
      },
    });

    return vetProfile;
  }

  /**
   * Update vet profile (authenticated vet)
   */
  async updateVetProfile(userId: string, data: UpdateVetProfileDto) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    return this.prisma.vetProfile.update({
      where: { userId },
      data: {
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.yearsExperience !== undefined && {
          yearsExperience: data.yearsExperience,
        }),
        ...(data.specialties && { specialties: data.specialties }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.city && { city: data.city }),
        ...(data.department && { department: data.department }),
        ...(data.serviceRadius !== undefined && {
          serviceRadius: data.serviceRadius,
        }),
        ...(data.isAvailableNow !== undefined && {
          isAvailableNow: data.isAvailableNow,
        }),
        ...(data.timezone && { timezone: data.timezone }),
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * Toggle "available now" status (for real-time emergency services)
   */
  async toggleAvailability(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    if (!vet.isVerified) {
      throw new ForbiddenException("Only verified vets can set availability");
    }

    return this.prisma.vetProfile.update({
      where: { userId },
      data: {
        isAvailableNow: !vet.isAvailableNow,
      },
    });
  }

  // ============================================
  // SCHEDULE EXCEPTIONS
  // ============================================

  async getScheduleExceptions(
    userId: string,
    startDate: string,
    endDate: string,
  ) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    return this.prisma.scheduleException.findMany({
      where: {
        vetProfileId: vet.id,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: "asc" },
    });
  }

  async upsertScheduleException(
    userId: string,
    dateStr: string,
    data: {
      isAvailable?: boolean;
      reason?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    const date = new Date(dateStr);

    return this.prisma.scheduleException.upsert({
      where: { vetProfileId_date: { vetProfileId: vet.id, date } },
      create: {
        vetProfileId: vet.id,
        date,
        isAvailable: data.isAvailable ?? false,
        reason: data.reason,
        startTime: data.startTime,
        endTime: data.endTime,
      },
      update: {
        isAvailable: data.isAvailable ?? false,
        reason: data.reason,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    });
  }

  async deleteScheduleException(userId: string, dateStr: string) {
    const vet = await this.prisma.vetProfile.findUnique({ where: { userId } });
    if (!vet) throw new NotFoundException("Vet profile not found");

    const date = new Date(dateStr);

    const exception = await this.prisma.scheduleException.findUnique({
      where: { vetProfileId_date: { vetProfileId: vet.id, date } },
    });

    if (!exception) throw new NotFoundException("Schedule exception not found");

    await this.prisma.scheduleException.delete({
      where: { vetProfileId_date: { vetProfileId: vet.id, date } },
    });
  }

  // ============================================
  // EARNINGS & ANALYTICS
  // ============================================

  /**
   * Get vet earnings summary with aggregations
   */
  async getMyEarnings(
    userId: string,
    filters: { startDate?: string; endDate?: string },
  ) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    const dateFilter: any = {};
    if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
    if (filters.endDate) dateFilter.lte = new Date(filters.endDate);

    // Get completed appointments with transactions
    const appointments = await this.prisma.appointment.findMany({
      where: {
        vetId: vet.id,
        status: AppointmentStatus.COMPLETED,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      include: {
        transaction: true,
      },
    });

    // Aggregate metrics
    let totalEarnings = 0;
    let totalCommissions = 0;
    let totalCtg = 0;
    let pendingBalance = 0;
    let availableBalance = 0;

    for (const apt of appointments) {
      if (!apt.transaction) continue;

      totalEarnings += apt.transaction.amountCop;
      totalCommissions += apt.transaction.commissionAmount;

      if (apt.transaction.amountCtg) {
        totalCtg += apt.transaction.amountCtg;
      }

      if (apt.transaction.status === "CONFIRMED") {
        pendingBalance += apt.amount - apt.transaction.commissionAmount;
      } else if (apt.transaction.status === "LIQUIDATED") {
        availableBalance += apt.amount - apt.transaction.commissionAmount;
      }
    }

    const netEarnings = totalEarnings - totalCommissions;

    // Group by month for charts
    const byMonth = this.groupAppointmentsByMonth(appointments);

    return {
      totalEarnings,
      totalCommissions,
      netEarnings,
      totalCtg,
      pendingBalance,
      availableBalance,
      transactionCount: appointments.length,
      byTier: {
        tier: vet.tier,
        commissionPct: this.getTierCommissionPct(vet.tier),
        commissionAmount: totalCommissions,
        earnings: netEarnings,
      },
      byMonth,
      ctgBalance: vet.ctgBalance,
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Haversine formula for great-circle distance between two points on Earth.
   * Returns distance in kilometers.
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
  }

  /**
   * Filter vets by availability on a specific date
   */
  private async filterByDateAvailability(vets: any[], date: Date) {
    const dayOfWeek = this.getDayOfWeek(date);
    const results = [];

    for (const vet of vets) {
      // Check schedule exception
      const exception = await this.prisma.scheduleException.findUnique({
        where: {
          vetProfileId_date: {
            vetProfileId: vet.id,
            date: new Date(date.toISOString().split("T")[0]),
          },
        },
      });

      if (exception && !exception.isAvailable) {
        continue; // Vet not available that day
      }

      // Check regular schedule
      const schedule = await this.prisma.vetSchedule.findUnique({
        where: {
          vetProfileId_dayOfWeek: {
            vetProfileId: vet.id,
            dayOfWeek,
          },
        },
      });

      if (!schedule || !schedule.isActive) {
        continue;
      }

      // Check existing appointments (slot availability)
      const appointmentCount = await this.prisma.appointment.count({
        where: {
          vetId: vet.id,
          date: new Date(date.toISOString().split("T")[0]),
          status: {
            in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
          },
        },
      });

      // Calculate max slots for the day
      const maxSlots = this.calculateMaxSlots(
        schedule.startTime,
        schedule.endTime,
        schedule.slotDuration,
      );

      if (appointmentCount < maxSlots) {
        results.push(vet);
      }
    }

    return results;
  }

  /**
   * Apply sorting based on criteria
   */
  private applySorting(vets: any[], sortBy: string) {
    switch (sortBy) {
      case "rating":
        return vets.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      case "distance":
        return vets.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });

      case "price_asc":
        return vets.sort((a, b) => {
          const aPrice = a.prices?.[0]?.priceCop || Infinity;
          const bPrice = b.prices?.[0]?.priceCop || Infinity;
          return aPrice - bPrice;
        });

      case "price_desc":
        return vets.sort((a, b) => {
          const aPrice = a.prices?.[0]?.priceCop || 0;
          const bPrice = b.prices?.[0]?.priceCop || 0;
          return bPrice - aPrice;
        });

      case "experience":
        return vets.sort(
          (a, b) => (b.yearsExperience || 0) - (a.yearsExperience || 0),
        );

      case "relevance":
      default:
        return vets.sort((a, b) => b.compositeScore - a.compositeScore);
    }
  }

  /**
   * Get day of week enum value from date
   */
  private getDayOfWeek(date: Date): any {
    const days = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    return days[date.getDay()];
  }

  /**
   * Calculate max appointment slots in a day
   */
  private calculateMaxSlots(
    startTime: string,
    endTime: string,
    slotDuration: number,
  ): number {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes;

    return Math.floor(totalMinutes / slotDuration);
  }

  /**
   * Get commission percentage by tier
   */
  private getTierCommissionPct(tier: VetTier): number {
    const commissions = {
      [VetTier.FREE]: 10,
      [VetTier.PRO]: 8,
      [VetTier.ELITE]: 3,
    };
    return commissions[tier];
  }

  /**
   * Group appointments by month for analytics
   */
  private groupAppointmentsByMonth(appointments: any[]) {
    const byMonth: Record<
      string,
      { count: number; earnings: number; commissions: number }
    > = {};

    for (const apt of appointments) {
      const monthKey = `${apt.date.getFullYear()}-${String(
        apt.date.getMonth() + 1,
      ).padStart(2, "0")}`;

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { count: 0, earnings: 0, commissions: 0 };
      }

      byMonth[monthKey].count += 1;
      if (apt.transaction) {
        byMonth[monthKey].earnings += apt.transaction.amountCop;
        byMonth[monthKey].commissions += apt.transaction.commissionAmount;
      }
    }

    return Object.entries(byMonth)
      .map(([month, data]) => ({
        month,
        ...data,
        netEarnings: data.earnings - data.commissions,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Remove internal scoring fields from response
   */
  private stripInternalFields = (vet: any) => {
    const { compositeScore: _compositeScore, _count, ...publicVet } = vet;
    return publicVet;
  };
}
