import React, { useState, useEffect } from 'react';
import './RecommendationsLayout.css';

interface RecommendationsLayoutProps {
  summary: React.ReactNode;
  filters: React.ReactNode;
  content: React.ReactNode;
  sidebar: React.ReactNode;
}

export const RecommendationsLayout: React.FC<RecommendationsLayoutProps> = ({
  summary,
  filters,
  content,
  sidebar,
}) => {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsFiltersOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Закрываем сайдбар при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isFiltersOpen && !target.closest('.recommendations-filters-sidebar') && !target.closest('.recommendations-filters-toggle')) {
        setIsFiltersOpen(false);
      }
    };

    if (isFiltersOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isFiltersOpen]);

  return (
    <div className="recommendations-layout">
      {/* Верхняя панель со сводкой */}
      <div className="recommendations-layout-summary">
        {summary}
      </div>

      {/* Кнопка открытия фильтров для мобильных */}
      {isMobile && (
        <button
          className="recommendations-filters-toggle"
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          aria-label="Открыть фильтры"
        >
          <i className={`pi ${isFiltersOpen ? 'pi-times' : 'pi-filter'}`}></i>
          <span>Фильтры</span>
        </button>
      )}

      {/* Overlay для мобильных */}
      {isMobile && isFiltersOpen && (
        <div
          className="recommendations-filters-overlay"
          onClick={() => setIsFiltersOpen(false)}
        />
      )}

      {/* Основной контент с 3 колонками */}
      <div className="recommendations-layout-main">
        {/* Левая колонка - фильтры */}
        <aside className={`recommendations-layout-filters ${isMobile && isFiltersOpen ? 'mobile-open' : ''}`}>
          <div className="recommendations-filters-sidebar">
            {isMobile && (
              <div className="recommendations-filters-sidebar-header">
                <h3>🔍 Фильтры</h3>
                <button
                  className="recommendations-filters-close"
                  onClick={() => setIsFiltersOpen(false)}
                  aria-label="Закрыть фильтры"
                >
                  <i className="pi pi-times"></i>
                </button>
              </div>
            )}
            <div className="recommendations-filters-content">
              {filters}
            </div>
          </div>
        </aside>

        {/* Центральная колонка - карточки рекомендаций */}
        <main className="recommendations-layout-content">
          {content}
        </main>

        {/* Правая колонка - контекстная информация */}
        <aside className="recommendations-layout-sidebar">
          {sidebar}
        </aside>
      </div>
    </div>
  );
};

export default RecommendationsLayout;

