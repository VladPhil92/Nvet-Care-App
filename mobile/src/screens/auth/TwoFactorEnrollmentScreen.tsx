/**
 * TwoFactorEnrollmentScreen — habilitar 2FA con Google Authenticator.
 *
 * Flujo:
 *   1. Llamar a POST /auth/2fa/enroll → recibir { secret, otpauthUrl, encryptedSecret }
 *   2. Mostrar QR del otpauthUrl + secret manual + instrucciones
 *   3. Usuario escanea con Google Authenticator
 *   4. Usuario ingresa el código TOTP de 6 dígitos
 *   5. Llamar a POST /auth/2fa/confirm → recibir 10 recovery codes
 *   6. Mostrar recovery codes con CTA "Copiar"/"Descargar"
 *   7. Usuario confirma que los guardó → goBack()
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Rect } from 'react-native-svg'

import { Colors } from '../../theme/colors'
import { Icon } from '../../components/common/Icon'
import authService from '../../services/auth.service.v2'

interface Props {
  navigation: any
}

type Step = 'loading' | 'scan' | 'verify' | 'recovery' | 'done'

export default function TwoFactorEnrollmentScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('loading')
  const [secret, setSecret] = useState('')
  const [otpauthUrl, setOtpauthUrl] = useState('')
  const [encryptedSecret, setEncryptedSecret] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 1. Iniciar enrollment al montar
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await authService.startTwoFactorEnrollment()
        if (cancelled) return
        setSecret(data.secret)
        setOtpauthUrl(data.otpauthUrl)
        setEncryptedSecret(data.encryptedSecret)
        setStep('scan')
      } catch (error: any) {
        Alert.alert('Error', authService.getErrorMessage(error), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigation])

  const handleVerify = useCallback(async () => {
    if (code.length < 6) {
      Alert.alert('Código incompleto', 'Ingresa los 6 dígitos del autenticador.')
      return
    }
    setSubmitting(true)
    try {
      const result = await authService.confirmTwoFactorEnrollment(encryptedSecret, code)
      setRecoveryCodes(result.recoveryCodes)
      setStep('recovery')
    } catch (error: any) {
      Alert.alert(
        'Código incorrecto',
        authService.getErrorMessage(error) +
          '\n\nVerifica que la hora de tu dispositivo esté sincronizada.',
      )
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }, [code, encryptedSecret])

  const handleCopyRecovery = useCallback(() => {
    Clipboard.setString(recoveryCodes.join('\n'))
    Alert.alert(
      'Códigos copiados',
      'Pégalos en un lugar seguro (gestor de contraseñas, nota cifrada, etc.).',
    )
  }, [recoveryCodes])

  const handleCopySecret = useCallback(() => {
    Clipboard.setString(secret)
    Alert.alert('Código copiado', 'Pégalo manualmente en tu app autenticadora.')
  }, [secret])

  if (step === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.sage} size="large" />
          <Text style={styles.loadingText}>Generando código de seguridad…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Verificación en 2 pasos</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'scan' && (
          <ScanStep
            secret={secret}
            otpauthUrl={otpauthUrl}
            onCopySecret={handleCopySecret}
            onContinue={() => setStep('verify')}
          />
        )}
        {step === 'verify' && (
          <VerifyStep
            code={code}
            onChangeCode={setCode}
            onSubmit={handleVerify}
            submitting={submitting}
            onBack={() => setStep('scan')}
          />
        )}
        {step === 'recovery' && (
          <RecoveryStep
            codes={recoveryCodes}
            onCopy={handleCopyRecovery}
            onDone={() => navigation.goBack()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// =====================================================================
// STEP COMPONENTS
// =====================================================================

function ScanStep({
  secret,
  otpauthUrl,
  onCopySecret,
  onContinue,
}: {
  secret: string
  otpauthUrl: string
  onCopySecret: () => void
  onContinue: () => void
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Paso 1 de 3 · Escanea el QR</Text>
      <Text style={styles.stepDesc}>
        Abre Google Authenticator (o tu app preferida: Authy, 1Password, Microsoft
        Authenticator) y escanea este código:
      </Text>

      {/* QR placeholder. En producción usar `react-native-qrcode-svg` */}
      <View style={styles.qrWrap}>
        <FauxQR data={otpauthUrl} size={200} />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>o ingresa manualmente</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable style={styles.secretBox} onPress={onCopySecret} accessibilityRole="button">
        <Text style={styles.secretLabel}>Tu código secreto</Text>
        <Text style={styles.secretValue} selectable>
          {secret.match(/.{1,4}/g)?.join(' ') ?? secret}
        </Text>
        <Text style={styles.secretHint}>Toca para copiar</Text>
      </Pressable>

      <View style={styles.tipBox}>
        <Icon name="shield" size={16} color={Colors.sage} />
        <Text style={styles.tipText}>
          Este código solo se muestra una vez. Si pierdes acceso al autenticador, podrás
          usar los códigos de recuperación que recibirás al final.
        </Text>
      </View>

      <Pressable style={styles.cta} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.ctaText}>Ya escaneé el código</Text>
        <Icon name="arrow-right" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

