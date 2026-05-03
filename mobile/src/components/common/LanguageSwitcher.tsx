import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Badge, UI_COLORS } from '../ui/primitives'
import { useI18n } from '../../i18n/I18nProvider'

/**
 * LanguageSwitcher — selector de idioma compacto.
 *
 * Diseño:
 *  - Card horizontal con todos los locales disponibles como chips
 *  - El locale activo se renderiza con borde sage + check mark
 *  - Tap dispara `switchLocale()` (re-render del árbol completo)
 *  - a11y: `accessibilityRole="radio"` + `selected` state
 */

interface Props {
  compact?: boolean
}

export default function LanguageSwitcher({ compact = false }: Props) {
  const { locale, switchLocale, availableLocales } = useI18n()

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {availableLocales.map((loc) => {
        const isActive = loc.code === locale
        return (
          <Pressable
            key={loc.code}
            onPress={() => switchLocale(loc.code)}
            style={[
              styles.chip,
              isActive && styles.chipActive,
              compact && styles.chipCompact,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={loc.nativeName}
          >
            <Text
              style={[
                styles.chipLabel,
                isActive && styles.chipLabelActive,
              ]}
            >
              {loc.nativeName}
            </Text>
            {isActive && <Text style={styles.checkGlyph}>✓</Text>}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowCompact: { gap: 6 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  chipCompact: { paddingVertical: 8, paddingHorizontal: 10 },
  chipActive: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.text,
  },
  chipLabelActive: { color: UI_COLORS.sage, fontWeight: '700' },
  checkGlyph: {
    fontSize: 14,
    color: UI_COLORS.sage,
    fontWeight: '800',
  },
})
