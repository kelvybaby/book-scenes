import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/eb-garamond/latin-400.css'
import '@fontsource/eb-garamond/latin-500.css'
import '@fontsource/eb-garamond/latin-500-italic.css'
import App from './App.tsx'
import { ButterflyModelShowcase } from './labs/butterfly-models/ButterflyModelShowcase.tsx'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
const activeLab = new URLSearchParams(window.location.search).get('lab')

root.render(
  <StrictMode>
    {activeLab === 'butterfly-models' ? <ButterflyModelShowcase /> : <App />}
  </StrictMode>,
)
