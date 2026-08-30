/**
 * HomeScreen — Cliente (alineado con mockup oficial Nvet Care).
 *
 * Estructura del mockup:
 *   1. Header   → Logo + bell con dot naranja
 *   2. Greeting → "Hola, {nombre}" en verde + heading grande "¿Cómo podemos ayudarte hoy?"
 *   3. Search   → barra blanca redondeada con icono lupa
 *   4. Quick actions → 4 cards (Vet a domicilio, Telemedicina, Emergencias, Tienda)
 *      con iconos line+nodes oficiales y dot naranja
 *   5. Hero card → verde claro con título, subtítulo, CTA verde y espacio para imagen mascota
 *   6. Próximas citas → header + "Ver todas" + card con vet info, hora, dirección
 *   7. "Para ti y tu mascota" → cards horizontales (productos)
 *
 * Bottom nav vive en `ClientNavigator` (no se renderiza aquí).
 */

import React, { useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useI18n } from '../../i18n/I18nProvider'
import { Colors } from '../../theme/colors'
import { Logo } from '../../components/common/Logo'
import { Icon, IconNode, type IconName } from '../../components/common/Icon'
import {
  useCurrentUserQuery,
  useTodayAppointmentsQuery,
  useBalanceQuery,
} from '../../hooks/queries/useMobileQueries'
import { formatAppointmentDate } from '../../utils/format'

interface HomeScreenProps {
  navigation: any
}

interface QuickAction {
  id: string
  icon: IconName
  label: string
  bgColor: string
  iconColor: string
  onPress?: () => void
}

