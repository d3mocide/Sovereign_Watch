/* eslint-disable react-refresh/only-export-components */
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { AuthProvider } from './hooks/useAuth'

const App = lazy(() => import('./App'))
const StatsDashboardView = lazy(() => import('./components/views/StatsDashboardView'))

const isStatsRoute = window.location.pathname === '/stats'

import { getToken, logout } from './api/auth'

const originalFetch = window.fetch
window.fetch = async (...args) => {
  const resource = args[0]
  let config = args[1]
  
  // Attach token to internal API requests (except for auth routes which don't need it)
  if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/')) {
    const token = getToken()
    if (token) {
      config = config || {}
      const headers = new Headers(config.headers || {})
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      config.headers = headers
    }
  }
  
  const response = await originalFetch(resource, config)
  
  // Cleanly handle expiration of tokens
  if (response.status === 401 && getToken()) {
    logout()
    window.location.reload()
  }
  
  return response
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-black text-[#0f0] font-mono animate-pulse">SYSTEM INITIALIZING...</div>}>
        {isStatsRoute ? <StatsDashboardView /> : <App />}
      </Suspense>
    </AuthProvider>
  </React.StrictMode>,
)
