import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { VerifyTransferDto } from "./dto/payment.dto";
import { ManualTransferPaymentService } from "./manual-transfer-payment.service";

@Controller("payments/manual-transfer")
@UseGuards(JwtAuthGuard)
export class ManualTransferPaymentController {
  constructor(
    private readonly manualTransferPaymentService: ManualTransferPaymentService,
  ) {}

  @Post(":transactionId/proof")
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  submitProof(
    @Request() req,
    @Param("transactionId", ParseUUIDPipe) transactionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VerifyTransferDto,
  ) {
    return this.manualTransferPaymentService.submitClientProof(
      req.user.id,
      transactionId,
      file,
      dto,
    );
  }

  @Get(":transactionId/proof")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getProof(
    @Param("transactionId", ParseUUIDPipe) transactionId: string,
    @Res() res: Response,
  ) {
    const proof = await this.manualTransferPaymentService.getProof(transactionId);
    res.setHeader("Content-Type", proof.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${proof.fileName}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(proof.buffer);
  }

  @Post(":transactionId/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() req,
    @Param("transactionId", ParseUUIDPipe) transactionId: string,
  ) {
    return this.manualTransferPaymentService.approve(
      req.user.id,
      transactionId,
    );
  }

  @Post(":transactionId/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  reject(
    @Request() req,
    @Param("transactionId", ParseUUIDPipe) transactionId: string,
    @Body("reason") reason: string,
  ) {
    return this.manualTransferPaymentService.reject(
      req.user.id,
      transactionId,
      reason,
    );
  }
}
