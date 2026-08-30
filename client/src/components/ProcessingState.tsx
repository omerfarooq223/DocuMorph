import React from 'react';
import { Loader2, Check } from 'lucide-react';

interface ProcessingStateProps {
  currentStep: number; // 1 to 5
}

const STEPS = [
  { id: 1, label: 'Reading PDF structure & layout coordinates' },
  { id: 2, label: 'Detecting tabular grids, rows & columns' },
  { id: 3, label: 'Analyzing document sections & classification' },
  { id: 4, label: 'Extracting grounded semantic JSON data' },
  { id: 5, label: 'Validating & formatting JSON output' },
];

export const ProcessingState: React.FC<ProcessingStateProps> = ({ currentStep }) => {
  return (
    <div className="progress-stepper">
      {STEPS.map((step) => {
        const isCompleted = currentStep > step.id;
        const isActive = currentStep === step.id;

        return (
          <div
            key={step.id}
            className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
          >
            <div className="step-indicator">
              {isCompleted ? (
                <Check size={13} strokeWidth={3} />
              ) : isActive ? (
                <Loader2 size={13} className="spinner" />
              ) : (
                step.id
              )}
            </div>
            <span style={{ fontWeight: isActive ? 600 : 400 }}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
};
