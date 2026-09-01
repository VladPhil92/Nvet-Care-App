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
};

const E2E_VET_SPECIALTIES = ["Consulta general", "Emergencias"];

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
  // Convert the current instant to a synthetic UTC date that carries the
  // current Bogota calendar day, then pin fixture appointments to noon local.
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
    ...(adminCredentials ? [adminCredentials.email] : []),
  ];
  if (new Set(fixtureEmails).size !== fixtureEmails.length) {
    throw new Error("E2E seed refused: fixture identities must use different emails.");
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

  const vetProfile = await prisma.vetProfile.upsert({
    where: { userId: vetUser.id },
    update: {
      licenseNumber: "NVET-E2E-0001",
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
    },
    create: {
      userId: vetUser.id,
      licenseNumber: "NVET-E2E-0001",
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
    },
  });

  // Reset only records owned by the dedicated E2E fixture client/vet. The
  // optional ADMIN fixture has no domain data and is never used outside
  // test/staging, so repeated runs cannot touch unrelated operator accounts.
  await prisma.$transaction([
    prisma.appointment.deleteMany({
      where: {
        OR: [{ clientId: client.id }, { vetId: vetProfile.id }],
      },
    }),
    prisma.pet.deleteMany({ where: { ownerId: client.id } }),
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
