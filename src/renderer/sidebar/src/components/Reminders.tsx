import React, { useEffect, useState } from 'react'
import { ArrowLeft, Clock, CheckCircle, Trash2, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@common/components/Button'

interface Reminder {
  id: string
  insightId: string
  userId: string
  title: string
  description: string
  actionParams: any
  createdAt: string
  completed: boolean
  completedAt?: string
}

interface RemindersProps {
  onClose: () => void
}

export const Reminders: React.FC<RemindersProps> = ({ onClose }) => {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [executingReminders, setExecutingReminders] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    loadReminders()

    // Listen for user changes and reload reminders
    const handleUserChange = () => {
      console.log('[Reminders] User changed, reloading reminders...')
      setReminders([]) // Clear current reminders immediately
      loadReminders()
    }

    window.sidebarAPI.onUserChanged(handleUserChange)

    return () => {
      window.sidebarAPI.removeUserChangedListener()
    }
  }, [])

  const loadReminders = async () => {
    setIsLoading(true)
    try {
      const data = await window.sidebarAPI.getReminders()
      setReminders(data)
    } catch (error) {
      console.error('Failed to load reminders:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExecuteReminder = async (reminderId: string) => {
    setExecutingReminders(prev => new Set(prev).add(reminderId))
    try {
      const result = await window.sidebarAPI.executeReminderAction(reminderId)
      if (result.success) {
        // Reload reminders to show updated state
        await loadReminders()
      } else {
        alert(`Failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Failed to execute reminder:', error)
      alert('Failed to execute reminder')
    } finally {
      setExecutingReminders(prev => {
        const newSet = new Set(prev)
        newSet.delete(reminderId)
        return newSet
      })
    }
  }

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      const result = await window.sidebarAPI.completeReminder(reminderId)
      if (result.success) {
        await loadReminders()
      }
    } catch (error) {
      console.error('Failed to complete reminder:', error)
    }
  }

  const handleDeleteReminder = async (reminderId: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) {
      return
    }
    
    try {
      const result = await window.sidebarAPI.deleteReminder(reminderId)
      if (result.success) {
        await loadReminders()
      }
    } catch (error) {
      console.error('Failed to delete reminder:', error)
    }
  }

  const activeReminders = reminders.filter(r => !r.completed)
  const completedReminders = reminders.filter(r => r.completed)

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-background/80 backdrop-blur">
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Reminders</h2>
          <p className="text-xs text-muted-foreground">
            {activeReminders.length} active
          </p>
        </div>
        <Button
          onClick={() => setShowCompleted(!showCompleted)}
          variant="ghost"
          size="sm"
        >
          {showCompleted ? 'Hide' : 'Show'} Completed
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Active Reminders */}
            {activeReminders.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">No active reminders</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Set reminders from insights to see them here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground mb-1 line-clamp-2">
                          {reminder.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {reminder.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      <Button
                        onClick={() => handleExecuteReminder(reminder.id)}
                        disabled={executingReminders.has(reminder.id)}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        {executingReminders.has(reminder.id) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Executing...</span>
                          </>
                        ) : (
                          <>
                            <span>Execute</span>
                            <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleCompleteReminder(reminder.id)}
                        variant="ghost"
                        size="sm"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteReminder(reminder.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(reminder.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Completed Reminders */}
            {showCompleted && completedReminders.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Completed ({completedReminders.length})
                </h3>
                <div className="space-y-3">
                  {completedReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="bg-card/50 border border-border/50 rounded-lg p-4 opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground mb-1 line-clamp-2 line-through">
                            {reminder.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Completed {reminder.completedAt ? new Date(reminder.completedAt).toLocaleDateString() : 'recently'}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleDeleteReminder(reminder.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

