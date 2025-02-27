import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import Toast from '../Toast'

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders with default props', () => {
    render(<Toast id="test" message="Test message" />)
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('renders with title', () => {
    render(<Toast id="test" title="Test Title" message="Test message" />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('renders with correct type styles', () => {
    const { container } = render(
      <Toast id="test" type="success" message="Success message" />
    )
    expect(container.firstChild).toHaveClass('success')
  })

  it('shows progress bar by default', () => {
    const { container } = render(<Toast id="test" message="Test message" />)
    expect(container.querySelector('.toast-progress')).toBeInTheDocument()
  })

  it('hides progress bar when progressBar is false', () => {
    const { container } = render(
      <Toast id="test" message="Test message" progressBar={false} />
    )
    expect(container.querySelector('.toast-progress')).not.toBeInTheDocument()
  })

  it('calls onClose when clicked and closeOnClick is true', () => {
    const onClose = jest.fn()
    render(
      <Toast
        id="test"
        message="Test message"
        onClose={onClose}
        closeOnClick={true}
      />
    )
    
    fireEvent.click(screen.getByText('Test message'))
    act(() => {
      jest.runAllTimers()
    })
    
    expect(onClose).toHaveBeenCalled()
  })

  it('pauses timer on hover when pauseOnHover is true', () => {
    const onClose = jest.fn()
    const { container } = render(
      <Toast
        id="test"
        message="Test message"
        onClose={onClose}
        duration={1000}
        pauseOnHover={true}
      />
    )

    // Hover over toast
    fireEvent.mouseEnter(container.firstChild as Element)
    
    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(2000)
    })

    // Toast should not be closed
    expect(onClose).not.toHaveBeenCalled()

    // Mouse leave
    fireEvent.mouseLeave(container.firstChild as Element)
    
    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(1000)
    })

    // Toast should be closed
    expect(onClose).toHaveBeenCalled()
  })

  it('supports RTL mode', () => {
    const { container } = render(
      <Toast id="test" message="Test message" rtl={true} />
    )
    expect(container.firstChild).toHaveClass('rtl')
  })

  it('applies custom className and style', () => {
    const { container } = render(
      <Toast
        id="test"
        message="Test message"
        className="custom-class"
        style={{ backgroundColor: 'red' }}
      />
    )
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveStyle({ backgroundColor: 'red' })
  })
}) 