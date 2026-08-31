import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { GovernanceController } from "./governance.controller";
import { GovernanceService } from "./governance.service";
import { AuthModule } from "../auth/auth.module";

/**
 * AdminModule — superficies HTTP de administración y gobernanza raíz.
 *
 * AdminController conserva las capacidades ADMIN operativas existentes.
 * GovernanceController es SUPERADMIN-only y concentra lifecycle de usuarios,
 * decisiones de verificación, suspensión de vets y auditoría redactada.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController, GovernanceController],
  providers: [AdminService, GovernanceService],
  exports: [AdminService, GovernanceService],
})
export class AdminModule {}
