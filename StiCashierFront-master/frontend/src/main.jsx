import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const apiBaseUrl = import.meta.env.VITE_API_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : ''
)

const nativeFetch = window.fetch.bind(window)
window.fetch = async (resource, options) => {
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    return nativeFetch(`${apiBaseUrl}${resource}`, options)
  }
  return nativeFetch(resource, options)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
