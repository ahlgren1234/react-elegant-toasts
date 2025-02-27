import React from 'react'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ToastProvider, useToast } from '../ToastContext'

const TestComponent = () => {
  const toast = useToast()

  return (
    <div>
      <button onClick={() => toast.addToast({ message: 'Test toast' })}>
        Add Toast
      </button>
      <button onClick={() => toast.removeAll()}>Remove All</button>
    </div>
  )
}

describe('ToastProvider and useToast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('provides toast context to children', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    expect(screen.getByText('Add Toast')).toBeInTheDocument()
  })

  it('throws error when useToast is used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    expect(() => {
      render(<TestComponent />)
    }).toThrow('useToast must be used within a ToastProvider')
    
    consoleError.mockRestore()
  })

  it('adds toast with default configuration', () => {
    const { getByText } = render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    act(() => {
      getByText('Add Toast').click()
    })

    expect(screen.getByText('Test toast')).toBeInTheDocument()
  })

  it('removes all toasts', () => {
    const { getByText } = render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    // Add some toasts
    act(() => {
      getByText('Add Toast').click()
      getByText('Add Toast').click()
    })

    expect(screen.getAllByText('Test toast')).toHaveLength(2)

    // Remove all toasts
    act(() => {
      getByText('Remove All').click()
    })

    expect(screen.queryByText('Test toast')).not.toBeInTheDocument()
  })

  it('respects maxToasts configuration', () => {
    const { getByText } = render(
      <ToastProvider maxToasts={2}>
        <TestComponent />
      </ToastProvider>
    )

    // Add more toasts than the maximum
    act(() => {
      getByText('Add Toast').click()
      getByText('Add Toast').click()
      getByText('Add Toast').click()
    })

    // Should only show the maximum number of toasts
    expect(screen.getAllByText('Test toast')).toHaveLength(2)
  })

  it('applies default position and animation', () => {
    const { getByText } = render(
      <ToastProvider defaultPosition="bottom-left" defaultAnimation="fade">
        <TestComponent />
      </ToastProvider>
    )

    act(() => {
      getByText('Add Toast').click()
    })

    const toast = screen.getByText('Test toast').parentElement?.parentElement
    expect(toast).toHaveClass('fadeIn')
  })

  it('auto-removes toast after duration', () => {
    const { getByText } = render(
      <ToastProvider defaultDuration={1000}>
        <TestComponent />
      </ToastProvider>
    )

    act(() => {
      getByText('Add Toast').click()
    })

    expect(screen.getByText('Test toast')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(screen.queryByText('Test toast')).not.toBeInTheDocument()
  })
}) 