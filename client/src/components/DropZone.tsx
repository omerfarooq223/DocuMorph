import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Sparkles, Layers } from 'lucide-react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  onLoadSample: (sampleType: 'invoice' | 'multipage' | 'resume') => void;
  isLoadingSample: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  onLoadSample,
  isLoadingSample,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelect(file);
      } else {
        alert('Please upload a valid PDF document.');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="glass-card">
      <div
        className={`dropzone-container ${isDragActive ? 'is-drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="file-input-hidden"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
        />

        <div className="dropzone-icon-box">
          <UploadCloud size={32} />
        </div>

        <h3 className="dropzone-title">Upload your PDF document</h3>
        <p className="dropzone-desc">
          Drag & drop a PDF here, or click to browse. Multi-page, tables, invoices, & scanned PDFs supported.
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <FileText size={16} />
          Choose PDF File
        </button>
      </div>

      <div className="sample-pills-wrap">
        <div className="sample-pills-label">Or try with a realistic sample PDF:</div>
        <div className="sample-pills-list">
          <button
            type="button"
            className="sample-pill-btn"
            disabled={isLoadingSample}
            onClick={() => onLoadSample('invoice')}
          >
            <FileText size={14} />
            Invoice with Table
          </button>

          <button
            type="button"
            className="sample-pill-btn"
            disabled={isLoadingSample}
            onClick={() => onLoadSample('multipage')}
          >
            <Layers size={14} />
            2-Page Bank Statement
          </button>

          <button
            type="button"
            className="sample-pill-btn"
            disabled={isLoadingSample}
            onClick={() => onLoadSample('resume')}
          >
            <Sparkles size={14} />
            Software Engineer Resume
          </button>
        </div>
      </div>
    </div>
  );
};
