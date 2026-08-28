import React, { useState, useCallback } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  UI_COLORS,
} from '../../components/ui/primitives'
import DocumentPickerCard, {
  PickedDocument,
} from '../../components/common/DocumentPickerCard'
import { useUploadVerificationMutation } from '../../hooks/queries/useMobileMutations'
import { pickImage } from '../../utils/imagePicker'

/**
 * UploadVerificationDocsScreen — subida de documentos para verificación vet.
 *
 * Documentos requeridos:
 *  1. Cédula (ID) — frente y reverso
 *  2. Tarjeta profesional COMVEZCOL
 *  3. Diploma de Medicina Veterinaria
 *  4. Certificado de antecedentes (opcional)
 *
 * + datos: número de tarjeta profesional + año de emisión
 *
 * Decisiones:
 *  - DocumentPickerCard placeholder hasta integrar `expo-image-picker`
 *  - Validación: los 3 primeros docs son obligatorios + número de tarjeta válido
 *  - FormData multipart construida al submit
 *  - Tras éxito → navigation.goBack() y `useMyVerificationStatusQuery` ya invalida
 */

interface Props {
  navigation: any
}

interface DocsState {
  idDocument: PickedDocument | null
  licenseDocument: PickedDocument | null
  diploma: PickedDocument | null
  backgroundCheck: PickedDocument | null
}

