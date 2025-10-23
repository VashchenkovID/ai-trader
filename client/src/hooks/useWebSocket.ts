import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data?: any;
  channel?: string;
  timestamp?: string;
}

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  sendMessage: (message: any) => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    url = `ws://${window.location.hostname}:3001/`,
    autoConnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscriptionsRef = useRef<Set<string>>(new Set());

  // Очистка таймаута переподключения
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Подключение к WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    // Проверяем доступность сервера
    try {
      const response = await fetch(`http://${window.location.hostname}:3001/health`);
      if (!response.ok) {
        throw new Error(`Server not responding: ${response.status}`);
      }
      console.log('✅ Server is available, connecting WebSocket...');
    } catch (error) {
      console.error('❌ Server not available:', error);
      setError('Сервер недоступен. Убедитесь, что сервер запущен на порту 3001');
      setIsConnecting(false);
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔌 WebSocket connected to:', url);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Восстанавливаем подписки
        subscriptionsRef.current.forEach(channel => {
          ws.send(JSON.stringify({ action: 'subscribe', channel }));
        });
        
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        
        onDisconnect?.();

        // Автоматическое переподключение
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`🔄 Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Превышено максимальное количество попыток переподключения');
        }
      };

      ws.onerror = (error) => {
        console.error('🔌 WebSocket error connecting to:', url, error);
        setError(`Ошибка подключения к WebSocket: ${url}`);
        setIsConnecting(false);
        onError?.(error);
      };

    } catch (error) {
      console.error('🔌 Failed to create WebSocket connection:', error);
      setError('Не удалось создать WebSocket соединение');
      setIsConnecting(false);
    }
  }, [url, maxReconnectAttempts, reconnectInterval, onConnect, onDisconnect, onError, onMessage]);

  // Отключение от WebSocket
  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttemptsRef.current = maxReconnectAttempts; // Предотвращаем автоматическое переподключение
  }, [clearReconnectTimeout, maxReconnectAttempts]);

  // Переподключение
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Отправка сообщения
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        setError('Ошибка отправки сообщения');
      }
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, []);

  // Подписка на канал
  const subscribe = useCallback((channel: string) => {
    subscriptionsRef.current.add(channel);
    sendMessage({ action: 'subscribe', channel });
  }, [sendMessage]);

  // Отписка от канала
  const unsubscribe = useCallback((channel: string) => {
    subscriptionsRef.current.delete(channel);
    sendMessage({ action: 'unsubscribe', channel });
  }, [sendMessage]);

  // Автоматическое подключение при монтировании
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      clearReconnectTimeout();
      disconnect();
    };
  }, [autoConnect]); // Убираем функции из зависимостей

  return {
    isConnected,
    isConnecting,
    error,
    sendMessage,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    reconnect
  };
};

export default useWebSocket;