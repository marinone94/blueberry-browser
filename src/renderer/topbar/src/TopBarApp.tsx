import React from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { UserAccountProvider } from './contexts/UserAccountContext'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'

const TopBarContent: React.FC = () => {
    return (
        <div className="flex flex-col bg-background select-none bg-red-500">
            {/* Tab Bar */}
            <div className="w-full h-10 pr-2 flex items-center app-region-drag bg-muted dark:bg-muted">
                <TabBar />
            </div>

            {/* Toolbar */}
            <div className="flex items-center px-2 py-1 gap-2 app-region-drag bg-background shadow-subtle z-10 dark:shadow-[0_0_6px_rgba(0,0,0,0.2)]">
                <AddressBar />
            </div>
        </div>
    )
}

export const TopBarApp: React.FC = () => {
    return (
        <UserAccountProvider>
            <BrowserProvider>
                <TopBarContent />
            </BrowserProvider>
        </UserAccountProvider>
    )
}

