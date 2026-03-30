/* eslint-disable react-refresh/only-export-components */
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { AuthProvider } from './hooks/useAuth'

const App = lazy(() => import('./App'))
const StatsDashboardView = lazy(() => import('./components/views/StatsDashboardView'))

const isStatsRoute = window.location.pathname === '/stats'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-black text-[#0f0] font-mono animate-pulse">SYSTEM INITIALIZING...</div>}>
        {isStatsRoute ? <StatsDashboardView /> : <App />}
      </Suspense>
    </AuthProvider>
  </React.StrictMode>,
)
