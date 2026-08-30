import React from 'react';
import {
  FileCode,
  Layers,
  Clock,
  Cpu,
  CheckCircle,
  Wrench,
} from 'lucide-react';

interface MetadataPanelProps {
  documentType: string;
  confidence: number;
  pageCount: number;
  executionTimeMs: number;
  engineUsed: 'local' | 'ai';
  aiProvider?: string;
  isValidJson: boolean;
  isRepaired: boolean;
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({
  documentType,
  confidence,
  pageCount,
  executionTimeMs,
  engineUsed,
  aiProvider,
  isValidJson,
  isRepaired,
}) => {
  const formatDocType = (dt: string) => {
    return dt.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div className="meta-chip chip-doctype" title={`Classification confidence: ${Math.round(confidence * 100)}%`}>
        <FileCode size={13} />
        <span>Type: {formatDocType(documentType)}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({Math.round(confidence * 100)}%)</span>
      </div>

      <div className="meta-chip">
        <Layers size={13} />
        <span>{pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
      </div>

      <div className="meta-chip">
        <Clock size={13} />
        <span>{executionTimeMs}ms</span>
      </div>

      <div className="meta-chip">
        <Cpu size={13} />
        <span>
          {engineUsed === 'local'
            ? 'Local Engine (Offline)'
            : `AI: ${aiProvider?.toUpperCase() || 'Agent'}`}
        </span>
      </div>

      {isValidJson && (
        <div className="meta-chip chip-success">
          {isRepaired ? (
            <>
              <Wrench size={13} />
              <span>JSON Auto-Repaired</span>
            </>
          ) : (
            <>
              <CheckCircle size={13} />
              <span>Valid JSON</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
