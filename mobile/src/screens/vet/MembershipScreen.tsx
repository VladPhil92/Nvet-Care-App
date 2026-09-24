import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Button, Badge, Skeleton, UI_COLORS } from '../../components/ui/primitives'
import vetService, {
  type MembershipPlan,
  type MembershipState,
  type VetTier,
} from '../../services/vet.service'
import { formatCOP } from '../../utils/format'

interface Props {
  navigation: any
}

export default function MembershipScreen({ navigation }: Props) {
  const [membership, setMembership] = useState<MembershipState | null>(null)
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<VetTier | null>(null)

  const load = useCallback(async () => {
    try {
      const [current, available] = await Promise.all([
        vetService.getMyMembership(),
        vetService.getMembershipPlans(),
      ])
      setMembership(current)
      setPlans(available)
    } catch (err: any) {
      Alert.alert(
        'No pudimos cargar la membresía',
        err?.response?.data?.message ?? 'Intenta nuevamente.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const requestChange = useCallback(
    async (tier: VetTier) => {
      if (!membership || changing || tier === membership.tier) return
      setChanging(tier)
      try {
        const updated = await vetService.requestMembershipChange(tier)
        setMembership(updated)
        if (updated.status === 'PENDING_CHANGE') {
          Alert.alert(
            'Solicitud registrada',
            'Tu plan actual y su comisión siguen vigentes hasta que se confirme el cobro del nuevo plan.',
          )
        } else {
          Alert.alert('Membresía actualizada', 'El cambio ya está activo.')
        }
      } catch (err: any) {
        Alert.alert(
          'No pudimos cambiar el plan',
          err?.response?.data?.message ?? 'Intenta nuevamente.',
        )
      } finally {
        setChanging(null)
      }
    },
    [membership, changing],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Membresía veterinaria</Text>
          <Text style={styles.subtitle}>Menor comisión según tu plan activo</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="flat">
          <Text style={styles.policyTitle}>Tu práctica, tus precios</Text>
          <Text style={styles.policyText}>
            Nvet puede sugerir referencias, pero tú defines el precio final de cada servicio. La membresía solo modifica la comisión de plataforma y los beneficios de visibilidad.
          </Text>
        </Card>

        {loading ? (
          <View style={{ gap: 10, marginTop: 14 }}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} width="100%" height={180} borderRadius={14} />
            ))}
          </View>
        ) : (
          <>
            {membership?.status === 'PENDING_CHANGE' && membership.requestedPlan && (
              <View style={styles.pendingCard}>
                <Badge label="Cambio pendiente" tone="warning" size="sm" />
                <Text style={styles.pendingTitle}>{membership.requestedPlan.name}</Text>
                <Text style={styles.pendingText}>
                  {formatCOP(membership.requestedPlan.monthlyPriceCop)} / mes. Tu plan {membership.activePlan.name} continúa activo hasta confirmar el cobro.
                </Text>
              </View>
            )}

            <View style={{ gap: 12, marginTop: 14 }}>
              {plans.map((plan) => {
                const active = membership?.tier === plan.tier
                const pending = membership?.requestedTier === plan.tier
                return (
                  <View key={plan.tier} style={[styles.planCard, active && styles.planCardActive]}>
                    <View style={styles.planHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        <Text style={styles.planPrice}>
                          {plan.monthlyPriceCop === 0
                            ? 'Gratis'
                            : `${formatCOP(plan.monthlyPriceCop)} / mes`}
                        </Text>
                      </View>
                      {active && <Badge label="Activo" tone="success" size="sm" />}
                      {pending && !active && <Badge label="Pendiente" tone="warning" size="sm" />}
                    </View>

                    <View style={styles.commissionBox}>
                      <Text style={styles.commissionValue}>{plan.commissionPct}%</Text>
                      <Text style={styles.commissionLabel}>comisión por transacción</Text>
                    </View>

                    <Text style={styles.planDescription}>{plan.description}</Text>
                    <View style={styles.perks}>
                      {plan.perks.map((perk) => (
                        <Text key={perk} style={styles.perk}>✓ {perk}</Text>
                      ))}
                    </View>

                    <Button
                      label={
                        active
                          ? 'Plan activo'
                          : pending
                            ? 'Cambio pendiente'
                            : changing === plan.tier
                              ? 'Registrando…'
                              : plan.tier === 'FREE'
                                ? 'Cambiar a Free Vet'
                                : `Solicitar ${plan.name}`
                      }
                      variant={active ? 'ghost' : 'primary'}
                      onPress={() => requestChange(plan.tier)}
                      disabled={active || pending || changing !== null}
                      loading={changing === plan.tier}
                      fullWidth
                    />
                  </View>
                )
              })}
            </View>
          </>
        )}

        <Text style={styles.legalNote}>
          Los planes pagos no se activan hasta que Nvet confirme el cobro. Mientras una solicitud esté pendiente, continúan vigentes el plan y la comisión anteriores.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
  },
  back: { fontSize: 28, color: UI_COLORS.gold },
  title: { fontSize: 17, fontWeight: '800', color: UI_COLORS.text },
  subtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  policyTitle: { fontSize: 15, fontWeight: '800', color: UI_COLORS.text },
  policyText: { marginTop: 6, fontSize: 12, lineHeight: 18, color: UI_COLORS.muted },
  pendingCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  pendingTitle: { marginTop: 8, fontSize: 15, fontWeight: '800', color: UI_COLORS.text },
  pendingText: { marginTop: 4, fontSize: 12, lineHeight: 17, color: UI_COLORS.muted },
  planCard: {
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    padding: 16,
  },
  planCardActive: { borderColor: UI_COLORS.sage, borderWidth: 1.5 },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  planName: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  planPrice: { marginTop: 3, fontSize: 13, fontWeight: '700', color: UI_COLORS.gold },
  commissionBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: UI_COLORS.borderLight,
  },
  commissionValue: { fontSize: 28, fontWeight: '800', color: UI_COLORS.sage },
  commissionLabel: { flex: 1, fontSize: 12, color: UI_COLORS.muted },
  planDescription: { marginTop: 12, fontSize: 12, lineHeight: 17, color: UI_COLORS.muted },
  perks: { marginTop: 10, marginBottom: 14, gap: 6 },
  perk: { fontSize: 12, lineHeight: 17, color: UI_COLORS.text },
  legalNote: { marginTop: 18, fontSize: 11, lineHeight: 16, color: UI_COLORS.muted, textAlign: 'center' },
})
