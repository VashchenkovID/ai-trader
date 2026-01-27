import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { Button, Card, Badge, ProgressBar, Skeleton, Input, Select, Modal, Table } from '../../components/ui';
import './DesignSystemTest.css';

const DesignSystemTest: React.FC = () => {
  const { theme, themeName, toggleTheme } = useTheme();
  const [loading] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [modalOpen, setModalOpen] = useState<{ [key: string]: boolean }>({});
  const sectionsRef = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const sections = [
    { id: 'overview', label: 'Обзор', icon: '📋' },
    { id: 'theme', label: 'Тема', icon: '🎨' },
    { id: 'button', label: 'Button', icon: '🔘' },
    { id: 'card', label: 'Card', icon: '🃏' },
    { id: 'badge', label: 'Badge', icon: '🏷️' },
    { id: 'input', label: 'Input', icon: '📝' },
    { id: 'select', label: 'Select', icon: '📋' },
    { id: 'progress', label: 'ProgressBar', icon: '📊' },
    { id: 'skeleton', label: 'Skeleton', icon: '💀' },
    { id: 'modal', label: 'Modal', icon: '🪟' },
    { id: 'table', label: 'Table', icon: '📊' },
    { id: 'colors', label: 'Цвета', icon: '🎨' },
    { id: 'gradients', label: 'Градиенты', icon: '🌈' },
    { id: 'typography', label: 'Типографика', icon: '📖' },
    { id: 'effects', label: 'Эффекты', icon: '✨' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 200;
      
      for (const section of sections) {
        const element = sectionsRef.current[section.id];
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = sectionsRef.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
    }
  };

  return (
    <div className="design-system-test">
      {/* Боковая навигация */}
      <aside className="test-sidebar">
        <div className="sidebar-header">
          <h2>Навигация</h2>
        </div>
        <nav className="sidebar-nav">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => scrollToSection(section.id)}
            >
              <span className="nav-icon">{section.icon}</span>
              <span className="nav-label">{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="container">
        {/* Заголовок */}
        <div className="section" ref={(el) => (sectionsRef.current['overview'] = el)}>
          <div className="section-header">
            <h1 className="section-title">🎨 Тестирование дизайн-системы</h1>
            <p className="section-description">
              Интерактивная документация и тестовая площадка для всех компонентов и стилей новой дизайн-системы
            </p>
          </div>
          
          <div className="info-grid">
            <Card variant="glass" hover>
              <div className="info-card">
                <div className="info-icon">📦</div>
                <h3>Компоненты</h3>
                <p>9 готовых UI-компонентов</p>
              </div>
            </Card>
            <Card variant="glass" hover>
              <div className="info-card">
                <div className="info-icon">🎨</div>
                <h3>Темы</h3>
                <p>Темная и светлая темы</p>
              </div>
            </Card>
            <Card variant="glass" hover>
              <div className="info-card">
                <div className="info-icon">✨</div>
                <h3>Эффекты</h3>
                <p>Glassmorphism, градиенты, анимации</p>
              </div>
            </Card>
            <Card variant="glass" hover>
              <div className="info-card">
                <div className="info-icon">📱</div>
                <h3>Адаптивность</h3>
                <p>Полная поддержка мобильных устройств</p>
              </div>
            </Card>
          </div>
        </div>

        {/* Управление темой */}
        <div className="section glass" ref={(el) => (sectionsRef.current['theme'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🎨 Управление темой</h2>
            <p className="section-description">
              Переключение между темной и светлой темами. Тема сохраняется в localStorage.
            </p>
          </div>
          
          <Card variant="default" hover>
            <div className="theme-controls">
              <div className="theme-info">
                <Badge variant={themeName === 'dark' ? 'primary' : 'neutral'} size="lg">
                  Текущая тема: {themeName === 'dark' ? '🌙 Темная' : '☀️ Светлая'}
                </Badge>
                <p className="theme-description">
                  Все компоненты автоматически адаптируются под выбранную тему
                </p>
              </div>
              <Button variant="secondary" onClick={toggleTheme} size="lg">
                Переключить на {themeName === 'dark' ? '☀️ Светлую' : '🌙 Темную'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Кнопки */}
        <div className="section glass" ref={(el) => (sectionsRef.current['button'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🔘 Button компонент</h2>
            <p className="section-description">
              Универсальная кнопка с поддержкой различных вариантов, размеров, состояний загрузки и иконок.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>variant</code>
                <span>primary | secondary | ghost | danger | success</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>loading</code>
                <span>boolean</span>
              </div>
              <div className="prop-item">
                <code>icon</code>
                <span>ReactNode</span>
              </div>
              <div className="prop-item">
                <code>iconPosition</code>
                <span>left | right</span>
              </div>
              <div className="prop-item">
                <code>fullWidth</code>
                <span>boolean</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Различные стили кнопок для разных контекстов использования</p>
            <div className="button-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="success">Success</Button>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Три размера для разных уровней важности и контекста</p>
            <div className="button-row">
              <div className="example-item">
                <Button variant="primary" size="sm">Small</Button>
                <small>sm - компактный размер</small>
              </div>
              <div className="example-item">
                <Button variant="primary" size="md">Medium</Button>
                <small>md - стандартный размер</small>
              </div>
              <div className="example-item">
                <Button variant="primary" size="lg">Large</Button>
                <small>lg - крупный размер</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Состояния (states)</h3>
            <p className="group-description">Различные состояния кнопки: загрузка, отключена, полная ширина</p>
            <div className="button-row">
              <div className="example-item">
                <Button variant="primary" loading={loading}>
                  {loading ? 'Загрузка...' : 'Loading'}
                </Button>
                <small>loading - показывает спиннер</small>
              </div>
              <div className="example-item">
                <Button variant="primary" disabled>
                  Disabled
                </Button>
                <small>disabled - неактивное состояние</small>
              </div>
              <div className="example-item">
                <Button variant="primary" fullWidth>
                  Full Width
                </Button>
                <small>fullWidth - на всю ширину</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">С иконками</h3>
            <p className="group-description">Поддержка иконок слева или справа от текста</p>
            <div className="button-row">
              <Button 
                variant="primary" 
                icon={<span>✓</span>} 
                iconPosition="left"
              >
                С иконкой слева
              </Button>
              <Button 
                variant="primary" 
                icon={<span>→</span>} 
                iconPosition="right"
              >
                С иконкой справа
              </Button>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Пример кода</h3>
            <Card variant="default">
              <pre className="code-example">
{`<Button 
  variant="primary" 
  size="md"
  loading={isLoading}
  icon={<Icon />}
  iconPosition="left"
  onClick={handleClick}
>
  Нажми меня
</Button>`}
              </pre>
            </Card>
          </div>
        </div>

        {/* Цвета */}
        <div className="section glass" ref={(el) => (sectionsRef.current['colors'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🎨 Цветовая палитра</h2>
            <p className="section-description">
              Полная палитра цветов дизайн-системы, адаптированная под темную и светлую темы.
            </p>
          </div>
          
          <div className="color-grid">
            <div className="color-group">
              <h3 className="group-title">Фоны</h3>
              <div className="color-item" style={{ backgroundColor: theme.colors.background.primary }}>
                <span>Primary</span>
                <code>{theme.colors.background.primary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.background.secondary }}>
                <span>Secondary</span>
                <code>{theme.colors.background.secondary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.background.tertiary }}>
                <span>Tertiary</span>
                <code>{theme.colors.background.tertiary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.background.elevated }}>
                <span>Elevated</span>
                <code>{theme.colors.background.elevated}</code>
              </div>
            </div>

            <div className="color-group">
              <h3 className="group-title">Поверхности</h3>
              <div className="color-item" style={{ backgroundColor: theme.colors.surface.default }}>
                <span>Default</span>
                <code>{theme.colors.surface.default}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.surface.hover }}>
                <span>Hover</span>
                <code>{theme.colors.surface.hover}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.surface.active }}>
                <span>Active</span>
                <code>{theme.colors.surface.active}</code>
              </div>
              <div className="color-item glass" style={{ backgroundColor: theme.colors.surface.glass }}>
                <span>Glass</span>
                <code>{theme.colors.surface.glass}</code>
              </div>
            </div>

            <div className="color-group">
              <h3 className="group-title">Акценты</h3>
              <div className="color-item" style={{ backgroundColor: theme.colors.accent.primary }}>
                <span>Primary</span>
                <code>{theme.colors.accent.primary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.accent.success }}>
                <span>Success</span>
                <code>{theme.colors.accent.success}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.accent.error }}>
                <span>Error</span>
                <code>{theme.colors.accent.error}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.accent.warning }}>
                <span>Warning</span>
                <code>{theme.colors.accent.warning}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.accent.info }}>
                <span>Info</span>
                <code>{theme.colors.accent.info}</code>
              </div>
            </div>

            <div className="color-group">
              <h3 className="group-title">Текст</h3>
              <div className="color-item" style={{ backgroundColor: theme.colors.text.primary, color: theme.colors.background.primary }}>
                <span>Primary</span>
                <code>{theme.colors.text.primary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.text.secondary, color: theme.colors.background.primary }}>
                <span>Secondary</span>
                <code>{theme.colors.text.secondary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.text.tertiary, color: theme.colors.background.primary }}>
                <span>Tertiary</span>
                <code>{theme.colors.text.tertiary}</code>
              </div>
              <div className="color-item" style={{ backgroundColor: theme.colors.text.disabled, color: theme.colors.background.primary }}>
                <span>Disabled</span>
                <code>{theme.colors.text.disabled}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Градиенты */}
        <div className="section glass" ref={(el) => (sectionsRef.current['gradients'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🌈 Градиенты</h2>
            <p className="section-description">
              Статические и анимированные градиенты для различных элементов интерфейса. Все градиенты используют 3 цвета для плавного перехода.
            </p>
          </div>
          
          <div className="gradient-group">
            <h3 className="group-title">Основные градиенты</h3>
            <div className="gradient-grid">
              <div 
                className="gradient-item gradient-primary" 
                style={{ background: theme.colors.gradients.primary }}
              >
                <span>Primary</span>
                <small>3 цвета</small>
              </div>
              <div 
                className="gradient-item gradient-success" 
                style={{ background: theme.colors.gradients.success }}
              >
                <span>Success</span>
                <small>3 цвета</small>
              </div>
              <div 
                className="gradient-item gradient-error" 
                style={{ background: theme.colors.gradients.error }}
              >
                <span>Error</span>
                <small>3 цвета</small>
              </div>
              <div 
                className="gradient-item gradient-warning" 
                style={{ background: theme.colors.gradients.warning }}
              >
                <span>Warning</span>
                <small>3 цвета</small>
              </div>
              <div 
                className="gradient-item gradient-info" 
                style={{ background: theme.colors.gradients.info }}
              >
                <span>Info</span>
                <small>3 цвета</small>
              </div>
            </div>
          </div>

          <div className="gradient-group">
            <h3 className="group-title">Анимированные градиенты</h3>
            <div className="gradient-grid">
              <div 
                className="gradient-item gradient-primary-animated"
              >
                <span>Primary Animated</span>
                <small>Плавная анимация</small>
              </div>
              <div 
                className="gradient-item gradient-success-animated"
              >
                <span>Success Animated</span>
                <small>Плавная анимация</small>
              </div>
              <div 
                className="gradient-item gradient-error-animated"
              >
                <span>Error Animated</span>
                <small>Плавная анимация</small>
              </div>
            </div>
          </div>

          <div className="gradient-group">
            <h3 className="group-title">Специальные градиенты</h3>
            <div className="gradient-grid">
              <div 
                className="gradient-item gradient-glass" 
                style={{ background: theme.colors.gradients.glass }}
              >
                <span>Glass</span>
                <small>Для glassmorphism</small>
              </div>
              <div 
                className="gradient-item gradient-sunset" 
                style={{ background: theme.colors.gradients.sunset }}
              >
                <span>Sunset</span>
                <small>Оранжево-розовый</small>
              </div>
              <div 
                className="gradient-item gradient-ocean" 
                style={{ background: theme.colors.gradients.ocean }}
              >
                <span>Ocean</span>
                <small>Голубо-фиолетовый</small>
              </div>
              <div 
                className="gradient-item gradient-neon" 
                style={{ background: theme.colors.gradients.neon }}
              >
                <span>Neon</span>
                <small>Неоновый эффект</small>
              </div>
            </div>
          </div>
        </div>

        {/* Типографика */}
        <div className="section glass" ref={(el) => (sectionsRef.current['typography'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">📖 Типографика</h2>
            <p className="section-description">
              Система типографики с предопределенными стилями для заголовков, текста и чисел.
            </p>
          </div>
          
          <div className="typography-group">
            <h1 style={theme.typography.styles.h1}>Заголовок H1</h1>
            <h2 style={theme.typography.styles.h2}>Заголовок H2</h2>
            <h3 style={theme.typography.styles.h3}>Заголовок H3</h3>
            <h4 style={theme.typography.styles.h4}>Заголовок H4</h4>
            <h5 style={theme.typography.styles.h5}>Заголовок H5</h5>
            <h6 style={theme.typography.styles.h6}>Заголовок H6</h6>
            
            <p style={theme.typography.styles.body}>
              Обычный текст (Body). Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            
            <p style={theme.typography.styles.bodyLarge}>
              Большой текст (Body Large). Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            
            <p style={theme.typography.styles.bodySmall}>
              Маленький текст (Body Small). Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            
            <p style={theme.typography.styles.caption}>
              Подпись (Caption). Lorem ipsum dolor sit amet.
            </p>
          </div>

          <div className="typography-group">
            <h3 className="group-title">Числа (моноширинный шрифт)</h3>
            <div className="number-examples">
              <span className="number" style={theme.typography.styles.number}>
                1,234,567.89 ₽
              </span>
              <span className="number-large" style={theme.typography.styles.numberLarge}>
                1,234,567.89 ₽
              </span>
              <span className="number-xlarge" style={theme.typography.styles.numberXLarge}>
                1,234,567.89 ₽
              </span>
            </div>
          </div>
        </div>

        {/* Glassmorphism */}
        <div className="section" style={{ 
          background: `linear-gradient(135deg, ${theme.colors.accent.primary}20 0%, ${theme.colors.accent.success}20 100%)`,
          position: 'relative',
          overflow: 'hidden'
        }} ref={(el) => (sectionsRef.current['effects'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">✨ Эффекты</h2>
            <p className="section-description">
              Glassmorphism эффекты, тени и glow эффекты для создания глубины и визуального интереса.
            </p>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Glassmorphism эффекты</h3>
            <p className="group-description">
              Эффект стекла с размытием фона. Для лучшего эффекта нужен контрастный фон позади элемента.
            </p>
          
          <div className="glass-grid">
            <div className="glass-card glass" style={{ position: 'relative', zIndex: 1 }}>
              <h3>Glass Card</h3>
              <p>Карточка с glassmorphism эффектом (blur 12px)</p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-2)' }}>
                Прозрачный фон с размытием
              </p>
            </div>
            
            <div className="glass-card glass-strong" style={{ position: 'relative', zIndex: 1 }}>
              <h3>Glass Strong</h3>
              <p>Карточка с более сильным blur эффектом (blur 20px)</p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-2)' }}>
                Более непрозрачный фон с сильным размытием
              </p>
            </div>
          </div>
          
          {/* Демонстрация на градиентном фоне */}
          <div style={{ 
            marginTop: 'var(--spacing-6)',
            padding: 'var(--spacing-6)',
            background: `linear-gradient(135deg, ${theme.colors.accent.primary}40 0%, ${theme.colors.accent.error}40 100%)`,
            borderRadius: 'var(--radius-lg)',
            position: 'relative'
          }}>
            <h3 style={{ marginBottom: 'var(--spacing-4)' }}>Пример на градиентном фоне</h3>
            <div className="glass-card glass" style={{ position: 'relative', zIndex: 1 }}>
              <h4>Glass на градиенте</h4>
              <p>Здесь эффект glassmorphism должен быть более заметен благодаря контрастному фону</p>
            </div>
          </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Тени (Shadows)</h3>
            <p className="group-description">
              Система теней для создания глубины и иерархии элементов.
            </p>
          
            <div className="shadow-grid">
            <div className="shadow-item" style={{ boxShadow: theme.shadows.sm }}>
              <span>Small Shadow</span>
            </div>
            <div className="shadow-item" style={{ boxShadow: theme.shadows.base }}>
              <span>Base Shadow</span>
            </div>
            <div className="shadow-item" style={{ boxShadow: theme.shadows.md }}>
              <span>Medium Shadow</span>
            </div>
            <div className="shadow-item" style={{ boxShadow: theme.shadows.lg }}>
              <span>Large Shadow</span>
            </div>
            <div className="shadow-item" style={{ boxShadow: theme.shadows.xl }}>
              <span>XL Shadow</span>
            </div>
          </div>

          <div className="glow-grid">
            <h3 className="group-title">Glow эффекты</h3>
            <div className="glow-item" style={{ boxShadow: theme.shadows.glow.primary }}>
              <span>Primary Glow</span>
            </div>
            <div className="glow-item" style={{ boxShadow: theme.shadows.glow.success }}>
              <span>Success Glow</span>
            </div>
            <div className="glow-item" style={{ boxShadow: theme.shadows.glow.error }}>
              <span>Error Glow</span>
            </div>
            <div className="glow-item" style={{ boxShadow: theme.shadows.glow.warning }}>
              <span>Warning Glow</span>
            </div>
            <div className="glow-item" style={{ boxShadow: theme.shadows.glow.info }}>
              <span>Info Glow</span>
            </div>
          </div>
          
            <div className="glow-grid" style={{ marginTop: 'var(--spacing-6)' }}>
              <h3 className="group-title">Strong Glow эффекты</h3>
              <div className="glow-item" style={{ boxShadow: theme.shadows.glow.primaryStrong }}>
                <span>Primary Strong</span>
              </div>
              <div className="glow-item" style={{ boxShadow: theme.shadows.glow.successStrong }}>
                <span>Success Strong</span>
              </div>
              <div className="glow-item" style={{ boxShadow: theme.shadows.glow.errorStrong }}>
                <span>Error Strong</span>
              </div>
              <div className="glow-item" style={{ boxShadow: theme.shadows.glow.warningStrong }}>
                <span>Warning Strong</span>
              </div>
              <div className="glow-item" style={{ boxShadow: theme.shadows.glow.infoStrong }}>
                <span>Info Strong</span>
              </div>
            </div>
          </div>
        </div>

        {/* Spacing */}
        <div className="section glass">
          <h2 className="section-subtitle">Отступы (Spacing)</h2>
          
          <div className="spacing-examples">
            {[1, 2, 3, 4, 6, 8, 12, 16].map((size) => (
              <div key={size} className="spacing-item">
                <div 
                  className="spacing-box" 
                  style={{ 
                    width: theme.spacing[size as keyof typeof theme.spacing],
                    height: theme.spacing[size as keyof typeof theme.spacing],
                    backgroundColor: theme.colors.accent.primary,
                  }}
                />
                <span>{size} ({theme.spacing[size as keyof typeof theme.spacing]})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="section glass">
          <h2 className="section-subtitle">Border Radius</h2>
          
          <div className="radius-examples">
            {(['sm', 'base', 'md', 'lg', 'xl'] as const).map((size) => (
              <div key={size} className="radius-item">
                <div 
                  className="radius-box" 
                  style={{ 
                    borderRadius: theme.borderRadius[size],
                    backgroundColor: theme.colors.accent.primary,
                  }}
                />
                <span>{size} ({theme.borderRadius[size]})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['card'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🃏 Card компонент</h2>
            <p className="section-description">
              Универсальный контейнер для контента с различными вариантами стилизации и эффектами hover.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>variant</code>
                <span>default | glass | elevated | interactive</span>
              </div>
              <div className="prop-item">
                <code>hover</code>
                <span>boolean - эффект при наведении</span>
              </div>
              <div className="prop-item">
                <code>header</code>
                <span>ReactNode - заголовок карточки</span>
              </div>
              <div className="prop-item">
                <code>footer</code>
                <span>ReactNode - подвал карточки</span>
              </div>
            </div>
          </div>
          
          <div className="card-grid">
            <Card variant="default" hover header="Default Card">
              <p>Обычная карточка с градиентной полоской сверху при hover</p>
              <Badge variant="primary" size="sm" style={{ marginTop: 'var(--spacing-2)' }}>
                Hover меня
              </Badge>
            </Card>
            
            <Card variant="glass" hover header="Glass Card">
              <p>Карточка с glassmorphism эффектом и градиентным overlay</p>
              <Badge variant="info" size="sm" style={{ marginTop: 'var(--spacing-2)' }}>
                Glass эффект
              </Badge>
            </Card>
            
            <Card variant="elevated" hover header="Elevated Card">
              <p>Карточка с тенью и градиентной рамкой при hover</p>
              <Badge variant="success" size="sm" style={{ marginTop: 'var(--spacing-2)' }}>
                Поднятая
              </Badge>
            </Card>
            
            <Card variant="interactive" hover header="Interactive Card">
              <p>Интерактивная карточка с радиальным эффектом при hover</p>
              <Badge variant="warning" size="sm" style={{ marginTop: 'var(--spacing-2)' }}>
                Кликабельная
              </Badge>
            </Card>
            
            <Card 
              variant="default" 
              hover
              header={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Card с Footer</span>
                  <Badge variant="primary" size="sm">New</Badge>
                </div>
              }
              footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Footer текст</span>
                  <Button variant="ghost" size="sm">Действие</Button>
                </div>
              }
            >
              <p>Карточка с header и footer, демонстрирующая гибкость компонента</p>
            </Card>

            <Card variant="glass" hover header="Градиентная карточка">
              <div 
                style={{ 
                  padding: 'var(--spacing-4)', 
                  borderRadius: 'var(--radius-base)',
                  background: theme.colors.gradients.ocean,
                  marginTop: 'var(--spacing-2)'
                }}
              >
                <p style={{ margin: 0, color: 'white', fontWeight: 600 }}>
                  Внутренний градиентный блок
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Badge компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['badge'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🏷️ Badge компонент</h2>
            <p className="section-description">
              Компактный индикатор для отображения статусов, меток и другой важной информации.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>variant</code>
                <span>success | error | warning | info | primary | neutral</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>icon</code>
                <span>string - иконка перед текстом</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Варианты</h3>
            <div className="badge-row">
              <Badge variant="success">Success</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </div>
          </div>

          <div className="badge-group">
            <h3 className="group-title">Размеры</h3>
            <div className="badge-row">
              <Badge variant="primary" size="sm">Small</Badge>
              <Badge variant="primary" size="md">Medium</Badge>
              <Badge variant="primary" size="lg">Large</Badge>
            </div>
          </div>

          <div className="badge-group">
            <h3 className="group-title">С иконками</h3>
            <div className="badge-row">
              <Badge variant="success" icon="✓">Успешно</Badge>
              <Badge variant="error" icon="✕">Ошибка</Badge>
              <Badge variant="warning" icon="⚠">Предупреждение</Badge>
            </div>
          </div>
        </div>

        {/* ProgressBar компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['progress'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">📊 ProgressBar компонент</h2>
            <p className="section-description">
              Индикатор прогресса с поддержкой различных цветовых вариантов, размеров и анимации.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>value</code>
                <span>number (0-100) - значение прогресса</span>
              </div>
              <div className="prop-item">
                <code>variant</code>
                <span>default | success | error | warning | info</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>animated</code>
                <span>boolean - анимация заполнения</span>
              </div>
              <div className="prop-item">
                <code>showLabel</code>
                <span>boolean - показывать процент</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Цветовые варианты для разных типов информации</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <ProgressBar value={75} variant="default" showLabel />
              <ProgressBar value={60} variant="success" showLabel />
              <ProgressBar value={40} variant="error" showLabel />
              <ProgressBar value={50} variant="warning" showLabel />
              <ProgressBar value={80} variant="info" showLabel />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Три размера для разных контекстов</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div className="example-item">
                <ProgressBar value={70} size="sm" showLabel />
                <small>sm</small>
              </div>
              <div className="example-item">
                <ProgressBar value={70} size="md" showLabel />
                <small>md</small>
              </div>
              <div className="example-item">
                <ProgressBar value={70} size="lg" showLabel />
                <small>lg</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Анимированный прогресс</h3>
            <p className="group-description">Плавная анимация заполнения с shimmer эффектом</p>
            <ProgressBar value={loading ? 100 : 0} variant="default" showLabel animated />
            <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-2)' }}>
              Нажмите кнопку "Нажми меня" в секции Button, чтобы увидеть анимацию
            </p>
          </div>
        </div>

        {/* Skeleton компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['skeleton'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">💀 Skeleton компонент</h2>
            <p className="section-description">
              Компонент для отображения состояния загрузки с различными вариантами и анимациями.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>variant</code>
                <span>text | circular | rectangular</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg (для circular)</span>
              </div>
              <div className="prop-item">
                <code>width</code>
                <span>string - ширина (для text/rectangular)</span>
              </div>
              <div className="prop-item">
                <code>height</code>
                <span>string - высота (для text/rectangular)</span>
              </div>
              <div className="prop-item">
                <code>animation</code>
                <span>pulse | wave | none</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Три типа скелетонов: текст, прямоугольник, круг</p>
            <div className="skeleton-examples">
              <div className="example-item" style={{ width: '100%', maxWidth: '300px' }}>
                <Skeleton variant="text" width="100%" height={20} />
                <Skeleton variant="text" width="80%" height={20} />
                <Skeleton variant="text" width="60%" height={20} />
                <small>text - текстовые строки</small>
              </div>
              <div className="example-item">
                <Skeleton variant="rectangular" width={200} height={150} />
                <small>rectangular - прямоугольник</small>
              </div>
              <div className="example-item">
                <Skeleton variant="circular" size="lg" />
                <small>circular - круг</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Анимации (animations)</h3>
            <p className="group-description">Три типа анимации для индикации загрузки</p>
            <div className="skeleton-examples">
              <div className="example-item">
                <Skeleton variant="rectangular" width={200} height={100} animation="pulse" />
                <small>pulse - пульсация</small>
              </div>
              <div className="example-item">
                <Skeleton variant="rectangular" width={200} height={100} animation="wave" />
                <small>wave - волна</small>
              </div>
              <div className="example-item">
                <Skeleton variant="rectangular" width={200} height={100} animation="none" />
                <small>none - без анимации</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Пример использования</h3>
            <p className="group-description">Реальный пример загрузки карточки с использованием скелетонов</p>
            <Card variant="default">
              <div style={{ display: 'flex', gap: 'var(--spacing-4)', alignItems: 'center' }}>
                <Skeleton variant="circular" size="lg" />
                <div style={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" height={20} style={{ marginBottom: 'var(--spacing-2)' }} />
                  <Skeleton variant="text" width="100%" height={16} />
                  <Skeleton variant="text" width="80%" height={16} />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Modal компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['modal'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">🪟 Modal компонент</h2>
            <p className="section-description">
              Модальное окно с glassmorphism эффектами, плавными анимациями и поддержкой различных размеров.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>isOpen</code>
                <span>boolean - открыто ли модальное окно</span>
              </div>
              <div className="prop-item">
                <code>onClose</code>
                <span>() =&gt; void - функция закрытия</span>
              </div>
              <div className="prop-item">
                <code>title</code>
                <span>string - заголовок модалки</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg | xl | fullscreen</span>
              </div>
              <div className="prop-item">
                <code>showCloseButton</code>
                <span>boolean - показывать кнопку закрытия</span>
              </div>
              <div className="prop-item">
                <code>closeOnBackdropClick</code>
                <span>boolean - закрывать по клику на backdrop</span>
              </div>
              <div className="prop-item">
                <code>closeOnEscape</code>
                <span>boolean - закрывать по Escape</span>
              </div>
              <div className="prop-item">
                <code>footer</code>
                <span>ReactNode - футер модалки</span>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Пять размеров модальных окон</p>
            <div className="button-row">
              <Button onClick={() => setModalOpen({ ...modalOpen, sm: true })}>Small</Button>
              <Button onClick={() => setModalOpen({ ...modalOpen, md: true })}>Medium</Button>
              <Button onClick={() => setModalOpen({ ...modalOpen, lg: true })}>Large</Button>
              <Button onClick={() => setModalOpen({ ...modalOpen, xl: true })}>Extra Large</Button>
              <Button onClick={() => setModalOpen({ ...modalOpen, fullscreen: true })}>Fullscreen</Button>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Пример использования</h3>
            <p className="group-description">Модальное окно с формой</p>
            <Button onClick={() => setModalOpen({ ...modalOpen, example: true })}>
              Открыть модальное окно
            </Button>
          </div>

          {/* Модалки */}
          <Modal
            isOpen={modalOpen.sm || false}
            onClose={() => setModalOpen({ ...modalOpen, sm: false })}
            title="Small Modal"
            size="sm"
          >
            <p>Это маленькое модальное окно (400px).</p>
          </Modal>

          <Modal
            isOpen={modalOpen.md || false}
            onClose={() => setModalOpen({ ...modalOpen, md: false })}
            title="Medium Modal"
            size="md"
          >
            <p>Это среднее модальное окно (600px).</p>
          </Modal>

          <Modal
            isOpen={modalOpen.lg || false}
            onClose={() => setModalOpen({ ...modalOpen, lg: false })}
            title="Large Modal"
            size="lg"
          >
            <p>Это большое модальное окно (900px).</p>
          </Modal>

          <Modal
            isOpen={modalOpen.xl || false}
            onClose={() => setModalOpen({ ...modalOpen, xl: false })}
            title="Extra Large Modal"
            size="xl"
          >
            <p>Это очень большое модальное окно (1200px).</p>
          </Modal>

          <Modal
            isOpen={modalOpen.fullscreen || false}
            onClose={() => setModalOpen({ ...modalOpen, fullscreen: false })}
            title="Fullscreen Modal"
            size="fullscreen"
          >
            <p>Это полноэкранное модальное окно.</p>
          </Modal>

          <Modal
            isOpen={modalOpen.example || false}
            onClose={() => setModalOpen({ ...modalOpen, example: false })}
            title="Пример модального окна"
            size="md"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen({ ...modalOpen, example: false })}>
                  Отмена
                </Button>
                <Button onClick={() => setModalOpen({ ...modalOpen, example: false })}>Сохранить</Button>
              </>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <Input label="Имя" placeholder="Введите имя" />
              <Input label="Email" type="email" placeholder="Введите email" />
              <Input label="Сообщение" variant="filled" placeholder="Введите сообщение" />
            </div>
          </Modal>
        </div>

        {/* Table компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['table'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">📊 Table компонент</h2>
            <p className="section-description">
              Таблица с сортировкой, фильтрацией, hover эффектами и поддержкой различных размеров.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>data</code>
                <span>Array - данные для таблицы</span>
              </div>
              <div className="prop-item">
                <code>columns</code>
                <span>Array&lt;TableColumn&gt; - колонки таблицы</span>
              </div>
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>sortable</code>
                <span>boolean - включить сортировку</span>
              </div>
              <div className="prop-item">
                <code>hoverable</code>
                <span>boolean - hover эффекты на строках</span>
              </div>
              <div className="prop-item">
                <code>striped</code>
                <span>boolean - чередующиеся строки</span>
              </div>
              <div className="prop-item">
                <code>bordered</code>
                <span>boolean - границы ячеек</span>
              </div>
              <div className="prop-item">
                <code>onRowClick</code>
                <span>(row) =&gt; void - обработчик клика на строку</span>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Три размера таблицы</p>
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <Table
                data={[
                  { id: 1, name: 'Акция 1', price: 1000, change: 5.2 },
                  { id: 2, name: 'Акция 2', price: 2500, change: -2.1 },
                  { id: 3, name: 'Акция 3', price: 500, change: 10.5 },
                ]}
                columns={[
                  { key: 'name', header: 'Название', sortable: true },
                  { key: 'price', header: 'Цена', sortable: true },
                  {
                    key: 'change',
                    header: 'Изменение %',
                    sortable: true,
                    render: (value) => (
                      <span style={{ color: value > 0 ? 'var(--color-accent-success)' : 'var(--color-accent-error)' }}>
                        {value > 0 ? '+' : ''}{value}%
                      </span>
                    ),
                  },
                ]}
                size="sm"
              />
            </div>
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <Table
                data={[
                  { id: 1, name: 'Акция 1', price: 1000, change: 5.2 },
                  { id: 2, name: 'Акция 2', price: 2500, change: -2.1 },
                  { id: 3, name: 'Акция 3', price: 500, change: 10.5 },
                ]}
                columns={[
                  { key: 'name', header: 'Название', sortable: true },
                  { key: 'price', header: 'Цена', sortable: true },
                  {
                    key: 'change',
                    header: 'Изменение %',
                    sortable: true,
                    render: (value) => (
                      <span style={{ color: value > 0 ? 'var(--color-accent-success)' : 'var(--color-accent-error)' }}>
                        {value > 0 ? '+' : ''}{value}%
                      </span>
                    ),
                  },
                ]}
                size="md"
              />
            </div>
            <Table
              data={[
                { id: 1, name: 'Акция 1', price: 1000, change: 5.2 },
                { id: 2, name: 'Акция 2', price: 2500, change: -2.1 },
                { id: 3, name: 'Акция 3', price: 500, change: 10.5 },
              ]}
              columns={[
                { key: 'name', header: 'Название', sortable: true },
                { key: 'price', header: 'Цена', sortable: true },
                {
                  key: 'change',
                  header: 'Изменение %',
                  sortable: true,
                  render: (value) => (
                    <span style={{ color: value > 0 ? 'var(--color-accent-success)' : 'var(--color-accent-error)' }}>
                      {value > 0 ? '+' : ''}{value}%
                    </span>
                  ),
                },
              ]}
              size="lg"
            />
          </div>

          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Различные стили таблицы</p>
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <h4 style={{ marginBottom: 'var(--spacing-2)' }}>Striped (чередующиеся строки)</h4>
              <Table
                data={[
                  { id: 1, name: 'Акция 1', price: 1000 },
                  { id: 2, name: 'Акция 2', price: 2500 },
                  { id: 3, name: 'Акция 3', price: 500 },
                ]}
                columns={[
                  { key: 'name', header: 'Название' },
                  { key: 'price', header: 'Цена' },
                ]}
                striped
              />
            </div>
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <h4 style={{ marginBottom: 'var(--spacing-2)' }}>Bordered (с границами)</h4>
              <Table
                data={[
                  { id: 1, name: 'Акция 1', price: 1000 },
                  { id: 2, name: 'Акция 2', price: 2500 },
                  { id: 3, name: 'Акция 3', price: 500 },
                ]}
                columns={[
                  { key: 'name', header: 'Название' },
                  { key: 'price', header: 'Цена' },
                ]}
                bordered
              />
            </div>
            <div>
              <h4 style={{ marginBottom: 'var(--spacing-2)' }}>С кликом на строку</h4>
              <Table
                data={[
                  { id: 1, name: 'Акция 1', price: 1000 },
                  { id: 2, name: 'Акция 2', price: 2500 },
                  { id: 3, name: 'Акция 3', price: 500 },
                ]}
                columns={[
                  { key: 'name', header: 'Название' },
                  { key: 'price', header: 'Цена' },
                ]}
                onRowClick={(row) => alert(`Клик по строке: ${row.name}`)}
              />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Пример использования</h3>
            <p className="group-description">Таблица портфеля с сортировкой</p>
            <Table
              data={[
                { ticker: 'SBER', name: 'Сбербанк', quantity: 10, price: 250.5, total: 2505 },
                { ticker: 'GAZP', name: 'Газпром', quantity: 5, price: 180.2, total: 901 },
                { ticker: 'LKOH', name: 'Лукойл', quantity: 3, price: 7500, total: 22500 },
              ]}
              columns={[
                { key: 'ticker', header: 'Тикер', sortable: true },
                { key: 'name', header: 'Название', sortable: true },
                { key: 'quantity', header: 'Количество', sortable: true },
                {
                  key: 'price',
                  header: 'Цена',
                  sortable: true,
                  render: (value) => `${value.toFixed(2)} ₽`,
                },
                {
                  key: 'total',
                  header: 'Сумма',
                  sortable: true,
                  render: (value) => `${value.toLocaleString('ru-RU')} ₽`,
                },
              ]}
              hoverable
              striped
            />
          </div>
        </div>

        {/* Input компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['input'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">📝 Input компонент</h2>
            <p className="section-description">
              Поле ввода с поддержкой иконок, состояний ошибок, различных размеров и красивой анимацией фокуса.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>variant</code>
                <span>default | filled</span>
              </div>
              <div className="prop-item">
                <code>label</code>
                <span>string - метка поля</span>
              </div>
              <div className="prop-item">
                <code>error</code>
                <span>string - текст ошибки</span>
              </div>
              <div className="prop-item">
                <code>helperText</code>
                <span>string - подсказка</span>
              </div>
              <div className="prop-item">
                <code>leftIcon</code>
                <span>ReactNode - иконка слева</span>
              </div>
              <div className="prop-item">
                <code>rightIcon</code>
                <span>ReactNode - иконка справа</span>
              </div>
              <div className="prop-item">
                <code>fullWidth</code>
                <span>boolean</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Три размера для разных контекстов использования</p>
            <div className="input-row">
              <div className="example-item">
                <Input size="sm" placeholder="Small input" />
                <small>sm - компактный</small>
              </div>
              <div className="example-item">
                <Input size="md" placeholder="Medium input" />
                <small>md - стандартный</small>
              </div>
              <div className="example-item">
                <Input size="lg" placeholder="Large input" />
                <small>lg - крупный</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Default - стандартный стиль, Filled - с заполненным фоном</p>
            <div className="input-row">
              <div className="example-item">
                <Input variant="default" placeholder="Default variant" />
                <small>default</small>
              </div>
              <div className="example-item">
                <Input variant="filled" placeholder="Filled variant" />
                <small>filled</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">С label и helper text</h3>
            <p className="group-description">Метки и подсказки для улучшения UX</p>
            <div className="input-examples">
              <Input
                label="Email адрес"
                placeholder="example@mail.com"
                helperText="Введите ваш email адрес"
              />
              <Input
                label="Пароль"
                type="password"
                placeholder="Введите пароль"
                helperText="Минимум 8 символов"
              />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Состояния (states)</h3>
            <p className="group-description">Нормальное состояние, ошибка валидации, отключенное поле</p>
            <div className="input-examples">
              <Input
                label="Обычное поле"
                placeholder="Нормальное состояние"
              />
              <Input
                label="Поле с ошибкой"
                placeholder="Ошибка валидации"
                error="Это поле обязательно для заполнения"
              />
              <Input
                label="Отключенное поле"
                placeholder="Недоступно"
                disabled
              />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">С иконками</h3>
            <p className="group-description">Поддержка иконок слева и справа для улучшения визуального восприятия</p>
            <div className="input-examples">
              <Input
                label="С иконкой слева"
                placeholder="Поиск..."
                leftIcon={<span>🔍</span>}
              />
              <Input
                label="С иконкой справа"
                placeholder="Показать пароль"
                rightIcon={<span>👁️</span>}
              />
              <Input
                label="С обеими иконками"
                placeholder="Поиск с очисткой"
                leftIcon={<span>🔍</span>}
                rightIcon={<span>✕</span>}
              />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Анимация фокуса</h3>
            <p className="group-description">Кликните на поле ниже, чтобы увидеть красивую анимацию фокуса с градиентной рамкой и glow эффектом</p>
            <Input
              label="Попробуйте сфокусироваться"
              placeholder="Кликните сюда..."
              helperText="Обратите внимание на градиентную рамку и свечение"
            />
          </div>
        </div>

        {/* Select компонент */}
        <div className="section glass" ref={(el) => (sectionsRef.current['select'] = el)}>
          <div className="section-header">
            <h2 className="section-subtitle">📋 Select компонент</h2>
            <p className="section-description">
              Выпадающий список с поддержкой поиска, glassmorphism эффектом и кастомным дизайном.
            </p>
          </div>

          <div className="props-card">
            <h3 className="props-title">📋 Пропсы</h3>
            <div className="props-grid">
              <div className="prop-item">
                <code>size</code>
                <span>sm | md | lg</span>
              </div>
              <div className="prop-item">
                <code>variant</code>
                <span>default | filled</span>
              </div>
              <div className="prop-item">
                <code>options</code>
                <span>{'Array<{value: string, label: string}>'}</span>
              </div>
              <div className="prop-item">
                <code>searchable</code>
                <span>boolean - включить поиск</span>
              </div>
              <div className="prop-item">
                <code>label</code>
                <span>string - метка поля</span>
              </div>
              <div className="prop-item">
                <code>error</code>
                <span>string - текст ошибки</span>
              </div>
            </div>
          </div>
          
          <div className="component-group">
            <h3 className="group-title">Размеры (sizes)</h3>
            <p className="group-description">Три размера для разных контекстов использования</p>
            <div className="select-row">
              <div className="example-item">
                <Select
                  size="sm"
                  placeholder="Small select"
                  options={[
                    { value: '1', label: 'Опция 1' },
                    { value: '2', label: 'Опция 2' },
                    { value: '3', label: 'Опция 3' },
                  ]}
                />
                <small>sm</small>
              </div>
              <div className="example-item">
                <Select
                  size="md"
                  placeholder="Medium select"
                  options={[
                    { value: '1', label: 'Опция 1' },
                    { value: '2', label: 'Опция 2' },
                    { value: '3', label: 'Опция 3' },
                  ]}
                />
                <small>md</small>
              </div>
              <div className="example-item">
                <Select
                  size="lg"
                  placeholder="Large select"
                  options={[
                    { value: '1', label: 'Опция 1' },
                    { value: '2', label: 'Опция 2' },
                    { value: '3', label: 'Опция 3' },
                  ]}
                />
                <small>lg</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">Варианты (variants)</h3>
            <p className="group-description">Default - стандартный стиль, Filled - с заполненным фоном</p>
            <div className="select-row">
              <div className="example-item">
                <Select
                  variant="default"
                  placeholder="Default variant"
                  options={[
                    { value: '1', label: 'Опция 1' },
                    { value: '2', label: 'Опция 2' },
                  ]}
                />
                <small>default</small>
              </div>
              <div className="example-item">
                <Select
                  variant="filled"
                  placeholder="Filled variant"
                  options={[
                    { value: '1', label: 'Опция 1' },
                    { value: '2', label: 'Опция 2' },
                  ]}
                />
                <small>filled</small>
              </div>
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">С label и helper text</h3>
            <p className="group-description">Метки, подсказки и состояния ошибок</p>
            <div className="input-examples">
              <Select
                label="Выберите валюту"
                placeholder="Выберите валюту"
                helperText="Выберите валюту для торговли"
                options={[
                  { value: 'RUB', label: 'Рубли (RUB)' },
                  { value: 'USD', label: 'Доллары (USD)' },
                  { value: 'EUR', label: 'Евро (EUR)' },
                ]}
              />
              <Select
                label="Статус заявки"
                placeholder="Выберите статус"
                error="Необходимо выбрать статус"
                options={[
                  { value: 'pending', label: 'В ожидании' },
                  { value: 'executed', label: 'Исполнена' },
                  { value: 'cancelled', label: 'Отменена' },
                ]}
              />
            </div>
          </div>

          <div className="component-group">
            <h3 className="group-title">С поиском (searchable)</h3>
            <p className="group-description">Поиск по опциям для удобной навигации в больших списках</p>
            <Select
              label="Поиск инструмента"
              placeholder="Начните вводить название..."
              searchable
              options={[
                { value: 'SBER', label: 'Сбербанк' },
                { value: 'GAZP', label: 'Газпром' },
                { value: 'LKOH', label: 'Лукойл' },
                { value: 'YNDX', label: 'Яндекс' },
                { value: 'TCSG', label: 'TCS Group' },
                { value: 'VTBR', label: 'ВТБ' },
                { value: 'GMKN', label: 'Норникель' },
                { value: 'NVTK', label: 'Новатэк' },
              ]}
            />
          </div>

          <div className="component-group">
            <h3 className="group-title">Full width</h3>
            <p className="group-description">Выбор на всю ширину контейнера</p>
            <Select
              placeholder="Полная ширина"
              fullWidth
              options={[
                { value: '1', label: 'Опция 1' },
                { value: '2', label: 'Опция 2' },
                { value: '3', label: 'Опция 3' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignSystemTest;
