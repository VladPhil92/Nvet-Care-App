import { FinancialDataCryptoService } from "./financial-data-crypto.service";

describe("FinancialDataCryptoService", () => {
  let service: FinancialDataCryptoService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
    service = new FinancialDataCryptoService();
  });

  it("encrypts and decrypts payout data without plaintext leakage", () => {
    const destination = {
      bankName: "Bancolombia",
      accountNumber: "1234567890",
      accountType: "SAVINGS" as const,
      documentId: "123456789",
    };

    const encrypted = service.encrypt(destination);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(destination.accountNumber);
    expect(encrypted).not.toContain(destination.documentId);
    expect(service.decrypt(encrypted)).toEqual(destination);
  });

  it("produces a stable keyed fingerprint and masked display value", () => {
    const destination = {
      bankName: "Bancolombia",
      accountNumber: "1234567890",
      accountType: "SAVINGS" as const,
      documentId: "123456789",
    };

    const first = service.fingerprint(destination);
    const second = service.fingerprint({ ...destination });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(service.mask(destination)).toContain("••••7890");
    expect(service.mask(destination)).not.toContain("1234567890");
  });

  it("fails closed outside tests when the dedicated key is absent", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
    const productionService = new FinancialDataCryptoService();

    expect(() =>
      productionService.encrypt({
        phoneNumber: "3001234567",
        documentId: "123456789",
      }),
    ).toThrow();
  });
});
