import React, { useState, useEffect } from 'react'
import { Clock, Search, Trash2, X, ExternalLink, RefreshCw } from 'lucide-react'
import { useHistory } from '../contexts/HistoryContext'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

interface HistoryEntryProps {
  entry: {
    id: string;
    url: string;
    title: string;
    visitedAt: Date;
    favicon?: string;
  }
  onNavigate: (url: string) => void
  onRemove: (id: string) => void
}

const HistoryEntry: React.FC<HistoryEntryProps> = ({ entry, onNavigate, onRemove }) => {
  const formatTime = (date: Date) => {
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInHours = diffInMs / (1000 * 60 * 60)
    
    console.log('formatTime debug:', {
      date: date.toISOString(),
      now: now.toISOString(),
      diffInMs,
      diffInHours,
      dateValid: !isNaN(date.getTime())
    })
    
    // Handle invalid dates or future dates
    if (isNaN(date.getTime()) || diffInMs < 0) {
      return 'Invalid time'
    }
    
    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60)
      if (minutes < 1) {
        return 'Just now'
      } else {
        return `${minutes}m ago`
      }
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`
    } else {
      const days = Math.floor(diffInHours / 24)
      return days === 1 ? 'Yesterday' : `${days} days ago`
    }
  }

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  return (
    <div 
      className="group flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0"
      onClick={() => onNavigate(entry.url)}
    >
      {/* Favicon */}
      <div className="flex-shrink-0 w-4 h-4">
        {entry.favicon ? (
          <img 
            src={entry.favicon} 
            alt="" 
            className="w-4 h-4 rounded-sm"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-4 h-4 bg-muted rounded-sm flex items-center justify-center">
            <ExternalLink className="w-2 h-2 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {entry.title || 'Untitled'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {getDomain(entry.url)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {formatTime(entry.visitedAt)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(entry.id)
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface HistoryProps {
  onClose: () => void
}

export const History: React.FC<HistoryProps> = ({ onClose }) => {
  const { 
    history, 
    isLoading, 
    searchQuery, 
    setSearchQuery, 
    clearHistory, 
    removeEntry, 
    navigateToUrl,
    refreshHistory 
  } = useHistory()
  
  console.log('History component render:', { history, isLoading, searchQuery })
  
  const [showConfirmClear, setShowConfirmClear] = useState(false)

  // Clear search query when component mounts to ensure full history is shown
  useEffect(() => {
    console.log('History: Component mounted, current search query:', searchQuery)
    if (searchQuery.trim()) {
      console.log('History: Clearing search query on mount to show full history')
      setSearchQuery('')
    }
  }, []) // Only run on mount

  const handleClearHistory = async () => {
    if (showConfirmClear) {
      await clearHistory()
      setShowConfirmClear(false)
    } else {
      setShowConfirmClear(true)
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowConfirmClear(false), 3000)
    }
  }

  const handleNavigate = async (url: string) => {
    try {
      await navigateToUrl(url)
      // Optional: You could show a toast notification here
      // For now, the console log in navigateToUrl provides feedback
      onClose() // Close history panel after navigation
    } catch (error) {
      console.error('Failed to navigate from history:', error)
      // Keep the history panel open if navigation failed
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">History</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted rounded-md border border-border 
                     focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
                     text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-b border-border space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            console.log('Manual refresh button clicked')
            setSearchQuery('') // Clear any search first
            refreshHistory()
          }}
          disabled={isLoading}
          className="w-full"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh History
        </Button>
        <Button
          variant={showConfirmClear ? "destructive" : "outline"}
          size="sm"
          onClick={handleClearHistory}
          disabled={history.length === 0}
          className="w-full"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {showConfirmClear ? 'Click again to confirm' : 'Clear History'}
        </Button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <Clock className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No results found' : 'No browsing history yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {history.map((entry) => (
              <HistoryEntry
                key={entry.id}
                entry={entry}
                onNavigate={handleNavigate}
                onRemove={removeEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
