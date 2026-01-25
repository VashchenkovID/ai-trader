/**
 * Утилита для логирования с сохранением в localStorage
 * Позволяет видеть логи даже после перезагрузки страницы
 */

const MAX_LOG_ENTRIES = 100;

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];

  constructor() {
    // Загружаем логи из localStorage при инициализации
    this.loadLogs();
    
    // Перехватываем console методы
    this.interceptConsole();
  }

  private loadLogs() {
    try {
      const saved = localStorage.getItem('app_logs');
      if (saved) {
        this.logs = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Ошибка загрузки логов из localStorage:', error);
    }
  }

  private saveLogs() {
    try {
      // Сохраняем только последние MAX_LOG_ENTRIES записей
      const logsToSave = this.logs.slice(-MAX_LOG_ENTRIES);
      localStorage.setItem('app_logs', JSON.stringify(logsToSave));
    } catch (error) {
      console.error('Ошибка сохранения логов в localStorage:', error);
    }
  }

  private interceptConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    console.log = (...args: any[]) => {
      this.addLog('log', args.join(' '), args);
      originalLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.addLog('warn', args.join(' '), args);
      originalWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
      this.addLog('error', args.join(' '), args);
      originalError.apply(console, args);
    };

    console.info = (...args: any[]) => {
      this.addLog('info', args.join(' '), args);
      originalInfo.apply(console, args);
    };
  }

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    this.logs.push(entry);
    this.saveLogs();
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem('app_logs');
  }

  printLogs() {
    console.group('📋 Сохраненные логи');
    this.logs.forEach(log => {
      const style = log.level === 'error' ? 'color: red' : 
                   log.level === 'warn' ? 'color: orange' : 
                   'color: blue';
      console.log(`%c[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`, style, log.data || '');
    });
    console.groupEnd();
  }
}

// Создаем глобальный экземпляр
export const logger = new Logger();

// Добавляем метод в window для доступа из консоли
if (typeof window !== 'undefined') {
  (window as any).showLogs = () => logger.printLogs();
  (window as any).clearLogs = () => logger.clearLogs();
}

