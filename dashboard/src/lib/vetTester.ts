import type {
  ScheduleException,
  VetAppointment,
  VetChatSummary,
  VetEarnings,
  VetPrice,
  VetProfile,
  VetVerificationStatus,
} from '../services/vet.service'

export interface VetTesterSnapshot {
  profile: VetProfile
  earnings: VetEarnings
  appointments: VetAppointment[]
  prices: VetPrice[]
  verification: VetVerificationStatus
  chats: VetChatSummary[]
  scheduleExceptions: ScheduleException[]
}

const today = new Date()
const isoDay = (offset = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

export function createVetTesterSnapshot(): VetTesterSnapshot {
  const prices: VetPrice[] = [
    { id: 'tester-price-1', serviceName: 'Consulta domiciliaria', priceCop: 85000, priceCtg: 202, isActive: true },
    { id: 'tester-price-2', serviceName: 'Vacunación', priceCop: 65000, priceCtg: 155, isActive: true },
    { id: 'tester-price-3', serviceName: 'Urgencia domiciliaria', priceCop: 150000, priceCtg: 357, isActive: true },
  ]

  const profile: VetProfile = {
    id: 'vet-tester-profile',
    userId: 'superadmin-vet-tester',
    licenseNumber: 'TEST-NVET-0001',
    specialties: ['Medicina general', 'Urgencias', 'Medicina preventiva'],
    tier: 'ELITE',
    ctgBalance: 1280,
    bio: 'Perfil virtual para validación funcional del dashboard veterinario.',
    yearsExperience: 8,
    rating: 4.9,
    reviewCount: 42,
    isVerified: true,
    isActive: true,
    verificationStatus: 'APPROVED',
    city: 'Cartagena',
    department: 'Bolívar',
    serviceRadius: 12,
    isAvailableNow: true,
    timezone: 'America/Bogota',
    user: {
      id: 'superadmin-vet-tester',
      firstName: 'Vet',
      lastName: 'Tester',
      email: 'sandbox@nvet.local',
    },
    prices,
    schedules: [
      { id: 'sch-mon', dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '18:00', slotDuration: 60, isActive: true },
      { id: 'sch-tue', dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '18:00', slotDuration: 60, isActive: true },
      { id: 'sch-wed', dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '18:00', slotDuration: 60, isActive: true },
      { id: 'sch-thu', dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '18:00', slotDuration: 60, isActive: true },
      { id: 'sch-fri', dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '17:00', slotDuration: 60, isActive: true },
    ],
    verificationDocuments: [
      { id: 'doc-1', type: 'COMVEZCOL_CARD', status: 'APPROVED', fileName: 'comvezcol-test.pdf', uploadedAt: today.toISOString() },
      { id: 'doc-2', type: 'PROFESSIONAL_DEGREE', status: 'APPROVED', fileName: 'titulo-test.pdf', uploadedAt: today.toISOString() },
    ],
  }

  const appointments: VetAppointment[] = [
    {
      id: 'tester-apt-1', vetId: profile.id, clientId: 'client-a', petId: 'pet-a',
      serviceType: 'Consulta domiciliaria', date: isoDay(), time: '10:00', address: 'Cartagena',
      status: 'CONFIRMED', paymentMethod: 'CTG', amount: 85000,
      client: { id: 'client-a', firstName: 'Laura', lastName: 'Martínez' },
      pet: { id: 'pet-a', name: 'Bruno', species: 'Canino', breed: 'Labrador', weight: 28.5 },
    },
    {
      id: 'tester-apt-2', vetId: profile.id, clientId: 'client-b', petId: 'pet-b',
      serviceType: 'Vacunación', date: isoDay(), time: '13:30', address: 'Cartagena',
      status: 'IN_PROGRESS', paymentMethod: 'PSE', amount: 65000,
      client: { id: 'client-b', firstName: 'Andrés', lastName: 'Gómez' },
      pet: { id: 'pet-b', name: 'Mía', species: 'Felino', breed: 'Criollo', weight: 4.2 },
    },
    {
      id: 'tester-apt-3', vetId: profile.id, clientId: 'client-c', petId: 'pet-c',
      serviceType: 'Urgencia domiciliaria', date: isoDay(1), time: '09:00', address: 'Cartagena',
      status: 'PENDING', paymentMethod: 'TRANSFER', amount: 150000,
      client: { id: 'client-c', firstName: 'Camila', lastName: 'Ruiz' },
      pet: { id: 'pet-c', name: 'Rocky', species: 'Canino', breed: 'Bulldog', weight: 19.8 },
    },
  ]

  return {
    profile,
    appointments,
    prices,
    earnings: {
      totalEarnings: 2860000,
      totalCommissions: 286000,
      netEarnings: 2574000,
      totalCtg: 2380,
      pendingBalance: 420000,
      availableBalance: 1780000,
      transactionCount: 34,
      ctgBalance: profile.ctgBalance,
      byTier: { tier: 'ELITE', commissionPct: 10, commissionAmount: 286000, earnings: 2574000 },
      byMonth: [],
    },
    verification: {
      verificationStatus: 'APPROVED',
      isVerified: true,
      verifiedAt: today.toISOString(),
      documents: profile.verificationDocuments,
    },
    chats: [
      { appointmentId: 'tester-apt-1', unreadCount: 2, appointment: { id: 'tester-apt-1', status: 'CONFIRMED', pet: { name: 'Bruno' }, client: { id: 'client-a', firstName: 'Laura', lastName: 'Martínez' } } },
      { appointmentId: 'tester-apt-2', unreadCount: 0, appointment: { id: 'tester-apt-2', status: 'IN_PROGRESS', pet: { name: 'Mía' }, client: { id: 'client-b', firstName: 'Andrés', lastName: 'Gómez' } } },
    ],
    scheduleExceptions: [
      { id: 'tester-exception-1', date: `${isoDay(3)}T00:00:00.000Z`, isAvailable: false, reason: 'Bloqueo de prueba' },
    ],
  }
}
