/**
 * Простой тест WebSocket соединения
 */

export const testWebSocketConnection = () => {
  return new Promise((resolve, reject) => {
    console.log('🧪 Тестирование WebSocket соединения...');
    
    const ws = new WebSocket('ws://localhost:3001/');
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);
    
    ws.onopen = () => {
      console.log('✅ WebSocket соединение установлено');
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };
    
    ws.onerror = (error) => {
      console.error('❌ Ошибка WebSocket соединения:', error);
      clearTimeout(timeout);
      reject(error);
    };
    
    ws.onclose = (event) => {
      console.log('🔌 WebSocket соединение закрыто:', event.code, event.reason);
    };
  });
};

// Автоматический тест при загрузке модуля
if (typeof window !== 'undefined') {
  testWebSocketConnection()
    .then(() => {
      console.log('🎉 WebSocket тест пройден');
    })
    .catch((error) => {
      console.error('💥 WebSocket тест провален:', error);
    });
}