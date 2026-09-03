import { of, lastValueFrom } from "rxjs";
import { FinancialPrivacyInterceptor } from "./financial-privacy.interceptor";

describe("FinancialPrivacyInterceptor", () => {
  const interceptor = new FinancialPrivacyInterceptor();
  const context = {} as any;

  const run = async (value: unknown) =>
    lastValueFrom(
      interceptor.intercept(context, { handle: () => of(value) } as any),
    );

  it("redacts private transfer storage keys and legacy proof URLs", async () => {
    const result = (await run({
      id: "tx-1",
      paymentMethod: "TRANSFER",
      transferProofStorageKey: "cloudinary:v1:private:raw:secret",
      transferProofSha256: "abc123",
      hashOnchain: "https://legacy.example/proof.pdf",
    })) as any;

    expect(result.transferProofStorageKey).toBeUndefined();
    expect(result.hashOnchain).toBeUndefined();
    expect(result.transferProofSha256).toBe("abc123");
  });

  it("keeps a legitimate CTG chain hash", async () => {
    const result = (await run({
      paymentMethod: "CTG",
      hashOnchain: "0xabc",
    })) as any;

    expect(result.hashOnchain).toBe("0xabc");
  });

  it("redacts encrypted payout data recursively", async () => {
    const result = (await run({
      results: [
        {
          id: "wd-1",
          destinationMasked: "Banco ••••1234",
          destinationCiphertext: "v1.secret",
          destinationFingerprint: "fingerprint",
        },
      ],
    })) as any;

    expect(result.results[0].destinationMasked).toBe("Banco ••••1234");
    expect(result.results[0].destinationCiphertext).toBeUndefined();
    expect(result.results[0].destinationFingerprint).toBeUndefined();
  });
});
