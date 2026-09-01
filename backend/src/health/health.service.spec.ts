import { HealthService } from "./health.service";

describe("HealthService", () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: HealthService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    service = new HealthService(prisma as any);
    jest
      .spyOn(service as any, "checkMemory")
      .mockReturnValue({ status: "up", impact: "advisory" });

    delete process.env.APP_REVISION;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("publishes only a shortened validated deployment revision", async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA =
      "E73987C16949F17284DC645988E7F45876DE6C98";

    const health = await service.getLiveness();

    expect(health.revision).toBe("e73987c16949");
  });

  it("fails closed when deployment revision metadata is not a git SHA", async () => {
    process.env.APP_REVISION = "operator-secret-or-arbitrary-value";

    const health = await service.getLiveness();

    expect(health.revision).toBe("unknown");
  });

  it("reports database readiness without leaking provider error details", async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error("postgres://db-user:db-password@private-host/internal"),
    );

    const health = await service.getReadiness();
    const serialized = JSON.stringify(health);

    expect(health.status).toBe("down");
    expect(health.checks.database).toEqual(
      expect.objectContaining({
        status: "down",
        impact: "blocking",
        error: "dependency_unavailable",
      }),
    );
    expect(serialized).not.toContain("db-password");
    expect(serialized).not.toContain("private-host");
  });

  it("reports ready when the blocking database dependency is up", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const health = await service.getReadiness();

    expect(health.status).toBe("ok");
    expect(health.checks.database).toEqual(
      expect.objectContaining({ status: "up", impact: "blocking" }),
    );
    expect(health.checks.memory).toEqual(
      expect.objectContaining({ status: "up", impact: "advisory" }),
    );
  });

  it("does not remove a healthy instance from traffic for advisory V8 heap pressure", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    (service as any).checkMemory.mockReturnValue({
      status: "down",
      impact: "advisory",
      details: { utilizationPct: 97 },
    });

    const health = await service.getReadiness();

    expect(health.status).toBe("ok");
    expect(health.checks.database.status).toBe("up");
    expect(health.checks.memory).toEqual(
      expect.objectContaining({
        status: "down",
        impact: "advisory",
        details: { utilizationPct: 97 },
      }),
    );
  });
});