function VerifyStep({
  code,
  onChangeCode,
  onSubmit,
  submitting,
  onBack,
}: {
  code: string
  onChangeCode: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  onBack: () => void
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Paso 2 de 3 · Verifica el código</Text>
      <Text style={styles.stepDesc}>
        Ingresa el código de 6 dígitos que muestra tu app autenticadora.
      </Text>

      <View style={styles.codeInputWrap}>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(v) => onChangeCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="000000"
          placeholderTextColor={Colors.inkMuted}
          maxLength={6}
          autoFocus
          textAlign="center"
          accessibilityLabel="Código del autenticador"
        />
      </View>

      <View style={styles.tipBox}>
        <Icon name="check" size={16} color={Colors.sage} />
        <Text style={styles.tipText}>
          El código cambia cada 30 segundos. Si falla, espera al siguiente y vuelve a
          intentar.
        </Text>
      </View>

      <Pressable
        style={[styles.cta, code.length < 6 && styles.ctaDisabled]}
        onPress={onSubmit}
        disabled={code.length < 6 || submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.ctaText}>Verificar</Text>
            <Icon name="check" size={18} color="#FFFFFF" />
          </>
        )}
      </Pressable>

      <Pressable onPress={onBack} style={styles.ctaSecondary}>
        <Text style={styles.ctaSecondaryText}>Volver al QR</Text>
      </Pressable>
    </View>
  )
}

