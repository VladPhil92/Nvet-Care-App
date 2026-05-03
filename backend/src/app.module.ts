import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { ResilienceModule } from './common/resilience.module';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ChatModule } from './chat/chat.module';
import { VetsModule } from './vets/vets.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';

/**
 * Orden de imports importante:
 *  1. ConfigModule primero (variables de entorno disponibles para todos)
 *  2. CommonModule (logger, throttler, filters globales) — `@Global()`
 *  3. PrismaModule — `@Global()`
 *  4. ResilienceModule (audit, idempotency, blacklist) — `@Global()`
 *  5. MailModule (driver pluggable: console/sendgrid/ses/smtp) — `@Global()`
 *  6. HealthModule — debe estar antes de AuthModule para `/health` público
 *  7. Módulos de dominio
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonModule,
    PrismaModule,
    ResilienceModule,
    MailModule,
    HealthModule,
    AuthModule,
    AppointmentsModule,
    ChatModule,
    VetsModule,
    PaymentsModule,
    AdminModule,
  ],
})
export class AppModule {}
