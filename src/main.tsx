import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const container = document.getElementById('root');

if (container) {
  // No StrictMode: double-mounting would boot the Milkdown editor twice.
  createRoot(container).render(<App />);
}
