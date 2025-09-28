import React, { useState, useEffect } from 'react'
import { cn } from '@common/lib/utils'
import { useUserAccount } from '../contexts/UserAccountContext'

interface UserAccount {
  id: string;
  name: string;
  email: string;
  birthday?: string;
  createdAt: Date;
  lastActiveAt: Date;
  sessionPartition: string;
  isGuest: boolean;
}

interface UserIndicatorProps {
  className?: string;
}

/**
 * User Indicator Component
 * Shows current user's initials in a colored circle
 * - Blue circle for guest users
 * - Green circle for regular users
 * - Shows full name on hover
 * - Opens account switcher when clicked
 */
export const UserIndicator: React.FC<UserIndicatorProps> = ({ className }) => {
  const { currentUser, setShowAccountSwitcher } = useUserAccount()
  const [isLoading, setIsLoading] = useState(true)

  // Set loading to false when we have user data
  useEffect(() => {
    setIsLoading(currentUser === null)
  }, [currentUser])

  /**
   * Generate user initials from name
   */
  const getInitials = (name: string): string => {
    if (!name) return '?'
    
    const words = name.trim().split(' ')
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase()
    }
    
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
  }

  /**
   * Get circle color based on user type
   */
  const getCircleColor = (user: UserAccount | null): string => {
    if (!user) return 'bg-gray-400'
    return user.isGuest ? 'bg-blue-500' : 'bg-green-500'
  }

  /**
   * Get hover text
   */
  const getHoverText = (user: UserAccount | null): string => {
    if (!user) return 'Loading...'
    return user.isGuest ? 'Guest User' : user.name
  }

  if (isLoading) {
    return (
      <div className={cn(
        "w-8 h-8 rounded-full bg-gray-300 animate-pulse flex items-center justify-center",
        className
      )}>
        <div className="w-4 h-4 bg-gray-400 rounded-full" />
      </div>
    )
  }

  const initials = getInitials(currentUser?.name || '')
  const circleColor = getCircleColor(currentUser)
  const hoverText = getHoverText(currentUser)

  return (
    <div
      className={cn(
        "relative group cursor-pointer",
        className
      )}
      onClick={() => {
        console.log('UserIndicator clicked - showing account switcher')
        // Show account switcher modal directly
        setShowAccountSwitcher(true)
      }}
      title={hoverText}
    >
      {/* User Circle */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm",
        "transition-all duration-200 hover:scale-110 hover:shadow-lg",
        "app-region-no-drag", // Allow clicking in draggable area
        circleColor
      )}>
        {initials}
      </div>

      {/* Hover Tooltip */}
      <div className={cn(
        "absolute top-full right-0 mt-2 px-2 py-1 bg-black text-white text-xs rounded",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none",
        "whitespace-nowrap z-50"
      )}>
        {hoverText}
        {/* Tooltip arrow */}
        <div className="absolute bottom-full right-2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-black" />
      </div>
    </div>
  )
}
