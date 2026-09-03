import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

describe("ClosedBetaAccessService", () => {
  const originalEnv = process.env;
  const legalConsent = {
    assertCurrentAcceptance: jest.fn(),
  } as any;
  const activation = {
    assertActiveForBooking: jest.fn(),
  } as any;
  const cohort = {
    assertActiveMember: jest.fn(),
    getActiveCount: jest.fn(),
  } as any;
  let service: ClosedBetaAccessService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NVET_BOOKING_ENABLED;
    delete process.env.NVET_CLOSED_BETA_ENABLED;
    delete process.env.NVET_CLOSED_BETA_MARKET;
    delete process.env.NVET_CLOSED_BETA_CLIENT_HASHES;
    jest.clearAllMocks();
    legalConsent.assertCurrentAcceptance.mockResolvedValue(undefined);
    activation.assertActiveForBooking.mockResolvedValue(undefined);
    cohort.assertActiveMember.mockResolvedValue(undefined);
    cohort.getActiveCount.mockResolvedValue(1);
    service = new ClosedBetaAccessService(legalConsent, activation, cohort);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not change booking behavior while the beta gate is disabled", async () => {
    await expect(service.assertBookingAllowed("client-1", null)).resolves.toBeUndefined();
    expect(activation.assertActiveForBooking).not.toHaveBeenCalled();
    expect(cohort.assertActiveMember).not.toHaveBeenCalled();
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("allows an invited consenting client with a Cartagena veterinarian and active authorization", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena de Indias, Bolívar"),
    ).resolves.toBeUndefined();
    expect(activation.assertActiveForBooking).toHaveBeenCalledTimes(1);
    expect(cohort.assertActiveMember).toHaveBeenCalledWith("client-1");
    expect(legalConsent.assertCurrentAcceptance).toHaveBeenCalledWith("client-1");
  });

  it("fails closed before cohort checks when activation authorization is missing", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    activation.assertActiveForBooking.mockRejectedValue(
      new ServiceUnavailableException("activation-required"),
    );

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toThrow("activation-required");
    expect(cohort.assertActiveMember).not.toHaveBeenCalled();
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("rejects a client outside the auditable cohort before legal lookup", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    cohort.assertActiveMember.mockRejectedValue(
      new ForbiddenException("cohort-required"),
    );

    await expect(
      service.assertBookingAllowed("client-not-invited", "Cartagena"),
    ).rejects.toThrow("cohort-required");
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("rejects bookings outside the Cartagena launch market before legal lookup", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";

    await expect(
      service.assertBookingAllowed("client-1", "Barranquilla"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("blocks new bookings when the operations switch is off", async () => {
    process.env.NVET_BOOKING_ENABLED = "false";

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails closed if beta is enabled but activation, cohort or legal services are not wired", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    const misconfigured = new ClosedBetaAccessService();

    await expect(
      misconfigured.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails closed if cohort service is missing after activation passes", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    const misconfigured = new ClosedBetaAccessService(
      legalConsent,
      activation,
    );

    await expect(
      misconfigured.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: "CLOSED_BETA_COHORT_GATE_NOT_CONFIGURED",
      }),
    });
  });

  it("propagates missing legal acceptance and never opens booking", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    legalConsent.assertCurrentAcceptance.mockRejectedValue(
      new ForbiddenException("legal-required"),
    );

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toThrow("legal-required");
  });

  it("does not expose cohort members through the public policy", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    cohort.getActiveCount.mockResolvedValue(12);

    await expect(service.getPublicPolicy()).resolves.toEqual({
      phase: 12,
      mode: "closed-beta",
      market: "Cartagena de Indias",
      bookingEnabled: true,
      cohortConfigured: true,
      cohortSource: "auditable-control-plane",
      legalAcceptanceRequired: true,
      operatorAuthorizationRequired: true,
    });
    expect(JSON.stringify(await service.getPublicPolicy())).not.toContain(
      "client-1",
    );
  });
});
