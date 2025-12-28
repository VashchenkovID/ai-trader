import React from 'react';
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
  return (
    <div className="recommendations-layout">
      {/* Верхняя панель со сводкой */}
      <div className="recommendations-layout-summary">
        {summary}
      </div>

      {/* Основной контент с 3 колонками */}
      <div className="recommendations-layout-main">
        {/* Левая колонка - фильтры */}
        <aside className="recommendations-layout-filters">
          {filters}
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

