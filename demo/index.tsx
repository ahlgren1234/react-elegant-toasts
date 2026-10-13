import { createRoot } from 'react-dom/client';
import 'react-elegant-toasts/styles.css';
import './styles/tokens.css';
import './styles/styles.css';
import { App } from './App';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
