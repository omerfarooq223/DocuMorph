import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  onRetry,
  onDismiss,
}) => {
  return (
    <div
      style={{
        background: 'var(--color-danger-bg)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px',
        color: '#fca5a5',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-danger)' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fecaca' }}>
            Extraction Error
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: 2 }}>{message}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onRetry && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={onRetry}
          >
            <RotateCcw size={12} />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            style={{ width: 28, height: 28 }}
            onClick={onDismiss}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
