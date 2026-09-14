import { RuntimeTelemetryService } from "./runtime-telemetry.service";

describe("RuntimeTelemetryService", () => {
  it("aggregates API, auth and CTG telemetry without identity fields", () => {
    const service = new RuntimeTelemetryService();

    service.record({ event: "API_REQUEST_SUCCESS", durationMs: 100 });
    service.record({ event: "API_REQUEST_SUCCESS", durationMs: 200 });
    service.record({
      event: "API_REQUEST_FAILURE",
      durationMs: 350,
      outcomeCode: "HTTP_503",
    });
    service.record({ event: "AUTH_LOGIN_SUCCESS", durationMs: 700 });
    service.record({ event: "AUTH_LOGIN_FAILURE", durationMs: 1200 });
    service.record({
      event: "CTG_FEDERATION_EXCHANGE_SUCCESS",
      durationMs: 1500,
    });

    const snapshot = service.getSnapshot(24);

    expect(snapshot.api).toMatchObject({
      sampleSize: 3,
      success: 2,
      failure: 1,
      failureRatePct: 33.33,
      latencyP95Ms: 350,
    });
    expect(snapshot.authClient).toMatchObject({
      sampleSize: 2,
      success: 1,
      failure: 1,
      successRatePct: 50,
      latencyP95Ms: 1200,
    });
    expect(snapshot.ctgFederationClient).toMatchObject({
      sampleSize: 1,
      success: 1,
      failure: 0,
      successRatePct: 100,
      latencyP95Ms: 1500,
    });
    expect(snapshot.boundaries).toEqual({
      containsUserIdentifiers: false,
      containsTokens: false,
      containsPasswords: false,
      containsTwoFactorCodes: false,
      containsClinicalFreeText: false,
      containsPaymentCredentials: false,
      containsRawClientStackTraces: false,
      automaticBetaEvidenceApproval: false,
    });
  });

  it("falls back to the 24-hour aggregation window for invalid input", () => {
    const service = new RuntimeTelemetryService();
    const snapshot = service.getSnapshot(0);

    expect(snapshot.window.hours).toBe(24);
    expect(snapshot.samples).toBe(0);
  });
});
