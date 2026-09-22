import {
  AppointmentStatus,
  DayOfWeek,
  PaymentMethod,
  PrismaClient,
  UserRole,
  VerificationStatus,
  VetTier,
} from "@prisma/client";

import { PasswordService } from "../src/auth/services/password.service";

const prisma = new PrismaClient();
const passwordService = new PasswordService();

const FIXTURE_IDS = {
  pet: "00000000-0000-4000-8000-000000000101",
  pendingAppointment: "00000000-0000-4000-8000-000000000201",
  confirmedAppointment: "00000000-0000-4000-8000-000000000202",
  registryCheck: "00000000-0000-4000-8000-000000000301",
};

const E2E_VET_LICENSE = "NVET-E2E-0001";
const E2E_VET_COMVEZCOL = "99999-9";
const E2E_VET_SPECIALTIES = ["Consulta general", "Emergencias"];

// Staging must satisfy the same market-supply invariant as production without
// weakening MarketLaunchGuard. These auxiliary identities exist only because
// assertSeedAllowed() refuses this seed outside test/staging. They are coverage
// fixtures, not beta evidence and not real veterinarians.
const AUXILIARY_COVERAGE_VETS = [
  {
    email: "nvet-e2e-coverage-2@nvetcare.invalid",
    firstName: "Veterinario",
    lastName: "Cobertura E2E 2",
    licenseNumber: "NVET-E2E-0002",
    comvezcolNumber: "99999-8",
    registryCheckId: "00000000-0000-4000-8000-000000000302",
    latitude: 10.4101,
    longitude: -75.5058,
  },
  {
    email: "nvet-e2e-coverage-3@nvetcare.invalid",
    firstName: "Veterinario",
    lastName: "Cobertura E2E 3",
    licenseNumber: "NVET-E2E-0003",
    comvezcolNumber: "99999-7",
    registryCheckId: "00000000-0000-4000-8000-000000000303",
    latitude: 10.3898,
    longitude: -75.5232,
  },
] as const;

const OFFICIAL_REGISTRY_URL =
  "https://consejoprofesionalmvz.gov.co/consulta-de-profesionales/";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`E2E seed refused: ${name} is required.`);
  }
  return value;
}

function optionalCredentialPair(
  emailName: string,
  passwordName: string,
): { email: string; password: string } | null {
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName];

  if (Boolean(email) !== Boolean(password)) {
    throw new Error(
      `E2E seed refused: ${emailName} and ${passwordName} must be configured together.`,
    );
  }

  if (!email || !password) return null;
  return { email: email.toLowerCase(), password };
}

