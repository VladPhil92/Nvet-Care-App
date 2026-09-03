import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

describe("ClosedBetaAccessService", () => {
  const originalEnv = process.env;
  const legalConsent = {
    assertCurrentAcceptance: jest.fn(),
  } as any;
  let service: ClosedBetaAccessService;

  const hash = (value: string) =>
    crypto.createHash("sha256").update(value).digest("hex");

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NVET_BOOKING_ENABLED;
    delete process.env.NVET_CLOSED_BETA_ENABLED;
    delete process.env.NVET_CLOSED_BETA_MARKET;
    delete process.env.NVET_CLOSED_BETA_CLIENT_HASHES;
    jest.clearAllMocks();
    legalConsent.assertCurrentAcceptance.mockResolvedValue(undefined);
    service = new ClosedBetaAccessService(legalConsent);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not change booking behavior while the beta gate is disabled", async () => {
    await expect(service.assertBookingAllowed("client-1", null)).resolves.toBeUndefined();
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("allows an invited consenting client with a Cartagena veterinarian", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena de Indias, Bolívar"),
    ).resolves.toBeUndefined();
    expect(legalConsent.assertCurrentAcceptance).toHaveBeenCalledWith("client-1");
  });

  it("rejects a client outside the configured cohort before legal lookup", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-allowed");

    await expect(
      service.assertBookingAllowed("client-not-invited", "Cartagena"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("rejects bookings outside the Cartagena launch market before legal lookup", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    await expect(
      service.assertBookingAllowed("client-1", "Barranquilla"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(legalConsent.assertCurrentAcceptance).not.toHaveBeenCalled();
  });

  it("fails closed if the gate is enabled without a valid cohort", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = "not-a-hash";

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("blocks new bookings when the operations switch is off", async () => {
    process.env.NVET_BOOKING_ENABLED = "false";

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails closed if beta is enabled but the legal service is not wired", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");
    const misconfigured = new ClosedBetaAccessService();

    await expect(
      misconfigured.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("propagates a missing legal acceptance and never opens booking", async () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");
    legalConsent.assertCurrentAcceptance.mockRejectedValue(
      new ForbiddenException("legal-required"),
    );

    await expect(
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).rejects.toThrow("legal-required");
  });

  it("counts only valid unique cohort hashes without exposing them", () => {
    const clientOne = hash("client-1");
    const clientTwo = hash("client-2");
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = [
      clientOne,
      clientTwo,
      clientOne,
      "not-a-hash",
    ].join(",");

    expect(service.getConfiguredClientCount()).toBe(2);
    expect(JSON.stringify(service.getPublicPolicy())).not.toContain(clientOne);
    expect(JSON.stringify(service.getPublicPolicy())).not.toContain(clientTwo);
  });

  it("does not expose the cohort through the public policy", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    expect(service.getPublicPolicy()).toEqual({
      phase: 12,
      mode: "closed-beta",
      market: "Cartagena de Indias",
      bookingEnabled: true,
      cohortConfigured: true,
      legalAcceptanceRequired: true,
    });
    expect(JSON.stringify(service.getPublicPolicy())).not.toContain(
      hash("client-1"),
    );
  });
});
