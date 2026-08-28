import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  UI_COLORS,
} from '../../components/ui/primitives'
import { useCurrentUserQuery } from '../../hooks/queries/useMobileQueries'
import { useUpdateProfileMutation } from '../../hooks/queries/useMobileMutations'
import { pickImage } from '../../utils/imagePicker'

/**
 * EditProfileScreen — edición de datos del usuario.
 *
 * Capacidades:
 *  - Form con firstName, lastName, phone (avatar a futuro)
 *  - Pre-fill con datos del `useCurrentUserQuery`
 *  - Validación: nombres mínimos 2 chars + teléfono colombiano
 *  - Optimistic update via `useUpdateProfileMutation` con rollback en error
 *  - El email es read-only (require flujo de cambio separado por seguridad)
 */

interface Props {
  navigation: any
}

export default function EditProfileScreen({ navigation }: Props) {
  const userQuery = useCurrentUserQuery()
  const updateMutation = useUpdateProfileMutation()
  const user = userQuery.data

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Pre-fill al cargar el user
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '')
      setLastName(user.lastName ?? '')
      setPhone(user.phone ?? '')
    }
  }, [user])

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {}
    if (firstName.trim().length < 2)
      errs.firstName = 'Nombre mínimo 2 caracteres'
    if (lastName.trim().length < 2)
      errs.lastName = 'Apellido mínimo 2 caracteres'
    if (phone && !phone.match(/^3\d{9}$/))
      errs.phone = 'Número celular inválido (10 dígitos, debe empezar en 3)'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [firstName, lastName, phone])

  const handlePickAvatar = useCallback(async () => {
    const picked = await pickImage()
    if (picked) setAvatarUri(picked.uri)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return

    try {
      await updateMutation.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        avatar: avatarUri ?? undefined,
      })
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message ||
          'No pudimos guardar tus cambios. Intenta de nuevo.',
      )
    }
  }, [validate, firstName, lastName, phone, avatarUri, updateMutation, navigation])

  const initials = (
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')
  ).toUpperCase() || '?'

  const isDirty =
    user &&
    (firstName.trim() !== (user.firstName ?? '') ||
      lastName.trim() !== (user.lastName ?? '') ||
      phone.trim() !== (user.phone ?? '') ||
      avatarUri !== null)

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
        <Text style={styles.title}>Editar perfil</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Avatar header */}
          <View style={styles.avatarSection}>
            <Pressable
              onPress={handlePickAvatar}
              accessibilityRole="button"
              accessibilityLabel="Cambiar foto de perfil"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraIcon}>📷</Text>
              </View>
            </Pressable>
            <Text style={styles.changePhotoText}>Cambiar foto</Text>
          </View>

          {/* Form */}
          <Card>
            <Text style={styles.fieldLabel}>Nombre</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="María"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.firstName && styles.inputError]}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              accessibilityLabel="Nombre"
            />
            {errors.firstName && (
              <Text style={styles.errorText}>{errors.firstName}</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Apellido</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Pérez"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.lastName && styles.inputError]}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              accessibilityLabel="Apellido"
            />
            {errors.lastName && (
              <Text style={styles.errorText}>{errors.lastName}</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Teléfono</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="3001234567"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.phone && styles.inputError]}
              keyboardType="phone-pad"
              maxLength={10}
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel="Número de celular"
            />
            {errors.phone && (
              <Text style={styles.errorText}>{errors.phone}</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Email</Text>
            <View style={styles.readonlyInput}>
              <Text style={styles.readonlyText}>{user?.email ?? '—'}</Text>
              <Text style={styles.readonlyHint}>Solo lectura</Text>
            </View>
            <Text style={styles.helper}>
              Para cambiar tu email, contacta soporte.
            </Text>
          </Card>

          <View style={{ marginTop: 24 }}>
            <Button
              label={
                updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'
              }
              onPress={handleSubmit}
              loading={updateMutation.isPending}
              disabled={!isDirty}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.sage },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: UI_COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 8,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UI_COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: UI_COLORS.bg,
  },
  cameraIcon: { fontSize: 12 },
  changePhotoText: {
    fontSize: 13,
    color: UI_COLORS.sage,
    fontWeight: '700',
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    fontSize: 14,
    color: UI_COLORS.text,
  },
  inputError: { borderColor: UI_COLORS.error },
  errorText: { fontSize: 11, color: UI_COLORS.error, marginTop: 4 },
  readonlyInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.borderLight,
  },
  readonlyText: { fontSize: 14, color: UI_COLORS.text, flex: 1 },
  readonlyHint: { fontSize: 11, color: UI_COLORS.muted, fontStyle: 'italic' },
  helper: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
})