function assertSeedAllowed(): void {
  const target = process.env.NVET_SEED_TARGET?.trim().toLowerCase();
  const enabled = process.env.NVET_ALLOW_E2E_SEED === "true";

  if (!enabled || (target !== "test" && target !== "staging")) {
    throw new Error(
      "E2E seed refused. Set NVET_ALLOW_E2E_SEED=true and NVET_SEED_TARGET=test|staging explicitly.",
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("E2E seed refused: DATABASE_URL is required.");
  }
}

function bogotaDate(offsetDays = 0): Date {
  const bogotaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      bogotaNow.getUTCFullYear(),
      bogotaNow.getUTCMonth(),
      bogotaNow.getUTCDate() + offsetDays,
      17,
      0,
      0,
      0,
    ),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--check")) {
    console.log("E2E seed TypeScript loaded successfully.");
    return;
  }

  assertSeedAllowed();

  const clientEmail = requiredEnv("E2E_CLIENT_EMAIL").toLowerCase();
  const clientPassword = requiredEnv("E2E_CLIENT_PASSWORD");
  const vetEmail = requiredEnv("E2E_VET_EMAIL").toLowerCase();
  const vetPassword = requiredEnv("E2E_VET_PASSWORD");
  const adminCredentials = optionalCredentialPair(
    "E2E_ADMIN_EMAIL",
    "E2E_ADMIN_PASSWORD",
  );

  const fixtureEmails = [
    clientEmail,
    vetEmail,
    ...AUXILIARY_COVERAGE_VETS.map((fixture) => fixture.email),
    ...(adminCredentials ? [adminCredentials.email] : []),
  ];
  if (new Set(fixtureEmails).size !== fixtureEmails.length) {
    throw new Error(
      "E2E seed refused: fixture identities must use different emails.",
    );
  }

  const [clientPasswordHash, vetPasswordHash, adminPasswordHash] =
    await Promise.all([
      passwordService.hash(clientPassword),
      passwordService.hash(vetPassword),
      adminCredentials
        ? passwordService.hash(adminCredentials.password)
        : Promise.resolve(null),
    ]);

  const client = await prisma.user.upsert({
    where: { email: clientEmail },
    update: {
      passwordHash: clientPasswordHash,
      role: UserRole.CLIENT,
      firstName: "Cliente",
      lastName: "E2E",
      ctgBalance: 10_000,
      emailVerified: true,
      isActive: true,
      deactivatedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      recoveryCodesHash: [],
      passwordChangedAt: new Date(),
    },
    create: {
      email: clientEmail,
      passwordHash: clientPasswordHash,
      role: UserRole.CLIENT,
      firstName: "Cliente",
      lastName: "E2E",
      ctgBalance: 10_000,
      emailVerified: true,
      isActive: true,
      passwordChangedAt: new Date(),
    },
  });

  const vetUser = await prisma.user.upsert({
    where: { email: vetEmail },
    update: {
      passwordHash: vetPasswordHash,
      role: UserRole.VET,
      firstName: "Veterinario",
      lastName: "E2E",
      emailVerified: true,
      isActive: true,
      deactivatedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      recoveryCodesHash: [],
      passwordChangedAt: new Date(),
    },
    create: {
      email: vetEmail,
      passwordHash: vetPasswordHash,
      role: UserRole.VET,
      firstName: "Veterinario",
      lastName: "E2E",
      emailVerified: true,
      isActive: true,
      passwordChangedAt: new Date(),
    },
  });

  let adminEmail: string | null = null;
  if (adminCredentials && adminPasswordHash) {
    adminEmail = adminCredentials.email;
    await prisma.user.upsert({
      where: { email: adminCredentials.email },
      update: {
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        firstName: "Administrador",
        lastName: "E2E",
        emailVerified: true,
        isActive: true,
        deactivatedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodesHash: [],
        passwordChangedAt: new Date(),
      },
      create: {
        email: adminCredentials.email,
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        firstName: "Administrador",
        lastName: "E2E",
        emailVerified: true,
        isActive: true,
        passwordChangedAt: new Date(),
      },
    });
  }

  // The professional fixture is canonical by license, not by user identity.
  // On first insertion the database trust trigger intentionally forces the
  // profile inactive because no registry evidence exists yet. The synthetic
  // registry evidence is created immediately below, and only then is the
  // isolated staging veterinarian activated.
  const vetProfile = await prisma.vetProfile.upsert({
    where: { licenseNumber: E2E_VET_LICENSE },
    update: {
      userId: vetUser.id,
      specialties: E2E_VET_SPECIALTIES,
      tier: VetTier.ELITE,
      bio: "Fixture veterinario para pruebas E2E de Nvet Care.",
      yearsExperience: 10,
      rating: 5,
      reviewCount: 20,
      isVerified: true,
      isActive: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      latitude: 10.3997,
      longitude: -75.5144,
      city: "Cartagena",
      department: "Bolívar",
      serviceRadius: 30,
      isAvailableNow: true,
      timezone: "America/Bogota",
      comvezcolNumber: E2E_VET_COMVEZCOL,
    },
    create: {
      userId: vetUser.id,
      licenseNumber: E2E_VET_LICENSE,
      specialties: E2E_VET_SPECIALTIES,
      tier: VetTier.ELITE,
      bio: "Fixture veterinario para pruebas E2E de Nvet Care.",
      yearsExperience: 10,
      rating: 5,
      reviewCount: 20,
      isVerified: true,
      isActive: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      latitude: 10.3997,
      longitude: -75.5144,
      city: "Cartagena",
      department: "Bolívar",
      serviceRadius: 30,
      isAvailableNow: true,
      timezone: "America/Bogota",
      comvezcolNumber: E2E_VET_COMVEZCOL,
    },
  });

  await prisma.vetProfessionalRegistryCheck.upsert({
    where: { vetProfileId: vetProfile.id },
    update: {
      status: "VERIFIED",
      checkedById: null,
      evidence:
        "Synthetic staging-only registry evidence for NVET-E2E-0001. Not a real professional identity.",
      sourceUrl: OFFICIAL_REGISTRY_URL,
      checkedAt: new Date(),
    },
    create: {
      id: FIXTURE_IDS.registryCheck,
      vetProfileId: vetProfile.id,
      status: "VERIFIED",
      checkedById: null,
      evidence:
        "Synthetic staging-only registry evidence for NVET-E2E-0001. Not a real professional identity.",
      sourceUrl: OFFICIAL_REGISTRY_URL,
      checkedAt: new Date(),
    },
  });

  await prisma.vetProfile.update({
    where: { id: vetProfile.id },
    data: {
      isVerified: true,
      verificationStatus: VerificationStatus.APPROVED,
      isActive: true,
      isAvailableNow: true,
    },
  });

  // Keep the staging market guard meaningful: create enough synthetic,
  // geo-consistent, verified profiles to reach the same minimum of three
  // operational veterinarians required by production booking policy.
  for (const fixture of AUXILIARY_COVERAGE_VETS) {
    const auxiliaryUser = await prisma.user.upsert({
      where: { email: fixture.email },
      update: {
        passwordHash: vetPasswordHash,
        role: UserRole.VET,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        emailVerified: true,
        isActive: true,
        deactivatedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodesHash: [],
        passwordChangedAt: new Date(),
      },
      create: {
        email: fixture.email,
        passwordHash: vetPasswordHash,
        role: UserRole.VET,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        emailVerified: true,
        isActive: true,
        passwordChangedAt: new Date(),
      },
    });

    const auxiliaryProfile = await prisma.vetProfile.upsert({
      where: { licenseNumber: fixture.licenseNumber },
      update: {
        userId: auxiliaryUser.id,
        specialties: E2E_VET_SPECIALTIES,
        tier: VetTier.FREE,
        bio: "Fixture sintético de cobertura para staging E2E.",
        yearsExperience: 5,
        rating: 5,
        reviewCount: 0,
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        verifiedAt: new Date(),
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        city: "Cartagena",
        department: "Bolívar",
        serviceRadius: 30,
        isAvailableNow: false,
        timezone: "America/Bogota",
        comvezcolNumber: fixture.comvezcolNumber,
      },
      create: {
        userId: auxiliaryUser.id,
        licenseNumber: fixture.licenseNumber,
        specialties: E2E_VET_SPECIALTIES,
        tier: VetTier.FREE,
        bio: "Fixture sintético de cobertura para staging E2E.",
        yearsExperience: 5,
        rating: 5,
        reviewCount: 0,
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        verifiedAt: new Date(),
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        city: "Cartagena",
        department: "Bolívar",
        serviceRadius: 30,
        isAvailableNow: false,
        timezone: "America/Bogota",
        comvezcolNumber: fixture.comvezcolNumber,
      },
    });

    await prisma.vetProfessionalRegistryCheck.upsert({
      where: { vetProfileId: auxiliaryProfile.id },
      update: {
        status: "VERIFIED",
        checkedById: null,
        evidence: `Synthetic staging-only registry evidence for ${fixture.licenseNumber}. Not a real professional identity.`,
        sourceUrl: OFFICIAL_REGISTRY_URL,
        checkedAt: new Date(),
      },
      create: {
        id: fixture.registryCheckId,
        vetProfileId: auxiliaryProfile.id,
        status: "VERIFIED",
        checkedById: null,
        evidence: `Synthetic staging-only registry evidence for ${fixture.licenseNumber}. Not a real professional identity.`,
        sourceUrl: OFFICIAL_REGISTRY_URL,
        checkedAt: new Date(),
      },
    });

    await prisma.vetProfile.update({
      where: { id: auxiliaryProfile.id },
      data: {
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isActive: true,
        isAvailableNow: false,
      },
    });
  }

  await prisma.$transaction([
    prisma.appointment.deleteMany({
      where: {
        OR: [
          {
            id: {
              in: [
                FIXTURE_IDS.pendingAppointment,
                FIXTURE_IDS.confirmedAppointment,
              ],
            },
          },
          { clientId: client.id },
          { vetId: vetProfile.id },
        ],
      },
    }),
    prisma.pet.deleteMany({
      where: {
        OR: [{ id: FIXTURE_IDS.pet }, { ownerId: client.id }],
      },
    }),
    prisma.price.deleteMany({ where: { vetId: vetProfile.id } }),
    prisma.vetSchedule.deleteMany({ where: { vetProfileId: vetProfile.id } }),
    prisma.scheduleException.deleteMany({
      where: { vetProfileId: vetProfile.id },
    }),
  ]);

  const pet = await prisma.pet.create({
    data: {
      id: FIXTURE_IDS.pet,
      ownerId: client.id,
      name: "Luna E2E",
      species: "Perro",
      breed: "Mestizo",
      weight: 12,
      birthDate: new Date("2021-01-15T12:00:00.000Z"),
      notes: "Fixture determinista para Detox.",
    },
  });

  await prisma.price.create({
    data: {
      vetId: vetProfile.id,
      serviceName: "Consulta general E2E",
      priceCop: 50_000,
      priceCtg: 50,
      isActive: true,
    },
  });

  await prisma.vetSchedule.createMany({
    data: Object.values(DayOfWeek).map((dayOfWeek) => ({
      vetProfileId: vetProfile.id,
      dayOfWeek,
      startTime: "08:00",
      endTime: "23:00",
      slotDuration: 60,
      isActive: true,
    })),
  });

  await prisma.appointment.createMany({
    data: [
      {
        id: FIXTURE_IDS.pendingAppointment,
        vetId: vetProfile.id,
        clientId: client.id,
        petId: pet.id,
        serviceType: "Consulta general E2E",
        date: bogotaDate(0),
        time: "20:00",
        address: "Calle E2E 1, Cartagena",
        status: AppointmentStatus.PENDING,
        paymentMethod: PaymentMethod.CTG,
        amount: 50_000,
        notes: "Fixture pendiente para flujo veterinario Detox.",
        scheduledAt: new Date(),
        lastStatusChangeAt: new Date(),
      },
      {
        id: FIXTURE_IDS.confirmedAppointment,
        vetId: vetProfile.id,
        clientId: client.id,
        petId: pet.id,
        serviceType: "Consulta general E2E",
        date: bogotaDate(1),
        time: "18:00",
        address: "Calle E2E 2, Cartagena",
        status: AppointmentStatus.CONFIRMED,
        paymentMethod: PaymentMethod.CTG,
        amount: 50_000,
        notes: "Fixture confirmada para flujo de chat Detox.",
        scheduledAt: new Date(),
        confirmedAt: new Date(),
        lastStatusChangeAt: new Date(),
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        target: process.env.NVET_SEED_TARGET,
        client: clientEmail,
        vet: vetEmail,
        admin: adminEmail,
        fixtures: {
          petId: pet.id,
          pendingAppointmentId: FIXTURE_IDS.pendingAppointment,
          confirmedAppointmentId: FIXTURE_IDS.confirmedAppointment,
          registryCheckId: FIXTURE_IDS.registryCheck,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("E2E seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
