import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  /**
   * @nestjs/passport 12 adds an optional AuthModuleOptions dependency to the
   * generated AuthGuard base class. Without an explicit zero-argument
   * constructor, Nest can inherit that reflection metadata onto this concrete
   * fixed-strategy guard and attempt to resolve AuthModuleOptions from every
   * domain module that uses JwtAuthGuard.
   *
   * Nvet does not inject per-module passport options here: the "jwt" strategy
   * is fixed and PassportModule is configured centrally in AuthModule.
   */
  constructor() {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }
}
