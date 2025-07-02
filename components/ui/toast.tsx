"use client"

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'

export interface ToastProps {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  timeoutId?: NodeJS.Timeout
}

export interface ToastContextType {
  toasts: ToastProps[]
  addToast: (toast: Omit<ToastProps, 'id'>) => void
  removeToast: (id: string) => void
}

// Toast Hook
export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([])

  const addToast = (toast: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast = { ...toast, id }
    
    setToasts(prev => [...prev, newToast])
    
    // Auto remove after duration with cleanup
    const timeoutId = setTimeout(() => {
      removeToast(id)
    }, toast.duration || 3000)
    
    // Store timeout ID for potential cleanup
    newToast.timeoutId = timeoutId
  }

  const removeToast = (id: string) => {
    setToasts(prev => {
      const toast = prev.find(t => t.id === id)
      if (toast && toast.timeoutId) {
        clearTimeout(toast.timeoutId)
      }
      return prev.filter(toast => toast.id !== id)
    })
  }

  return { toasts, addToast, removeToast }
}

// Toast Component
export function Toast({ toast, onRemove }: { toast: ToastProps; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger animation
    setTimeout(() => setIsVisible(true), 10)
  }, [])

  const handleRemove = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(toast.id), 300)
  }



  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        max-w-xs w-auto ${getBgColor()} border rounded-md shadow-md px-3 py-2 mb-2
      `}
    >
      <div className="flex items-center space-x-2">
        <div className="flex-shrink-0">
          {/* 더 작은 아이콘 */}
          {toast.type === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
          {toast.type === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
          {toast.type === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-600" />}
          {toast.type === 'info' && <Info className="h-4 w-4 text-blue-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 leading-tight">
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-gray-600 mt-0.5 leading-tight">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={handleRemove}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors ml-1"
        >
          <XCircle className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// Toast Container
export function ToastContainer({ toasts, onRemove }: { toasts: ToastProps[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-50 space-y-1">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
} 