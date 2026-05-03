import { useState, useEffect } from 'react'
import { BREAKPOINTS } from '../theme/tokens'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

interface ResponsiveHook {
  device: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  width: number
  height: number
}

export function useResponsive(): ResponsiveHook {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    // Llamar inmediatamente para obtener dimensiones iniciales
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getDeviceType = (width: number): DeviceType => {
    if (width < BREAKPOINTS.tablet) return 'mobile'
    if (width < BREAKPOINTS.desktop) return 'tablet'
    return 'desktop'
  }

  const device = getDeviceType(dimensions.width)

  return {
    device,
    isMobile: device === 'mobile',
    isTablet: device === 'tablet',
    isDesktop: device === 'desktop',
    width: dimensions.width,
    height: dimensions.height,
  }
}
