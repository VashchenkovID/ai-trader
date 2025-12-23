import React from 'react';
import PortfolioVisualization from '../components/PortfolioVisualization';
import './Portfolio.css';

const Portfolio: React.FC = () => {
  return (
    <div className="portfolio-page">
      <PortfolioVisualization />
    </div>
  );
};

export default Portfolio;
