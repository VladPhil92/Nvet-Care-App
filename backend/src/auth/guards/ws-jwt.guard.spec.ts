import { ExecutionContext } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { WsJwtGuard } from "./ws-jwt.guard";

describe("WsJwtGuard", () => {
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  let guard: WsJwtGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new WsJwtGuard(jwtService as any, prisma as any);
    jwtService.verifyAsync.mockResolvedValue({ sub: "user-1", iat: 100 });
  });

  function buildContext(existingUser?: Record<string, unknown>) {
    const socket: any = {
      handshake: { auth: { token: "signed-access-token" } },
      user: existingUser,
      disconnect: jest.fn(),
    };
    const context = {
      switchToWs: () => ({ getClient: () => socket }),
    } as unknown as ExecutionContext;
    return { context, socket };
  }

  it("revalidates the database even when the socket already has a cached user", async () => {
    const { context, socket } = buildContext({
      id: "user-1",
      email: "old@example.com",
      role: "CLIENT",
      emailVerified: true,
      twoFactorEnabled: false,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "current@example.com",
      role: "CLIENT",
      emailVerified: true,
      twoFactorEnabled: false,
      isActive: true,
      passwordChangedAt: null,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith("signed-access-token", {
      secret: process.env.JWT_SECRET,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(socket.user.email).toBe("current@example.com");
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects an already-connected socket after account deletion", async () => {
    const { context, socket } = buildContext({
      id: "user-1",
      email: "cached@example.com",
      role: "CLIENT",
      emailVerified: true,
      twoFactorEnabled: false,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "deleted+user-1@privacy.invalid",
      role: "CLIENT",
      emailVerified: false,
      twoFactorEnabled: false,
      isActive: false,
      passwordChangedAt: new Date(200 * 1000),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(WsException);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects when the access token was invalidated by a password change", async () => {
    const { context, socket } = buildContext();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "CLIENT",
      emailVerified: true,
      twoFactorEnabled: false,
      isActive: true,
      passwordChangedAt: new Date(200 * 1000),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      "Token invalidated by password change",
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("fails closed and disconnects when token verification fails", async () => {
    const { context, socket } = buildContext();
    jwtService.verifyAsync.mockRejectedValue(new Error("bad signature"));

    await expect(guard.canActivate(context)).rejects.toThrow("Invalid token");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
