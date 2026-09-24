import React, { createContext, useState, useEffect, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

type UserMode = 'CLIENT' | 'VET'

interface UserModeContextType {
  mode: UserMode
  toggleMode: () => void
  setMode: (mode: UserMode) => void
  isLoading: boolean
}

export const UserModeContext = createContext<UserModeContextType>({
  mode: 'CLIENT',
  toggleMode: () => {},
  setMode: () => {},
  isLoading: true,
})

const STORAGE_KEY = '@nvet:userMode'

interface UserModeProviderProps {
  children: ReactNode
}

export const UserModeProvider: React.FC<UserModeProviderProps> = ({ children }) => {
  const [mode, setModeState] = useState<UserMode>('CLIENT')
  const [isLoading, setIsLoading] = useState(true)

  // Hydrate persisted mode from the external storage boundary.
  useEffect(() => {
    let active = true

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((savedMode) => {
        if (active && (savedMode === 'CLIENT' || savedMode === 'VET')) {
          setModeState(savedMode)
        }
      })
      .catch((error) => {
        console.error('Error loading user mode:', error)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const setMode = async (newMode: UserMode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newMode)
      setModeState(newMode)
    } catch (error) {
      console.error('Error saving user mode:', error)
    }
  }

  const toggleMode = () => {
    const newMode = mode === 'CLIENT' ? 'VET' : 'CLIENT'
    setMode(newMode)
  }

  return (
    <UserModeContext.Provider value={{ mode, toggleMode, setMode, isLoading }}>
      {children}
    </UserModeContext.Provider>
  )
}
