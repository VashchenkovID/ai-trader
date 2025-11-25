import React from 'react';
import { Card } from 'primereact/card';
import PredictionAnalysisPanel from '../components/neural-networks/PredictionAnalysisPanel';

const TrainingDebug: React.FC = () => {
  return (
    <div className="grid">
      <div className="col-12">
        <Card title="🔧 Отладка обучения нейросетей" className="mb-4">
          {/* Табличка/сводка по обучению нейросетей будет добавлена позже, сейчас фокус на анализе и предсказаниях */}
          <PredictionAnalysisPanel />
        </Card>
      </div>
    </div>
  );
};

export default TrainingDebug;

