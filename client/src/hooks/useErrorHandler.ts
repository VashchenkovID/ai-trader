import { useEffect } from 'react';

/**
 * Хук для глобального отлова ошибок JavaScript
 * Отлавливает ошибки, которые не поймал ErrorBoundary
 */
export const useErrorHandler = () => {
    useEffect(() => {
        // Обработчик для необработанных ошибок JavaScript
        const handleError = (event: ErrorEvent) => {
            console.error('🚨 Unhandled JavaScript Error:', event.error);
            
            // Отправляем ошибку на сервер только если есть реальная ошибка
            if (event.message && event.message !== 'undefined') {
                reportError({
                    message: event.message || 'Unknown JavaScript error',
                    stack: event.error?.stack || 'No stack trace available',
                    filename: event.filename || 'Unknown file',
                    lineno: event.lineno || 0,
                    colno: event.colno || 0,
                    type: 'javascript'
                });
            }
        };

        // Обработчик для необработанных промисов
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error('🚨 Unhandled Promise Rejection:', event.reason);
            
            // Отправляем ошибку на сервер только если есть реальная ошибка
            if (event.reason && event.reason !== 'undefined') {
                reportError({
                    message: `Unhandled Promise Rejection: ${event.reason}`,
                    stack: event.reason?.stack || 'No stack trace available',
                    type: 'promise'
                });
            }
        };

        // Добавляем обработчики
        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        // Очистка при размонтировании
        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);
};

/**
 * Отправка ошибки на сервер
 */
const reportError = async (errorData: {
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    type: 'javascript' | 'promise';
}) => {
    try {
        // Фильтруем undefined значения
        const cleanErrorData = {
            error: errorData.message,
            context: {
                stack: errorData.stack,
                filename: errorData.filename,
                lineno: errorData.lineno,
                colno: errorData.colno,
                type: errorData.type,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            },
            severity: 'error'
        };

        await fetch('/api/errors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(cleanErrorData)
        });
    } catch (reportingError) {
        console.error('Failed to report error:', reportingError);
    }
};

export default useErrorHandler;
