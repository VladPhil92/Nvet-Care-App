import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'nvet-care-booking-payment-recovery-v1'

export interface PendingPaymentRecovery {
  appointmentId: string
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  amountCop: number
  amountCtg?: number
  idempotencyKey: string
  createdAt: string
}

type RecoveryMap = Record<string, PendingPaymentRecovery>

async function readRecoveryMap(): Promise<RecoveryMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as RecoveryMap
  } catch {
    // Corrupted local recovery state must never block the rest of the app.
    return {}
  }
}

async function writeRecoveryMap(records: RecoveryMap): Promise<void> {
  if (Object.keys(records).length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY)
    return
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

/**
 * Records the financial continuation only after a replayed appointment exists.
 * The payment itself is never executed from background recovery: the client
 * must explicitly confirm it from the appointment detail screen.
 */
export async function savePendingPaymentRecovery(
  recovery: PendingPaymentRecovery,
): Promise<void> {
  const records = await readRecoveryMap()
  records[recovery.appointmentId] = recovery
  await writeRecoveryMap(records)
}

export async function getPendingPaymentRecovery(
  appointmentId: string,
): Promise<PendingPaymentRecovery | null> {
  const records = await readRecoveryMap()
  const recovery = records[appointmentId]
  if (!recovery) return null

  if (
    recovery.appointmentId !== appointmentId ||
    !recovery.idempotencyKey ||
    !Number.isFinite(recovery.amountCop)
  ) {
    delete records[appointmentId]
    await writeRecoveryMap(records)
    return null
  }

  return recovery
}

export async function clearPendingPaymentRecovery(
  appointmentId: string,
): Promise<void> {
  const records = await readRecoveryMap()
  if (!records[appointmentId]) return
  delete records[appointmentId]
  await writeRecoveryMap(records)
}

/**
 * Payment handoffs are user-scoped. A logout or account switch must never make
 * one client's pending financial continuation visible to the next session.
 */
export async function clearAllPendingPaymentRecovery(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
