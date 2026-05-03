import React from 'react'
import ScreenPlaceholder from '../../components/navigation/ScreenPlaceholder'

export default function ClientAppointmentsPlaceholder() {
  return (
    <ScreenPlaceholder
      glyph="◷"
      accent="sage"
      title="Mis citas"
      subtitle="Aquí verás tus citas agendadas, en curso y completadas. Podrás reagendar, cancelar y abrir el chat con tu veterinario."
    />
  )
}
