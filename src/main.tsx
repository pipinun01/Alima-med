import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './lib/offline'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary title="Что-то сломалось при отрисовке" className="m-6">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

registerServiceWorker()
