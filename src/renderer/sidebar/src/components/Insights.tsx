import React from 'react'
import { useInsights } from '../contexts/InsightsContext'
import { Button } from '@common/components/Button'
import { 
  Brain, 
  X, 
  Sparkles, 
  History, 
  Clock, 
  BookOpen, 
  Zap, 
  TrendingUp,
  ArrowRight,
  Loader2,
  CheckCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'

interface SessionTab {
  url: string
  title: string
  timestamp: string
  sessionId: string
}

interface InsightsProps {
  onClose: () => void
}

const getInsightIcon = (type: string) => {
  switch (type) {
    case 'workflow':
      return <Zap className="w-5 h-5 text-purple-500" />
    case 'research':
      return <BookOpen className="w-5 h-5 text-blue-500" />
    case 'abandoned':
      return <Clock className="w-5 h-5 text-orange-500" />
    case 'habit':
      return <TrendingUp className="w-5 h-5 text-green-500" />
    default:
      return <Sparkles className="w-5 h-5 text-gray-500" />
  }
}

const getInsightTypeLabel = (type: string) => {
  switch (type) {
    case 'workflow':
      return 'Workflow Detected'
    case 'research':
      return 'Research Summary'
    case 'abandoned':
      return 'Unfinished Task'
    case 'habit':
      return 'Browsing Habit'
    default:
      return 'Insight'
  }
}

const getActionLabel = (actionType: string, insightType?: string) => {
  // For habit insights with remind action, show "Set Reminder"
  if (insightType === 'habit' && actionType === 'remind') {
    return 'Set Reminder'
  }
  
  switch (actionType) {
    case 'open_urls':
      return 'Open Workflow'
    case 'resume_research':
      return 'Continue'
    case 'remind':
      return 'Set Reminder'
    case 'create_workflow':
      return 'Create Workflow'
    default:
      return 'Take Action'
  }
}

export const Insights: React.FC<InsightsProps> = ({ onClose }) => {
  const { insights, isLoading, isAnalyzing, error, analyzeBehavior, executeAction, markCompleted, getSessionTabs, openAndTrackTab, refreshInsights } = useInsights()
  const [executingInsights, setExecutingInsights] = React.useState<Set<string>>(new Set())
  const [completingInsights, setCompletingInsights] = React.useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = React.useState(false)
  
  // Tab dropdown state for unfinished tasks
  const [expandedInsightId, setExpandedInsightId] = React.useState<string | null>(null)
  const [sessionTabs, setSessionTabs] = React.useState<Map<string, SessionTab[]>>(new Map())
  const [loadingTabs, setLoadingTabs] = React.useState<Set<string>>(new Set())
  const [openingTabs, setOpeningTabs] = React.useState<Set<string>>(new Set())
  
  // Confirmation dialog state
  const [confirmationData, setConfirmationData] = React.useState<{insightId: string, percentage: number} | null>(null)

  // Separate insights by status
  const activeInsights = insights.filter(i => i.status === 'pending' || i.status === 'in_progress')
  const completedInsights = insights.filter(i => i.status === 'completed')
  
  // Setup event listeners for auto-completion
  React.useEffect(() => {
    const handleAutoCompleted = async (data: { insightId: string; percentage: number; reason: string }) => {
      console.log('[Insights] Insight auto-completed:', data)
      // Refresh insights to show the updated status
      await refreshInsights()
    }
    
    const handleConfirmationRequest = (data: { insightId: string; percentage: number }) => {
      console.log('[Insights] Completion confirmation requested:', data)
      setConfirmationData(data)
    }
    
    window.sidebarAPI.onInsightAutoCompleted(handleAutoCompleted)
    window.sidebarAPI.onInsightCompletionConfirmationRequest(handleConfirmationRequest)
    
    return () => {
      window.sidebarAPI.removeInsightAutoCompletedListener()
      window.sidebarAPI.removeInsightCompletionConfirmationRequestListener()
    }
  }, [refreshInsights])

  const handleExecuteAction = async (insightId: string, insight: any) => {
    // For abandoned tasks, show the tab dropdown instead of executing directly
    if (insight.type === 'abandoned' && insight.actionType === 'resume_research') {
      await handleToggleTabDropdown(insightId)
      return
    }
    
    // For other insights, execute the action directly
    setExecutingInsights(prev => new Set(prev).add(insightId))
    try {
      const result = await executeAction(insightId)
      if (result.success) {
        console.log('Action executed:', result.message)
      } else {
        console.error('Action failed:', result.error)
        alert(`Failed: ${result.error}`)
      }
    } finally {
      setExecutingInsights(prev => {
        const newSet = new Set(prev)
        newSet.delete(insightId)
        return newSet
      })
    }
  }

  const handleToggleTabDropdown = async (insightId: string) => {
    if (expandedInsightId === insightId) {
      // Collapse if already expanded
      setExpandedInsightId(null)
      return
    }
    
    // Expand and load tabs if not already loaded
    setExpandedInsightId(insightId)
    
    if (!sessionTabs.has(insightId)) {
      setLoadingTabs(prev => new Set(prev).add(insightId))
      try {
        const result = await getSessionTabs(insightId)
        if (result.success) {
          setSessionTabs(prev => new Map(prev).set(insightId, result.tabs))
        } else {
          console.error('Failed to load tabs:', result.error)
          alert(`Failed to load tabs: ${result.error}`)
        }
      } finally {
        setLoadingTabs(prev => {
          const newSet = new Set(prev)
          newSet.delete(insightId)
          return newSet
        })
      }
    }
  }

  const handleOpenTab = async (insightId: string, url: string) => {
    const tabKey = `${insightId}-${url}`
    setOpeningTabs(prev => new Set(prev).add(tabKey))
    try {
      const result = await openAndTrackTab(insightId, url)
      if (result.success) {
        console.log('Tab opened and tracked:', url)
        if (result.completionPercentage !== undefined) {
          console.log('Completion percentage:', result.completionPercentage)
        }
      } else {
        console.error('Failed to open tab:', result.error)
        alert(`Failed: ${result.error}`)
      }
    } finally {
      setOpeningTabs(prev => {
        const newSet = new Set(prev)
        newSet.delete(tabKey)
        return newSet
      })
    }
  }

  const handleMarkCompleted = async (insightId: string) => {
    setCompletingInsights(prev => new Set(prev).add(insightId))
    try {
      const result = await markCompleted(insightId)
      if (result.success) {
        console.log('Insight marked as completed:', result.message)
      } else {
        console.error('Failed to mark as completed:', result.error)
        alert(`Failed: ${result.error}`)
      }
    } finally {
      setCompletingInsights(prev => {
        const newSet = new Set(prev)
        newSet.delete(insightId)
        return newSet
      })
    }
  }

  const formatTimeAgo = (dateString: string | undefined): string => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }
  
  const handleConfirmCompletion = async (confirm: boolean) => {
    if (!confirmationData) return
    
    if (confirm) {
      await handleMarkCompleted(confirmationData.insightId)
    }
    
    setConfirmationData(null)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Proactive Insights</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {activeInsights.length} active{completedInsights.length > 0 && `, ${completedInsights.length} completed`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30">
        <Button
          onClick={analyzeBehavior}
          disabled={isAnalyzing}
          size="sm"
          className="flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Analyze Behavior</span>
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowHistory(!showHistory)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <History className="w-4 h-4" />
          <span>{showHistory ? 'Hide' : 'Show'} History</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading insights...</p>
          </div>
        ) : activeInsights.length === 0 && completedInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
            <Brain className="w-16 h-16 text-muted-foreground/40" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Insights Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click "Analyze Behavior" to discover patterns in your browsing activity and get personalized suggestions.
              </p>
              <Button
                onClick={analyzeBehavior}
                disabled={isAnalyzing}
                className="flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze Now</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Active Insights */}
            {activeInsights.length > 0 && (
              <div className="space-y-4 mb-6">
                {activeInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
                  >
                    {/* Insight Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="mt-0.5">
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {getInsightTypeLabel(insight.type)}
                          </span>
                          {/* Status Badge */}
                          {insight.status === 'in_progress' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full">
                              In Progress
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Score: {Math.round(insight.relevanceScore * 100)}%
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {insight.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {insight.description}
                        </p>
                        {/* Show last resumed time for in_progress tasks */}
                        {insight.status === 'in_progress' && insight.lastResumedAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Last worked on: {formatTimeAgo(insight.lastResumedAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      <Button
                        onClick={() => handleExecuteAction(insight.id, insight)}
                        disabled={executingInsights.has(insight.id) || loadingTabs.has(insight.id)}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        {executingInsights.has(insight.id) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Executing...</span>
                          </>
                        ) : (
                          <>
                            <span>{getActionLabel(insight.actionType, insight.type)}</span>
                            {insight.type === 'abandoned' && insight.actionType === 'resume_research' ? (
                              expandedInsightId === insight.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ArrowRight className="w-3 h-3" />
                            )}
                          </>
                        )}
                      </Button>
                      {/* Mark Complete button for in_progress abandoned tasks */}
                      {insight.status === 'in_progress' && insight.type === 'abandoned' && (
                        <Button
                          onClick={() => handleMarkCompleted(insight.id)}
                          disabled={completingInsights.has(insight.id)}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          {completingInsights.has(insight.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Completing...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Mark Complete</span>
                            </>
                          )}
                        </Button>
                      )}
                      {/* Discard button for habit insights */}
                      {insight.type === 'habit' && (
                        <Button
                          onClick={() => handleMarkCompleted(insight.id)}
                          disabled={completingInsights.has(insight.id)}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          {completingInsights.has(insight.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Discarding...</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              <span>Discard</span>
                            </>
                          )}
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Tab Dropdown for abandoned tasks */}
                    {insight.type === 'abandoned' && expandedInsightId === insight.id && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        {loadingTabs.has(insight.id) ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading tabs...</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Related Tabs ({sessionTabs.get(insight.id)?.length || 0})
                              </span>
                              {insight.openedTabUrls && insight.openedTabUrls.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Opened: {insight.openedTabUrls.length} / {sessionTabs.get(insight.id)?.length || 0}
                                </span>
                              )}
                            </div>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                              {sessionTabs.get(insight.id)?.map((tab, idx) => {
                                const isOpened = insight.openedTabUrls?.includes(tab.url)
                                const tabKey = `${insight.id}-${tab.url}`
                                const isOpening = openingTabs.has(tabKey)
                                
                                return (
                                  <button
                                    key={`${tab.url}-${idx}`}
                                    onClick={() => handleOpenTab(insight.id, tab.url)}
                                    disabled={isOpening}
                                    className={`w-full text-left p-2 rounded border transition-colors ${
                                      isOpened 
                                        ? 'bg-green-500/10 border-green-500/20 text-foreground' 
                                        : 'bg-card border-border hover:bg-card/80'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {isOpening ? (
                                            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                                          ) : (
                                            <ExternalLink className={`w-3 h-3 flex-shrink-0 ${isOpened ? 'text-green-500' : 'text-muted-foreground'}`} />
                                          )}
                                          <span className="text-sm font-medium truncate">{tab.title}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground truncate block mt-1">
                                          {tab.url}
                                        </span>
                                      </div>
                                      {isOpened && (
                                        <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Completed Insights (History) */}
            {showHistory && completedInsights.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Completed ({completedInsights.length})
                </h3>
                {completedInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-4 rounded-lg border border-border/50 bg-card/30 opacity-60"
                  >
                    {/* Insight Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="mt-0.5">
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {getInsightTypeLabel(insight.type)}
                          </span>
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span className="text-xs text-muted-foreground">
                            Score: {Math.round(insight.relevanceScore * 100)}%
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {insight.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {insight.description}
                        </p>
                      </div>
                    </div>

                    {/* Status Info */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">
                        Acted upon {insight.actedUponAt ? new Date(insight.actedUponAt).toLocaleDateString() : 'recently'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state for active insights */}
            {activeInsights.length === 0 && completedInsights.length > 0 && (
              <div className="text-center py-8 mb-6">
                <p className="text-sm text-muted-foreground">No active insights. All insights have been completed.</p>
                <Button
                  onClick={analyzeBehavior}
                  disabled={isAnalyzing}
                  size="sm"
                  className="mt-4"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      <span>Generate New Insights</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Confirmation Dialog for Completion */}
      {confirmationData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Mark Task as Complete?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              You've opened {Math.round(confirmationData.percentage * 100)}% of the tabs related to this task. 
              Would you like to mark it as complete?
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => handleConfirmCompletion(true)}
                className="flex-1"
              >
                <Check className="w-4 h-4 mr-2" />
                Mark Complete
              </Button>
              <Button
                onClick={() => handleConfirmCompletion(false)}
                variant="outline"
                className="flex-1"
              >
                Not Yet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

