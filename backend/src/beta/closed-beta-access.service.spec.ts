import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

describe("ClosedBetaAccessService", () => {
  const originalEnv = process.env;
  let service: ClosedBetaAccessService;

  const hash = (value: string) =>
    crypto.createHash("sha256").update(value).digest("hex");

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NVET_CLOSED_BETA_ENABLED;
    delete process.env.NVET_CLOSED_BETA_MARKET;
    delete process.env.NVET_CLOSED_BETA_CLIENT_HASHES;
    service = new ClosedBetaAccessService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not change booking behavior while the beta gate is disabled", () => {
    expect(() => service.assertBookingAllowed("client-1", null)).not.toThrow();
  });

  it("allows an invited client with a Cartagena veterinarian", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    expect(() =>
      service.assertBookingAllowed("client-1", "Cartagena de Indias, Bolívar"),
    ).not.toThrow();
  });

  it("rejects a client outside the configured cohort", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-allowed");

    expect(() =>
      service.assertBookingAllowed("client-not-invited", "Cartagena"),
    ).toThrow(ForbiddenException);
  });

  it("rejects bookings outside the Cartagena launch market", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    expect(() =>
      service.assertBookingAllowed("client-1", "Barranquilla"),
    ).toThrow(ForbiddenException);
  });

  it("fails closed if the gate is enabled without a valid cohort", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = "not-a-hash";

    expect(() =>
      service.assertBookingAllowed("client-1", "Cartagena"),
    ).toThrow(ServiceUnavailableException);
  });

  it("does not expose the cohort through the public policy", () => {
    process.env.NVET_CLOSED_BETA_ENABLED = "true";
    process.env.NVET_CLOSED_BETA_CLIENT_HASHES = hash("client-1");

    expect(service.getPublicPolicy()).toEqual({
      phase: 12,
      mode: "closed-beta",
      market: "Cartagena de Indias",
      cohortConfigured: true,
    });
    expect(JSON.stringify(service.getPublicPolicy())).not.toContain(
      hash("client-1"),
    );
  });
});
