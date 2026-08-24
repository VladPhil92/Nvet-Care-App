/**
 * Nvet Care — Sistema de iconos oficial (mobile / React Native).
 *
 * Estilo línea + nodos según el brand kit:
 *   - Stroke 2px, redondeado en todas las esquinas (linecap + linejoin = round)
 *   - Outline only (sin fill) para sentirse aireado
 *   - Color del trazo = `T.ink` (Azul Profundo) por default
 *   - Dot accent naranja (T.gold) opcional como "nodo" o indicador
 *
 * Coherente con el símbolo principal de Nvet Care (curva + dot).
 */

import React from 'react'
import Svg, { Circle, Path, Rect, G } from 'react-native-svg'
import { Colors } from '../../theme/colors'

export type IconName =
  | 'home'
  | 'services'
  | 'veterinarians'
  | 'store'
  | 'emergency'
  | 'chat'
  | 'bell'
  | 'profile'
  | 'vet-home'
  | 'telemedicine'
  | 'consultation'
  | 'vaccination'
  | 'laboratory'
  | 'hospital'
  | 'surgery'
  | 'grooming'
  | 'search'
  | 'filters'
  | 'location'
  | 'calendar'
  | 'heart'
  | 'share'
  | 'phone'
  | 'arrow-right'
  | 'verified'
  | 'shield'
  | 'secure-payment'
  | 'history'
  | 'lock'
  | 'star'
  | 'medal'
  | 'headset'
  | 'check'
  | 'close'
  | 'arrow-back'
  | 'arrow-left'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'chevron-up'
  | 'chevron-down'

interface IconProps {
  name: IconName
  size?: number
  color?: string
  accent?: boolean
  accentColor?: string
  strokeWidth?: number
}

export function Icon({
  name,
  size = 24,
  color = Colors.ink,
  accent = false,
  accentColor = Colors.gold,
  strokeWidth = 2,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {renderIcon(name)}
      </G>
      {accent && <Circle cx={accentDotPos(name).x} cy={accentDotPos(name).y} r={2.2} fill={accentColor} />}
    </Svg>
  )
}

function accentDotPos(name: IconName): { x: number; y: number } {
  switch (name) {
    case 'bell':
      return { x: 17, y: 7 }
    case 'chat':
    case 'consultation':
      return { x: 18, y: 8 }
    default:
      return { x: 18, y: 18 }
  }
}

