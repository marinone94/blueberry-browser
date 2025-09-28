import React, { useState, useEffect } from 'react'
import { X, Edit2, User, Mail, Calendar, AlertCircle, CheckCircle, Trash2 } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

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

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserAccount | null
  onUserUpdated?: (user: UserAccount) => void
  onUserDeleted?: () => void
}

interface EditableField {
  name: string
  email: string
  birthday: string
}

interface ValidationErrors {
  name?: string
  email?: string
  birthday?: string
}

/**
 * User Profile Manager Modal
 * Separate modal with inline editing for user information
 */
export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUserUpdated,
  onUserDeleted
}) => {
  const [editingField, setEditingField] = useState<keyof EditableField | null>(null)
  const [editValues, setEditValues] = useState<EditableField>({
    name: '',
    email: '',
    birthday: ''
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset form when user changes or modal opens/closes
  useEffect(() => {
    if (user) {
      setEditValues({
        name: user.name,
        email: user.email,
        birthday: user.birthday || ''
      })
    }
    setEditingField(null)
    setErrors({})
    setSaveError(null)
    setShowDeleteConfirm(false)
  }, [user, isOpen])

  /**
   * Validation functions
   */
  const validateField = (field: keyof EditableField, value: string): string | undefined => {
    switch (field) {
      case 'name':
        if (!value.trim()) {
          return 'Name is required'
        }
        if (value.trim().length > 50) {
          return 'Name must be 50 characters or less'
        }
        return undefined

      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Invalid email format'
        }
        return undefined

      case 'birthday':
        if (value) {
          const date = new Date(value)
          const now = new Date()
          if (date > now) {
            return 'Birthday cannot be in the future'
          }
          if (date < new Date('1900-01-01')) {
            return 'Please enter a valid birthday'
          }
        }
        return undefined

      default:
        return undefined
    }
  }

  /**
   * Start editing a field
   */
  const startEditing = (field: keyof EditableField) => {
    setEditingField(field)
    setErrors({})
    setSaveError(null)
  }

  /**
   * Cancel editing
   */
  const cancelEditing = () => {
    if (user) {
      setEditValues({
        name: user.name,
        email: user.email,
        birthday: user.birthday || ''
      })
    }
    setEditingField(null)
    setErrors({})
    setSaveError(null)
  }

  /**
   * Handle input change
   */
  const handleInputChange = (field: keyof EditableField, value: string) => {
    setEditValues(prev => ({ ...prev, [field]: value }))
    
    // Real-time validation
    const error = validateField(field, value)
    setErrors(prev => ({ ...prev, [field]: error }))
    
    if (saveError) {
      setSaveError(null)
    }
  }

  /**
   * Save field changes
   */
  const saveField = async (field: keyof EditableField) => {
    if (!user) return

    const value = editValues[field]
    const error = validateField(field, value)
    
    if (error) {
      setErrors(prev => ({ ...prev, [field]: error }))
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const updates: any = {}
      
      if (field === 'name') {
        updates.name = value.trim()
      } else if (field === 'email') {
        updates.email = value.trim() || undefined
      } else if (field === 'birthday') {
        updates.birthday = value || undefined
      }

      const result = await window.topBarAPI.updateUser(user.id, updates)

      if (result.success && result.user) {
        onUserUpdated?.(result.user)
        setEditingField(null)
      } else {
        setSaveError(result.error || 'Failed to update user')
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      setSaveError('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Handle delete user
   */
  const handleDeleteUser = async () => {
    if (!user || user.isGuest) return

    setIsDeleting(true)

    try {
      const result = await window.topBarAPI.deleteUser(user.id)

      if (result.success) {
        onUserDeleted?.()
        onClose()
      } else {
        setSaveError(result.error || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
      setSaveError('An unexpected error occurred')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  /**
   * Format date for display
   */
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Not set'
    
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return 'Invalid date'
    }
  }

  /**
   * Get account age
   */
  const getAccountAge = (createdAt: Date): string => {
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now.getTime() - created.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 30) return `${diffDays} days ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  }

  if (!isOpen || !user) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {user.isGuest ? 'Guest User Profile' : 'User Profile'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Account created {getAccountAge(user.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Guest User Notice */}
          {user.isGuest && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center">
                <User className="text-blue-500 mr-2" size={16} />
                <div>
                  <p className="text-blue-700 dark:text-blue-400 text-sm font-medium">Guest User</p>
                  <p className="text-blue-600 dark:text-blue-500 text-xs mt-1">
                    Guest user data is cleared when the app restarts. Create a regular account to save your data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name
            </label>
            <div className="relative">
              {editingField === 'name' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      value={editValues.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                        errors.name ? "border-red-500" : "border-gray-300"
                      )}
                      maxLength={50}
                      autoFocus
                    />
                    {editValues.name && !errors.name && (
                      <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
                    )}
                    {errors.name && (
                      <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
                    )}
                  </div>
                  {errors.name && (
                    <p className="text-red-500 text-sm">{errors.name}</p>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveField('name')}
                      disabled={isSaving || !!errors.name || !editValues.name.trim()}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  onClick={() => !user.isGuest && startEditing('name')}
                >
                  <span className="text-gray-900 dark:text-white">{user.name}</span>
                  {!user.isGuest && (
                    <Edit2 className="text-gray-400 hover:text-blue-500" size={16} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email
            </label>
            <div className="relative">
              {editingField === 'email' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="email"
                      value={editValues.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                        errors.email ? "border-red-500" : "border-gray-300"
                      )}
                      placeholder="Enter email (optional)"
                      autoFocus
                    />
                    {editValues.email && !errors.email && (
                      <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
                    )}
                    {errors.email && (
                      <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
                    )}
                  </div>
                  {errors.email && (
                    <p className="text-red-500 text-sm">{errors.email}</p>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveField('email')}
                      disabled={isSaving || !!errors.email}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  onClick={() => !user.isGuest && startEditing('email')}
                >
                  <span className="text-gray-900 dark:text-white">
                    {user.email || 'Not set'}
                  </span>
                  {!user.isGuest && (
                    <Edit2 className="text-gray-400 hover:text-blue-500" size={16} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Birthday Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Birthday
            </label>
            <div className="relative">
              {editingField === 'birthday' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="date"
                      value={editValues.birthday}
                      onChange={(e) => handleInputChange('birthday', e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                        errors.birthday ? "border-red-500" : "border-gray-300"
                      )}
                      max={new Date().toISOString().split('T')[0]}
                      autoFocus
                    />
                    {editValues.birthday && !errors.birthday && (
                      <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
                    )}
                    {errors.birthday && (
                      <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
                    )}
                  </div>
                  {errors.birthday && (
                    <p className="text-red-500 text-sm">{errors.birthday}</p>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveField('birthday')}
                      disabled={isSaving || !!errors.birthday}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  onClick={() => !user.isGuest && startEditing('birthday')}
                >
                  <span className="text-gray-900 dark:text-white">
                    {formatDate(user.birthday)}
                  </span>
                  {!user.isGuest && (
                    <Edit2 className="text-gray-400 hover:text-blue-500" size={16} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {saveError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center">
                <AlertCircle className="text-red-500 mr-2" size={16} />
                <p className="text-red-700 dark:text-red-400 text-sm">{saveError}</p>
              </div>
            </div>
          )}

          {/* Delete User Section */}
          {!user.isGuest && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Danger Zone
              </h3>
              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete Account
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Are you sure you want to delete this account? This action cannot be undone and will permanently delete all user data.
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteUser}
                      disabled={isDeleting}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
