import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Badge,
  Skeleton,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  useCurrentUserQuery,
  useMyVerificationStatusQuery,
} from '../../hooks/queries/useMobileQueries'
import { useLogoutMutation } from '../../hooks/queries/useMobileMutations'
import { useUserMode } from '../../hooks/useUserMode'
import { useI18n } from '../../i18n/I18nProvider'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'

/**
 * ProfileScreen — perfil del usuario con switch de modo Cliente/Vet.
 *
 * Refactorizado para consumir React Query (eliminada mock data).
 *
 * Capacidades:
 *  - Header con avatar de iniciales + nombre + email del current user
 *  - Switch de modo (CLIENT / VET) con validación de verificación
 *  - Lista de menús con navegación a Wallet, Notifications, Settings, etc.
 *  - Logout con confirmación + `useLogoutMutation` (limpia React Query cache)
 *  - Estados loading/error tratados con Skeleton
 */

interface Props {
  navigation: any
}

export default function ProfileScreen({ navigation }: Props) {
  const { mode, toggleMode } = useUserMode()
  const { t } = useI18n()
  const userQuery = useCurrentUserQuery()
  const verificationQuery = useMyVerificationStatusQuery({
    enabled: mode === 'VET' || userQuery.data?.role === 'VET',
  })
  const logoutMutation = useLogoutMutation()

  const user = userQuery.data
  const verification = verificationQuery.data

  const isVetVerified = verification?.status === 'APPROVED'
  const isPendingVerification = verification?.status === 'PENDING'

  const initials = (
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')
  ).toUpperCase() || '?'

  const handleModeToggle = useCallback(() => {
    if (mode === 'CLIENT') {
      if (isVetVerified) {
        toggleMode()
      } else if (isPendingVerification) {
        Alert.alert(
          t('profile.pendingVerification'),
          t('auth.forgotPassword.subtitle'),
          [{ text: t('common.confirm') }],
        )
      } else {
        Alert.alert(
          t('profile.modeVet'),
          t('profile.becomeVetSubtitle'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('profile.becomeVet'),
              onPress: () => navigation.navigate('VetVerification'),
            },
          ],
        )
      }
    } else {
      toggleMode()
    }
  }, [mode, isVetVerified, isPendingVerification, toggleMode, navigation, t])

  const handleLogout = useCallback(() => {
    Alert.alert(
      t('auth.logout'),
      t('auth.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logout'),
          style: 'destructive',
          onPress: () => logoutMutation.mutate(),
        },
      ],
    )
  }, [logoutMutation, t])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            {userQuery.isLoading ? (
              <Skeleton width={80} height={80} borderRadius={40} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>
          {userQuery.isLoading ? (
            <View style={{ width: 200, alignItems: 'center', gap: 6 }}>
              <Skeleton width="80%" height={20} />
              <Skeleton width="60%" height={14} />
            </View>
          ) : user ? (
            <>
              <Text style={styles.name}>
                {user.firstName} {user.lastName}
              </Text>
              <Text style={styles.email}>{user.email}</Text>
              {user.role === 'VET' && isVetVerified && (
                <View style={{ marginTop: 8 }}>
                  <Badge label={`✓ ${t('profile.verifiedBadge')}`} tone="success" size="sm" />
                </View>
              )}
            </>
          ) : (
            <Text style={styles.email}>No pudimos cargar tu perfil</Text>
          )}
        </View>

        {/* Mode switch */}
        <Section title={t('profile.sections.mode').toUpperCase()}>
          <Card>
            <View style={styles.modeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>
                  {mode === 'CLIENT' ? t('profile.modeClient') : t('profile.modeVet')}
                </Text>
                <Text style={styles.modeSubtitle}>
                  {mode === 'CLIENT'
                    ? t('profile.clientDescription')
                    : t('profile.vetDescription')}
                </Text>
              </View>
              <Switch
                value={mode === 'VET'}
                onValueChange={handleModeToggle}
                trackColor={{
                  false: UI_COLORS.border,
                  true: UI_COLORS.sage,
                }}
                thumbColor={mode === 'VET' ? UI_COLORS.gold : UI_COLORS.card}
                accessibilityLabel="Cambiar modo"
              />
            </View>

            {mode === 'CLIENT' && isPendingVerification && (
              <View style={{ marginTop: 12 }}>
                <Badge label={`⏱ ${t('profile.pendingVerification')}`} tone="warning" outline size="sm" />
              </View>
            )}
          </Card>

          {mode === 'CLIENT' && !isVetVerified && !isPendingVerification && (
            <Pressable
              onPress={() => navigation.navigate('VetVerification')}
              style={styles.upsellCard}
              accessibilityRole="button"
              accessibilityLabel={t('profile.becomeVet')}
            >
              <Text style={styles.upsellTitle}>{t('profile.becomeVet')}</Text>
              <Text style={styles.upsellSubtitle}>
                {t('profile.becomeVetSubtitle')}
              </Text>
            </Pressable>
          )}
        </Section>

        {/* Cuenta */}
        <Section title={t('profile.sections.account').toUpperCase()}>
          <Card>
            <MenuRow
              glyph="💼"
              label={t('profile.menu.wallet')}
              onPress={() => navigation.navigate('Wallet')}
            />
            <MenuRow
              glyph="🔔"
              label={t('profile.menu.notifications')}
              onPress={() => navigation.navigate('Notifications')}
            />
            {mode === 'VET' && (
              <MenuRow
                glyph="📋"
                label={t('profile.menu.services')}
                onPress={() => navigation.navigate('PriceManagement')}
              />
            )}
            <MenuRow
              glyph="👤"
              label={t('profile.menu.editProfile')}
              onPress={() => navigation.navigate('EditProfile')}
            />
          </Card>
        </Section>

        {/* Idioma */}
        <Section title="IDIOMA">
          <Card>
            <LanguageSwitcher />
          </Card>
        </Section>

        {/* Seguridad */}
        <Section title={t('profile.sections.security').toUpperCase()}>
          <Card>
            <MenuRow glyph="🔒" label={t('profile.menu.changePassword')} />
            <MenuRow glyph="🔐" label={t('profile.menu.twoFactor')} />
            <MenuRow glyph="🛡️" label={t('profile.menu.privacy')} />
          </Card>
        </Section>

        {/* Soporte */}
        <Section title={t('profile.sections.support').toUpperCase()}>
          <Card>
            <MenuRow glyph="❓" label={t('profile.menu.help')} />
            <MenuRow glyph="📄" label={t('profile.menu.terms')} />
            <MenuRow glyph="ℹ️" label={t('profile.menu.about')} value="v1.0" />
          </Card>
        </Section>

        {/* Logout */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && { opacity: 0.85 },
          ]}
          disabled={logoutMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('auth.logout')}
          accessibilityState={{ busy: logoutMutation.isPending }}
        >
          <Text style={styles.logoutText}>
            {logoutMutation.isPending ? `${t('common.loading')}` : t('auth.logout')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

interface MenuRowProps {
  glyph: string
  label: string
  value?: string
  onPress?: () => void
}

function MenuRow({ glyph, label, value, onPress }: MenuRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && onPress && { opacity: 0.85 },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <Text style={styles.menuGlyph}>{glyph}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {value && <Text style={styles.menuValue}>{value}</Text>}
      {onPress && <Text style={styles.menuArrow}>›</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: UI_COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  name: { fontSize: 22, fontWeight: '800', color: UI_COLORS.text },
  email: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.muted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text, marginBottom: 2 },
  modeSubtitle: { fontSize: 12, color: UI_COLORS.muted, lineHeight: 17 },
  upsellCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: UI_COLORS.gold,
    borderStyle: 'dashed',
    backgroundColor: '#C9A9610a',
  },
  upsellTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.gold },
  upsellSubtitle: {
    fontSize: 12,
    color: UI_COLORS.muted,
    marginTop: 4,
    lineHeight: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuGlyph: { fontSize: 18 },
  menuLabel: { fontSize: 14, color: UI_COLORS.text, fontWeight: '500' },
  menuValue: { fontSize: 12, color: UI_COLORS.muted },
  menuArrow: { fontSize: 22, color: UI_COLORS.muted, marginLeft: 6 },
  logoutBtn: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.error,
    alignItems: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: UI_COLORS.error },
})
