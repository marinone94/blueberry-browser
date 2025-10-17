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
  ExternalLink,
  Trash2,
  Edit2,
  Play,
  Save,
  Package,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
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

type InsightsTab = 'patterns' | 'agents'

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
      return 'Resume'
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
  const { 
    insights, isLoading, isAnalyzing, error, analyzeBehavior, executeAction, markCompleted, getSessionTabs, openAndTrackTab, refreshInsights,
    savedWorkflows, isLoadingWorkflows, saveAsAgent, executeWorkflow, deleteWorkflow, renameWorkflow
  } = useInsights()
  const [executingInsights, setExecutingInsights] = React.useState<Set<string>>(new Set())
  const [completingInsights, setCompletingInsights] = React.useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = React.useState(false)
  
  // Tab navigation state
  const [activeTab, setActiveTab] = React.useState<InsightsTab>('patterns')
  
  // Filter and sort state for patterns tab
  const [filterType, setFilterType] = React.useState<string>('all')
  const [sortBy, setSortBy] = React.useState<'name' | 'score' | 'time'>('time')
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc')
  
  // Tab dropdown state for unfinished tasks
  const [expandedInsightId, setExpandedInsightId] = React.useState<string | null>(null)
  const [sessionTabs, setSessionTabs] = React.useState<Map<string, SessionTab[]>>(new Map())
  const [loadingTabs, setLoadingTabs] = React.useState<Set<string>>(new Set())
  const [openingTabs, setOpeningTabs] = React.useState<Set<string>>(new Set())
  
  // Workflow automation state
  const [savingWorkflows, setSavingWorkflows] = React.useState<Set<string>>(new Set())
  const [executingWorkflows, setExecutingWorkflows] = React.useState<Set<string>>(new Set())
  const [deletingWorkflows, setDeletingWorkflows] = React.useState<Set<string>>(new Set())
  const [renamingWorkflowId, setRenamingWorkflowId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [expandedWorkflowId, setExpandedWorkflowId] = React.useState<string | null>(null)
  
  // Confirmation dialog state
  const [confirmationData, setConfirmationData] = React.useState<{insightId: string, percentage: number} | null>(null)

  // Separate insights by status
  const allActiveInsights = insights.filter(i => i.status === 'pending' || i.status === 'in_progress')
  const allCompletedInsights = insights.filter(i => i.status === 'completed')
  
  // Apply filtering to both active and completed insights
  let activeInsights = filterType !== 'all' 
    ? allActiveInsights.filter(i => i.type === filterType)
    : allActiveInsights
  
  let completedInsights = filterType !== 'all'
    ? allCompletedInsights.filter(i => i.type === filterType)
    : allCompletedInsights
  
  // Apply sorting
  activeInsights = [...activeInsights].sort((a, b) => {
    let comparison = 0
    
    switch (sortBy) {
      case 'name':
        comparison = a.title.localeCompare(b.title)
        break
      case 'score':
        comparison = a.relevanceScore - b.relevanceScore
        break
      case 'time':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
    }
    
    return sortOrder === 'asc' ? comparison : -comparison
  })
  
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
    // For abandoned tasks and research summaries, show the tab dropdown instead of executing directly
    if ((insight.type === 'abandoned' || insight.type === 'research') && insight.actionType === 'resume_research') {
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
      console.log('[Insights] Mark completed result:', result)
      if (result.success) {
        // Refresh insights to move it to history
        await refreshInsights()
        console.log('[Insights] Insights refreshed')
      } else {
        console.error('[Insights] Failed to mark as completed:', result.error)
        alert(`Failed: ${result.error}`)
      }
    } catch (error) {
      console.error('[Insights] Exception while marking completed:', error)
      alert(`Error: ${error}`)
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

  // Workflow automation handlers
  const handleSaveAsAgent = async (insightId: string) => {
    setSavingWorkflows(prev => new Set(prev).add(insightId))
    try {
      const result = await saveAsAgent(insightId)
      if (result.success) {
        alert(`Workflow saved! Access it from the "My Agents" tab.`)
        setActiveTab('agents')
      } else {
        alert(`Failed to save: ${result.error}`)
      }
    } finally {
      setSavingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(insightId)
        return newSet
      })
    }
  }

  const handleExecuteWorkflow = async (workflowId: string) => {
    setExecutingWorkflows(prev => new Set(prev).add(workflowId))
    try {
      const result = await executeWorkflow(workflowId)
      if (result.success) {
        console.log('Workflow executed:', result.message)
      } else {
        alert(`Failed: ${result.error}`)
      }
    } finally {
      setExecutingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(workflowId)
        return newSet
      })
    }
  }

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Delete this workflow?')) return
    
    setDeletingWorkflows(prev => new Set(prev).add(workflowId))
    try {
      const result = await deleteWorkflow(workflowId)
      if (!result.success) {
        alert(`Failed: ${result.error}`)
      }
    } finally {
      setDeletingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(workflowId)
        return newSet
      })
    }
  }

  const handleRenameWorkflow = async (workflowId: string) => {
    if (!renameValue.trim()) return
    
    try {
      const result = await renameWorkflow(workflowId, renameValue.trim())
      if (result.success) {
        setRenamingWorkflowId(null)
        setRenameValue('')
      } else {
        alert(`Failed: ${result.error}`)
      }
    } catch (err) {
      console.error('Failed to rename:', err)
    }
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
            {activeInsights.length} active
            {filterType !== 'all' && allActiveInsights.length !== activeInsights.length && (
              <span> (of {allActiveInsights.length})</span>
            )}
            {completedInsights.length > 0 && (
              <>
                , {completedInsights.length} completed
                {filterType !== 'all' && allCompletedInsights.length !== completedInsights.length && (
                  <span> (of {allCompletedInsights.length})</span>
                )}
              </>
            )}
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-3 pt-3 border-b border-border bg-muted/30">
        <button
          onClick={() => setActiveTab('patterns')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'patterns'
              ? 'bg-background text-foreground border border-b-0 border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>Detected Patterns</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'agents'
              ? 'bg-background text-foreground border border-b-0 border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <span>My Agents</span>
            {savedWorkflows.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                {savedWorkflows.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Actions Bar - Show different actions based on active tab */}
      {activeTab === 'patterns' && (
        <>
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
          
          {/* Filter and Sort Controls */}
          <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2 py-1 text-sm bg-background border border-border rounded-md text-foreground"
              >
                <option value="all">All Types</option>
                <option value="workflow">Workflow</option>
                <option value="research">Research</option>
                <option value="abandoned">Unfinished Task</option>
                <option value="habit">Browsing Habit</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'score' | 'time')}
                className="px-2 py-1 text-sm bg-background border border-border rounded-md text-foreground"
              >
                <option value="time">Time</option>
                <option value="name">Name</option>
                <option value="score">Score</option>
              </select>
              
              <Button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                variant="outline"
                size="sm"
                className="flex items-center gap-1 px-2"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Detected Patterns Tab */}
        {activeTab === 'patterns' && (
          <>
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
                            {((insight.type === 'abandoned' || insight.type === 'research') && insight.actionType === 'resume_research') ? (
                              expandedInsightId === insight.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ArrowRight className="w-3 h-3" />
                            )}
                          </>
                        )}
                      </Button>
                      {/* Mark Complete button for abandoned tasks */}
                      {insight.type === 'abandoned' && (
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
                      {/* Archive button for research summaries */}
                      {insight.type === 'research' && (
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
                              <span>Archiving...</span>
                            </>
                          ) : (
                            <>
                              <Package className="w-3 h-3" />
                              <span>Archive</span>
                            </>
                          )}
                        </Button>
                      )}
                      {/* Save as Agent button for workflow insights */}
                      {insight.type === 'workflow' && insight.actionType === 'open_urls' && (
                        <Button
                          onClick={() => handleSaveAsAgent(insight.id)}
                          disabled={savingWorkflows.has(insight.id)}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          {savingWorkflows.has(insight.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-3 h-3" />
                              <span>Save as Agent</span>
                            </>
                          )}
                        </Button>
                      )}
                      {/* Archive button for habit insights */}
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
                              <span>Archiving...</span>
                            </>
                          ) : (
                            <>
                              <Package className="w-3 h-3" />
                              <span>Archive</span>
                            </>
                          )}
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Tab Dropdown for abandoned tasks and research summaries */}
                    {(insight.type === 'abandoned' || insight.type === 'research') && expandedInsightId === insight.id && (
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

            {/* Empty state for active insights when filter is applied */}
            {activeInsights.length === 0 && allActiveInsights.length > 0 && filterType !== 'all' && (
              <div className="text-center py-8 mb-6">
                <p className="text-sm text-muted-foreground mb-2">No active {getInsightTypeLabel(filterType).toLowerCase()} patterns found.</p>
                {completedInsights.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    ({completedInsights.length} completed {getInsightTypeLabel(filterType).toLowerCase()} shown below)
                  </p>
                )}
                <Button
                  onClick={() => setFilterType('all')}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Clear Filter
                </Button>
              </div>
            )}
            
            {activeInsights.length === 0 && allActiveInsights.length === 0 && allCompletedInsights.length > 0 && (
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
        </>
        )}

        {/* My Agents Tab */}
        {activeTab === 'agents' && (
          <>
            {isLoadingWorkflows ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              </div>
            ) : savedWorkflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
                <Package className="w-16 h-16 text-muted-foreground/40" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Agents Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Save detected workflows as agents for quick access anytime.
                  </p>
                  <Button
                    onClick={() => setActiveTab('patterns')}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Go to Detected Patterns</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {savedWorkflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="p-4 rounded-lg border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-blue-500/5 hover:from-purple-500/10 hover:to-blue-500/10 transition-colors"
                  >
                    {/* Workflow Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="mt-0.5">
                        <Zap className="w-5 h-5 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {renamingWorkflowId === workflow.id ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameWorkflow(workflow.id)
                                if (e.key === 'Escape') {
                                  setRenamingWorkflowId(null)
                                  setRenameValue('')
                                }
                              }}
                              onBlur={() => handleRenameWorkflow(workflow.id)}
                              className="flex-1 px-2 py-1 text-sm font-semibold bg-background border border-border rounded"
                              autoFocus
                            />
                          ) : (
                            <h3 className="text-sm font-semibold text-foreground">
                              {workflow.name}
                            </h3>
                          )}
                          {workflow.useCount > 0 && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full">
                              Used {workflow.useCount} {workflow.useCount === 1 ? 'time' : 'times'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                          {workflow.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{workflow.steps.length} steps</span>
                          <span>•</span>
                          {workflow.lastUsed ? (
                            <span>Last used: {formatTimeAgo(workflow.lastUsed)}</span>
                          ) : (
                            <span>Never used</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Steps Preview - Expandable */}
                    {expandedWorkflowId === workflow.id && (
                      <div className="mb-3 p-3 bg-background/50 rounded border border-border">
                        <div className="space-y-2">
                          {workflow.steps.slice(0, 5).map((step, index) => (
                            <div key={index} className="flex items-center gap-2 text-xs">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium">
                                {index + 1}
                              </span>
                              <span className="text-muted-foreground truncate flex-1">
                                {step.title || step.url}
                              </span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                            </div>
                          ))}
                          {workflow.steps.length > 5 && (
                            <p className="text-xs text-muted-foreground pl-7">
                              +{workflow.steps.length - 5} more steps
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      <Button
                        onClick={() => handleExecuteWorkflow(workflow.id)}
                        disabled={executingWorkflows.has(workflow.id)}
                        size="sm"
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
                      >
                        {executingWorkflows.has(workflow.id) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Executing...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>Execute</span>
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => setExpandedWorkflowId(expandedWorkflowId === workflow.id ? null : workflow.id)}
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        {expandedWorkflowId === workflow.id ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            <span>Hide Steps</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            <span>Show Steps</span>
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setRenamingWorkflowId(workflow.id)
                          setRenameValue(workflow.name)
                        }}
                        size="sm"
                        variant="ghost"
                        className="w-8 h-8 p-0"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        disabled={deletingWorkflows.has(workflow.id)}
                        size="sm"
                        variant="ghost"
                        className="w-8 h-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {deletingWorkflows.has(workflow.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
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

