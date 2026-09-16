import { ExecutionContext } from "@nestjs/common";
import { MarketLaunchGuard } from "./market-launch.guard";

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("MarketLaunchGuard", () => {
  const originalPrefix = process.env.API_PREFIX;
  let policy: { assertBookingAllowed: jest.Mock };
  let guard: MarketLaunchGuard;

  beforeEach(() => {
    delete process.env.API_PREFIX;
    policy = { assertBookingAllowed: jest.fn().mockResolvedValue(undefined) };
    guard = new MarketLaunchGuard(policy as any);
  });

  afterAll(() => {
    if (originalPrefix === undefined) delete process.env.API_PREFIX;
    else process.env.API_PREFIX = originalPrefix;
  });

  it("evaluates the launch policy when a booking is created", async () => {
    await expect(
      guard.canActivate(
        contextFor({
          method: "POST",
          originalUrl: "/api/appointments",
          body: {
            vetId: "vet-1",
            serviceLatitude: 10.4,
            serviceLongitude: -75.5,
          },
        }),
      ),
    ).resolves.toBe(true);

    expect(policy.assertBookingAllowed).toHaveBeenCalledWith({
      vetId: "vet-1",
      serviceLatitude: 10.4,
      serviceLongitude: -75.5,
    });
  });

  it("accepts the unprefixed booking path too", async () => {
    await guard.canActivate(
      contextFor({ method: "POST", originalUrl: "/appointments", body: {} }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledTimes(1);
  });

  it("honors a custom API prefix", async () => {
    process.env.API_PREFIX = "/v2/";

    await guard.canActivate(
      contextFor({ method: "POST", originalUrl: "/v2/appointments", body: {} }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledTimes(1);
  });

  it("ignores the query string when matching the booking path", async () => {
    await guard.canActivate(
      contextFor({
        method: "POST",
        originalUrl: "/api/appointments?draft=true",
        body: {},
      }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledTimes(1);
  });

  it("falls back to `url` when `originalUrl` is absent", async () => {
    await guard.canActivate(
      contextFor({ method: "POST", url: "/api/appointments", body: {} }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledTimes(1);
  });

  it("matches the method case-insensitively", async () => {
    await guard.canActivate(
      contextFor({ method: "post", originalUrl: "/api/appointments", body: {} }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a read of the booking list", "GET", "/api/appointments"],
    ["a cancellation", "PATCH", "/api/appointments/abc"],
    ["a nested booking sub-resource", "POST", "/api/appointments/abc/proof"],
    ["an unrelated endpoint", "POST", "/api/pets"],
  ])("lets %s through without consulting the policy", async (_l, method, url) => {
    await expect(
      guard.canActivate(contextFor({ method, originalUrl: url, body: {} })),
    ).resolves.toBe(true);

    expect(policy.assertBookingAllowed).not.toHaveBeenCalled();
  });

  it("propagates a policy refusal instead of allowing the booking", async () => {
    const refusal = new Error("Servicio no disponible en esta zona");
    policy.assertBookingAllowed.mockRejectedValue(refusal);

    await expect(
      guard.canActivate(
        contextFor({
          method: "POST",
          originalUrl: "/api/appointments",
          body: { vetId: "vet-1" },
        }),
      ),
    ).rejects.toBe(refusal);
  });

  it("forwards absent coordinates as undefined rather than inventing them", async () => {
    await guard.canActivate(
      contextFor({ method: "POST", originalUrl: "/api/appointments" }),
    );

    expect(policy.assertBookingAllowed).toHaveBeenCalledWith({
      vetId: undefined,
      serviceLatitude: undefined,
      serviceLongitude: undefined,
    });
  });
});
