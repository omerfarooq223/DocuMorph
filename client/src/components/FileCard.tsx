import React from 'react';
import { FileText, Trash2, Layers, CheckCircle2, AlertCircle } from 'lucide-react';

interface FileCardProps {
  file: File;
  pageCount?: number;
  isScanned?: boolean;
  onRemove: () => void;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  pageCount,
  isScanned,
  onRemove,
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="file-card">
      <div className="file-info-group">
        <div className="file-icon-box">
          <FileText size={24} />
        </div>
        <div>
          <div className="file-name" title={file.name}>
            {file.name}
          </div>
          <div className="file-meta-row">
            <span>{formatBytes(file.size)}</span>
            {pageCount !== undefined && (
              <span className="file-tag">
                <Layers size={12} style={{ display: 'inline', marginRight: 4 }} />
                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
              </span>
            )}
            {isScanned ? (
              <span className="file-tag" style={{ color: 'var(--color-warning)' }}>
                <AlertCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                Scanned PDF (OCR)
              </span>
            ) : (
              <span className="file-tag" style={{ color: 'var(--color-success)' }}>
                <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                Text-based PDF
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-icon"
        onClick={onRemove}
        title="Remove and select another PDF"
      >
        <Trash2 size={16} color="var(--color-danger)" />
      </button>
    </div>
  );
};
