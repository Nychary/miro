import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('В app.html нет элемента #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