export default function HomeScreenV2({ navigation }: HomeScreenProps) {
  const { t } = useI18n()
  const userQ = useCurrentUserQuery()
  const todayApptQ = useTodayAppointmentsQuery()
  const balanceQ = useBalanceQuery()

  const refreshing = userQ.isFetching || todayApptQ.isFetching || balanceQ.isFetching
  const onRefresh = useCallback(() => {
    userQ.refetch()
    todayApptQ.refetch()
    balanceQ.refetch()
  }, [userQ, todayApptQ, balanceQ])

  const firstName = userQ.data?.firstName ?? ''
  const nextAppointment = todayApptQ.data?.[0]

  const getTabs = useCallback(() => navigation.getParent?.(), [navigation])

  const openSearch = useCallback(() => {
    getTabs()?.navigate('ClientSearch')
  }, [getTabs])

  const openAppointments = useCallback(() => {
    getTabs()?.navigate('ClientAppointments')
  }, [getTabs])

  const openNotifications = useCallback(() => {
    getTabs()?.navigate('ClientProfile', { screen: 'Notifications' })
  }, [getTabs])

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: 'vet-home',
        icon: 'vet-home',
        label: 'Veterinarios\na domicilio',
        bgColor: Colors.greenSoft,
        iconColor: Colors.sage,
        onPress: openSearch,
      },
      {
        id: 'telemedicine',
        icon: 'telemedicine',
        label: 'Telemedicina',
        bgColor: Colors.greenSoft,
        iconColor: Colors.sage,
        onPress: openSearch,
      },
      {
        id: 'emergency',
        icon: 'emergency',
        label: 'Emergencias',
        bgColor: '#FFE4D2',
        iconColor: Colors.gold,
        onPress: () => navigation.navigate('Emergency'),
      },
      {
        id: 'store',
        icon: 'store',
        label: 'Tienda',
        bgColor: Colors.greenSoft,
        iconColor: Colors.sage,
        onPress: () => navigation.navigate('Store'),
      },
    ],
    [navigation, openSearch],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.sage} />
        }
      >
        {/* ── 1. Header ────────────────────────────────────────── */}
        <View style={styles.header}>
          <Logo size={28} showWordmark />
          <Pressable
            onPress={openNotifications}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Notificaciones"
            style={styles.bellPressable}
          >
            <Icon name="bell" size={24} color={Colors.ink} accent />
          </Pressable>
        </View>

        {/* ── 2. Greeting ──────────────────────────────────────── */}
        <View style={styles.greeting}>
          <Text style={styles.greetingHello}>
            Hola, {firstName || 'amigo'}
          </Text>
          <Text style={styles.greetingHeading}>¿Cómo podemos{'\n'}ayudarte hoy?</Text>
        </View>

        {/* ── 3. Search bar ────────────────────────────────────── */}
        <Pressable
          onPress={openSearch}
          style={styles.searchBar}
          accessibilityRole="search"
          accessibilityLabel="Buscar servicios, veterinarios o productos"
        >
          <Icon name="search" size={20} color={Colors.inkMuted} />
          <Text style={styles.searchPlaceholder}>
            Buscar servicios, veterinarios, productos...
          </Text>
        </Pressable>

        {/* ── 4. Quick actions ─────────────────────────────────── */}
        <View style={styles.quickActions}>
          {quickActions.map((qa) => (
            <Pressable
              key={qa.id}
              style={styles.quickCard}
              onPress={qa.onPress}
              accessibilityRole="button"
              accessibilityLabel={qa.label.replace('\n', ' ')}
            >
              <IconNode
                name={qa.icon}
                size={56}
                bg={qa.bgColor}
                iconColor={qa.iconColor}
                accent
              />
              <Text style={styles.quickLabel}>{qa.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── 5. Hero card ─────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>
              Bienestar para tu mascota,{'\n'}tranquilidad para ti.
            </Text>
            <Text style={styles.heroSubtitle}>
              Conecta con veterinarios verificados y recibe la mejor atención, cuando más
              lo necesiten.
            </Text>
            <Pressable
              onPress={openSearch}
              style={({ pressed }) => [
                styles.heroCta,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Solicitar veterinario"
            >
              <Text style={styles.heroCtaText}>Solicitar veterinario</Text>
              <Icon name="arrow-right" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          {/* Espacio para mascota — placeholder ilustrativo */}
          <View style={styles.heroIllustration}>
            <View style={styles.heroDog}>
              <Icon name="heart" size={40} color={Colors.sage} />
            </View>
          </View>
        </View>

        {/* ── 6. Próximas citas ────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Citas próximas</Text>
            <Pressable
              onPress={openAppointments}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.sectionLink}>Ver todas</Text>
            </Pressable>
          </View>

          {nextAppointment ? (
            <Pressable
              style={styles.appointmentCard}
              onPress={() =>
                navigation.navigate('AppointmentDetail', {
                  appointmentId: nextAppointment.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Cita ${formatAppointmentDate(
                nextAppointment.scheduledAt,
              )} con ${nextAppointment.vet?.firstName ?? 'veterinario'}`}
            >
              <View style={styles.apptAvatar}>
                <Icon name="profile" size={28} color={Colors.sage} />
              </View>
              <View style={styles.apptCenter}>
                <Text style={styles.apptDate}>
                  {formatAppointmentDate(nextAppointment.scheduledAt)}
                </Text>
                <Text style={styles.apptService}>
                  {nextAppointment.serviceName ?? 'Consulta general'}
                </Text>
                <Text style={styles.apptVet}>
                  Dr. {nextAppointment.vet?.firstName ?? ''}{' '}
                  {nextAppointment.vet?.lastName ?? ''}
                </Text>
              </View>
              <View style={styles.apptRight}>
                <View style={styles.apptBadge}>
                  <Text style={styles.apptBadgeText}>Presencial</Text>
                </View>
                <View style={styles.apptLocation}>
                  <Icon name="location" size={12} color={Colors.inkMuted} />
                  <Text style={styles.apptLocationText} numberOfLines={2}>
                    {nextAppointment.address ?? 'Tu domicilio'}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={styles.appointmentEmpty}>
              <Icon name="calendar" size={28} color={Colors.inkMuted} />
              <Text style={styles.appointmentEmptyText}>
                No tienes citas programadas
              </Text>
              <Pressable
                onPress={openSearch}
                style={styles.appointmentEmptyCta}
              >
                <Text style={styles.appointmentEmptyCtaText}>Buscar veterinario</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── 7. Para ti y tu mascota ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Para ti y tu mascota</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productsRow}
          >
            <ProductCard
              title="Alimento premium"
              bg={Colors.greenSoft}
              icon="store"
              onPress={() => navigation.navigate('Store', { category: 'food' })}
            />
            <ProductCard
              title="Antipulgas y garrapatas"
              bg="#FFE4D2"
              icon="shield"
              onPress={() => navigation.navigate('Store', { category: 'meds' })}
            />
            <ProductCard
              title="Juguetes"
              bg={Colors.greenSoft}
              icon="heart"
              onPress={() => navigation.navigate('Store', { category: 'toys' })}
            />
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-componente: tarjeta de producto horizontal ──────────────
function ProductCard({
  title,
  bg,
  icon,
  onPress,
}: {
  title: string
  bg: string
  icon: IconName
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.productCard, { backgroundColor: bg }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.productIcon}>
        <Icon name={icon} size={28} color={Colors.sage} />
      </View>
      <Text style={styles.productTitle}>{title}</Text>
    </Pressable>
  )
}

// ── Estilos ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.canvas },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  bellPressable: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Greeting
  greeting: {
    marginBottom: 18,
  },
  greetingHello: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.sage,
    marginBottom: 6,
  },
  greetingHeading: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    lineHeight: 34,
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    columnGap: 12,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: Colors.inkMuted,
    flex: 1,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 8,
    marginBottom: 22,
  },
  quickCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    rowGap: 8,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 14,
  },

  // Hero card
  heroCard: {
    flexDirection: 'row',
    backgroundColor: Colors.greenSoft,
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    minHeight: 200,
  },
  heroLeft: {
    flex: 1.3,
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
    lineHeight: 22,
  },
  heroSubtitle: {
    fontSize: 12,
    color: Colors.inkSec,
    lineHeight: 16,
    marginTop: 8,
  },
  heroCta: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    alignItems: 'center',
    columnGap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  heroCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  heroIllustration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDog: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  sectionLink: {
    fontSize: 14,
    color: Colors.sageText,
    fontWeight: '600',
  },

  // Appointment card
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    columnGap: 12,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  apptAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  apptDate: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.sageText,
    marginBottom: 2,
  },
  apptService: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  apptVet: {
    fontSize: 12,
    color: Colors.inkSec,
    marginTop: 2,
  },
  apptRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  apptBadge: {
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  apptBadgeText: {
    fontSize: 11,
    color: Colors.sageText,
    fontWeight: '600',
  },
  apptLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    maxWidth: 100,
  },
  apptLocationText: {
    fontSize: 11,
    color: Colors.inkMuted,
    flexShrink: 1,
    textAlign: 'right',
  },

  // Empty appointment
  appointmentEmpty: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    rowGap: 8,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  appointmentEmptyText: {
    fontSize: 13,
    color: Colors.inkSec,
  },
  appointmentEmptyCta: {
    backgroundColor: Colors.sage,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
    marginTop: 4,
  },
  appointmentEmptyCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Products
  productsRow: {
    columnGap: 12,
    paddingRight: 20,
  },
  productCard: {
    width: 160,
    height: 110,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
  },
  productIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
    lineHeight: 16,
  },
})