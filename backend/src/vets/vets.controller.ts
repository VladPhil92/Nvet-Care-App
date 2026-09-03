import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

import { VetsService } from "./vets.service";
import { VerificationService } from "./verification.service";
import { PricesService } from "./prices.service";

import { SearchVetsDto } from "./dto/search-vets.dto";
import {
  GetScheduleExceptionsQueryDto,
  UpsertScheduleExceptionDto,
} from "./dto/schedule.dto";
import { UpdateVetProfileDto } from "./dto/update-vet-profile.dto";
import {
  CreatePriceDto,
  UpdatePriceDto,
  BulkCreatePricesDto,
} from "./dto/price.dto";
import {
  UploadDocumentDto,
  ApproveDocumentDto,
  RejectDocumentDto,
  CreateVetProfileDto,
} from "./dto/verification.dto";

@Controller("vets")
export class VetsController {
  constructor(
    private readonly vetsService: VetsService,
    private readonly verificationService: VerificationService,
    private readonly pricesService: PricesService,
  ) {}

  @Get()
  async searchVets(@Query() filters: SearchVetsDto) {
    return this.vetsService.searchVets(filters);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyProfile(@Request() req) {
    return this.vetsService.getMyVetProfile(req.user.id);
  }

  @Post("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Request() req, @Body() dto: CreateVetProfileDto) {
    return this.vetsService.createVetProfile(req.user.id, dto);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async updateMyProfile(@Request() req, @Body() dto: UpdateVetProfileDto) {
    return this.vetsService.updateVetProfile(req.user.id, dto);
  }

  @Post("me/availability/toggle")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async toggleMyAvailability(@Request() req) {
    return this.vetsService.toggleAvailability(req.user.id);
  }

  @Get("me/schedule/exceptions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getScheduleExceptions(
    @Request() req,
    @Query() query: GetScheduleExceptionsQueryDto,
  ) {
    return this.vetsService.getScheduleExceptions(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }

  @Put("me/schedule/exceptions/:dateStr")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  async upsertScheduleException(
    @Request() req,
    @Param("dateStr") dateStr: string,
    @Body() dto: UpsertScheduleExceptionDto,
  ) {
    return this.vetsService.upsertScheduleException(req.user.id, dateStr, dto);
  }

  @Delete("me/schedule/exceptions/:dateStr")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteScheduleException(
    @Request() req,
    @Param("dateStr") dateStr: string,
  ) {
    return this.vetsService.deleteScheduleException(req.user.id, dateStr);
  }

  @Get("me/earnings")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyEarnings(
    @Request() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.vetsService.getMyEarnings(req.user.id, { startDate, endDate });
  }

  @Get("me/verification")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyVerificationStatus(@Request() req) {
    return this.verificationService.getVerificationStatus(req.user.id);
  }

  @Post("me/verification/upload")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  async uploadVerificationDocument(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException("El archivo es obligatorio");
    }
    return this.verificationService.uploadDocument(
      req.user.id,
      dto.documentType,
      file,
      {
        documentNumber: dto.documentNumber,
        issuedDate: dto.issuedDate,
        expiryDate: dto.expiryDate,
        issuedBy: dto.issuedBy,
      },
    );
  }

  @Post("me/verification/submit")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  async submitVerification(@Request() req) {
    return this.verificationService.submitForReview(req.user.id);
  }

  @Get("me/prices")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyPrices(@Request() req, @Query("activeOnly") activeOnly?: string) {
    return this.pricesService.getMyPrices(req.user.id, activeOnly === "true");
  }

  @Post("me/prices")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async createPrice(@Request() req, @Body() dto: CreatePriceDto) {
    return this.pricesService.createPrice(req.user.id, dto);
  }

  @Post("me/prices/bulk")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async bulkCreatePrices(@Request() req, @Body() dto: BulkCreatePricesDto) {
    return this.pricesService.bulkCreatePrices(req.user.id, dto.prices);
  }

  @Put("me/prices/:priceId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async updatePrice(
    @Request() req,
    @Param("priceId", ParseUUIDPipe) priceId: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.pricesService.updatePrice(req.user.id, priceId, dto);
  }

  @Delete("me/prices/:priceId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrice(
    @Request() req,
    @Param("priceId", ParseUUIDPipe) priceId: string,
    @Query("hard") hard?: string,
  ) {
    await this.pricesService.deletePrice(req.user.id, priceId, hard === "true");
  }

  @Get("me/prices/stats")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyPriceStats(@Request() req) {
    return this.pricesService.getPriceStats(req.user.id);
  }

  @Get("admin/verifications/pending")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPendingVerifications(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.verificationService.getPendingVerifications({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Backend-mediated download for private professional documents. The storage
   * key never leaves the API and the response cannot be cached by browsers or
   * intermediary proxies.
   */
  @Get("admin/documents/:documentId/file")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async downloadVerificationDocument(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Res() res: any,
  ) {
    const document =
      await this.verificationService.readVerificationDocument(documentId);

    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Length", String(document.buffer.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.fileName}"`,
    );
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    return res.status(HttpStatus.OK).send(document.buffer);
  }

  @Post("admin/documents/:documentId/approve")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveDocument(
    @Request() req,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() dto: ApproveDocumentDto,
  ) {
    return this.verificationService.approveDocument(
      req.user.id,
      documentId,
      dto.notes,
    );
  }

  @Post("admin/documents/:documentId/reject")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async rejectDocument(
    @Request() req,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.verificationService.rejectDocument(
      req.user.id,
      documentId,
      dto.reason,
    );
  }

  @Get(":id")
  async getVetDetails(@Param("id", ParseUUIDPipe) id: string, @Request() req) {
    const userId = req?.user?.id;
    return this.vetsService.getVetDetails(id, userId);
  }

  @Get(":id/prices")
  async getVetPrices(@Param("id", ParseUUIDPipe) id: string) {
    return this.pricesService.getVetPrices(id, true);
  }
}
