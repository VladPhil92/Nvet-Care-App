import { WaitlistService } from './waitlist.service';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      waitlistEntry: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new WaitlistService(prisma);
  });

  describe('join', () => {
    it('crea una nueva entrada y retorna alreadyRegistered=false', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.create.mockResolvedValue({ id: '1', email: 'nuevo@test.com' });

      const result = await service.join('nuevo@test.com');

      expect(result.alreadyRegistered).toBe(false);
      expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'nuevo@test.com', source: 'store' },
      });
    });

    it('retorna alreadyRegistered=true sin crear duplicado', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue({ id: '1', email: 'ya@test.com' });

      const result = await service.join('ya@test.com');

      expect(result.alreadyRegistered).toBe(true);
      expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
    });

    it('acepta un source personalizado', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.create.mockResolvedValue({});

      await service.join('x@test.com', 'landing');

      expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'x@test.com', source: 'landing' },
      });
    });
  });
});