export default function UploadVerificationDocsScreen({ navigation }: Props) {
  const [docs, setDocs] = useState<DocsState>({
    idDocument: null,
    licenseDocument: null,
    diploma: null,
    backgroundCheck: null,
  })
  const [licenseNumber, setLicenseNumber] = useState('')
  const [issuedYear, setIssuedYear] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const uploadMutation = useUploadVerificationMutation()

  const handlePickDoc = useCallback(async (key: keyof DocsState) => {
    const picked = await pickImage()
    if (picked) {
      setDocs((prev) => ({ ...prev, [key]: picked }))
      setErrors((prev) => ({ ...prev, [key]: '' }))
    }
  }, [])

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {}
    if (!docs.idDocument) errs.idDocument = 'Documento de identidad requerido'
    if (!docs.licenseDocument)
      errs.licenseDocument = 'Tarjeta profesional requerida'
    if (!docs.diploma) errs.diploma = 'Diploma requerido'
    if (!licenseNumber.match(/^\d{4,8}$/))
      errs.licenseNumber = 'Número COMVEZCOL inválido (4-8 dígitos)'
    const year = parseInt(issuedYear, 10)
    if (!year || year < 1980 || year > new Date().getFullYear())
      errs.issuedYear = 'Año de emisión inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [docs, licenseNumber, issuedYear])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return

    try {
      const formData = new FormData()
      formData.append('licenseNumber', licenseNumber)
      formData.append('issuedYear', issuedYear)

      const appendIfExists = (
        key: string,
        doc: PickedDocument | null,
      ) => {
        if (doc) {
          formData.append(key, {
            uri: doc.uri,
            name: doc.name,
            type: doc.type,
          } as any)
        }
      }
      appendIfExists('idDocument', docs.idDocument)
      appendIfExists('licenseDocument', docs.licenseDocument)
      appendIfExists('diploma', docs.diploma)
      if (docs.backgroundCheck) {
        appendIfExists('backgroundCheck', docs.backgroundCheck)
      }

      await uploadMutation.mutateAsync({ formData })

      Alert.alert(
        'Solicitud enviada',
        'Tu verificación está en proceso de revisión. Te notificaremos en 24-48 horas hábiles.',
        [{ text: 'Entendido', onPress: () => navigation.goBack() }],
      )
    } catch (err: any) {
      Alert.alert(
        'Error al enviar',
        err?.response?.data?.message ||
          'No pudimos procesar tu solicitud. Intenta de nuevo.',
      )
    }
  }, [validate, licenseNumber, issuedYear, docs, uploadMutation, navigation])

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
        <Text style={styles.title}>Verificación profesional</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Card variant="flat" style={styles.intro}>
            <Badge label="🔒 Procesamiento seguro" tone="info" outline size="sm" />
            <Text style={styles.introTitle}>Sube tus documentos</Text>
            <Text style={styles.introBody}>
              Tu solicitud será revisada en 24-48 h hábiles. Los archivos se
              transmiten encriptados y no se comparten con terceros.
            </Text>
          </Card>

          {/* Documentos */}
          <View style={styles.docsSection}>
            <Text style={styles.sectionTitle}>Documentos requeridos</Text>

            <DocumentPickerCard
              label="Cédula de ciudadanía"
              description="Foto clara del frente del documento"
              required
              glyph="🆔"
              document={docs.idDocument}
              onPick={() => handlePickDoc('idDocument')}
              onRemove={() =>
                setDocs((p) => ({ ...p, idDocument: null }))
              }
              error={errors.idDocument}
            />

            <View style={{ height: 16 }} />

            <DocumentPickerCard
              label="Tarjeta profesional COMVEZCOL"
              description="Tarjeta vigente expedida por el Consejo Profesional"
              required
              glyph="🎓"
              document={docs.licenseDocument}
              onPick={() => handlePickDoc('licenseDocument')}
              onRemove={() =>
                setDocs((p) => ({ ...p, licenseDocument: null }))
              }
              error={errors.licenseDocument}
            />

            <View style={{ height: 16 }} />

            <DocumentPickerCard
              label="Diploma de Medicina Veterinaria"
              description="Diploma de pregrado emitido por una universidad reconocida"
              required
              glyph="📜"
              document={docs.diploma}
              onPick={() => handlePickDoc('diploma')}
              onRemove={() => setDocs((p) => ({ ...p, diploma: null }))}
              error={errors.diploma}
            />

            <View style={{ height: 16 }} />

            <DocumentPickerCard
              label="Certificado de antecedentes (opcional)"
              description="Aumenta tu confiabilidad ante los clientes"
              glyph="🏥"
              document={docs.backgroundCheck}
              onPick={() => handlePickDoc('backgroundCheck')}
              onRemove={() =>
                setDocs((p) => ({ ...p, backgroundCheck: null }))
              }
            />
          </View>

          {/* Datos de la tarjeta */}
          <View style={styles.docsSection}>
            <Text style={styles.sectionTitle}>Datos de tu tarjeta</Text>
            <Text style={styles.fieldLabel}>Número COMVEZCOL</Text>
            <TextInput
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="12345"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.licenseNumber && styles.inputError]}
              keyboardType="numeric"
              maxLength={8}
              accessibilityLabel="Número de tarjeta COMVEZCOL"
            />
            {errors.licenseNumber && (
              <Text style={styles.errorText}>{errors.licenseNumber}</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              Año de emisión
            </Text>
            <TextInput
              value={issuedYear}
              onChangeText={setIssuedYear}
              placeholder="2018"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.issuedYear && styles.inputError]}
              keyboardType="numeric"
              maxLength={4}
              accessibilityLabel="Año de emisión de la tarjeta"
            />
            {errors.issuedYear && (
              <Text style={styles.errorText}>{errors.issuedYear}</Text>
            )}
          </View>

          <View style={{ marginTop: 24 }}>
            <Button
              label={
                uploadMutation.isPending
                  ? 'Enviando solicitud…'
                  : 'Enviar para revisión'
              }
              onPress={handleSubmit}
              loading={uploadMutation.isPending}
              fullWidth
              accent="gold"
            />
          </View>

          <Text style={styles.disclaimer}>
            Al enviar aceptas que verifiquemos tu información con el COMVEZCOL.
            Tus archivos se procesan según la Ley 1581 de 2012 (protección de
            datos personales).
          </Text>
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
  back: { fontSize: 28, color: UI_COLORS.gold },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  intro: { gap: 8 },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginTop: 4,
  },
  introBody: {
    fontSize: 13,
    color: UI_COLORS.muted,
    lineHeight: 18,
  },
  docsSection: { marginTop: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 12,
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
  errorText: {
    fontSize: 11,
    color: UI_COLORS.error,
    marginTop: 4,
  },
  disclaimer: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 16,
  },
})
