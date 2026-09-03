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

  it("removes private contact, exact location and nested relation fields", async () => {
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
          prices: [
            {
              id: "price-1",
              vetId: "private-vet-id",
              serviceName: "Consulta",
              priceCop: 100000,
              priceCtg: 100,
              isActive: true,
              createdAt: new Date(),
            },
          ],
          reviews: [
            {
              id: "review-1",
              appointmentId: "private-appointment-id",
              clientId: "private-client-id",
              rating: 5,
              comment: "Excelente",
              client: {
                firstName: "Carlos",
                lastName: "González",
                avatar: null,
              },
            },
          ],
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
        firstName: "Ana",
        lastName: "Vet",
        avatar: null,
      },
      prices: [
        {
          id: "price-1",
          serviceName: "Consulta",
          priceCop: 100000,
          priceCtg: 100,
          isActive: true,
        },
      ],
      reviews: [
        {
          id: "review-1",
          rating: 5,
          comment: "Excelente",
          client: {
            firstName: "Carlos",
            lastName: "G.",
            avatar: null,
          },
        },
      ],
    });
    expect(result.results[0].user.id).toBeUndefined();
    expect(result.results[0].user.email).toBeUndefined();
    expect(result.results[0].user.phone).toBeUndefined();
    expect(result.results[0].latitude).toBeUndefined();
    expect(result.results[0].longitude).toBeUndefined();
    expect(result.results[0].ctgBalance).toBeUndefined();
    expect(result.results[0].userId).toBeUndefined();
    expect(result.results[0].prices[0].vetId).toBeUndefined();
    expect(result.results[0].reviews[0].appointmentId).toBeUndefined();
    expect(result.results[0].reviews[0].clientId).toBeUndefined();
  });

  it("minimizes the standalone public price endpoint", async () => {
    const payload = [
      {
        id: "price-1",
        vetId: "private-vet-id",
        serviceName: "Consulta",
        priceCop: 100000,
        priceCtg: 100,
        isActive: true,
        createdAt: new Date(),
      },
    ];

    const result: any = await lastValueFrom(
      interceptor.intercept(
        context("/api/vets/11111111-1111-1111-1111-111111111111/prices"),
        { handle: () => of(payload) } as any,
      ),
    );

    expect(result[0]).toEqual({
      id: "price-1",
      serviceName: "Consulta",
      priceCop: 100000,
      priceCtg: 100,
      isActive: true,
    });
  });

  it("does not sanitize authenticated vet self endpoints", async () => {
    const payload = {
      id: "self",
      latitude: 10.1,
      user: { email: "me@example.com" },
    };
    const result = await lastValueFrom(
      interceptor.intercept(context("/api/vets/me"), {
        handle: () => of(payload),
      } as any),
    );
    expect(result).toEqual(payload);
  });
});
