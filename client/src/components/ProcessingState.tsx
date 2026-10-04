import React, { useState } from 'react';
import { Loader2, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldCheck } from 'lucide-react';

interface ProcessingStateProps {
  currentStep: number; // 1 to 5
  isCompleted?: boolean;
  executionTimeMs?: number;
}

const STEPS = [
  { id: 1, label: 'Reading PDF structure & layout coordinates', desc: 'Vector text extraction & geometry mapping' },
  { id: 2, label: 'Detecting tabular grids, rows & columns', desc: 'Column boundary projection & table reconstruction' },
  { id: 3, label: 'Analyzing document sections & classification', desc: 'Layout grouping & document type determination' },
  { id: 4, label: 'Extracting grounded semantic JSON data', desc: 'Key-value pairing & bounding-box provenance' },
  { id: 5, label: 'Validating & formatting JSON output', desc: 'Strict JSON repair & invariant integrity checks' },
];

export const ProcessingState: React.FC<ProcessingStateProps> = ({
  currentStep,
  isCompleted = false,
  executionTimeMs,
}) => {
  const [isExpanded, setIsExpanded] = useState(!isCompleted);

  if (isCompleted) {
    return (
      <div className="pipeline-status-card">
        <div
          className="pipeline-status-header"
          onClick={() => setIsExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsExpanded((prev) => !prev)}
        >
          <div className="pipeline-status-left">
            <div className="pipeline-badge-success">
              <CheckCircle2 size={16} />
              <span>5/5 Pipeline Steps Passed</span>
            </div>
            <div className="pipeline-meta-text">
              <span className="pipeline-metric">
                <Clock size={12} />
                {executionTimeMs ? `${executionTimeMs}ms` : 'Completed'}
              </span>
              <span className="pipeline-metric local-metric">
                <ShieldCheck size={12} />
                100% Grounded
              </span>
            </div>
          </div>

          <button
            type="button"
            className="pipeline-toggle-btn"
            aria-label={isExpanded ? 'Collapse pipeline steps' : 'Expand pipeline steps'}
          >
            <span style={{ fontSize: '0.75rem', marginRight: 4 }}>
              {isExpanded ? 'Hide Details' : 'View All 5 Steps'}
            </span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {isExpanded && (
          <div className="progress-stepper completed-stepper">
            {STEPS.map((step) => (
              <div key={step.id} className="step-item completed">
                <div className="step-indicator">
                  <Check size={13} strokeWidth={3} />
                </div>
                <div className="step-text-wrap">
                  <span className="step-label">{step.label}</span>
                  <span className="step-desc">{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Active extracting state
  return (
    <div className="progress-stepper active-stepper">
      <div className="stepper-title-row">
        <Loader2 size={15} className="spinner" />
        <span>Executing Extraction Pipeline (Step {currentStep} of 5)...</span>
      </div>
      {STEPS.map((step) => {
        const isStepPassed = currentStep > step.id;
        const isActive = currentStep === step.id;

        return (
          <div
            key={step.id}
            className={`step-item ${isActive ? 'active' : ''} ${isStepPassed ? 'completed' : ''}`}
          >
            <div className="step-indicator">
              {isStepPassed ? (
                <Check size={13} strokeWidth={3} />
              ) : isActive ? (
                <Loader2 size={13} className="spinner" />
              ) : (
                step.id
              )}
            </div>
            <div className="step-text-wrap">
              <span className="step-label" style={{ fontWeight: isActive ? 600 : 400 }}>
                {step.label}
              </span>
              <span className="step-desc">{step.desc}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
