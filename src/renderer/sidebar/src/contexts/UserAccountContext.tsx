import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

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

interface UserAccountContextType {
  // User data
  currentUser: UserAccount | null
  allUsers: UserAccount[]
  
  // Loading states
  isLoading: boolean
  
  // Modal states
  showAccountCreation: boolean
  setShowAccountCreation: (show: boolean) => void
  showUserProfile: boolean
  setShowUserProfile: (show: boolean) => void
  profileUser: UserAccount | null
  setProfileUser: (user: UserAccount | null) => void
  showAccountSwitcher: boolean
  setShowAccountSwitcher: (show: boolean) => void
  
  // Actions (using IPC since we're in sidebar)
  refreshUserData: () => Promise<void>
  createUser: (userData: {name: string, email?: string, birthday?: string}) => Promise<UserAccount>
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => Promise<void>
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) => Promise<UserAccount>
  deleteUser: (userId: string) => Promise<void>
}

const UserAccountContext = createContext<UserAccountContextType | undefined>(undefined)

export const useUserAccount = (): UserAccountContextType => {
  const context = useContext(UserAccountContext)
  if (!context) {
    throw new Error('useUserAccount must be used within a UserAccountProvider')
  }
  return context
}

export const UserAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [allUsers, setAllUsers] = useState<UserAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Modal states
  const [showAccountCreation, setShowAccountCreation] = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [profileUser, setProfileUser] = useState<UserAccount | null>(null)
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)

  /**
   * Load user data from main process
   */
  const refreshUserData = useCallback(async () => {
    try {
      setIsLoading(true)
      
      const [currentUserData, allUsersData] = await Promise.all([
        window.sidebarAPI.getCurrentUser(),
        window.sidebarAPI.getUsers()
      ])

      setCurrentUser(currentUserData)
      setAllUsers(allUsersData)

      console.log('Sidebar UserAccountContext - Data loaded successfully:', allUsersData.length, 'users')

    } catch (error) {
      console.error('Failed to load user data in sidebar:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load user data on mount
  useEffect(() => {
    refreshUserData()
  }, [refreshUserData])

  // Listen for user changes from main process
  useEffect(() => {
    const unsubscribe = window.sidebarAPI.onUserChanged(() => {
      refreshUserData()
    })

    return unsubscribe
  }, [refreshUserData])

  // Listen for messages from topbar
  useEffect(() => {
    const unsubscribe = window.sidebarAPI.onTopbarMessage((type: string, data: any) => {
      
      switch (type) {
        case 'show-account-switcher':
          setShowAccountSwitcher(true)
          break
        case 'show-account-creation':
          setShowAccountCreation(true)
          break
        case 'show-user-profile':
          if (data?.user) {
            setProfileUser(data.user)
            setShowUserProfile(true)
          }
          break
        default:
          console.warn('Unknown topbar message type:', type)
      }
    })

    return unsubscribe
  }, [])

  /**
   * Create a new user account
   */
  const createUser = useCallback(async (userData: {name: string, email?: string, birthday?: string}) => {
    try {
      const newUser = await window.sidebarAPI.createUser(userData)
      await refreshUserData() // Refresh to get updated user list
      return newUser
    } catch (error) {
      console.error('Failed to create user in sidebar:', error)
      throw error
    }
  }, [refreshUserData])

  /**
   * Switch to a different user
   */
  const switchUser = useCallback(async (userId: string, options?: {keepCurrentTabs: boolean}) => {
    try {
      await window.sidebarAPI.switchUser(userId, options)
      await refreshUserData() // Refresh to get updated current user
    } catch (error) {
      console.error('Failed to switch user in sidebar:', error)
      throw error
    }
  }, [refreshUserData])

  /**
   * Update user information
   */
  const updateUser = useCallback(async (userId: string, updates: {name?: string, email?: string, birthday?: string}) => {
    try {
      const updatedUser = await window.sidebarAPI.updateUser(userId, updates)
      await refreshUserData() // Refresh to get updated user data
      return updatedUser
    } catch (error) {
      console.error('Failed to update user in sidebar:', error)
      throw error
    }
  }, [refreshUserData])

  /**
   * Delete a user account
   */
  const deleteUser = useCallback(async (userId: string) => {
    try {
      await window.sidebarAPI.deleteUser(userId)
      await refreshUserData() // Refresh to get updated user list
    } catch (error) {
      console.error('Failed to delete user in sidebar:', error)
      throw error
    }
  }, [refreshUserData])

  const contextValue: UserAccountContextType = {
    // User data
    currentUser,
    allUsers,
    
    // Loading states
    isLoading,
    
    // Modal states
    showAccountCreation,
    setShowAccountCreation,
    showUserProfile,
    setShowUserProfile,
    profileUser,
    setProfileUser,
    showAccountSwitcher,
    setShowAccountSwitcher,
    
    // Actions
    refreshUserData,
    createUser,
    switchUser,
    updateUser,
    deleteUser,
  }

  return (
    <UserAccountContext.Provider value={contextValue}>
      {children}
    </UserAccountContext.Provider>
  )
}