function renderIcon(name: IconName): React.ReactNode {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M3 11 L12 3 L21 11 L21 20 C21 20.55 20.55 21 20 21 L4 21 C3.45 21 3 20.55 3 20 Z" />
          <Circle cx="9.5" cy="14" r="0.7" fill={Colors.ink} />
          <Circle cx="11" cy="13.2" r="0.7" fill={Colors.ink} />
          <Circle cx="12.5" cy="13.2" r="0.7" fill={Colors.ink} />
          <Circle cx="14" cy="14" r="0.7" fill={Colors.ink} />
          <Path d="M9 17 C9 15.5 10 15 12 15 C14 15 15 15.5 15 17 C15 18 14 18.5 12 18.5 C10 18.5 9 18 9 17 Z" />
        </>
      )
    case 'services':
      return (
        <>
          <Rect x="3" y="7" width="18" height="13" rx="2" />
          <Path d="M9 7 V5 C9 4.45 9.45 4 10 4 H14 C14.55 4 15 4.45 15 5 V7" />
          <Path d="M12 11 V17 M9 14 H15" />
        </>
      )
    case 'veterinarians':
      return (
        <>
          <Circle cx="12" cy="7" r="3.2" />
          <Path d="M5.5 21 C5.5 17 8 15 12 15 C16 15 18.5 17 18.5 21" />
          <Path d="M9 16 V19 C9 20 10 20.5 11 20.5 C12 20.5 13 20 13 19 V18" />
          <Circle cx="13" cy="17.5" r="1.2" />
        </>
      )
    case 'store':
      return (
        <>
          <Path d="M5 8 H19 L18 21 H6 Z" />
          <Path d="M9 8 V6 C9 4 10.3 3 12 3 C13.7 3 15 4 15 6 V8" />
          <Circle cx="10.5" cy="14" r="0.7" fill={Colors.ink} />
          <Circle cx="13.5" cy="14" r="0.7" fill={Colors.ink} />
          <Path d="M9.5 16 C9.5 15 10.5 14.5 12 14.5 C13.5 14.5 14.5 15 14.5 16" />
        </>
      )
    case 'emergency':
      return (
        <>
          <Path d="M7 14 V12 C7 9 9 7 12 7 C15 7 17 9 17 12 V14" />
          <Rect x="6" y="14" width="12" height="4" rx="1" />
          <Path d="M12 4 V6 M5 7 L6.5 8.5 M19 7 L17.5 8.5 M3 11 H5 M19 11 H21" />
        </>
      )
    case 'chat':
      return (
        <>
          <Path d="M4 6 C4 5 5 4 6 4 H18 C19 4 20 5 20 6 V14 C20 15 19 16 18 16 H10 L6 20 V16 C5 16 4 15 4 14 Z" />
          <Circle cx="9" cy="10" r="0.7" fill={Colors.ink} />
          <Circle cx="12" cy="10" r="0.7" fill={Colors.ink} />
          <Circle cx="15" cy="10" r="0.7" fill={Colors.ink} />
        </>
      )
    case 'bell':
      return (
        <>
          <Path d="M6 16 V11 C6 8 8 6 12 6 C16 6 18 8 18 11 V16 L19 18 H5 Z" />
          <Path d="M10 18 C10 19 11 20 12 20 C13 20 14 19 14 18" />
          <Path d="M12 6 V4" />
        </>
      )
    case 'profile':
      return (
        <>
          <Circle cx="12" cy="9" r="3.5" />
          <Path d="M5 21 C5 17 8 15 12 15 C16 15 19 17 19 21" />
        </>
      )
    case 'vet-home':
      return (
        <>
          <Path d="M4 11 L12 4 L20 11 V20 H4 Z" />
          <Circle cx="10" cy="13" r="0.6" fill={Colors.ink} />
          <Circle cx="11.4" cy="12.3" r="0.6" fill={Colors.ink} />
          <Circle cx="12.6" cy="12.3" r="0.6" fill={Colors.ink} />
          <Circle cx="14" cy="13" r="0.6" fill={Colors.ink} />
          <Path d="M10 16 C10 15 11 14.5 12 14.5 C13 14.5 14 15 14 16 C14 17 13 17.5 12 17.5 C11 17.5 10 17 10 16 Z" />
        </>
      )
    case 'telemedicine':
      return (
        <>
          <Path d="M7 4 V10 C7 13 9 15 12 15 C15 15 17 13 17 10 V4" />
          <Path d="M7 4 H5 M17 4 H19" />
          <Path d="M12 15 V18 C12 19.5 13 20.5 14.5 20.5 C16 20.5 17 19.5 17 18" />
          <Circle cx="17" cy="17.5" r="1.5" />
        </>
      )
    case 'consultation':
      return (
        <>
          <Path d="M4 6 C4 5 5 4 6 4 H18 C19 4 20 5 20 6 V14 C20 15 19 16 18 16 H10 L6 20 V16 C5 16 4 15 4 14 Z" />
          <Path d="M12 7 V13 M9 10 H15" />
        </>
      )
    case 'vaccination':
      return (
        <>
          <Path d="M14 4 L20 10" />
          <Path d="M16 6 L19 3 M18 8 L21 5" />
          <Path d="M5 19 L13 11" />
          <Rect x="11" y="9" width="4" height="6" transform="rotate(45 13 12)" />
          <Path d="M3 21 L5 19" />
        </>
      )
    case 'laboratory':
      return (
        <>
          <Path d="M9 3 H15" />
          <Path d="M10 3 V14 C10 16 11 17 12 17 C13 17 14 16 14 14 V3" />
          <Path d="M10 11 H14" />
          <Circle cx="11" cy="13" r="0.5" fill={Colors.ink} />
          <Circle cx="13" cy="14" r="0.5" fill={Colors.ink} />
        </>
      )
    case 'hospital':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7 V17 M7 12 H17" />
        </>
      )
    case 'surgery':
      return (
        <>
          <Path d="M14 4 L20 10 L18 12 L4 21 V20 L17 7 Z" />
          <Path d="M14 4 L18 8" />
        </>
      )
    case 'grooming':
      return (
        <>
          <Circle cx="6" cy="7" r="2.5" />
          <Circle cx="6" cy="17" r="2.5" />
          <Path d="M8 8.5 L20 16 M8 15.5 L20 8" />
        </>
      )
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="6" />
          <Path d="M16 16 L20 20" />
        </>
      )
    case 'filters':
      return (
        <>
          <Path d="M3 7 H21 M3 12 H21 M3 17 H21" />
          <Circle cx="9" cy="7" r="1.5" fill={Colors.surface} />
          <Circle cx="9" cy="7" r="1.5" />
          <Circle cx="15" cy="12" r="1.5" fill={Colors.surface} />
          <Circle cx="15" cy="12" r="1.5" />
          <Circle cx="7" cy="17" r="1.5" fill={Colors.surface} />
          <Circle cx="7" cy="17" r="1.5" />
        </>
      )
    case 'location':
      return (
        <>
          <Path d="M12 21 C12 21 19 14 19 9 C19 5 16 2 12 2 C8 2 5 5 5 9 C5 14 12 21 12 21 Z" />
          <Circle cx="12" cy="9" r="2.5" />
        </>
      )
    case 'calendar':
      return (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" />
          <Path d="M3 9 H21 M8 3 V7 M16 3 V7" />
          <Circle cx="8" cy="13" r="0.6" fill={Colors.ink} />
          <Circle cx="12" cy="13" r="0.6" fill={Colors.ink} />
          <Circle cx="16" cy="13" r="0.6" fill={Colors.ink} />
          <Circle cx="8" cy="17" r="0.6" fill={Colors.ink} />
          <Circle cx="12" cy="17" r="0.6" fill={Colors.ink} />
        </>
      )
    case 'heart':
      return <Path d="M12 21 C5 16 3 12 3 8 C3 5 5 3 8 3 C10 3 11.5 4 12 5.5 C12.5 4 14 3 16 3 C19 3 21 5 21 8 C21 12 19 16 12 21 Z" />
    case 'share':
      return (
        <>
          <Circle cx="6" cy="12" r="2.5" />
          <Circle cx="18" cy="6" r="2.5" />
          <Circle cx="18" cy="18" r="2.5" />
          <Path d="M8.5 11 L15.5 7 M8.5 13 L15.5 17" />
        </>
      )
    case 'phone':
      return <Path d="M5 4 C5 3 6 2 7 2 H9 L11 6 L9 7.5 C10 10 12 12 14.5 13 L16 11 L20 13 V15 C20 16 19 17 18 17 C12 17 5 12 5 6 Z" transform="translate(0 1)" />
    case 'arrow-right':
      return <Path d="M5 12 H19 M14 7 L19 12 L14 17" />
    case 'verified':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M8 12 L11 15 L16 9" />
        </>
      )
    case 'shield':
      return (
        <>
          <Path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" />
          <Path d="M9 12 L11 14 L15 10" />
        </>
      )
    case 'secure-payment':
      return (
        <>
          <Rect x="3" y="6" width="18" height="13" rx="2" />
          <Path d="M3 10 H21" />
          <Path d="M16 14 V13 C16 12 16.7 11 18 11 C19.3 11 20 12 20 13 V14" />
          <Rect x="15.5" y="14" width="5" height="3.5" rx="0.5" />
        </>
      )
    case 'history':
      return (
        <>
          <Path d="M5 4 H17 L19 6 V20 H5 Z" />
          <Circle cx="10" cy="11" r="0.6" fill={Colors.ink} />
          <Circle cx="11.4" cy="10.3" r="0.6" fill={Colors.ink} />
          <Circle cx="12.6" cy="10.3" r="0.6" fill={Colors.ink} />
          <Circle cx="14" cy="11" r="0.6" fill={Colors.ink} />
          <Path d="M10 14 C10 13 11 12.5 12 12.5 C13 12.5 14 13 14 14 C14 15 13 15.5 12 15.5 C11 15.5 10 15 10 14 Z" />
        </>
      )
    case 'lock':
      return (
        <>
          <Rect x="5" y="11" width="14" height="10" rx="2" />
          <Path d="M8 11 V8 C8 5.5 9.8 4 12 4 C14.2 4 16 5.5 16 8 V11" />
          <Circle cx="12" cy="16" r="1" />
        </>
      )
    case 'star':
      return <Path d="M12 3 L14.5 9 L21 9.5 L16 13.5 L17.5 20 L12 16.5 L6.5 20 L8 13.5 L3 9.5 L9.5 9 Z" />
    case 'medal':
      return (
        <>
          <Circle cx="12" cy="9" r="6" />
          <Path d="M9 14 L7 21 L12 18 L17 21 L15 14" />
          <Path d="M10 9 L11 11 L14 7" />
        </>
      )
    case 'headset':
      return (
        <>
          <Path d="M4 14 V11 C4 6.5 7.5 3 12 3 C16.5 3 20 6.5 20 11 V14" />
          <Rect x="3" y="14" width="4" height="6" rx="1.5" />
          <Rect x="17" y="14" width="4" height="6" rx="1.5" />
          <Path d="M19 20 V21 C19 22 18 22.5 17 22.5 H13" />
        </>
      )
    case 'check':
      return <Path d="M5 12 L10 17 L19 7" />
    case 'close':
      return <Path d="M6 6 L18 18 M6 18 L18 6" />
    case 'arrow-back':
    case 'arrow-left':
      return <Path d="M19 12 H5 M10 17 L5 12 L10 7" />
    case 'plus':
      return <Path d="M12 5 V19 M5 12 H19" />
    case 'edit':
      return (
        <>
          <Path d="M4 20 H8 L19 9 L15 5 L4 16 Z" />
          <Path d="M13.5 6.5 L17.5 10.5" />
        </>
      )
    case 'trash':
      return (
        <>
          <Path d="M4 7 H20 M9 7 V4 H15 V7 M7 7 L8 21 H16 L17 7" />
          <Path d="M10 11 V17 M14 11 V17" />
        </>
      )
    case 'chevron-up':
      return <Path d="M6 15 L12 9 L18 15" />
    case 'chevron-down':
      return <Path d="M6 9 L12 15 L18 9" />
    default:
      return null
  }
}

export function IconNode({
  name,
  size = 56,
  bg = Colors.greenSoft,
  iconColor = Colors.sage,
  accent = false,
}: {
  name: IconName
  size?: number
  bg?: string
  iconColor?: string
  accent?: boolean
}) {
  const iconSize = Math.round(size * 0.55)
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={bg} />
      <G transform={`translate(${(size - iconSize) / 2}, ${(size - iconSize) / 2})`}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <G stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {renderIcon(name)}
          </G>
          {accent && (
            <Circle cx={accentDotPos(name).x} cy={accentDotPos(name).y} r={2.2} fill={Colors.gold} />
          )}
        </Svg>
      </G>
    </Svg>
  )
}
