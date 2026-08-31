import { NotFoundException } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { PublicVetLocationInterceptor } from "./public-location.interceptor";

describe("PublicVetLocationInterceptor", () => {
  it("hides a suspended veterinarian reached through the public detail URL", async () => {
    const interceptor = new PublicVetLocationInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "GET",
          originalUrl: "/api/vets/00000000-0000-4000-8000-000000000001",
        }),
      }),
    } as any;
    const next = {
      handle: () =>
        of({
          id: "00000000-0000-4000-8000-000000000001",
          isActive: false,
          latitude: 10.4,
          longitude: -75.5,
        }),
    } as any;

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("still strips precise coordinates from an active public profile", async () => {
    const interceptor = new PublicVetLocationInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "GET",
          originalUrl: "/api/vets/00000000-0000-4000-8000-000000000001",
        }),
      }),
    } as any;
    const next = {
      handle: () =>
        of({
          id: "00000000-0000-4000-8000-000000000001",
          isActive: true,
          latitude: 10.4,
          longitude: -75.5,
        }),
    } as any;

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      isActive: true,
    });
  });
});
