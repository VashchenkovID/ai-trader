import ReactDOM from 'react-dom/client';
import App from './App';

// Глобальные стили дизайн-системы (первыми!)
import './styles/global.css';

// Стили PrimeReact (порядок важен!)
import 'primereact/resources/themes/lara-light-blue/theme.css';  // Тема
import 'primereact/resources/primereact.min.css';                // Основные стили компонентов
import 'primeicons/primeicons.css';                              // Иконки

// Кастомные стили (перед PrimeFlex чтобы избежать конфликтов)
import './index.css';

// PrimeFlex (последним, чтобы grid система работала правильно)
import 'primeflex/primeflex.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
);