function RecoveryStep({
  codes,
  onCopy,
  onDone,
}: {
  codes: string[]
  onCopy: () => void
  onDone: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Paso 3 de 3 · Códigos de recuperación</Text>
      <Text style={styles.stepDesc}>
        Guarda estos 10 códigos en un lugar seguro. Cada uno funciona{' '}
        <Text style={{ fontWeight: '800' }}>una sola vez</Text> y te permite acceder si
        pierdes el autenticador.
      </Text>

      <View style={styles.codesGrid}>
        {codes.map((c, i) => (
          <View key={c} style={styles.codePill}>
            <Text style={styles.codeNumber}>{i + 1}.</Text>
            <Text style={styles.codeValue} selectable>
              {c}
            </Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.copyBtn} onPress={onCopy} accessibilityRole="button">
        <Icon name="check" size={16} color={Colors.sage} />
        <Text style={styles.copyBtnText}>Copiar todos los códigos</Text>
      </Pressable>

      <View style={styles.warningBox}>
        <Icon name="shield" size={18} color={Colors.gold} />
        <Text style={styles.warningText}>
          IMPORTANTE: estos códigos NO se mostrarán de nuevo. Si los pierdes, no podrás
          recuperar tu cuenta sin contactar soporte.
        </Text>
      </View>

      <Pressable
        style={styles.confirmCheck}
        onPress={() => setConfirmed((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
      >
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
        <Text style={styles.confirmText}>
          He guardado los códigos en un lugar seguro
        </Text>
      </Pressable>

      <Pressable
        style={[styles.cta, !confirmed && styles.ctaDisabled]}
        onPress={onDone}
        disabled={!confirmed}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Activar 2FA</Text>
        <Icon name="check" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

// =====================================================================
// FAUX QR — placeholder hasta integrar `react-native-qrcode-svg`
// =====================================================================

/**
 * Renderizado falso de QR como matriz 21x21 derivada del hash del data.
 * Para producción, importar:
 *   import QRCode from 'react-native-qrcode-svg'
 *   <QRCode value={data} size={200} backgroundColor="#fff" color="#000" />
 */
function FauxQR({ data, size }: { data: string; size: number }) {
  // Derivamos un patrón pseudo-aleatorio del string para simular QR
  const cells = 21
  const cellSize = size / cells
  const grid: boolean[][] = []
  let h = 0
  for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) >>> 0
  for (let r = 0; r < cells; r++) {
    grid[r] = []
    for (let c = 0; c < cells; c++) {
      h = (h * 1103515245 + 12345) >>> 0
      grid[r][c] = (h & 1) === 1
    }
  }
  // Marcadores de posición (esquinas)
  const setMarker = (cr: number, cc: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4
        grid[cr + r][cc + c] = isOuter || isInner
      }
  }
  setMarker(0, 0)
  setMarker(0, cells - 7)
  setMarker(cells - 7, 0)

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {grid.map((row, r) =>
        row.map(
          (filled, c) =>
            filled && (
              <Rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#0D1B2A"
              />
            ),
        ),
      )}
    </Svg>
  )
}

// =====================================================================
// STYLES
// =====================================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', rowGap: 12 },
  loadingText: { color: Colors.inkSec, fontSize: 14 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },

  content: { padding: 20, paddingBottom: 40 },

  stepWrap: { rowGap: 16 },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.sage,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepDesc: {
    fontSize: 14,
    color: Colors.inkSec,
    lineHeight: 20,
  },

  qrWrap: {
    alignSelf: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.line },
  dividerText: { fontSize: 11, color: Colors.inkMuted, fontWeight: '600' },

  secretBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    rowGap: 4,
  },
  secretLabel: { fontSize: 11, color: Colors.inkMuted, fontWeight: '600' },
  secretValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  secretHint: { fontSize: 11, color: Colors.sageText, fontWeight: '600', marginTop: 4 },

  tipBox: {
    flexDirection: 'row',
    columnGap: 10,
    backgroundColor: Colors.greenSoft,
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 12, color: Colors.ink, lineHeight: 16 },

  warningBox: {
    flexDirection: 'row',
    columnGap: 10,
    backgroundColor: '#FFE4D2',
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#7A3A0E',
    fontWeight: '600',
    lineHeight: 16,
  },

  codeInputWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.line,
    paddingVertical: 8,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    fontFamily: 'monospace',
    letterSpacing: 8,
    paddingVertical: 16,
  },

  codesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  codePill: {
    width: '47%',
    flexDirection: 'row',
    columnGap: 6,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  codeNumber: { fontSize: 12, color: Colors.inkMuted, fontWeight: '600' },
  codeValue: {
    fontSize: 13,
    color: Colors.ink,
    fontFamily: 'monospace',
    fontWeight: '700',
  },

  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.greenSoft,
    borderRadius: 10,
  },
  copyBtnText: { fontSize: 14, color: Colors.sageText, fontWeight: '700' },

  confirmCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.sage, borderColor: Colors.sage },
  confirmText: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '500' },

  cta: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ctaSecondary: { paddingVertical: 12, alignItems: 'center' },
  ctaSecondaryText: { color: Colors.sageText, fontSize: 14, fontWeight: '600' },
})
