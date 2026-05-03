import React from 'react'
import ScreenPlaceholder from '../../components/navigation/ScreenPlaceholder'

export default function VetEarningsPlaceholder() {
  return (
    <ScreenPlaceholder
      glyph="▲"
      accent="gold"
      title="Resumen de ingresos"
      subtitle="Total facturado, comisión por tier, balance disponible y solicitudes de retiro. Gráficos por mes/trimestre próximamente."
    />
  )
}
