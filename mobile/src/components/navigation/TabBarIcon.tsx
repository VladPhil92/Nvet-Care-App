import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

import { Icon, type IconName } from '../common/Icon'
import { Colors } from '../../theme/colors'

/**
 * TabBarIcon — iconos del bottom tab bar usando el sistema oficial Icon.
 *
 * Estado activo: icono en verde principal + dot accent naranja opcional.
 * Estado inactivo: icono en gris muted (Colors.inkMuted).
 *
 * Cambio en API: ahora recibe `name` (IconName) en lugar de `glyph` (string).
 * Los navigators ya pasaban nombres como 'home', 'calendar', etc., compatibles
 * con el nuevo Icon system.
 */

interface Props {
  /** Nombre del icono del sistema oficial */
  name: IconName
  focused: boolean
  /** Acento de marca: 'sage' (verde) para CLIENT, 'gold' (naranja) para VET */
  accent?: 'sage' | 'gold'
  /** Badge numérico opcional (notificaciones / mensajes) */
  badge?: number
  /** Si true, muestra el dot accent naranja en el icono activo */
  showAccentDot?: boolean
}

export default function TabBarIcon({
  name,
  focused,
  accent = 'sage',
  badge,
  showAccentDot = false,
}: Props) {
  const accentColor = accent === 'sage' ? Colors.sage : Colors.gold
  const inactiveColor = Colors.inkMuted
  const iconColor = focused ? accentColor : inactiveColor

  return (
    <View style={styles.container} accessibilityElementsHidden>
      <Icon
        name={name}
        size={24}
        color={iconColor}
        accent={focused && showAccentDot}
        accentColor={Colors.gold}
      />

      {badge !== undefined && badge > 0 && (
        <View style={styles.badge} accessibilityLabel={`${badge} notificaciones`}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
})
