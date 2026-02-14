
import React from 'react';

interface ScoreGaugeProps {
  score: number;
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score }) => {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return 'text-emerald-500';
    if (s >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return 'stroke-emerald-500';
    if (s >= 50) return 'stroke-amber-500';
    return 'stroke-rose-500';
  };

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-48 h-48 transform -rotate-90">
        <circle
          cx="96"
          cy="96"
          r={radius}
          stroke="currentColor"
          strokeWidth="12"
          fill="transparent"
          className="text-slate-100"
        />
        <circle
          cx="96"
          cy="96"
          r={radius}
          stroke="currentColor"
          strokeWidth="12"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${getBgColor(score)} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-5xl font-bold ${getColor(score)}`}>{score}%</span>
        <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Match</span>
      </div>
    </div>
  );
};

export default ScoreGauge;
