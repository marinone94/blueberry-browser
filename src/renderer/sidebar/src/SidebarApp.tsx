import React, { useEffect, useState } from 'react'
import { ChatProvider } from './contexts/ChatContext'
import { HistoryProvider } from './contexts/HistoryContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { InsightsProvider } from './contexts/InsightsContext'
import { UserAccountProvider, useUserAccount } from './contexts/UserAccountContext'
import { Chat } from './components/Chat'
import { History } from './components/History'
import { ChatHistory } from './components/ChatHistory'
import { Insights } from './components/Insights'
import { Reminders } from './components/Reminders'
import { Toast } from './components/Toast'
import { AccountCreationModal } from './components/AccountCreationModal'
import { UserProfileModal } from './components/UserProfileModal'
import { AccountSwitcherModal } from './components/AccountSwitcherModal'
import { useDarkMode } from '@common/hooks/useDarkMode'

interface ToastData {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

const SidebarContent: React.FC = () => {
    const { isDarkMode } = useDarkMode()
    const [currentView, setCurrentView] = useState<'chat' | 'chat-history' | 'browsing-history' | 'insights' | 'reminders'>('chat')
    const [toasts, setToasts] = useState<ToastData[]>([])
    const { 
        showAccountCreation, 
        setShowAccountCreation, 
        showUserProfile,
        setShowUserProfile,
        profileUser,
        setProfileUser,
        showAccountSwitcher,
        setShowAccountSwitcher,
        currentUser,
        allUsers,
        switchUser
    } = useUserAccount()


    // Apply dark mode class to the document
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [isDarkMode])

    // Listen for reminder-set events
    useEffect(() => {
        const handleReminderSet = (data: any) => {
            console.log('Reminder set:', data)
            addToast(data.message || 'Reminder saved successfully', 'success')
        }

        window.sidebarAPI.onReminderSet(handleReminderSet)

        return () => {
            window.sidebarAPI.removeReminderSetListener()
        }
    }, [])

    // Toast management
    const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = `toast-${Date.now()}`
        setToasts(prev => [...prev, { id, message, type }])
    }

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id))
    }

    return (
        <>
            <div className="h-screen flex flex-col bg-background border-l border-border">
                {currentView === 'chat' ? (
                    <Chat 
                        onShowHistory={(type) => setCurrentView(type === 'chats' ? 'chat-history' : 'browsing-history')}
                        onShowInsights={() => setCurrentView('insights')}
                        onShowReminders={() => setCurrentView('reminders')}
                    />
                ) : currentView === 'chat-history' ? (
                    <ChatHistory 
                        onClose={() => setCurrentView('chat')}
                        onSelectSession={() => setCurrentView('chat')}
                    />
                ) : currentView === 'insights' ? (
                    <Insights onClose={() => setCurrentView('chat')} />
                ) : currentView === 'reminders' ? (
                    <Reminders onClose={() => setCurrentView('chat')} />
                ) : (
                    <History onClose={() => setCurrentView('chat')} />
                )}
            </div>

            {/* Toast notifications */}
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    onClose={() => removeToast(toast.id)}
                />
            ))}

            {/* Account Creation Modal */}
            <AccountCreationModal
                isOpen={showAccountCreation}
                onClose={() => setShowAccountCreation(false)}
                onAccountCreated={(user) => {
                    console.log('Account created:', user)
                    setShowAccountCreation(false)
                }}
                isFirstTime={false}
            />

            {/* User Profile Modal */}
            <UserProfileModal
                isOpen={showUserProfile}
                onClose={() => {
                    setShowUserProfile(false)
                    setProfileUser(null)
                }}
                user={profileUser}
                onUserUpdated={async (user: any) => {
                    try {
                        console.log('User updated:', user)
                        setProfileUser(user)
                        console.log('User updated successfully:', user)
                    } catch (error) {
                        console.error('Failed to update user:', error)
                    }
                }}
                onUserDeleted={async () => {
                    try {
                        console.log('User deleted')
                        setShowUserProfile(false)
                        setProfileUser(null)
                        console.log('User deleted successfully')
                    } catch (error) {
                        console.error('Failed to delete user:', error)
                    }
                }}
            />

            {/* Account Switcher Modal */}
            <AccountSwitcherModal
                isOpen={showAccountSwitcher}
                onClose={() => setShowAccountSwitcher(false)}
                currentUser={currentUser}
                allUsers={allUsers}
                onSwitchUser={async (userId: string, options: any) => {
                    try {
                        console.log('Switching user:', userId, options)
                        await switchUser(userId, options)
                        setShowAccountSwitcher(false)
                    } catch (error) {
                        console.error('Failed to switch user:', error)
                        // Keep modal open on error so user can try again
                    }
                }}
                onCreateAccount={() => {
                    setShowAccountSwitcher(false)
                    setShowAccountCreation(true)
                }}
                onManageProfile={(user) => {
                    setShowAccountSwitcher(false)
                    setProfileUser(user)
                    setShowUserProfile(true)
                }}
            />
        </>
    )
}

export const SidebarApp: React.FC = () => {
    return (
        <UserAccountProvider>
            <HistoryProvider>
                <ChatHistoryProvider>
                    <InsightsProvider>
                        <ChatProvider>
                            <SidebarContent />
                        </ChatProvider>
                    </InsightsProvider>
                </ChatHistoryProvider>
            </HistoryProvider>
        </UserAccountProvider>
    )
}

