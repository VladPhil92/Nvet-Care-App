import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, FontSize, Spacing, BorderRadius, Shadow, Typography } from '../../theme/tokens'

export const HomeScreen = () => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Hola, Laura 👋</Text>
          <Text style={styles.subtitle}>¿Cómo está tu mascota hoy?</Text>
        </View>

        {/* Próxima cita */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Próxima cita</Text>
            <Text style={styles.badge}>Hoy</Text>
          </View>
          <View style={styles.appointmentRow}>
            <View style={styles.iconCircle}>
              <Text style={styles.icon}>🐕</Text>
            </View>
            <View style={styles.appointmentInfo}>
              <Text style={styles.appointmentVet}>Dra. Valeria Ospina</Text>
              <Text style={styles.appointmentDetails}>Max • Consulta domiciliaria</Text>
              <Text style={styles.appointmentTime}>14:00 PM • En 2 horas</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Ver seguimiento</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionCard}>
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionText}>Buscar veterinario</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard}>
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionText}>Mis citas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard}>
            <Text style={styles.actionIcon}>🐾</Text>
            <Text style={styles.actionText}>Mis mascotas</Text>
          </TouchableOpacity>
        </View>

        {/* Wallet Summary */}
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>SALDO CTG TOKEN</Text>
          <Text style={styles.walletAmount}>125.50 CTG</Text>
          <Text style={styles.walletSubtext}>≈ $52.710 COP</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  content: {
    padding: Spacing.gutter,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  greeting: {
    fontFamily: Typography.serif,
    fontSize: FontSize.h1,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.body,
    color: Colors.inkSec,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...Shadow.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.h3,
    fontWeight: '600',
    color: Colors.ink,
  },
  badge: {
    backgroundColor: Colors.sageFade,
    color: Colors.sage,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  appointmentRow: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  icon: {
    fontSize: 24,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentVet: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  appointmentDetails: {
    fontSize: FontSize.small,
    color: Colors.inkSec,
    marginBottom: Spacing.xs,
  },
  appointmentTime: {
    fontSize: FontSize.small,
    color: Colors.sage,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: Colors.sage,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.inkInv,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionCard: {
    width: '50%',
    padding: Spacing.sm,
  },
  actionCardInner: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  actionText: {
    fontSize: FontSize.small,
    color: Colors.ink,
    textAlign: 'center',
    fontWeight: '500',
  },
  walletCard: {
    backgroundColor: Colors.dark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadow.lg,
  },
  walletLabel: {
    fontSize: FontSize.tiny,
    color: Colors.inkMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  walletAmount: {
    fontFamily: Typography.serif,
    fontSize: FontSize.h1,
    color: Colors.gold,
    marginBottom: Spacing.xs,
  },
  walletSubtext: {
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
})
