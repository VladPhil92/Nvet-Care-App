import { ServiceUnavailableException } from "@nestjs/common";
import { AiProviderService } from "./ai-provider.service";

describe("AiProviderService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createService(values: Record<string, string | undefined> = {}) {
    const defaults: Record<string, string | undefined> = {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-test",
      AI_ASSIST_ENABLED: "true",
      OPENAI_BASE_URL: "https://provider.invalid/v1",
      AI_ASSIST_TIMEOUT_MS: "5000",
    };
    const config = {
      get: jest.fn((key: string) => ({ ...defaults, ...values })[key]),
    } as any;
    return new AiProviderService(config);
  }

  it("sends store=false, strict structured output and a unique client request id", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn(() => "req-provider-1") },
      json: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({ safe: true }),
      }),
    });
    global.fetch = fetchMock as any;
    const service = createService();

    const result = await service.generateStructured<{ safe: boolean }>({
      schemaName: "test_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { safe: { type: "boolean" } },
        required: ["safe"],
      },
      instructions: "System safety instructions",
      input: "sensitive clinical test input",
    });

    expect(result.safe).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Client-Request-Id"]).toMatch(/^nvet-ai-[0-9a-f-]+$/i);

    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "test_schema",
      strict: true,
    });
  });

  it("does not log clinical prompt content on provider failure", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: jest.fn(() => "req-provider-2") },
      json: jest.fn().mockResolvedValue({ error: { message: "provider failed" } }),
    });
    global.fetch = fetchMock as any;
    const service = createService();
    const warn = jest
      .spyOn((service as any).logger, "warn")
      .mockImplementation(() => undefined);
    const secretClinicalText = "clinical-secret-never-log";

    await expect(
      service.generateStructured({
        schemaName: "test_schema",
        schema: { type: "object" },
        instructions: "instructions",
        input: secretClinicalText,
      }),
    ).rejects.toThrow();

    expect(JSON.stringify(warn.mock.calls)).not.toContain(secretClinicalText);
    expect(JSON.stringify(warn.mock.calls)).toContain("req-provider-2");
  });

  it("fails closed when AI assistance is disabled", async () => {
    const service = createService({ AI_ASSIST_ENABLED: "false" });

    await expect(
      service.generateStructured({
        schemaName: "test_schema",
        schema: { type: "object" },
        instructions: "instructions",
        input: "input",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
