import React, { useState, useEffect } from 'react'
import { X, User, Mail, Calendar, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '../../../common/components/Button'
import { cn } from '../../../common/lib/utils'
import { useUserAccount } from '../contexts/UserAccountContext'

interface AccountCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onAccountCreated?: (user: any) => void
  isFirstTime?: boolean
}

interface FormData {
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
 * Account Creation Modal
 * Single form with real-time validation for creating new user accounts
 */
export const AccountCreationModal: React.FC<AccountCreationModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
  isFirstTime = false
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    birthday: ''
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { createUser } = useUserAccount()

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', email: '', birthday: '' })
      setErrors({})
      setSubmitError(null)
    }
  }, [isOpen])

  /**
   * Real-time validation
   */
  const validateField = (field: keyof FormData, value: string): string | undefined => {
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
   * Handle input change with real-time validation
   */
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Real-time validation
    const error = validateField(field, value)
    setErrors(prev => ({ ...prev, [field]: error }))
    
    // Clear submit error when user starts typing
    if (submitError) {
      setSubmitError(null)
    }
  }

  /**
   * Validate entire form
   */
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}
    let hasErrors = false

    // Validate all fields
    Object.keys(formData).forEach(field => {
      const error = validateField(field as keyof FormData, formData[field as keyof FormData])
      if (error) {
        newErrors[field as keyof ValidationErrors] = error
        hasErrors = true
      }
    })

    setErrors(newErrors)
    return !hasErrors
  }

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const userData = {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        birthday: formData.birthday || undefined
      }

      const newUser = await createUser(userData)
      
      onAccountCreated?.(newUser)
      onClose()
    } catch (error) {
      console.error('Failed to create account:', error)
      setSubmitError('An unexpected error occurred: ' + error)
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Check if form is valid
   */
  const isFormValid = formData.name.trim() && !Object.values(errors).some(error => error)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isFirstTime ? 'Welcome to Blueberry Browser' : 'Create New Account'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isFirstTime ? 'Create your first user account to get started' : 'Add a new user account'}
            </p>
          </div>
          {!isFirstTime && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={cn(
                  "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                  errors.name ? "border-red-500" : "border-gray-300"
                )}
                placeholder="Enter your name"
                maxLength={50}
              />
              {formData.name && !errors.name && (
                <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
              )}
              {errors.name && (
                <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
              )}
            </div>
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email (optional)
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={cn(
                  "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                  errors.email ? "border-red-500" : "border-gray-300"
                )}
                placeholder="Enter your email"
              />
              {formData.email && !errors.email && (
                <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
              )}
              {errors.email && (
                <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
              )}
            </div>
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          {/* Birthday Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Birthday (optional)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="date"
                value={formData.birthday}
                onChange={(e) => handleInputChange('birthday', e.target.value)}
                className={cn(
                  "w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                  errors.birthday ? "border-red-500" : "border-gray-300"
                )}
                max={new Date().toISOString().split('T')[0]}
              />
              {formData.birthday && !errors.birthday && (
                <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={16} />
              )}
              {errors.birthday && (
                <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={16} />
              )}
            </div>
            {errors.birthday && (
              <p className="text-red-500 text-sm mt-1">{errors.birthday}</p>
            )}
          </div>

          {/* Submit Error */}
          {submitError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center">
                <AlertCircle className="text-red-500 mr-2" size={16} />
                <p className="text-red-700 dark:text-red-400 text-sm">{submitError}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            {!isFirstTime && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={cn(
                "min-w-[100px]",
                isSubmitting && "cursor-not-allowed opacity-50"
              )}
            >
              {isSubmitting ? 'Creating...' : isFirstTime ? 'Get Started' : 'Create Account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
