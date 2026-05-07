/**
 * StoreScreen — Tienda de productos veterinarios.
 *
 * Estado actual: "Próximamente"
 * La tienda de accesorios, alimentos y medicamentos para mascotas
 * está en roadmap pero no implementada en v1.
 *
 * La pantalla muestra:
 *  - Ilustración decorativa (icono de tienda con brand colors)
 *  - Mensaje de "próximamente" con beneficios esperados
 *  - CTA para volver a buscar veterinarios (acción de valor inmediato)
 *  - Banner de registro de interés (collects email para waitlist via API cuando esté lista)
 */

import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../theme/colors'
import { Icon } from '../../components/common/Icon'

interface StoreScreenProps {
  navigation: any
  route?: { params?: { category?: string } }
}

const BENEFITS = [
  {
    icon: 'shield',
    title: 'Productos veterinarios certificados',
    description: 'Alimentos, medicamentos y accesorios recomendados por vets.',
  },
  {
    icon: 'vet-home',
    title: 'Entrega a domicilio',
    description: 'Recibe en casa con seguimiento en tiempo real.',
  },
  {
    icon: 'payment',
    title: 'Paga con CTG Token',
    description: 'Obtén descuentos exclusivos pagando con tu saldo CTG.',
  },
  {
    icon: 'star',
    title: 'Recomendaciones personalizadas',
    description: 'Basadas en la especie, raza y condición de tu mascota.',
  },
] as const

export default function StoreScreen({ navigation, route }: StoreScreenProps) {
  const [email, setEmail] = useState('')
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(false)

  const category = route?.params?.category

  const handleRegister = useCallback(async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email inválido', 'Por favor ingresa un correo válido.')
      return
    }
    setLoading(true)
    // TODO: llamar a un endpoint de waitlist cuando esté disponible
    await new Promise((r) => setTimeout(r, 800))
    setLoading(false)
    setRegistered(true)
  }, [email])

  const handleFindVet = useCallback(() => {
    navigation.navigate('ClientSearch')
  }, [navigation])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={styles.backBtn}
          >
            <Icon name="arrow-left" size={24} color={Colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Tienda</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero ilustración */}
          <View style={styles.hero}>
            <View style={styles.heroIconBg}>
              <Icon name="store" size={64} color={Colors.sage} />
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Próximamente</Text>
            </View>
          </View>

          {/* Título y descripción */}
          <Text style={styles.title}>La tienda de tu mascota</Text>
          <Text style={styles.subtitle}>
            Estamos construyendo la mejor tienda de productos veterinarios de
            Colombia, con la calidad y confianza de Nvet Care.
          </Text>

          {/* Beneficios */}
          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.icon} style={styles.benefitCard}>
                <View style={styles.benefitIcon}>
                  <Icon name={b.icon as any} size={28} color={Colors.sage} />
                </View>
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitDesc}>{b.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Waitlist */}
          {!registered ? (
            <View style={styles.waitlist}>
              <Text style={styles.waitlistTitle}>
                ¿Quieres ser de los primeros en acceder?
              </Text>
              <Text style={styles.waitlistSubtitle}>
                Déjanos tu correo y te avisamos cuando lancemos.
              </Text>
              <View style={styles.waitlistRow}>
                <TextInput
                  style={styles.waitlistInput}
                  placeholder="tu@correo.com"
                  placeholderTextColor={Colors.inkMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  accessibilityLabel="Correo electrónico para waitlist"
                />
                <Pressable
                  style={[
                    styles.waitlistBtn,
                    loading && { opacity: 0.7 },
                  ]}
                  onPress={handleRegister}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Registrarme"
                >
                  <Text style={styles.waitlistBtnText}>
                    {loading ? '...' : 'Avisar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[styles.waitlist, styles.waitlistSuccess]}>
              <Icon name="verified" size={32} color={Colors.sage} />
              <Text style={styles.successTitle}>¡Te avisaremos pronto!</Text>
              <Text style={styles.successSubtitle}>
                Recibirás una notificación en {email} cuando la tienda esté
                disponible.
              </Text>
            </View>
          )}

          {/* CTA principal — mientras tanto, buscar vet */}
          <View style={styles.ctaSection}>
            <Text style={styles.ctaLabel}>Mientras tanto...</Text>
            <Pressable
              style={({ pressed }) => [
                styles.ctaBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleFindVet}
              accessibilityRole="button"
              accessibilityLabel="Buscar veterinario a domicilio"
            >
              <Icon name="vet-home" size={20} color="#fff" />
              <Text style={styles.ctaBtnText}>Buscar veterinario a domicilio</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { width: 44 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },

  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIconBg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonBadge: {
    marginTop: -16,
    backgroundColor: Colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 320,
  },

  benefits: {
    alignSelf: 'stretch',
    marginBottom: 28,
    rowGap: 12,
  },
  benefitCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    columnGap: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1 },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 12,
    color: Colors.inkMuted,
    lineHeight: 16,
  },

  waitlist: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  waitlistTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 6,
  },
  waitlistSubtitle: {
    fontSize: 13,
    color: Colors.inkMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  waitlistRow: {
    flexDirection: 'row',
    columnGap: 10,
  },
  waitlistInput: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  waitlistBtn: {
    backgroundColor: Colors.sage,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  waitlistBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  waitlistSuccess: {
    alignItems: 'center',
    rowGap: 8,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    color: Colors.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  ctaSection: {
    alignSelf: 'stretch',
    alignItems: 'center',
    rowGap: 12,
  },
  ctaLabel: {
    fontSize: 13,
    color: Colors.inkMuted,
    fontStyle: 'italic',
  },
  ctaBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    columnGap: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  ctaBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
})
