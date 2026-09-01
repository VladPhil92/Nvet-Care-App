import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { T, F, SPACING } from '../theme/tokens'
import { Metric, Field, Badge, cardStyle, Btn, inputStyle } from '../components/UI'
import { PayBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import {
  useVetAppointmentsQuery,
  useVetChatsQuery,
  useVetEarningsQuery,
  useVetPricesQuery,
  useVetProfileQuery,
  useVetScheduleExceptionsQuery,
  useVetTodayAppointmentsQuery,
  useVetVerificationQuery,
  vetQueryKeys,
} from '../hooks/queries/useVetQueries'
import { createVetTesterSnapshot } from '../lib/vetTester'
import { vetService, type VetAppointment } from '../services/vet.service'

export type VetPanelMode = 'live' | 'tester'

interface VetPanelProps {
  mode?: VetPanelMode
}

function formatCOP(value = 0) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function personName(firstName?: string, lastName?: string) {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Cliente'
}

function statusVariant(status?: string): 'ok' | 'warn' | 'err' | 'default' {
  if (status === 'COMPLETED') return 'ok'
  if (status === 'IN_PROGRESS' || status === 'CONFIRMED') return 'warn'
  if (status === 'CANCELLED' || status === 'DISPUTED') return 'err'
  return 'default'
}

function nextAppointmentStatus(status: string) {
  if (status === 'PENDING') return 'CONFIRMED'
  if (status === 'CONFIRMED') return 'IN_PROGRESS'
  if (status === 'IN_PROGRESS') return 'COMPLETED'
  return null
}

const sectionTitleStyle = {
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 600,
  color: T.ink,
} as const

export default function VetPanel({ mode = 'live' }: VetPanelProps) {
  const isTester = mode === 'tester'
  const liveEnabled = !isTester
  const { isMobile, isTablet } = useResponsive()
  const queryClient = useQueryClient()
  const [tester, setTester] = useState(() => createVetTesterSnapshot())
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatment, setTreatment] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [servicePrice, setServicePrice] = useState('')
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionReason, setExceptionReason] = useState('')
  const [chatAppointmentId, setChatAppointmentId] = useState('')
  const [chatMessage, setChatMessage] = useState('')

  const dateRange = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 30)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }, [])

  const profileQ = useVetProfileQuery(liveEnabled)
  const earningsQ = useVetEarningsQuery(liveEnabled)
  const appointmentsQ = useVetAppointmentsQuery(liveEnabled)
  const todayQ = useVetTodayAppointmentsQuery(liveEnabled)
  const pricesQ = useVetPricesQuery(liveEnabled)
  const verificationQ = useVetVerificationQuery(liveEnabled)
  const chatsQ = useVetChatsQuery(liveEnabled)
  const scheduleQ = useVetScheduleExceptionsQuery(dateRange.startDate, dateRange.endDate, liveEnabled)

  const profile = isTester ? tester.profile : profileQ.data
  const earnings = isTester ? tester.earnings : earningsQ.data
  const appointments = isTester ? tester.appointments : (appointmentsQ.data ?? [])
  const todayAppointments = isTester
    ? tester.appointments.filter((appointment) => appointment.date.slice(0, 10) === new Date().toISOString().slice(0, 10))
    : (todayQ.data ?? [])
  const prices = isTester ? tester.prices : (pricesQ.data ?? [])
  const verification = isTester ? tester.verification : verificationQ.data
  const chats = isTester ? tester.chats : (chatsQ.data ?? [])
  const scheduleExceptions = isTester ? tester.scheduleExceptions : (scheduleQ.data ?? [])

  const selectedAppointment = appointments.find((item) => item.id === selectedAppointmentId)
  const currentChat = chats.find((chat) => (chat.appointmentId || chat.appointment?.id || chat.id) === chatAppointmentId)
  const isLoading = liveEnabled && (profileQ.isLoading || appointmentsQ.isLoading || earningsQ.isLoading)
  const hasCriticalError = liveEnabled && profileQ.isError

  const containerPadding = isMobile
    ? `${SPACING.mobile.gutter}px`
    : isTablet
      ? `${SPACING.tablet.gutter}px`
      : `${SPACING.desktop.gutter}px`
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  const twoColumns = isMobile || isTablet ? '1fr' : '1.15fr .85fr'

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    setBusyAction(key)
    setNotice(null)
    try {
      await action()
      setNotice(successMessage)
    } catch {
      setNotice('No fue posible completar la operación. Revisa la conexión o permisos del perfil veterinario.')
    } finally {
      setBusyAction(null)
    }
  }

  const invalidateVetData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.profile() }),
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.appointments() }),
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.today() }),
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.prices() }),
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.earnings() }),
      queryClient.invalidateQueries({ queryKey: vetQueryKeys.chats() }),
      queryClient.invalidateQueries({ queryKey: ['vet', 'schedule-exceptions'] }),
    ])
  }

  const toggleAvailability = () => {
    void runAction('availability', async () => {
      if (isTester) {
        setTester((current) => ({
          ...current,
          profile: { ...current.profile, isAvailableNow: !current.profile.isAvailableNow },
        }))
        return
      }
      await vetService.toggleAvailability()
      await invalidateVetData()
    }, isTester ? 'Disponibilidad simulada actualizada. No se guardó ningún dato real.' : 'Disponibilidad actualizada.')
  }

  const advanceAppointment = (appointment: VetAppointment) => {
    const next = nextAppointmentStatus(appointment.status)
    if (!next) return
    void runAction(`status-${appointment.id}`, async () => {
      if (isTester) {
        setTester((current) => ({
          ...current,
          appointments: current.appointments.map((item) => item.id === appointment.id ? { ...item, status: next } : item),
        }))
        return
      }
      await vetService.updateAppointmentStatus(appointment.id, next)
      await invalidateVetData()
    }, isTester ? `Flujo simulado: cita movida a ${next}.` : `Cita actualizada a ${next}.`)
  }

  const saveClinicalRecord = () => {
    if (!selectedAppointment || !diagnosis.trim() || !treatment.trim()) {
      setNotice('Selecciona una cita e ingresa diagnóstico y tratamiento.')
      return
    }
    void runAction('clinical', async () => {
      if (isTester) {
        setTester((current) => ({
          ...current,
          appointments: current.appointments.map((item) => item.id === selectedAppointment.id
            ? { ...item, diagnosis: diagnosis.trim(), treatment: treatment.trim() }
            : item),
        }))
      } else {
        await vetService.addClinicalNotes(selectedAppointment.id, diagnosis.trim(), treatment.trim())
        await invalidateVetData()
      }
      setDiagnosis('')
      setTreatment('')
    }, isTester ? 'Registro clínico probado en sandbox; no se escribió historia clínica real.' : 'Registro clínico guardado.')
  }

  const addPrice = () => {
    const numericPrice = Number(servicePrice)
    if (!serviceName.trim() || !Number.isFinite(numericPrice) || numericPrice < 5000) {
      setNotice('Ingresa un servicio y un precio válido desde $5.000 COP.')
      return
    }
    void runAction('price-create', async () => {
      if (isTester) {
        setTester((current) => ({
          ...current,
          prices: [...current.prices, {
            id: `tester-price-${Date.now()}`,
            serviceName: serviceName.trim(),
            priceCop: numericPrice,
            priceCtg: Math.round(numericPrice / 420),
            isActive: true,
          }],
        }))
      } else {
        await vetService.createPrice({ serviceName: serviceName.trim(), priceCop: numericPrice })
        await invalidateVetData()
      }
      setServiceName('')
      setServicePrice('')
    }, isTester ? 'Servicio agregado al catálogo de prueba.' : 'Servicio agregado al catálogo.')
  }

  const togglePrice = (priceId: string, isActive: boolean) => {
    void runAction(`price-${priceId}`, async () => {
      if (isTester) {
        setTester((current) => ({
          ...current,
          prices: current.prices.map((price) => price.id === priceId ? { ...price, isActive: !isActive } : price),
        }))
      } else {
        await vetService.updatePrice(priceId, { isActive: !isActive })
        await invalidateVetData()
      }
    }, isTester ? 'Estado del servicio cambiado en sandbox.' : 'Estado del servicio actualizado.')
  }

  const blockScheduleDate = () => {
    if (!exceptionDate) {
      setNotice('Selecciona una fecha para bloquear en la agenda.')
      return
    }
    void runAction('schedule', async () => {
      if (isTester) {
        const isoDate = `${exceptionDate}T00:00:00.000Z`
        setTester((current) => ({
          ...current,
          scheduleExceptions: [
            ...current.scheduleExceptions.filter((item) => item.date.slice(0, 10) !== exceptionDate),
            { id: `tester-ex-${Date.now()}`, date: isoDate, isAvailable: false, reason: exceptionReason.trim() || 'No disponible' },
          ],
        }))
      } else {
        await vetService.upsertScheduleException(exceptionDate, {
          isAvailable: false,
          reason: exceptionReason.trim() || 'No disponible',
        })
        await invalidateVetData()
      }
      setExceptionDate('')
      setExceptionReason('')
    }, isTester ? 'Bloqueo de agenda simulado.' : 'Fecha bloqueada en la agenda.')
  }

  const sendChat = () => {
    if (!chatAppointmentId || !chatMessage.trim()) {
      setNotice('Selecciona una conversación e ingresa un mensaje.')
      return
    }
    void runAction('chat', async () => {
      if (!isTester) {
        await vetService.sendChatMessage(chatAppointmentId, chatMessage.trim())
        await invalidateVetData()
      }
      setChatMessage('')
    }, isTester ? 'Mensaje simulado. No fue enviado a ningún cliente real.' : 'Mensaje enviado.')
  }

  if (hasCriticalError) {
    return (
      <div style={{ padding: containerPadding }}>
        <div style={{ ...cardStyle, padding: 24, borderLeft: `3px solid ${T.err}` }}>
          <div style={sectionTitleStyle}>No fue posible abrir el perfil veterinario</div>
          <p style={{ fontFamily: F.sans, color: T.inkMuted, lineHeight: 1.6 }}>
            La cuenta autenticada como VET no tiene un perfil veterinario disponible o el backend rechazó el acceso.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: containerPadding }}>
      <div style={{ ...cardStyle, marginBottom: 18, padding: isMobile ? 16 : 20, borderLeft: `3px solid ${isTester ? T.gold : T.sage}` }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, alignItems: isMobile ? 'flex-start' : 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: F.serif, fontSize: isMobile ? 22 : 28, color: T.ink }}>
                {isTester ? 'Vet Tester' : personName(profile?.user.firstName, profile?.user.lastName)}
              </div>
              <Badge variant={isTester ? 'gold' : 'sage'}>{isTester ? 'SANDBOX SUPERADMIN' : 'VETERINARIO'}</Badge>
              {profile?.tier && <Badge variant={profile.tier.toLowerCase() as 'free' | 'pro' | 'elite'}>{profile.tier}</Badge>}
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 13, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
              {isTester
                ? 'Vista funcional aislada: puedes probar agenda, historias, precios, disponibilidad y chat sin operar como veterinario ni modificar datos productivos.'
                : `${profile?.licenseNumber || 'Perfil profesional'} · ${profile?.city || 'Ubicación sin definir'} · ${profile?.verificationStatus || 'Verificación pendiente'}`}
            </div>
          </div>
          <Btn
            variant={profile?.isAvailableNow ? 'primary' : 'ghost'}
            onClick={toggleAvailability}
            disabled={busyAction === 'availability' || isLoading}
          >
            {profile?.isAvailableNow ? 'Disponible ahora' : 'Marcar disponible'}
          </Btn>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 18, padding: '11px 14px', borderRadius: 8, background: T.surfaceAlt, border: `1px solid ${T.line}`, color: T.inkSec, fontFamily: F.sans, fontSize: 13 }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 20 }}>
        <Metric label="CITAS HOY" value={isLoading ? '…' : todayAppointments.length} sub={`${appointments.length} en historial visible`} accent={T.sage} />
        <Metric label="INGRESO NETO" value={isLoading ? '…' : formatCOP(earnings?.netEarnings)} sub={`${earnings?.transactionCount ?? 0} servicios liquidados`} accent={T.gold} />
        <Metric label="SALDO DISPONIBLE" value={isLoading ? '…' : formatCOP(earnings?.availableBalance)} sub={`${earnings?.ctgBalance ?? profile?.ctgBalance ?? 0} CTG`} accent={T.goldLt} />
        <Metric label="VERIFICACIÓN" value={verification?.isVerified ? 'Aprobada' : (verification?.verificationStatus || 'Pendiente')} sub={`${profile?.rating ?? 0} ★ · ${profile?.reviewCount ?? 0} reseñas`} accent={verification?.isVerified ? T.sageLt : T.warn} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={sectionTitleStyle}>Agenda y ciclo de atención</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Confirmar → iniciar → completar servicio</div>
            </div>
            <Badge>{todayAppointments.length} hoy</Badge>
          </div>
          <div>
            {(todayAppointments.length ? todayAppointments : appointments.slice(0, 5)).map((appointment) => {
              const next = nextAppointmentStatus(appointment.status)
              return (
                <div key={appointment.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: T.ink }}>
                        {appointment.time} · {appointment.pet?.name || 'Paciente'}
                      </div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>
                        {appointment.serviceType} · {personName(appointment.client?.firstName, appointment.client?.lastName)}
                      </div>
                    </div>
                    <PayBadge m={appointment.paymentMethod} />
                    <Badge variant={statusVariant(appointment.status)}>{appointment.status}</Badge>
                    {next && (
                      <Btn size="sm" variant="ghost" onClick={() => advanceAppointment(appointment)} disabled={busyAction === `status-${appointment.id}`}>
                        → {next}
                      </Btn>
                    )}
                  </div>
                </div>
              )
            })}
            {!appointments.length && !isLoading && <div style={{ padding: 20, color: T.inkMuted, fontFamily: F.sans }}>Sin citas asignadas.</div>}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
            <div style={sectionTitleStyle}>Registro clínico</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Diagnóstico y tratamiento vinculados a una cita</div>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <Field label="Cita / paciente">
              <select value={selectedAppointmentId} onChange={(event) => setSelectedAppointmentId(event.target.value)} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {appointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>{appointment.pet?.name || 'Paciente'} · {appointment.serviceType}</option>
                ))}
              </select>
            </Field>
            {selectedAppointment?.pet && (
              <div style={{ padding: 10, background: T.surfaceAlt, borderRadius: 8, fontFamily: F.sans, fontSize: 12, color: T.inkSec }}>
                {selectedAppointment.pet.species} · {selectedAppointment.pet.breed || 'Sin raza registrada'} · {selectedAppointment.pet.weight ? `${selectedAppointment.pet.weight} kg` : 'Peso no registrado'}
              </div>
            )}
            <Field label="Diagnóstico"><input value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} style={inputStyle} placeholder="Hallazgos y diagnóstico" /></Field>
            <Field label="Tratamiento"><textarea value={treatment} onChange={(event) => setTreatment(event.target.value)} style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} placeholder="Medicamentos, dosis, indicaciones y seguimiento" /></Field>
            <Btn full onClick={saveClinicalRecord} disabled={busyAction === 'clinical'}>Guardar registro clínico</Btn>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
            <div style={sectionTitleStyle}>Catálogo privado de servicios</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Precios que alimentan oferta, chat y reserva</div>
          </div>
          <div style={{ padding: 20 }}>
            {prices.map((price) => (
              <div key={price.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 13.5, color: T.ink }}>{price.serviceName}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: T.inkMuted }}>{price.isActive ? 'Activo' : 'Oculto'}</div>
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 13, color: T.sage }}>{formatCOP(price.priceCop)}</div>
                {price.priceCtg != null && <div style={{ fontFamily: F.mono, fontSize: 12, color: T.gold }}>{price.priceCtg} CTG</div>}
                <Btn size="sm" variant="ghost" onClick={() => togglePrice(price.id, price.isActive)} disabled={busyAction === `price-${price.id}`}>
                  {price.isActive ? 'Ocultar' : 'Activar'}
                </Btn>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr .8fr auto', gap: 8, marginTop: 14 }}>
              <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} style={inputStyle} placeholder="Nuevo servicio" />
              <input value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} style={inputStyle} type="number" min={5000} placeholder="Precio COP" />
              <Btn onClick={addPrice} disabled={busyAction === 'price-create'}>Agregar</Btn>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
            <div style={sectionTitleStyle}>Agenda y excepciones</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Horario base + bloqueos puntuales</div>
          </div>
          <div style={{ padding: 20 }}>
            {(profile?.schedules ?? []).slice(0, 7).map((schedule) => (
              <div key={schedule.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontFamily: F.sans, fontSize: 12, color: T.inkSec }}>
                <span>{schedule.dayOfWeek}</span><span>{schedule.startTime}–{schedule.endTime}</span>
              </div>
            ))}
            {!profile?.schedules?.length && <div style={{ color: T.inkMuted, fontFamily: F.sans, fontSize: 12, marginBottom: 10 }}>Sin horario base configurado.</div>}
            <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 10, paddingTop: 12 }}>
              {scheduleExceptions.map((exception) => (
                <div key={exception.id} style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginBottom: 6 }}>
                  {exception.date.slice(0, 10)} · {exception.isAvailable ? 'Disponible' : 'Bloqueado'} {exception.reason ? `· ${exception.reason}` : ''}
                </div>
              ))}
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} style={inputStyle} />
                <input value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} style={inputStyle} placeholder="Motivo del bloqueo" />
                <Btn variant="ghost" onClick={blockScheduleDate} disabled={busyAction === 'schedule'}>Bloquear fecha</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
            <div style={sectionTitleStyle}>Chat de atención</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Conversaciones ligadas a citas activas</div>
          </div>
          <div style={{ padding: 20 }}>
            <select value={chatAppointmentId} onChange={(event) => setChatAppointmentId(event.target.value)} style={inputStyle}>
              <option value="">Seleccionar conversación…</option>
              {chats.map((chat) => {
                const id = chat.appointmentId || chat.appointment?.id || chat.id || ''
                const client = chat.client || chat.appointment?.client
                const pet = chat.pet || chat.appointment?.pet
                return <option key={id} value={id}>{pet?.name || 'Paciente'} · {personName(client?.firstName, client?.lastName)} · {chat.unreadCount ?? 0} sin leer</option>
              })}
            </select>
            {currentChat && <div style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>Conversación vinculada a la cita {chatAppointmentId.slice(0, 8)}.</div>}
            <textarea value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} style={{ ...inputStyle, minHeight: 78, resize: 'vertical', marginTop: 10 }} placeholder="Mensaje al cliente" />
            <div style={{ marginTop: 10 }}><Btn onClick={sendChat} disabled={busyAction === 'chat'}>Enviar mensaje</Btn></div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
            <div style={sectionTitleStyle}>Perfil, verificación y finanzas</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Estado profesional y conciliación económica</div>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F.sans, fontSize: 13 }}><span style={{ color: T.inkMuted }}>Licencia</span><span>{profile?.licenseNumber || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F.sans, fontSize: 13 }}><span style={{ color: T.inkMuted }}>Especialidades</span><span style={{ textAlign: 'right' }}>{profile?.specialties?.join(', ') || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F.sans, fontSize: 13 }}><span style={{ color: T.inkMuted }}>Verificación</span><Badge variant={verification?.isVerified ? 'ok' : 'warn'}>{verification?.verificationStatus || 'NONE'}</Badge></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F.sans, fontSize: 13 }}><span style={{ color: T.inkMuted }}>Comisión del plan</span><span>{earnings?.byTier.commissionPct ?? '—'}%</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F.sans, fontSize: 13 }}><span style={{ color: T.inkMuted }}>Pendiente de liquidar</span><span>{formatCOP(earnings?.pendingBalance)}</span></div>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
              {(profile?.verificationDocuments ?? verification?.documents ?? []).length} documento(s) de verificación visibles.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
