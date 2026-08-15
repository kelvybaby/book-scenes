import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/eb-garamond/latin-400.css'
import '@fontsource/eb-garamond/latin-500.css'
import '@fontsource/eb-garamond/latin-500-italic.css'
import App from './App.tsx'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
