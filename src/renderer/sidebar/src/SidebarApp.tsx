import React, { useEffect, useState } from 'react'
import { ChatProvider } from './contexts/ChatContext'
import { HistoryProvider } from './contexts/HistoryContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { UserAccountProvider, useUserAccount } from './contexts/UserAccountContext'
import { Chat } from './components/Chat'
import { History } from './components/History'
import { ChatHistory } from './components/ChatHistory'
import { AccountCreationModal } from './components/AccountCreationModal'
import { UserProfileModal } from './components/UserProfileModal'
import { AccountSwitcherModal } from './components/AccountSwitcherModal'
import { useDarkMode } from '@common/hooks/useDarkMode'

const SidebarContent: React.FC = () => {
    const { isDarkMode } = useDarkMode()
    const [currentView, setCurrentView] = useState<'chat' | 'chat-history' | 'browsing-history'>('chat')
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

    return (
        <>
            <div className="h-screen flex flex-col bg-background border-l border-border">
                {currentView === 'chat' ? (
                    <Chat onShowHistory={(type) => setCurrentView(type === 'chats' ? 'chat-history' : 'browsing-history')} />
                ) : currentView === 'chat-history' ? (
                    <ChatHistory 
                        onClose={() => setCurrentView('chat')}
                        onSelectSession={() => setCurrentView('chat')}
                    />
                ) : (
                    <History onClose={() => setCurrentView('chat')} />
                )}
            </div>

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
                    <ChatProvider>
                        <SidebarContent />
                    </ChatProvider>
                </ChatHistoryProvider>
            </HistoryProvider>
        </UserAccountProvider>
    )
}

