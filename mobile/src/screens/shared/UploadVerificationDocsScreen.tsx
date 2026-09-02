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
import { useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  UI_COLORS,
} from '../../components/ui/primitives'
import DocumentPickerCard, {
  PickedDocument,
} from '../../components/common/DocumentPickerCard'
import vetService from '../../services/vet.service'
import { qk } from '../../lib/queryKeys'
import { pickImage } from '../../utils/imagePicker'

interface Props {
  navigation: any
}

interface DocsState {
  idDocument: PickedDocument | null
  licenseDocument: PickedDocument | null
  diploma: PickedDocument | null
  backgroundCheck: PickedDocument | null
}

type VerificationDocumentType =
  | 'ID_DOCUMENT'
  | 'COMVEZCOL_CARD'
  | 'PROFESSIONAL_DEGREE'
  | 'ADDITIONAL'

const COMVEZCOL_FORMAT = /^\d{4,6}-\d$/

export default function UploadVerificationDocsScreen({ navigation }: Props) {
  const queryClient = useQueryClient()
  const [docs, setDocs] = useState<DocsState>({
    idDocument: null,
    licenseDocument: null,
    diploma: null,
    backgroundCheck: null,
  })
  const [licenseNumber, setLicenseNumber] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    if (!docs.licenseDocument) errs.licenseDocument = 'Tarjeta profesional requerida'
    if (!docs.diploma) errs.diploma = 'Diploma requerido'
    if (!COMVEZCOL_FORMAT.test(licenseNumber.trim())) {
      errs.licenseNumber = 'Número COMVEZCOL inválido. Usa el formato 12345-6'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [docs, licenseNumber])

  const uploadDocument = useCallback(
    async (
      document: PickedDocument,
      documentType: VerificationDocumentType,
      documentNumber?: string,
    ) => {
      const formData = new FormData()
      formData.append('documentType', documentType)
      if (documentNumber) formData.append('documentNumber', documentNumber)
      formData.append('file', {
        uri: document.uri,
        name: document.name,
        type: document.type,
      } as any)
      await vetService.uploadVerificationDocument(formData)
    },
    [],
  )

  const handleSubmit = useCallback(async () => {
    if (!validate() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await uploadDocument(docs.idDocument!, 'ID_DOCUMENT')
      await uploadDocument(
        docs.licenseDocument!,
        'COMVEZCOL_CARD',
        licenseNumber.trim(),
      )
      await uploadDocument(docs.diploma!, 'PROFESSIONAL_DEGREE')

      if (docs.backgroundCheck) {
        await uploadDocument(docs.backgroundCheck, 'ADDITIONAL')
      }

      await vetService.submitVerification()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.vets.me.verification() }),
        queryClient.invalidateQueries({ queryKey: qk.vets.me.profile() }),
      ])

      Alert.alert(
        'Solicitud enviada',
        'Tus documentos quedaron cargados y la verificación fue enviada a revisión.',
        [{ text: 'Entendido', onPress: () => navigation.goBack() }],
      )
    } catch (err: any) {
      Alert.alert(
        'Error al enviar',
        err?.response?.data?.message ||
          'No pudimos procesar tu solicitud. Los documentos que sí alcanzaron a cargarse se conservan y puedes reintentar.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    validate,
    isSubmitting,
    docs,
    licenseNumber,
    uploadDocument,
    queryClient,
    navigation,
  ])

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
              Se cargarán individualmente bajo el contrato seguro del backend y,
              cuando estén los tres documentos obligatorios, la solicitud se
              enviará automáticamente a revisión.
            </Text>
          </Card>

          <View style={styles.docsSection}>
            <Text style={styles.sectionTitle}>Documentos requeridos</Text>

            <DocumentPickerCard
              label="Cédula de ciudadanía"
              description="Foto clara del documento de identidad"
              required
              glyph="🆔"
              document={docs.idDocument}
              onPick={() => handlePickDoc('idDocument')}
              onRemove={() => setDocs((p) => ({ ...p, idDocument: null }))}
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
              onRemove={() => setDocs((p) => ({ ...p, licenseDocument: null }))}
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
              label="Documento adicional (opcional)"
              description="Certificación o soporte profesional complementario"
              glyph="🏥"
              document={docs.backgroundCheck}
              onPick={() => handlePickDoc('backgroundCheck')}
              onRemove={() => setDocs((p) => ({ ...p, backgroundCheck: null }))}
            />
          </View>

          <View style={styles.docsSection}>
            <Text style={styles.sectionTitle}>Datos de la tarjeta</Text>
            <Text style={styles.fieldLabel}>Número COMVEZCOL</Text>
            <TextInput
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="12345-6"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.licenseNumber && styles.inputError]}
              autoCapitalize="none"
              maxLength={8}
              accessibilityLabel="Número de tarjeta COMVEZCOL"
            />
            {errors.licenseNumber && (
              <Text style={styles.errorText}>{errors.licenseNumber}</Text>
            )}
          </View>

          <View style={{ marginTop: 24 }}>
            <Button
              label={isSubmitting ? 'Enviando solicitud…' : 'Enviar para revisión'}
              onPress={handleSubmit}
              loading={isSubmitting}
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
