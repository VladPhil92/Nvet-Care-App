import React from 'react'
import ScreenPlaceholder from '../../components/navigation/ScreenPlaceholder'

export default function ClientSearchPlaceholder() {
  return (
    <ScreenPlaceholder
      glyph="⌕"
      accent="sage"
      title="Encuentra al veterinario ideal"
      subtitle="Filtra por especialidad, distancia, calificación y precio. La búsqueda con geolocalización estará disponible en el siguiente sprint."
    />
  )
}
