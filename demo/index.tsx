import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider, useToast, ToastPosition, ToastAnimation, ToastType } from '../src'
import '../src/styles.css'
import './styles.css'

interface ToastConfig {
  type: ToastType
  position: ToastPosition
  animation: ToastAnimation
  duration: number
  title: string
  message: string
  progressBar: boolean
  pauseOnHover: boolean
  closeOnClick: boolean
  rtl: boolean
}

const defaultConfig: ToastConfig = {
  type: 'info',
  position: 'top-right',
  animation: 'slide',
  duration: 5000,
  title: 'Notification',
  message: 'This is a toast message',
  progressBar: true,
  pauseOnHover: true,
  closeOnClick: true,
  rtl: false,
}

const ConfigPanel: React.FC<{
  config: ToastConfig
  onChange: (config: ToastConfig) => void
}> = ({ config, onChange }) => {
  const handleChange = (key: keyof ToastConfig, value: any) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="config-panel">
      <h2>Customize Toast</h2>
      <div className="config-grid">
        <div className="config-item">
          <label>Type:</label>
          <select
            value={config.type}
            onChange={(e) => handleChange('type', e.target.value)}
          >
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>

        <div className="config-item">
          <label>Position:</label>
          <select
            value={config.position}
            onChange={(e) => handleChange('position', e.target.value)}
          >
            <option value="top-left">Top Left</option>
            <option value="top-center">Top Center</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </div>

        <div className="config-item">
          <label>Animation:</label>
          <select
            value={config.animation}
            onChange={(e) => handleChange('animation', e.target.value)}
          >
            <option value="slide">Slide</option>
            <option value="fade">Fade</option>
            <option value="zoom">Zoom</option>
            <option value="bounce">Bounce</option>
          </select>
        </div>

        <div className="config-item">
          <label>Duration (ms):</label>
          <input
            type="number"
            value={config.duration}
            onChange={(e) => handleChange('duration', parseInt(e.target.value))}
            min={1000}
            step={500}
          />
        </div>

        <div className="config-item">
          <label>Title:</label>
          <input
            type="text"
            value={config.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />
        </div>

        <div className="config-item">
          <label>Message:</label>
          <input
            type="text"
            value={config.message}
            onChange={(e) => handleChange('message', e.target.value)}
          />
        </div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.progressBar}
              onChange={(e) => handleChange('progressBar', e.target.checked)}
            />
            Show Progress Bar
          </label>
        </div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.pauseOnHover}
              onChange={(e) => handleChange('pauseOnHover', e.target.checked)}
            />
            Pause on Hover
          </label>
        </div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.closeOnClick}
              onChange={(e) => handleChange('closeOnClick', e.target.checked)}
            />
            Close on Click
          </label>
        </div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.rtl}
              onChange={(e) => handleChange('rtl', e.target.checked)}
            />
            RTL
          </label>
        </div>
      </div>
    </div>
  )
}

const DemoPage = () => {
  const toast = useToast()
  const [config, setConfig] = useState<ToastConfig>(defaultConfig)

  const showToast = () => {
    toast.addToast(config)
  }

  const showPresets = () => {
    toast.addToast({
      type: 'success',
      title: 'Success!',
      message: 'Operation completed successfully',
      position: 'top-right',
      animation: 'slide',
    })

    setTimeout(() => {
      toast.addToast({
        type: 'error',
        title: 'Error',
        message: 'Something went wrong',
        position: 'bottom-left',
        animation: 'bounce',
      })
    }, 1000)

    setTimeout(() => {
      toast.addToast({
        type: 'warning',
        title: 'Warning',
        message: 'Please check your input',
        position: 'top-center',
        animation: 'zoom',
      })
    }, 2000)

    setTimeout(() => {
      toast.addToast({
        type: 'info',
        title: 'Info',
        message: 'New updates available',
        position: 'bottom-right',
        animation: 'fade',
      })
    }, 3000)
  }

  return (
    <div className="demo-container">
      <header className="demo-header">
        <h1>Toast Notifications Demo</h1>
        <p>A highly customizable toast notification system for React</p>
        <div className="demo-links">
          <a
            href="https://github.com/ahlgren1234/react-elegant-toasts"
            target="_blank"
            rel="noopener noreferrer"
            className="demo-link"
          >
            <svg height="24" width="24" viewBox="0 0 16 16" className="demo-icon">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" fill="currentColor"/>
            </svg>
            GitHub Repository
          </a>
          <a
            href="https://www.npmjs.com/package/react-elegant-toasts"
            target="_blank"
            rel="noopener noreferrer"
            className="demo-link"
          >
            <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
              <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z" fill="currentColor"/>
            </svg>
            npm Package
          </a>
          <a
            href="https://peterahlgren.com"
            target="_blank"
            rel="noopener noreferrer"
            className="demo-link portfolio"
          >
            <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22c-5.523 0-10-4.477-10-10S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm1-11v6h-2v-6H8l4-4 4 4h-3z" fill="currentColor"/>
            </svg>
            Portfolio
          </a>
          <a
            href="https://buymeacoffee.com/peterahlgren"
            target="_blank"
            rel="noopener noreferrer"
            className="demo-link coffee"
          >
            <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
              <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z" fill="currentColor"/>
            </svg>
            Buy me a coffee
          </a>
        </div>
      </header>

      <main className="demo-content">
        <div className="demo-actions">
          <button onClick={showToast} className="demo-button primary">
            Show Custom Toast
          </button>
          <button onClick={showPresets} className="demo-button secondary">
            Show All Presets
          </button>
          <button onClick={() => toast.removeAll()} className="demo-button danger">
            Remove All
          </button>
        </div>

        <ConfigPanel config={config} onChange={setConfig} />
      </main>

      <footer className="demo-footer">
        <p>Try different combinations of settings to see how the toast notifications behave!</p>
      </footer>
    </div>
  )
}

const Demo = () => {
  return (
    <ToastProvider>
      <DemoPage />
    </ToastProvider>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<Demo />)
} 