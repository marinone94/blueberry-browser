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

interface UserStats {
  totalUsers: number;
  nonGuestUsers: number;
  currentUser: string | null;
  maxUsers: number;
  hasGuestUser: boolean;
}

interface UserData {
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  userStats: UserStats;
}

interface UserAccountContextType {
  // User data
  currentUser: UserAccount | null
  allUsers: UserAccount[]
  userStats: UserStats | null
  
  // Loading states
  isLoading: boolean
  
  // First-time setup
  isFirstTime: boolean
  showAccountCreation: boolean
  setShowAccountCreation: (show: boolean) => void
  
  // Profile management
  showUserProfile: boolean
  setShowUserProfile: (show: boolean) => void
  profileUser: UserAccount | null
  setProfileUser: (user: UserAccount | null) => void
  
  // Account switcher
  showAccountSwitcher: boolean
  setShowAccountSwitcher: (show: boolean) => void
  
  // Actions
  refreshUserData: () => Promise<void>
  createUser: (userData: {name: string, email?: string, birthday?: string}) => Promise<{success: boolean, user?: UserAccount, error?: string}>
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => Promise<{success: boolean, error?: string}>
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) => Promise<{success: boolean, user?: UserAccount, error?: string}>
  deleteUser: (userId: string) => Promise<{success: boolean, error?: string}>
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
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstTime, setIsFirstTime] = useState(false)
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
      
      const [currentUserData, allUsersData, statsData] = await Promise.all([
        window.topBarAPI.getCurrentUser(),
        window.topBarAPI.getUsers(),
        window.topBarAPI.getUserStats()
      ])

      setCurrentUser(currentUserData)
      setAllUsers(allUsersData)
      setUserStats(statsData)

      // Debug: Log successful data load
      console.log('UserAccountContext - Data loaded successfully:', allUsersData.length, 'users')

      // Check if this is first-time setup (only guest user exists and no other users have ever been created)
      const nonGuestUsers = allUsersData.filter(user => !user.isGuest)
      const isFirstTimeSetup = nonGuestUsers.length === 0 && (currentUserData?.isGuest ?? false) && statsData.nonGuestUsers === 0

      setIsFirstTime(isFirstTimeSetup)
      
      // Note: We don't auto-show the account creation modal anymore
      // Users can manually create accounts via the account switcher when they're ready

    } catch (error) {
      console.error('Failed to load user data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Create new user account
   */
  const createUser = useCallback(async (userData: {name: string, email?: string, birthday?: string}) => {
    try {
      const result = await window.topBarAPI.createUser(userData)
      
      if (result.success) {
        // Refresh user data after successful creation
        await refreshUserData()
        
        // If this was first-time setup, close the modal and switch to new user
        if (isFirstTime) {
          setShowAccountCreation(false)
          setIsFirstTime(false)
          
          // Switch to the newly created user
          if (result.user) {
            await switchUser(result.user.id)
          }
        }
      }
      
      return result
    } catch (error) {
      console.error('Failed to create user:', error)
      return { success: false, error: 'Failed to create user account' }
    }
  }, [isFirstTime, refreshUserData])

  /**
   * Switch to different user
   */
  const switchUser = useCallback(async (userId: string, options?: {keepCurrentTabs: boolean}) => {
    try {
      const result = await window.topBarAPI.switchUser(userId, options)
      
      if (result.success) {
        // User data will be updated via the user-changed event
        // No need to manually refresh here
      }
      
      return result
    } catch (error) {
      console.error('Failed to switch user:', error)
      return { success: false, error: 'Failed to switch user' }
    }
  }, [])

  /**
   * Update user information
   */
  const updateUser = useCallback(async (userId: string, updates: {name?: string, email?: string, birthday?: string}) => {
    try {
      const result = await window.topBarAPI.updateUser(userId, updates)
      
      if (result.success) {
        await refreshUserData()
      }
      
      return result
    } catch (error) {
      console.error('Failed to update user:', error)
      return { success: false, error: 'Failed to update user' }
    }
  }, [refreshUserData])

  /**
   * Delete user account
   */
  const deleteUser = useCallback(async (userId: string) => {
    try {
      const result = await window.topBarAPI.deleteUser(userId)
      
      if (result.success) {
        // User data will be updated via the user-changed event
        // No need to manually refresh here
      }
      
      return result
    } catch (error) {
      console.error('Failed to delete user:', error)
      return { success: false, error: 'Failed to delete user' }
    }
  }, [])

  // Load initial user data
  useEffect(() => {
    refreshUserData()
  }, [refreshUserData])

  // Listen for user changes from main process
  useEffect(() => {
    const handleUserChanged = (userData: UserData) => {
      setCurrentUser(userData.currentUser)
      setAllUsers(userData.allUsers)
      setUserStats(userData.userStats)
    }

    window.topBarAPI.onUserChanged(handleUserChanged)

    return () => {
      window.topBarAPI.removeUserChangedListener()
    }
  }, [])

  const value: UserAccountContextType = {
    // User data
    currentUser,
    allUsers,
    userStats,
    
    // Loading states
    isLoading,
    
    // First-time setup
    isFirstTime,
    showAccountCreation,
    setShowAccountCreation,
    
    // Profile management
    showUserProfile,
    setShowUserProfile,
    profileUser,
    setProfileUser,
    
    // Account switcher
    showAccountSwitcher,
    setShowAccountSwitcher,
    
    // Actions
    refreshUserData,
    createUser,
    switchUser,
    updateUser,
    deleteUser
  }

  return (
    <UserAccountContext.Provider value={value}>
      {children}
    </UserAccountContext.Provider>
  )
}
