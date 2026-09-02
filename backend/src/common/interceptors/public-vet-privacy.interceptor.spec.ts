import { of, lastValueFrom } from "rxjs";
import { PublicVetPrivacyInterceptor } from "./public-vet-privacy.interceptor";

describe("PublicVetPrivacyInterceptor", () => {
  const interceptor = new PublicVetPrivacyInterceptor();

  function context(path: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method: "GET", path }),
      }),
    } as any;
  }

  it("removes private contact and exact location fields from public vet search", async () => {
    const payload = {
      results: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          userId: "private-user-id",
          user: {
            id: "public-user-id",
            firstName: "Ana",
            lastName: "Vet",
            avatar: null,
            email: "private@example.com",
            phone: "+573001112233",
          },
          licenseNumber: "LIC-1",
          specialties: ["Felinos"],
          tier: "FREE",
          latitude: 10.123,
          longitude: -75.456,
          ctgBalance: 900,
          rejectionReason: "private",
          isVerified: true,
          distance: 1.4,
          city: "Cartagena",
        },
      ],
      total: 1,
    };

    const result: any = await lastValueFrom(
      interceptor.intercept(context("/api/vets"), {
        handle: () => of(payload),
      } as any),
    );

    expect(result.results[0]).toMatchObject({
      id: payload.results[0].id,
      city: "Cartagena",
      distance: 1.4,
      user: {
        id: "public-user-id",
        firstName: "Ana",
        lastName: "Vet",
        avatar: null,
      },
    });
    expect(result.results[0].user.email).toBeUndefined();
    expect(result.results[0].user.phone).toBeUndefined();
    expect(result.results[0].latitude).toBeUndefined();
    expect(result.results[0].longitude).toBeUndefined();
    expect(result.results[0].ctgBalance).toBeUndefined();
    expect(result.results[0].userId).toBeUndefined();
  });

  it("does not sanitize authenticated vet self endpoints", async () => {
    const payload = { id: "self", latitude: 10.1, user: { email: "me@example.com" } };
    const result = await lastValueFrom(
      interceptor.intercept(context("/api/vets/me"), {
        handle: () => of(payload),
      } as any),
    );
    expect(result).toEqual(payload);
  });
});
