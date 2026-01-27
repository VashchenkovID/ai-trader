import React, { useState } from 'react';
import { Card } from 'primereact/card';
import { InputNumber } from 'primereact/inputnumber';
// import { Button } from 'primereact/button'; // Reserved for future use
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { Slider } from 'primereact/slider';
import { Divider } from 'primereact/divider';

interface KellyCalculatorProps {
  className?: string;
}

const KellyCalculator: React.FC<KellyCalculatorProps> = ({ className = '' }) => {
  const [winRate, setWinRate] = useState<number>(0.6);
  const [averageWin, setAverageWin] = useState<number>(0.02);
  const [averageLoss, setAverageLoss] = useState<number>(0.01);
  const [conservativeFactor, setConservativeFactor] = useState<number>(0.25);
  const [portfolioValue, setPortfolioValue] = useState<number>(1000000);

  // Формула Келли: f = (bp - q) / b
  // где b = odds (averageWin / averageLoss), p = winRate, q = 1 - winRate
  const calculateKelly = () => {
    if (averageWin <= 0 || averageLoss <= 0) {
      return null;
    }

    const odds = averageWin / averageLoss;
    const kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
    
    // Ограничиваем Келли максимум 25%
    const maxKelly = Math.min(Math.max(kellyFraction, 0), 0.25);
    const conservativeKelly = maxKelly * conservativeFactor;
    
    return {
      kellyFraction: maxKelly,
      conservativeKelly,
      recommendedPositionSize: portfolioValue * conservativeKelly,
      odds,
      expectedValue: winRate * averageWin - (1 - winRate) * averageLoss
    };
  };

  const result = calculateKelly();

  const getKellySeverity = (kelly: number) => {
    if (kelly >= 0.1) return 'success';
    if (kelly >= 0.05) return 'warning';
    return 'danger';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <Card title="🧮 Калькулятор формулы Келли" className={className}>
      <div className="grid">
        {/* Параметры */}
        <div className="col-12 md:col-6">
          <h5 className="mb-3">Параметры</h5>
          
          <div className="field mb-4">
            <label className="block text-sm font-medium mb-2">
              Win Rate (вероятность выигрыша)
            </label>
            <div className="flex align-items-center gap-3">
              <InputNumber
                value={winRate}
                onValueChange={(e) => setWinRate(e.value || 0)}
                min={0}
                max={1}
                step={0.01}
                suffix=" (0-1)"
                className="flex-1"
              />
              <span className="text-sm text-500 w-8rem text-right">
                {(winRate * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={winRate * 100}
              onChange={(e) => setWinRate((e.value as number) / 100)}
              min={0}
              max={100}
              className="mt-2"
            />
          </div>

          <div className="field mb-4">
            <label className="block text-sm font-medium mb-2">
              Средняя прибыль (в долях)
            </label>
            <InputNumber
              value={averageWin}
              onValueChange={(e) => setAverageWin(e.value || 0)}
              min={0}
              max={1}
              step={0.001}
              suffix=" (например, 0.02 = 2%)"
              className="w-full"
            />
            <small className="text-500">
              Средний процент прибыли при выигрышной сделке
            </small>
          </div>

          <div className="field mb-4">
            <label className="block text-sm font-medium mb-2">
              Средний убыток (в долях)
            </label>
            <InputNumber
              value={averageLoss}
              onValueChange={(e) => setAverageLoss(e.value || 0)}
              min={0}
              max={1}
              step={0.001}
              suffix=" (например, 0.01 = 1%)"
              className="w-full"
            />
            <small className="text-500">
              Средний процент убытка при проигрышной сделке
            </small>
          </div>

          <Divider />

          <div className="field mb-4">
            <label className="block text-sm font-medium mb-2">
              Коэффициент консервативности
            </label>
            <div className="flex align-items-center gap-3">
              <InputNumber
                value={conservativeFactor}
                onValueChange={(e) => setConservativeFactor(e.value || 0.25)}
                min={0}
                max={1}
                step={0.05}
                suffix=" (доля от Келли)"
                className="flex-1"
              />
              <span className="text-sm text-500 w-8rem text-right">
                {(conservativeFactor * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={conservativeFactor * 100}
              onChange={(e) => setConservativeFactor((e.value as number) / 100)}
              min={0}
              max={100}
              className="mt-2"
            />
            <small className="text-500">
              Рекомендуется: 0.25 (1/4 от полного Келли) для снижения риска
            </small>
          </div>

          <div className="field mb-4">
            <label className="block text-sm font-medium mb-2">
              Стоимость портфеля
            </label>
            <InputNumber
              value={portfolioValue}
              onValueChange={(e) => setPortfolioValue(e.value || 0)}
              min={0}
              mode="decimal"
              className="w-full"
            />
          </div>
        </div>

        {/* Результаты */}
        <div className="col-12 md:col-6">
          <h5 className="mb-3">Результаты расчета</h5>
          
          {result ? (
            <div className="flex flex-column gap-3">
              <div className="p-3 border-round bg-gray-50">
                <div className="text-sm text-500 mb-2">Коэффициент Келли</div>
                <div className="flex align-items-center gap-2">
                  <Tag
                    value={result.kellyFraction.toFixed(4)}
                    severity={getKellySeverity(result.kellyFraction) as any}
                    className="text-lg"
                  />
                  <span className="text-sm text-500">
                    ({(result.kellyFraction * 100).toFixed(2)}% от капитала)
                  </span>
                </div>
                <small className="text-500 mt-2 block">
                  Максимальная доля капитала согласно формуле Келли
                </small>
              </div>

              <div className="p-3 border-round bg-blue-50">
                <div className="text-sm text-500 mb-2">Консервативный Келли</div>
                <div className="flex align-items-center gap-2">
                  <Tag
                    value={result.conservativeKelly.toFixed(4)}
                    severity={getKellySeverity(result.conservativeKelly) as any}
                    className="text-lg"
                  />
                  <span className="text-sm text-500">
                    ({(result.conservativeKelly * 100).toFixed(2)}% от капитала)
                  </span>
                </div>
                <small className="text-500 mt-2 block">
                  Рекомендуемый размер позиции с учетом консервативного коэффициента
                </small>
              </div>

              <div className="p-3 border-round bg-green-50">
                <div className="text-sm text-500 mb-2">Рекомендуемый размер позиции</div>
                <div className="text-2xl font-bold text-green-700">
                  {formatCurrency(result.recommendedPositionSize)}
                </div>
                <small className="text-500 mt-2 block">
                  Сумма, которую рекомендуется инвестировать в позицию
                </small>
              </div>

              <Divider />

              <div className="grid">
                <div className="col-6">
                  <div className="text-sm text-500 mb-1">Коэффициент (odds)</div>
                  <div className="text-lg font-semibold">
                    {result.odds.toFixed(2)}
                  </div>
                  <small className="text-500">
                    averageWin / averageLoss
                  </small>
                </div>
                <div className="col-6">
                  <div className="text-sm text-500 mb-1">Ожидаемое значение</div>
                  <div className={`text-lg font-semibold ${result.expectedValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(result.expectedValue * 100).toFixed(2)}%
                  </div>
                  <small className="text-500">
                    Математическое ожидание
                  </small>
                </div>
              </div>

              {result.expectedValue < 0 && (
                <Message
                  severity="warn"
                  text="Отрицательное математическое ожидание! Торговля не рекомендуется."
                  className="mt-3"
                />
              )}

              {result.kellyFraction <= 0 && (
                <Message
                  severity="warn"
                  text="Коэффициент Келли отрицательный или нулевой. Торговля не рекомендуется."
                  className="mt-3"
                />
              )}
            </div>
          ) : (
            <Message
              severity="error"
              text="Некорректные параметры. Убедитесь, что средняя прибыль и убыток больше нуля."
            />
          )}

          <Divider />

          <div className="p-3 bg-yellow-50 border-round">
            <h6 className="text-sm font-semibold mb-2">ℹ️ Информация</h6>
            <ul className="text-sm text-600 m-0 pl-3">
              <li>Формула Келли: f = (bp - q) / b</li>
              <li>где b = odds, p = winRate, q = 1 - winRate</li>
              <li>Коэффициент ограничен максимумом 25% для безопасности</li>
              <li>Консервативный подход использует долю от полного Келли</li>
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default KellyCalculator;

