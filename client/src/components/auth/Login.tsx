import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Card } from 'primereact/card';
import { Message } from 'primereact/message';
import { authService } from '../../services/authService';
import './Login.css';

interface LoginProps {
  onLoginSuccess?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authService.login(username, password);
      
      if (response.success) {
        // Небольшая задержка для сохранения куки
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Проверяем, что токен действительно сохранен
        const token = authService.getToken();
        
        if (!token) {
          throw new Error('Токен не был сохранен');
        }
        
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'Ошибка авторизации. Проверьте имя пользователя и пароль.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <h1>Вход в систему</h1>
          <p className="login-subtitle">Торговый помощник</p>
        </div>

        {error && (
          <Message severity="error" text={error} className="login-error" />
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Имя пользователя</label>
            <InputText
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите имя пользователя"
              disabled={loading}
              autoFocus
              required
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Пароль</label>
            <Password
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              disabled={loading}
              required
              feedback={false}
              toggleMask
              className="login-input"
              inputClassName="login-input"
            />
          </div>

          <Button
            type="submit"
            label="Войти"
            icon="pi pi-sign-in"
            loading={loading}
            disabled={loading || !username || !password}
            className="login-button"
          />
        </form>

        <div className="login-footer">
          <p className="login-hint">
            Используйте учетные данные администратора для входа
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Login;

