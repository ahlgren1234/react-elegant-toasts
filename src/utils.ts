export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9)
}

export const getPositionStyle = (position: string): React.CSSProperties => {
  const positions: { [key: string]: React.CSSProperties } = {
    'top-left': { top: 0, left: 0 },
    'top-center': { top: 0, left: '50%', transform: 'translateX(-50%)' },
    'top-right': { top: 0, right: 0 },
    'bottom-left': { bottom: 0, left: 0 },
    'bottom-center': { bottom: 0, left: '50%', transform: 'translateX(-50%)' },
    'bottom-right': { bottom: 0, right: 0 },
  }
  return positions[position] || positions['top-right']
}

export const getAnimationStyle = (animation: string): string => {
  const animations: { [key: string]: string } = {
    slide: 'slideIn',
    fade: 'fadeIn',
    zoom: 'zoomIn',
    bounce: 'bounceIn',
  }
  return animations[animation] || animations['slide']
} 