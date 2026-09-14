import React from 'react'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

interface NvetLogoProps {
  width?: number
  height?: number
  accessibilityLabel?: string
}

/**
 * Native rendering of dashboard/public/logo.svg.
 * Keep path geometry and official brand colors synchronized with the web mark.
 */
export default function NvetLogo({
  width = 160,
  height = 80,
  accessibilityLabel = 'Nvet Care',
}: NvetLogoProps) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 200 100"
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <Defs>
        <LinearGradient id="nvetGradient" x1="0" y1="0.5" x2="1" y2="0.5">
          <Stop offset="0" stopColor="#0D1B2A" />
          <Stop offset="0.45" stopColor="#1F5343" />
          <Stop offset="0.75" stopColor="#2E8C68" />
          <Stop offset="1" stopColor="#34B27A" />
        </LinearGradient>
      </Defs>
      <Path
        d="M 25 75 L 25 35 C 25 22 45 22 45 35 L 45 55 C 45 65 60 65 65 55 L 80 35 C 80 22 100 22 100 35 L 100 55 C 100 65 115 65 120 55 L 135 35 C 135 22 155 22 155 35 L 155 75"
        stroke="url(#nvetGradient)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={170} cy={75} r={6} fill="#FF8A3D" />
    </Svg>
  )
}
