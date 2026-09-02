import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
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
import { useI18n } from '../../i18n/I18nProvider'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'

/**
 * ProfileScreen — perfil de cuenta basado en el rol persistido por backend.
 *
 * El tipo de cuenta se define al registrarse y no se puede alternar mediante
 * estado local. CLIENT conserva el dashboard de usuario y VET conserva el
 * dashboard profesional. La verificación profesional es un estado distinto
 * del rol y solo controla la capacidad de ofrecer servicios públicamente.
 */

interface Props {
  navigation: any
}

export default function ProfileScreen({ navigation }: Props) {
  const { t } = useI18n()
  const userQuery = useCurrentUserQuery()
  const user = userQuery.data
  const isVet = user?.role === 'VET'
  const verificationQuery = useMyVerificationStatusQuery({ enabled: isVet })
  const logoutMutation = useLogoutMutation()

  const verification = verificationQuery.data
  const isVetVerified = verification?.status === 'APPROVED'
  const isPendingVerification =
    verification?.status === 'PENDING' || verification?.status === 'IN_REVIEW'

  const initials = (
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')
  ).toUpperCase() || '?'

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
              {isVet && isVetVerified && (
                <View style={{ marginTop: 8 }}>
                  <Badge label={`✓ ${t('profile.verifiedBadge')}`} tone="success" size="sm" />
                </View>
              )}
            </>
          ) : (
            <Text style={styles.email}>No pudimos cargar tu perfil</Text>
          )}
        </View>

        <Section title={t('profile.sections.mode').toUpperCase()}>
          <Card>
            <View style={styles.roleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>
                  {isVet ? 'Cuenta veterinaria' : 'Usuario regular'}
                </Text>
                <Text style={styles.roleSubtitle}>
                  {isVet
                    ? 'Tu rol profesional define este dashboard. La habilitación pública depende de la verificación de credenciales.'
                    : 'Tu rol de usuario define este dashboard para gestionar mascotas, citas y servicios.'}
                </Text>
              </View>
              <Badge label={isVet ? 'VET' : 'CLIENT'} tone={isVet ? 'gold' : 'sage'} size="sm" />
            </View>

            {isVet && isPendingVerification && (
              <View style={{ marginTop: 12 }}>
                <Badge label={`⏱ ${t('profile.pendingVerification')}`} tone="warning" outline size="sm" />
              </View>
            )}
          </Card>
        </Section>

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
            {isVet && (
              <>
                <MenuRow
                  glyph="✅"
                  label="Verificación profesional"
                  value={
                    isVetVerified
                      ? 'Aprobada'
                      : isPendingVerification
                        ? 'En revisión'
                        : 'Pendiente'
                  }
                  onPress={() => navigation.navigate('VetVerification')}
                />
                <MenuRow
                  glyph="📋"
                  label={t('profile.menu.services')}
                  onPress={() => navigation.navigate('PriceManagement')}
                />
              </>
            )}
            <MenuRow
              glyph="👤"
              label={t('profile.menu.editProfile')}
              onPress={() => navigation.navigate('EditProfile')}
            />
          </Card>
        </Section>

        <Section title="IDIOMA">
          <Card>
            <LanguageSwitcher />
          </Card>
        </Section>

        <Section title={t('profile.sections.security').toUpperCase()}>
          <Card>
            <MenuRow
              glyph="🔒"
              label={t('profile.menu.changePassword')}
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <MenuRow
              glyph="🔐"
              label={t('profile.menu.twoFactor')}
              onPress={() => navigation.navigate('TwoFactorEnrollment')}
            />
            <MenuRow
              glyph="👁️"
              label={t('profile.menu.activeSessions')}
              onPress={() => navigation.navigate('ActiveSessions')}
            />
          </Card>
        </Section>

        <Section title={t('profile.sections.support').toUpperCase()}>
          <Card>
            <MenuRow glyph="❓" label={t('profile.menu.help')} />
            <MenuRow glyph="📄" label={t('profile.menu.terms')} />
            <MenuRow glyph="ℹ️" label={t('profile.menu.about')} value="v1.0" />
          </Card>
        </Section>

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
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roleTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text, marginBottom: 2 },
  roleSubtitle: { fontSize: 12, color: UI_COLORS.muted, lineHeight: 17 },
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
