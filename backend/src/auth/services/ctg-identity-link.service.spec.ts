import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { CtgIdentityLinkService } from "./ctg-identity-link.service";

describe("CtgIdentityLinkService", () => {
  let service: CtgIdentityLinkService;
  let prisma: any;
  let ctgIdentityService: { verify: jest.Mock };
  let auditService: { log: jest.Mock };
  let originalEnv: NodeJS.ProcessEnv;

  const USER_ID = "nvet-user-1";
  const CTG_USER_ID = "11111111-1111-4111-8111-111111111111";
  const EMAIL = "admin@example.com";
  const SUPERADMIN = {
    id: USER_ID,
    email: EMAIL,
    role: "SUPERADMIN",
    ctgUserId: null,
    isActive: true,
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = "true";

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    ctgIdentityService = { verify: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new CtgIdentityLinkService(
      prisma,
      ctgIdentityService as any,
      auditService as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("keeps the existing SUPERADMIN role while linking the verified CTG identity", async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: EMAIL });
    prisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where.id) return Promise.resolve(SUPERADMIN);
      if (where.ctgUserId) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const result = await service.link(USER_ID, "valid-supabase-token");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { ctgUserId: CTG_USER_ID },
    });
    expect(result).toEqual(
      expect.objectContaining({
        linked: true,
        userId: USER_ID,
        role: "SUPERADMIN",
        ctgUserId: CTG_USER_ID,
        rolePreserved: true,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "ctg_identity_linked",
        metadata: expect.objectContaining({ rolePreserved: "SUPERADMIN" }),
      }),
    );
  });

  it("rejects linking when the CTG One email does not match the authenticated Nvet account", async () => {
    ctgIdentityService.verify.mockResolvedValue({
      sub: CTG_USER_ID,
      email: "other@example.com",
    });
    prisma.user.findUnique.mockResolvedValueOnce(SUPERADMIN);

    await expect(service.link(USER_ID, "valid-supabase-token")).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a CTG identity that already belongs to another Nvet user", async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: EMAIL });
    prisma.user.findUnique
      .mockResolvedValueOnce(SUPERADMIN)
      .mockResolvedValueOnce({ id: "different-nvet-user" });

    await expect(service.link(USER_ID, "valid-supabase-token")).rejects.toMatchObject({
      response: expect.objectContaining({ error: "CTG_IDENTITY_ALREADY_LINKED" }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("is idempotent when the same CTG identity is already linked", async () => {
    const alreadyLinked = { ...SUPERADMIN, ctgUserId: CTG_USER_ID };
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: EMAIL });
    prisma.user.findUnique
      .mockResolvedValueOnce(alreadyLinked)
      .mockResolvedValueOnce({ id: USER_ID });

    const result = await service.link(USER_ID, "valid-supabase-token");

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result.linked).toBe(true);
    expect(result.role).toBe("SUPERADMIN");
  });

  it("rejects an invalid CTG token without trusting caller identity data", async () => {
    ctgIdentityService.verify.mockRejectedValue(new Error("invalid signature"));

    await expect(service.link(USER_ID, "invalid-supabase-token")).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 while the CTG identity exchange gate is disabled", async () => {
    process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = "false";

    await expect(service.link(USER_ID, "valid-supabase-token")).rejects.toThrow(
      NotFoundException,
    );
    expect(ctgIdentityService.verify).not.toHaveBeenCalled();
  });
});
