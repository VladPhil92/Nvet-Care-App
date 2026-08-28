import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

function stripCoordinates<T extends Record<string, any>>(vet: T): T {
  if (!vet || typeof vet !== "object") return vet;
  const { latitude: _latitude, longitude: _longitude, ...safe } = vet;
  return safe as T;
}

/**
 * Las coordenadas exactas del veterinario se usan internamente para ranking
 * por distancia y tracking autorizado, pero no deben salir por endpoints
 * públicos de descubrimiento/perfil.
 */
@Injectable()
export class PublicVetLocationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const path = String(request.originalUrl ?? request.url ?? "").split("?")[0];

    const isPublicSearch = method === "GET" && /\/vets\/?$/.test(path);
    const isPublicDetail =
      method === "GET" && /\/vets\/[0-9a-fA-F-]{36}$/.test(path);

    if (!isPublicSearch && !isPublicDetail) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body) => {
        if (isPublicSearch && Array.isArray(body?.results)) {
          return {
            ...body,
            results: body.results.map((vet: Record<string, any>) =>
              stripCoordinates(vet),
            ),
          };
        }

        if (isPublicDetail && body && typeof body === "object") {
          return stripCoordinates(body);
        }

        return body;
      }),
    );
  }
}
