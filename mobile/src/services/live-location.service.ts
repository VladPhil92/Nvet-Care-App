import Geolocation, {
  GeolocationOptions,
  GeolocationResponse,
} from '@react-native-community/geolocation'
import { PermissionsAndroid, Platform } from 'react-native'
import api from './api'

export interface Coordinates {
  latitude: number
  longitude: number
  accuracy?: number
  heading?: number | null
  speedMps?: number | null
}

export interface LiveLocationResponse {
  appointmentId: string
  status: string
  trackingActive: boolean
  vetLocation: Coordinates | null
  locationUpdatedAt: string | null
  isStale: boolean
  vet?: {
    firstName?: string
    lastName?: string
    phone?: string
    avatar?: string
  }
}

const DEFAULT_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 10_000,
}

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Ubicación para Nvet Care',
        message:
          'Nvet Care usa tu ubicación para mostrar veterinarios cercanos y permitir tracking durante citas activas.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Ahora no',
      },
    )
    return result === PermissionsAndroid.RESULTS.GRANTED
  }

  if (Platform.OS === 'ios') {
    return new Promise<boolean>((resolve) => {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false),
      )
    })
  }

  return true
}

function getCurrentPosition(options: GeolocationOptions = DEFAULT_OPTIONS) {
  return new Promise<GeolocationResponse>((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, options)
  })
}

export const liveLocationService = {
  requestPermission: requestLocationPermission,

  async getDeviceCoordinates(): Promise<Coordinates | null> {
    const granted = await requestLocationPermission()
    if (!granted) return null

    const position = await getCurrentPosition()
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speedMps: position.coords.speed,
    }
  },

  watchDeviceCoordinates(
    onLocation: (coords: Coordinates) => void,
    onError?: (error: Error) => void,
  ): number {
    return Geolocation.watchPosition(
      (position) =>
        onLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speedMps: position.coords.speed,
        }),
      (error) => onError?.(new Error(error.message)),
      {
        enableHighAccuracy: true,
        distanceFilter: 20,
        interval: 10_000,
        fastestInterval: 5_000,
      } as any,
    )
  },

  clearWatch(watchId: number) {
    Geolocation.clearWatch(watchId)
  },

  async getAppointmentLiveLocation(
    appointmentId: string,
  ): Promise<LiveLocationResponse> {
    const response = await api.get<LiveLocationResponse>(
      `/appointments/${appointmentId}/live-location`,
    )
    return response.data
  },

  async publishAppointmentLiveLocation(
    appointmentId: string,
    coordinates: Coordinates,
  ): Promise<LiveLocationResponse> {
    const response = await api.patch<LiveLocationResponse>(
      `/appointments/${appointmentId}/live-location`,
      coordinates,
    )
    return response.data
  },
}

export default liveLocationService
