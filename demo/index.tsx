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