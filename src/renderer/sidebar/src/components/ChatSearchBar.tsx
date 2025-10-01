import React, { useState, useEffect } from 'react'
import { Search, X, Calendar } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

interface ChatSearchBarProps {
    onSearch: (query: string, options: {
        exactMatch: boolean;
        dateFrom?: string;
        dateTo?: string;
    }) => void
    onClear: () => void
    isSearching: boolean
}

export const ChatSearchBar: React.FC<ChatSearchBarProps> = ({ 
    onSearch, 
    onClear, 
    isSearching 
}) => {
    const [query, setQuery] = useState('')
    const [showDateFilters, setShowDateFilters] = useState(false)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')

    // Debounce search query to prevent excessive searches
    // 500ms is a good compromise between responsiveness and performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query)
        }, 500)

        return () => clearTimeout(timer)
    }, [query])

    // Trigger search when debounced query or dates change
    useEffect(() => {
        if (debouncedQuery.trim() || dateFrom || dateTo) {
            console.log('[ChatSearchBar] Triggering search:', {
                query: debouncedQuery,
                dateFrom,
                dateTo
            })
            handleSearch()
        } else {
            console.log('[ChatSearchBar] Clearing search - no query or filters')
            onClear()
        }
    }, [debouncedQuery, dateFrom, dateTo])

    const handleSearch = () => {
        const trimmedQuery = debouncedQuery.trim()
        
        // Check if query is surrounded by quotes for exact match
        const exactMatch = trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"')
        const searchQuery = exactMatch 
            ? trimmedQuery.slice(1, -1) // Remove quotes
            : trimmedQuery

        const searchOptions = {
            exactMatch,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined
        }

        console.log('[ChatSearchBar] Executing search:', {
            originalQuery: trimmedQuery,
            searchQuery,
            exactMatch,
            dateFrom: searchOptions.dateFrom,
            dateTo: searchOptions.dateTo,
            searchMode: exactMatch ? 'EXACT' : 'SEMANTIC'
        })

        onSearch(searchQuery, searchOptions)
    }

    const handleClear = () => {
        console.log('[ChatSearchBar] User clicked clear button')
        setQuery('')
        setDateFrom('')
        setDateTo('')
        onClear()
    }

    const hasActiveFilters = query.trim() || dateFrom || dateTo

    return (
        <div className="space-y-2">
            {/* Main Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Search chats... (use "quotes" for exact match)'
                    className={cn(
                        "w-full pl-10 pr-20 py-2 rounded-lg border bg-background",
                        "text-foreground placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                        "transition-all duration-200"
                    )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {/* Date Filter Toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDateFilters(!showDateFilters)}
                        className={cn(
                            "h-7 w-7 p-0",
                            showDateFilters && "bg-primary/10 text-primary"
                        )}
                        title="Filter by date"
                    >
                        <Calendar className="size-4" />
                    </Button>
                    
                    {/* Clear Button */}
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                            title="Clear search"
                        >
                            <X className="size-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Date Range Filters */}
            {showDateFilters && (
                <div className="flex items-center gap-2 px-2 py-2 bg-muted/30 rounded-lg animate-fade-in">
                    <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">
                            From
                        </label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className={cn(
                                "w-full px-2 py-1 text-sm rounded border bg-background",
                                "text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                            )}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">
                            To
                        </label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className={cn(
                                "w-full px-2 py-1 text-sm rounded border bg-background",
                                "text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                            )}
                        />
                    </div>
                </div>
            )}

            {/* Search Info */}
            {isSearching && (
                <div className="text-xs text-muted-foreground px-2">
                    Searching...
                </div>
            )}
            {hasActiveFilters && !isSearching && (
                <div className="text-xs text-muted-foreground px-2">
                    {query.startsWith('"') && query.endsWith('"') ? (
                        <span>Exact match search</span>
                    ) : query.trim() ? (
                        <span>Smart semantic search</span>
                    ) : (
                        <span>Filtering by date</span>
                    )}
                </div>
            )}
        </div>
    )
}

