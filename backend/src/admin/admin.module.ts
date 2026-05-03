import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';

/**
 * AdminModule — superficie HTTP exclusiva para usuarios con rol ADMIN.
 *
 * No expone WebSockets ni uploads (no requiere Multer).
 * Importa AuthModule para reutilizar JwtAuthGuard y RolesGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
