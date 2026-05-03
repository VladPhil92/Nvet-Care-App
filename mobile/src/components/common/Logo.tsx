/**
 * Nvet Care — Logo (React Native port del símbolo oficial).
 *
 * Símbolo: trazo continuo serpenteante (estilo "N" estilizada con 3 ondulaciones)
 * con gradient horizontal azul → verde y dot naranja al extremo derecho.
 *
 * Wordmark: "Nvet" en azul profundo (bold) + "Care" en verde principal (regular).
 *
 * Path data idéntico a `dashboard/public/logo.svg` y al componente web
 * `dashboard/src/components/Logos.tsx`.
 *
 * Props:
 *  - size: alto del símbolo en dp (default 36)
 *  - showWordmark: muestra "Nvet Care" al lado (default true)
 *  - inverted: paleta invertida para fondos oscuros
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

interface LogoProps {
  size?: number
  showWordmark?: boolean
  inverted?: boolean
}

// Paleta oficial Nvet Care (sincronizada con mobile/src/theme/colors.ts)
const COLORS = {
  blueDeep: '#0D1B2A',
  greenPrimary: '#34B27A',
  orangeAccent: '#FF8A3D',
  inkInv: '#FFFFFF',
  inkMutedDark: '#454D54',
} as const

export function Logo({ size = 36, showWordmark = true, inverted = false }: LogoProps) {
  // ID único del gradient por instancia para evitar colisiones cuando hay
  // varios <Logo> en una misma pantalla.
  const gradId = `nvetGrad_${size}_${inverted ? 'inv' : 'reg'}`

  const orangeColor = COLORS.orangeAccent
  const wordmarkInk = inverted ? COLORS.inkInv : COLORS.blueDeep
  const wordmarkAccent = COLORS.greenPrimary
  const captionColor = inverted ? 'rgba(255,255,255,0.55)' : COLORS.inkMutedDark

  // Símbolo horizontal 200x100 (relación natural). Lo escalamos respetando aspect.
  const symW = size * 1.7
  const symH = size * 0.85

  return (
    <View style={[styles.row, { columnGap: size * 0.28 }]}>
      <Svg width={symW} height={symH} viewBox="0 0 200 100" fill="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
            {inverted ? (
              <>
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="60%" stopColor="#9CD8B7" />
                <Stop offset="100%" stopColor={COLORS.greenPrimary} />
              </>
            ) : (
              <>
                <Stop offset="0%" stopColor={COLORS.blueDeep} />
                <Stop offset="45%" stopColor="#1F5343" />
                <Stop offset="75%" stopColor="#2E8C68" />
                <Stop offset="100%" stopColor={COLORS.greenPrimary} />
              </>
            )}
          </LinearGradient>
        </Defs>

        {/* Trazo serpenteante con 3 lobulos */}
        <Path
          d="M 25 75 L 25 35 C 25 22 45 22 45 35 L 45 55 C 45 65 60 65 65 55 L 80 35 C 80 22 100 22 100 35 L 100 55 C 100 65 115 65 120 55 L 135 35 C 135 22 155 22 155 35 L 155 75"
          stroke={`url(#${gradId})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Dot naranja en extremo inferior derecho */}
        <Circle cx={170} cy={75} r={6} fill={orangeColor} />
      </Svg>

      {showWordmark && (
        <View style={{ justifyContent: 'center' }}>
          <Text accessibilityRole="header" style={{ fontSize: size * 0.85, letterSpacing: -0.5 }}>
            <Text style={{ color: wordmarkInk, fontWeight: '800' }}>Nvet</Text>
            <Text style={{ color: wordmarkAccent, fontWeight: '400' }}> Care</Text>
          </Text>
          {size > 26 && (
            <Text
              style={{
                fontSize: size * 0.2,
                color: captionColor,
                letterSpacing: 1.5,
                marginTop: size * 0.06,
                textTransform: 'uppercase',
                fontWeight: '600',
              }}
            >
              Veterinary Platform
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

/**
 * Símbolo solo (sin wordmark) — para tab bar headers, app launcher,
 * splash screen donde el wordmark vive separado.
 */
export function LogoMark({
  size = 36,
  inverted = false,
}: {
  size?: number
  inverted?: boolean
}) {
  return <Logo size={size} showWordmark={false} inverted={inverted} />
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
