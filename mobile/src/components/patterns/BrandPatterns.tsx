/**
 * Patrones gráficos oficiales Nvet Care.
 *
 * 5 patrones decorativos del brand kit, todos en SVG procedural sin assets:
 *
 *   - <FlowBackground />      Flujo principal: rutas conectadas (hero sections oscuros)
 *   - <RoutesBackground />    Rutas en movimiento: dashed con pin (tracking)
 *   - <WatermarkLogo />       Marca de agua: "N" del logo translúcido (cards suaves)
 *   - <NodeNetwork />         Nodos conectados: red de profesionales (sidebar/empty states)
 *   - <ModularGrid />         Trama modular: dots grid (texturas de fondo)
 *
 * Todos respetan la paleta oficial via Colors. Diseñados para usarse como
 * background absolute con `pointerEvents: 'none'` debajo del contenido real.
 */

import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, {
  Circle,
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
  Line,
} from 'react-native-svg'
import { Colors } from '../../theme/colors'

interface PatternProps {
  width?: number
  height?: number
  /** Opacidad global del patrón (default 1) */
  opacity?: number
}

// ─────────────────────────────────────────────────────────────────
// 1. FLOW BACKGROUND — Rutas principales sobre fondo oscuro
//    Líneas curvas verdes/naranjas que conectan nodos, evocando
//    la red de profesionales y mascotas
// ─────────────────────────────────────────────────────────────────
export function FlowBackground({
  width = 400,
  height = 200,
  opacity = 1,
  bg = Colors.dark,
}: PatternProps & { bg?: string }) {
  return (
    <View style={[styles.absolute, { width, height, opacity, backgroundColor: bg }]}
          pointerEvents="none">
      <Svg width={width} height={height} viewBox="0 0 400 200">
        {/* Trazos de flujo en verde principal */}
        <Path d="M 0 80 C 80 80 100 40 180 40 C 260 40 280 120 360 120 L 400 120"
              stroke={Colors.sage} strokeWidth={2} fill="none" opacity={0.5} />
        <Path d="M 0 140 C 70 140 90 100 160 100 C 230 100 260 160 340 160 L 400 160"
              stroke={Colors.sage} strokeWidth={2} fill="none" opacity={0.35} />
        <Path d="M 0 40 C 60 40 80 20 140 20 C 200 20 240 80 320 80"
              stroke={Colors.sageLt} strokeWidth={1.5} fill="none" opacity={0.3} strokeDasharray="4 6" />
        {/* Nodos en intersecciones */}
        <Circle cx={100} cy={70} r={4} fill={Colors.sage} opacity={0.7} />
        <Circle cx={180} cy={40} r={5} fill={Colors.gold} />
        <Circle cx={260} cy={100} r={4} fill={Colors.sage} opacity={0.7} />
        <Circle cx={340} cy={160} r={4} fill={Colors.sageLt} />
        <Circle cx={140} cy={20} r={3} fill={Colors.sage} opacity={0.5} />
        <Circle cx={70} cy={140} r={3} fill={Colors.gold} opacity={0.6} />
      </Svg>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 2. ROUTES BACKGROUND — Rutas dashed con pins (tracking en vivo)
// ─────────────────────────────────────────────────────────────────
export function RoutesBackground({
  width = 400,
  height = 200,
  opacity = 1,
}: PatternProps) {
  return (
    <View style={[styles.absolute, { width, height, opacity }]} pointerEvents="none">
      <Svg width={width} height={height} viewBox="0 0 400 200">
        <Path d="M 30 170 L 80 100 L 160 130 L 240 60 L 340 90"
              stroke={Colors.sage} strokeWidth={2} strokeDasharray="6 4"
              strokeLinecap="round" fill="none" />
        {/* Pins / nodos a lo largo de la ruta */}
        <Circle cx={30} cy={170} r={6} fill={Colors.surface} stroke={Colors.sage} strokeWidth={2} />
        <Circle cx={80} cy={100} r={4} fill={Colors.sage} />
        <Circle cx={160} cy={130} r={4} fill={Colors.sage} />
        <Circle cx={240} cy={60} r={4} fill={Colors.sage} />
        {/* Pin destino con halo naranja */}
        <Circle cx={340} cy={90} r={10} fill={Colors.gold} opacity={0.18} />
        <Circle cx={340} cy={90} r={6} fill={Colors.gold} />
      </Svg>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 3. WATERMARK LOGO — Símbolo "N" translúcido como marca de agua
//    Útil para cards con bg verde claro (heroes "saludables")
// ─────────────────────────────────────────────────────────────────
export function WatermarkLogo({
  width = 400,
  height = 200,
  opacity = 0.12,
  color = Colors.sage,
}: PatternProps & { color?: string }) {
  return (
    <View style={[styles.absolute, { width, height, opacity }]} pointerEvents="none">
      <Svg width={width} height={height} viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
        <Path
          d="M 25 75 L 25 35 C 25 22 45 22 45 35 L 45 55 C 45 65 60 65 65 55 L 80 35 C 80 22 100 22 100 35 L 100 55 C 100 65 115 65 120 55 L 135 35 C 135 22 155 22 155 35 L 155 75"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={170} cy={75} r={4} fill={Colors.gold} opacity={0.7} />
      </Svg>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 4. NODE NETWORK — Red de nodos conectados (red de profesionales)
//    Para sidebar oscuro o empty states donde queremos transmitir
//    "conexión / comunidad"
// ─────────────────────────────────────────────────────────────────
export function NodeNetwork({
  width = 400,
  height = 200,
  opacity = 1,
  bg = Colors.dark,
}: PatternProps & { bg?: string }) {
  // 12 nodos pseudo-aleatorios con conexiones predefinidas
  const nodes = [
    { x: 60, y: 40, color: Colors.sage, r: 5 },
    { x: 160, y: 30, color: Colors.gold, r: 6 },
    { x: 280, y: 50, color: Colors.sageLt, r: 4 },
    { x: 350, y: 110, color: Colors.sage, r: 5 },
    { x: 100, y: 90, color: Colors.sage, r: 4 },
    { x: 200, y: 100, color: Colors.gold, r: 5 },
    { x: 50, y: 150, color: Colors.sageLt, r: 4 },
    { x: 140, y: 170, color: Colors.sage, r: 5 },
    { x: 240, y: 160, color: Colors.sage, r: 4 },
    { x: 320, y: 180, color: Colors.gold, r: 5 },
    { x: 380, y: 60, color: Colors.sageLt, r: 3 },
    { x: 30, y: 100, color: Colors.gold, r: 3 },
  ]
  // Conexiones: pares de índices [from, to]
  const links: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 9], [0, 4], [4, 5], [5, 8],
    [4, 6], [6, 7], [7, 8], [8, 9], [1, 5], [2, 5], [3, 10], [11, 0], [11, 6],
  ]
  return (
    <View style={[styles.absolute, { width, height, opacity, backgroundColor: bg }]}
          pointerEvents="none">
      <Svg width={width} height={height} viewBox="0 0 400 200">
        {/* Líneas de conexión */}
        {links.map(([a, b], i) => (
          <Line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={Colors.sageLt}
            strokeWidth={1}
            opacity={0.4}
          />
        ))}
        {/* Nodos */}
        {nodes.map((n, i) => (
          <Circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={0.85} />
        ))}
      </Svg>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 5. MODULAR GRID — Trama de dots equiespaciados (textura de fondo)
//    Inspirado en fondos minimal de dashboards modernos
// ─────────────────────────────────────────────────────────────────
export function ModularGrid({
  width = 400,
  height = 200,
  opacity = 0.6,
  spacing = 24,
  dotColor = Colors.sageLt,
  accentEvery = 7, // cada N dots, uno con accent (sage o gold)
}: PatternProps & { spacing?: number; dotColor?: string; accentEvery?: number }) {
  const cols = Math.ceil(width / spacing)
  const rows = Math.ceil(height / spacing)
  const dots: React.ReactNode[] = []
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isAccent = idx % accentEvery === 0
      const isOrange = idx % (accentEvery * 3) === 0
      const fill = isOrange ? Colors.gold : isAccent ? Colors.sage : dotColor
      dots.push(
        <Circle
          key={`${r}-${c}`}
          cx={c * spacing + spacing / 2}
          cy={r * spacing + spacing / 2}
          r={isAccent ? 2 : 1.2}
          fill={fill}
          opacity={isAccent ? 0.85 : 0.4}
        />,
      )
      idx++
    }
  }
  return (
    <View style={[styles.absolute, { width, height, opacity }]} pointerEvents="none">
      <Svg width={width} height={height}>{dots}</Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
})
