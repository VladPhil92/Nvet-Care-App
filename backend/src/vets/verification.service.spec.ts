import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { DocumentType, DocumentStatus, VerificationStatus } from '@prisma/client';

describe('VerificationService', () => {
  let service: VerificationService;
  let prisma: any;
  let mail: any;
  let storage: any;

  const USER_ID = 'user-1';
  const VET_ID = 'vet-1';
  const DOC_ID = 'doc-1';
  const ADMIN_ID = 'admin-1';

  const baseVet = {
    id: VET_ID,
    userId: USER_ID,
    verificationStatus: VerificationStatus.NONE,
    isVerified: false,
    verifiedAt: null,
    rejectionReason: null,
  };

  const validFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'documento.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024 * 100, // 100 KB
    buffer: Buffer.from('test'),
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };

  beforeEach(() => {
    prisma = {
      vetProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      verificationDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    mail = { sendVetApproval: jest.fn().mockResolvedValue({ ok: true }) };
    storage = {
      upload: jest.fn().mockResolvedValue({ url: '/uploads/verification/vet-1/doc.pdf', storageKey: '/path' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new VerificationService(prisma, mail, storage);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
  });

  // ─────────────────────────────────────────────────────────────────
  // uploadDocument
  // ─────────────────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    it('crea un nuevo documento correctamente', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.verificationDocument.findFirst.mockResolvedValue(null);
      prisma.verificationDocument.findMany.mockResolvedValue([]);
      const created = { id: DOC_ID, type: DocumentType.ID_DOCUMENT };
      prisma.verificationDocument.create.mockResolvedValue(created);

      const result = await service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, validFile);

      expect(storage.upload).toHaveBeenCalled();
      expect(prisma.verificationDocument.create).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('lanza NotFoundException si el perfil vet no existe', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, validFile),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el vet ya está APPROVED', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        ...baseVet,
        verificationStatus: VerificationStatus.APPROVED,
      });

      await expect(
        service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, validFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si el documento ya está APPROVED', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.verificationDocument.findFirst.mockResolvedValue({
        id: DOC_ID,
        status: DocumentStatus.APPROVED,
      });

      await expect(
        service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, validFile),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza BadRequestException si el archivo supera el tamaño máximo', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      const bigFile = { ...validFile, size: 11 * 1024 * 1024 }; // 11 MB

      await expect(
        service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, bigFile as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el MIME type no está permitido', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      const badFile = { ...validFile, mimetype: 'video/mp4' };

      await expect(
        service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, badFile as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('reemplaza un documento UPLOADED existente y borra el archivo anterior', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      const existing = { id: DOC_ID, status: DocumentStatus.UPLOADED, fileUrl: '/old/path.pdf' };
      prisma.verificationDocument.findFirst.mockResolvedValue(existing);
      prisma.verificationDocument.findMany.mockResolvedValue([existing]);
      const updated = { id: DOC_ID, status: DocumentStatus.UPLOADED };
      prisma.verificationDocument.update.mockResolvedValue(updated);

      const result = await service.uploadDocument(USER_ID, DocumentType.ID_DOCUMENT, validFile);

      expect(storage.delete).toHaveBeenCalledWith('/old/path.pdf');
      expect(prisma.verificationDocument.update).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('valida el formato COMVEZCOL correctamente', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.verificationDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadDocument(USER_ID, DocumentType.COMVEZCOL_CARD, validFile, {
          documentNumber: 'INVALIDO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta número COMVEZCOL con formato correcto', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.verificationDocument.findFirst.mockResolvedValue(null);
      prisma.verificationDocument.findMany.mockResolvedValue([]);
      prisma.verificationDocument.create.mockResolvedValue({ id: DOC_ID });

      await expect(
        service.uploadDocument(USER_ID, DocumentType.COMVEZCOL_CARD, validFile, {
          documentNumber: '12345-6',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getVerificationStatus
  // ─────────────────────────────────────────────────────────────────

  describe('getVerificationStatus', () => {
    it('retorna estado NOT_UPLOADED cuando no hay documentos', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        ...baseVet,
        verificationDocuments: [],
      });

      const result = await service.getVerificationStatus(USER_ID);

      expect(result.documents).toHaveLength(3); // 3 required docs
      expect(result.documents.every((d) => d.status === 'NOT_UPLOADED')).toBe(true);
      expect(result.canSubmit).toBe(false);
      expect(result.progress.approved).toBe(0);
    });

    it('calcula progreso correctamente con todos los documentos subidos', async () => {
      const docs = [
        { type: DocumentType.COMVEZCOL_CARD, status: DocumentStatus.UPLOADED, uploadedAt: new Date() },
        { type: DocumentType.PROFESSIONAL_DEGREE, status: DocumentStatus.UPLOADED, uploadedAt: new Date() },
        { type: DocumentType.ID_DOCUMENT, status: DocumentStatus.UPLOADED, uploadedAt: new Date() },
      ];
      prisma.vetProfile.findUnique.mockResolvedValue({
        ...baseVet,
        verificationDocuments: docs,
      });

      const result = await service.getVerificationStatus(USER_ID);

      expect(result.canSubmit).toBe(true);
      expect(result.progress.uploaded).toBe(3);
    });

    it('lanza NotFoundException si no existe el perfil', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(service.getVerificationStatus(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // approveDocument / rejectDocument
  // ─────────────────────────────────────────────────────────────────

  describe('approveDocument', () => {
    it('aprueba el documento y llama checkAndApproveVet', async () => {
      const doc = { id: DOC_ID, vetProfileId: VET_ID, vetProfile: baseVet };
      prisma.verificationDocument.findUnique.mockResolvedValue(doc);
      prisma.verificationDocument.update.mockResolvedValue({ ...doc, status: DocumentStatus.APPROVED });
      // checkAndApproveVet necesita findMany y vetProfile.update
      prisma.verificationDocument.findMany.mockResolvedValue([]); // sin todos los docs → no auto-aprueba
      prisma.vetProfile.update.mockResolvedValue({});

      const result = await service.approveDocument(ADMIN_ID, DOC_ID, 'Todo correcto');

      expect(prisma.verificationDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DocumentStatus.APPROVED }),
        }),
      );
      expect(result.status).toBe(DocumentStatus.APPROVED);
    });

    it('lanza NotFoundException si el documento no existe', async () => {
      prisma.verificationDocument.findUnique.mockResolvedValue(null);

      await expect(service.approveDocument(ADMIN_ID, 'no-existe')).rejects.toThrow(NotFoundException);
    });

    it('auto-aprueba el vet y envía email cuando todos los docs están aprobados', async () => {
      const doc = { id: DOC_ID, vetProfileId: VET_ID };
      prisma.verificationDocument.findUnique.mockResolvedValue(doc);
      prisma.verificationDocument.update.mockResolvedValue({ ...doc, status: DocumentStatus.APPROVED });

      // checkAndApproveVet encuentra los 3 docs aprobados
      prisma.verificationDocument.findMany.mockResolvedValue([
        { type: DocumentType.COMVEZCOL_CARD },
        { type: DocumentType.PROFESSIONAL_DEGREE },
        { type: DocumentType.ID_DOCUMENT },
      ]);
      prisma.vetProfile.update.mockResolvedValue({
        user: { email: 'vet@test.com', firstName: 'Pedro' },
      });

      await service.approveDocument(ADMIN_ID, DOC_ID);

      expect(mail.sendVetApproval).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'vet@test.com', firstName: 'Pedro' }),
      );
    });
  });

  describe('rejectDocument', () => {
    it('rechaza el documento y actualiza el estado del vet a REJECTED', async () => {
      const doc = { id: DOC_ID, vetProfileId: VET_ID };
      prisma.verificationDocument.findUnique.mockResolvedValue(doc);
      prisma.verificationDocument.update.mockResolvedValue({ ...doc, status: DocumentStatus.REJECTED });
      prisma.vetProfile.update.mockResolvedValue({});

      await service.rejectDocument(ADMIN_ID, DOC_ID, 'Imagen borrosa');

      expect(prisma.verificationDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DocumentStatus.REJECTED }),
        }),
      );
      expect(prisma.vetProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verificationStatus: VerificationStatus.REJECTED }),
        }),
      );
    });

    it('lanza BadRequestException si la razón de rechazo está vacía', async () => {
      const doc = { id: DOC_ID, vetProfileId: VET_ID };
      prisma.verificationDocument.findUnique.mockResolvedValue(doc);

      await expect(service.rejectDocument(ADMIN_ID, DOC_ID, '   ')).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el documento no existe', async () => {
      prisma.verificationDocument.findUnique.mockResolvedValue(null);

      await expect(service.rejectDocument(ADMIN_ID, 'no-existe', 'razón')).rejects.toThrow(NotFoundException);
    });
  });
});
