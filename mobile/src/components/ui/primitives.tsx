import React, { ReactNode, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  ViewStyle,
  TextStyle,
  PressableProps,
} from 'react-native'

/**
 * Primitives UI compartidas — base de todas las pantallas.
 *
 * Filosofía:
 *  - APIs pequeñas y composables
 *  - Paleta oficial Sage / Gold por defecto
 *  - Touch targets ≥48dp (Android M3) / 44pt (iOS HIG)
 *  - a11y: roles, labels, states correctos
 *  - Animaciones con `Animated` (sin Reanimated dependency)
 */

const COLORS = {
  sage: '#5B7553',
  gold: '#C9A961',
  bg: '#FAFAF7',
  card: '#FFFFFF',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
  borderLight: '#F0EDE5',
  error: '#C53030',
  success: '#48BB78',
  warning: '#DD6B20',
  info: '#3182CE',
} as const

// ============================================================
// CARD
// ============================================================

interface CardProps {
  children: ReactNode
  style?: ViewStyle
  /** Variantes visuales */
  variant?: 'default' | 'elevated' | 'flat'
  /** Si se provee, se hace pressable y aplica feedback */
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

export function Card({
  children,
  style,
  variant = 'default',
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: CardProps) {
  const baseStyle = [
    cardStyles.base,
    variant === 'elevated' && cardStyles.elevated,
    variant === 'flat' && cardStyles.flat,
    style,
  ]

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...baseStyle, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={baseStyle} accessibilityLabel={accessibilityLabel}>{children}</View>
}

const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderColor: 'transparent',
  },
  flat: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.borderLight,
  },
})

// ============================================================
// BUTTON
// ============================================================

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
  /** Color de marca: sage (default) o gold */
  accent?: 'sage' | 'gold'
  leadingIcon?: string
  trailingIcon?: string
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  accent = 'sage',
  leadingIcon,
  trailingIcon,
  disabled,
  ...rest
}: ButtonProps) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const accentColor = accent === 'gold' ? COLORS.gold : COLORS.sage

  const heightByt = { sm: 36, md: 48, lg: 56 }
  const fontSize = { sm: 13, md: 15, lg: 16 }

  const bg = isDanger
    ? COLORS.error
    : isPrimary
    ? accentColor
    : variant === 'ghost'
    ? 'transparent'
    : COLORS.card

  const fg = isPrimary || isDanger ? '#fff' : accentColor
  const border =
    variant === 'secondary' ? accentColor : variant === 'ghost' ? 'transparent' : 'transparent'

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        btnStyles.base,
        {
          height: heightByt[size],
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: size === 'sm' ? 12 : 20,
        },
        (disabled || loading) && { opacity: 0.55 },
        pressed && !disabled && !loading && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: loading }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={btnStyles.content}>
          {leadingIcon && (
            <Text style={[{ color: fg, fontSize: fontSize[size] }, btnStyles.icon]}>
              {leadingIcon}
            </Text>
          )}
          <Text style={[btnStyles.label, { color: fg, fontSize: fontSize[size] }]}>
            {label}
          </Text>
          {trailingIcon && (
            <Text style={[{ color: fg, fontSize: fontSize[size] }, btnStyles.icon]}>
              {trailingIcon}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  )
}

const btnStyles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: { fontWeight: '600' },
  icon: { fontSize: 16 },
})

// ============================================================
// BADGE
// ============================================================

interface BadgeProps {
  label: string
  /** Variante semántica de color */
  tone?: 'sage' | 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted'
  /** Tamaño del badge */
  size?: 'sm' | 'md'
  /** Si true, fondo solo de tinte y borde del color */
  outline?: boolean
}

export function Badge({ label, tone = 'sage', size = 'md', outline = false }: BadgeProps) {
  const toneColors: Record<NonNullable<BadgeProps['tone']>, string> = {
    sage: COLORS.sage,
    gold: COLORS.gold,
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    info: COLORS.info,
    muted: COLORS.muted,
  }
  const color = toneColors[tone]

  return (
    <View
      style={[
        badgeStyles.base,
        size === 'sm' && badgeStyles.sizeSm,
        outline
          ? { backgroundColor: `${color}1a`, borderColor: color, borderWidth: 1 }
          : { backgroundColor: color },
      ]}
      accessibilityLabel={label}
    >
      <Text
        style={[
          badgeStyles.label,
          size === 'sm' && badgeStyles.labelSm,
          { color: outline ? color : '#fff' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

const badgeStyles = StyleSheet.create({
  base: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  sizeSm: { paddingVertical: 2, paddingHorizontal: 8 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  labelSm: { fontSize: 10 },
})

// ============================================================
// EMPTY STATE
// ============================================================

interface EmptyStateProps {
  glyph?: string
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  glyph = '◌',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={emptyStyles.container} accessibilityLiveRegion="polite">
      <Text style={emptyStyles.glyph}>{glyph}</Text>
      <Text style={emptyStyles.title}>{title}</Text>
      {subtitle && <Text style={emptyStyles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={{ marginTop: 16 }}>
          <Button label={actionLabel} variant="primary" onPress={onAction} />
        </View>
      )}
    </View>
  )
}

const emptyStyles = StyleSheet.create({
  container: { padding: 32, alignItems: 'center' },
  glyph: { fontSize: 48, color: COLORS.muted, marginBottom: 12 },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
})

// ============================================================
// SKELETON (loading shimmer)
// ============================================================

interface SkeletonProps {
  width?: number | `${number}%`
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 6,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] })

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.borderLight,
          opacity,
        },
        style,
      ]}
      accessibilityElementsHidden
    />
  )
}

// ============================================================
// SECTION HEADER
// ============================================================

interface SectionHeaderProps {
  title: string
  subtitle?: string
  actionLabel?: string
  onActionPress?: () => void
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: SectionHeaderProps) {
  return (
    <View style={sectionStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={sectionStyles.title}>{title}</Text>
        {subtitle && <Text style={sectionStyles.subtitle}>{subtitle}</Text>}
      </View>
      {actionLabel && onActionPress && (
        <Pressable
          onPress={onActionPress}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
        >
          <Text style={sectionStyles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  action: { fontSize: 14, fontWeight: '600', color: COLORS.sage },
})

// ============================================================
// EXPORTS
// ============================================================

export const UI_COLORS = COLORS
