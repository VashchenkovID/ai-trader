import axios from 'axios';
import Cookies from 'js-cookie';

// В продакшене используем относительный путь через nginx proxy
const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Для работы с куками
});

// Интерцептор для добавления токена в заголовки
api.interceptors.request.use(
  (config) => {
    // Пытаемся получить токен из куки
    let token = Cookies.get('auth_token');
    
    // Если токен не найден в куки или обрезан, пытаемся получить из localStorage
    if (!token || (token && token.length < 100)) {
      try {
        const localStorageToken = localStorage.getItem('auth_token');
        if (localStorageToken && (!token || localStorageToken.length > token.length)) {
          token = localStorageToken;
          // Пытаемся восстановить в куки
          try {
            Cookies.set('auth_token', token, {
              expires: 7,
              secure: import.meta.env?.PROD || false,
              sameSite: 'lax',
              path: '/',
            });
          } catch (e) {
            // Игнорируем ошибки восстановления токена в куки
          }
        }
      } catch (e) {
        // Игнорируем ошибки чтения из localStorage
      }
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен недействителен или истек
      Cookies.remove('auth_token');
      Cookies.remove('user');
      try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      } catch (e) {
        // Игнорируем ошибки очистки localStorage
      }
      // НЕ делаем автоматический редирект, чтобы избежать бесконечных циклов
      // Редирект будет обработан в ProtectedRoute
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  fullName: string;
  lastLogin?: string;
  createdAt?: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

class AuthService {
  private readonly TOKEN_COOKIE_NAME = 'auth_token';
  private readonly USER_COOKIE_NAME = 'user';
  private readonly TOKEN_EXPIRY_DAYS = 7;

  /**
   * Авторизация пользователя
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await api.post<LoginResponse>('/api/auth/login', {
        username,
        password,
      });

      if (response.data.success && response.data.data.token) {
        // Сохраняем токен в куки
        const isProduction = import.meta.env?.PROD || false;
        const token = response.data.data.token;
        
        // Сохраняем токен в куки с явным указанием пути и домена
        try {
          Cookies.set(this.TOKEN_COOKIE_NAME, token, {
            expires: this.TOKEN_EXPIRY_DAYS,
            secure: isProduction,
            sameSite: 'lax',
            path: '/',
          });
          
          // Также сохраняем в localStorage как резервный вариант
          try {
            localStorage.setItem(this.TOKEN_COOKIE_NAME, token);
          } catch (e) {
            // Игнорируем ошибки сохранения в localStorage
          }
        } catch (cookieError) {
          // Сохраняем в localStorage как резервный вариант
          try {
            localStorage.setItem(this.TOKEN_COOKIE_NAME, token);
          } catch (e) {
            // Критическая ошибка: не удалось сохранить токен
            console.error('Не удалось сохранить токен авторизации');
          }
        }

        // Сохраняем информацию о пользователе в куки
        Cookies.set(this.USER_COOKIE_NAME, JSON.stringify(response.data.data.user), {
          expires: this.TOKEN_EXPIRY_DAYS,
          secure: isProduction,
          sameSite: 'lax',
        });
      }

      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Выход из системы
   */
  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Удаляем куки
      Cookies.remove(this.TOKEN_COOKIE_NAME);
      Cookies.remove(this.USER_COOKIE_NAME);
      // Удаляем из localStorage
      try {
        localStorage.removeItem(this.TOKEN_COOKIE_NAME);
        localStorage.removeItem(this.USER_COOKIE_NAME);
      } catch (e) {
        console.warn('[AuthService] Не удалось удалить токен из localStorage:', e);
      }
    }
  }

  /**
   * Получение информации о текущем пользователе
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await api.get<{ success: boolean; data: User }>('/api/auth/me');
      return response.data.data;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  /**
   * Проверка токена (использует /me endpoint, который уже защищен)
   */
  async verifyToken(): Promise<boolean> {
    try {
      const token = this.getToken();
      if (!token) {
        return false;
      }
      // Используем /me endpoint, который проверяет токен через middleware authenticate
      const response = await api.get<{ success: boolean; data: User }>('/api/auth/me');
      return response.data.success && !!response.data.data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Получение токена из куки или localStorage
   */
  getToken(): string | null {
    let token = Cookies.get(this.TOKEN_COOKIE_NAME);
    
    // Если токен обрезан или не найден, пытаемся получить из localStorage
    if (!token || token.length < 100) {
      try {
        const localStorageToken = localStorage.getItem(this.TOKEN_COOKIE_NAME);
        if (localStorageToken && (!token || localStorageToken.length > token.length)) {
          token = localStorageToken;
        }
      } catch (e) {
        console.warn('[AuthService] Не удалось прочитать токен из localStorage:', e);
      }
    }
    
    return token || null;
  }

  /**
   * Получение пользователя из куки
   */
  getUser(): User | null {
    const userCookie = Cookies.get(this.USER_COOKIE_NAME);
    if (userCookie) {
      try {
        return JSON.parse(userCookie);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Проверка авторизации
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Очистка данных авторизации
   */
  clearAuth(): void {
    Cookies.remove(this.TOKEN_COOKIE_NAME);
    Cookies.remove(this.USER_COOKIE_NAME);
    try {
      localStorage.removeItem(this.TOKEN_COOKIE_NAME);
      localStorage.removeItem(this.USER_COOKIE_NAME);
    } catch (e) {
      console.warn('[AuthService] Не удалось очистить localStorage:', e);
    }
  }
}

export const authService = new AuthService();
export { api as authApi };

