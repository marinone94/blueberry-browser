import React from 'react'
import { useInsights } from '../contexts/InsightsContext'
import { Button } from '@common/components/Button'
import { 
  Brain, 
  X, 
  Sparkles, 
  RefreshCw, 
  Clock, 
  BookOpen, 
  Zap, 
  TrendingUp,
  ArrowRight,
  Loader2
} from 'lucide-react'

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

const getActionLabel = (actionType: string) => {
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
  const { insights, isLoading, isAnalyzing, error, analyzeBehavior, refreshInsights, executeAction } = useInsights()
  const [executingInsights, setExecutingInsights] = React.useState<Set<string>>(new Set())

  const handleExecuteAction = async (insightId: string) => {
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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Proactive Insights</h2>
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
          onClick={refreshInsights}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
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
        ) : insights.length === 0 ? (
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
          <div className="space-y-4">
            {insights.map((insight) => (
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

                {/* Action Button */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button
                    onClick={() => handleExecuteAction(insight.id)}
                    disabled={executingInsights.has(insight.id)}
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
                        <span>{getActionLabel(insight.actionType)}</span>
                        <ArrowRight className="w-3 h-3" />
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {new Date(insight.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

