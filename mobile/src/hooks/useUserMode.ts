import { useContext } from 'react'
import { UserModeContext } from '../contexts/UserModeContext'

export const useUserMode = () => {
  const context = useContext(UserModeContext)
  
  if (!context) {
    throw new Error('useUserMode must be used within a UserModeProvider')
  }
  
  return context
}
