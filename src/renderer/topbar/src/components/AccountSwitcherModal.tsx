import React, { useState } from 'react'
import { X, Plus, Settings, User, ChevronRight } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

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

interface AccountSwitcherModalProps {
  isOpen: boolean
  onClose: () => void
  currentUser: UserAccount | null
  allUsers: UserAccount[]
  onSwitchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => void
  onCreateAccount: () => void
  onManageProfile: (user: UserAccount) => void
}

/**
 * Account Switcher Modal
 * Modal popup showing all user accounts with ability to switch between them
 */
export const AccountSwitcherModal: React.FC<AccountSwitcherModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onSwitchUser,
  onCreateAccount,
  onManageProfile
}) => {
  const [isSwitching, setIsSwitching] = useState(false)
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null)
  const [showTabOptions, setShowTabOptions] = useState<string | null>(null)

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
  const getCircleColor = (user: UserAccount): string => {
    return user.isGuest ? 'bg-blue-500' : 'bg-green-500'
  }

  /**
   * Handle user switch with tab management options
   */
  const handleUserSwitch = async (userId: string, keepCurrentTabs: boolean = false) => {
    if (userId === currentUser?.id) {
      onClose()
      return
    }

    setIsSwitching(true)
    setSwitchingUserId(userId)

    try {
      await onSwitchUser(userId, { keepCurrentTabs })
      onClose()
    } catch (error) {
      console.error('Failed to switch user:', error)
    } finally {
      setIsSwitching(false)
      setSwitchingUserId(null)
      setShowTabOptions(null)
    }
  }

  /**
   * Handle user click - show tab options for non-current users
   */
  const handleUserClick = (user: UserAccount) => {
    if (user.id === currentUser?.id) {
      return // Already current user
    }

    // For guest user or first-time switch, just switch directly
    if (user.isGuest || !currentUser || currentUser.isGuest) {
      handleUserSwitch(user.id, false)
    } else {
      // Show tab management options
      setShowTabOptions(user.id)
    }
  }

  /**
   * Format last active time
   */
  const formatLastActive = (lastActiveAt: Date): string => {
    const now = new Date()
    const diff = now.getTime() - new Date(lastActiveAt).getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(lastActiveAt).toLocaleDateString()
  }

  if (!isOpen) return null

  // Debug: Log user data
  console.log('AccountSwitcherModal - Users loaded:', allUsers.length)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-end pt-12 pr-4 z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-80 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Switch Account
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* User List */}
        <div className="max-h-96 overflow-y-auto">
          {allUsers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <p>Loading users...</p>
            </div>
          ) : (
            allUsers.map((user) => (
            <div key={user.id} className="relative">
              {/* User Item */}
              <div
                className={cn(
                  "flex items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors",
                  user.id === currentUser?.id && "bg-blue-50 dark:bg-blue-900/20",
                  isSwitching && switchingUserId === user.id && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !isSwitching && handleUserClick(user)}
              >
                {/* User Avatar */}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3",
                  getCircleColor(user)
                )}>
                  {getInitials(user.name)}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {user.name}
                      {user.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                          (Current)
                        </span>
                      )}
                    </h3>
                    {user.isGuest && (
                      <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                        Guest
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {user.email || 'No email'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {user.id === currentUser?.id ? 'Active now' : `Last active ${formatLastActive(user.lastActiveAt)}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1">
                  {user.id !== currentUser?.id && !isSwitching && (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  {isSwitching && switchingUserId === user.id && (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>

              {/* Tab Management Options */}
              {showTabOptions === user.id && !isSwitching && (
                <div className="absolute inset-x-0 top-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-10">
                  <div className="p-3 space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      What would you like to do with your current tabs?
                    </p>
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => handleUserSwitch(user.id, true)}
                      >
                        Keep current tabs
                        <span className="text-xs text-gray-500 ml-2">(Transfer to {user.name})</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleUserSwitch(user.id, false)}
                      >
                        Load {user.name}'s tabs
                        <span className="text-xs text-gray-500 ml-2">(Close current tabs)</span>
                      </Button>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-gray-500"
                        onClick={() => setShowTabOptions(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
          {/* Create Account */}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onCreateAccount()
              onClose()
            }}
            disabled={isSwitching}
          >
            <Plus size={16} className="mr-2" />
            Create New Account
          </Button>

          {/* Manage Profile */}
          {currentUser && !currentUser.isGuest && (
            <Button
              variant="ghost"
              className="w-full justify-start text-gray-600 dark:text-gray-400"
              onClick={() => {
                onManageProfile(currentUser)
                onClose()
              }}
              disabled={isSwitching}
            >
              <Settings size={16} className="mr-2" />
              Manage Profile
            </Button>
          )}

          {/* Guest Profile Info */}
          {currentUser?.isGuest && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
              <div className="flex items-start">
                <User className="text-blue-500 mr-2 mt-0.5 flex-shrink-0" size={14} />
                <div>
                  <p className="text-blue-700 dark:text-blue-400 text-xs font-medium">
                    You're using Guest Mode
                  </p>
                  <p className="text-blue-600 dark:text-blue-500 text-xs mt-1">
                    Your data will be cleared when the app restarts. Create an account to save your data.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
