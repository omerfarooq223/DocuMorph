import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { DropZone } from './components/DropZone.js';
import { FileCard } from './components/FileCard.js';
import { SchemaEditor } from './components/SchemaEditor.js';
import { ProcessingState } from './components/ProcessingState.js';
import { JsonViewer } from './components/JsonViewer.js';
import { PdfPreview, type HighlightBox } from './components/PdfPreview.js';
import { MetadataPanel } from './components/MetadataPanel.js';
import { SettingsModal, type AppSettings } from './components/SettingsModal.js';
import { ErrorAlert } from './components/ErrorAlert.js';
import {
  Play,
  Columns,
  FileCode2,
  Eye,
  RotateCcw,
  PlusCircle,
  SlidersHorizontal,
  FileText,
} from 'lucide-react';

interface ExtractionResultData {
  success: boolean;
  documentType: string;
  classificationConfidence: number;
  engineUsed: 'local' | 'ai';
  aiProviderUsed?: string;
  executionTimeMs: number;
  metadata: {
    fileName: string;
    fileSizeBytes: number;
    pageCount: number;
    isScanned: boolean;
  };
  semanticJson: Record<string, any>;
  structuralJson: any;
  provenanceMap?: Record<string, any>;
  diagnostics?: any;
  validation: {
    isValidJson: boolean;
    repaired: boolean;
    errors?: string[];
  };
}

export const App: React.FC = () => {
  // App state
  const [file, setFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<{ pageCount?: number; isScanned?: boolean } | null>(null);
  const [customSchema, setCustomSchema] = useState<string>('');
  const [isSchemaEnabled, setIsSchemaEnabled] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [result, setResult] = useState<ExtractionResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Interactive Comparison & Provenance Highlight state
  const [viewMode, setViewMode] = useState<'split' | 'json' | 'pdf'>('split');
  const [activeHighlight, setActiveHighlight] = useState<HighlightBox | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [showSchemaInResults, setShowSchemaInResults] = useState(false);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('pdf_agent_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // use default
      }
    }
    return {
      engine: 'local',
      aiProvider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini',
    };
  });

  useEffect(() => {
    localStorage.setItem('pdf_agent_settings', JSON.stringify(settings));
  }, [settings]);

  // Inspect file on selection
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setResult(null);
    setActiveHighlight(null);
    setSelectedFieldKey(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload-info', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.metadata) {
          setFileMeta({
            pageCount: data.metadata.pageCount,
            isScanned: data.metadata.isScanned,
          });
        }
      }
    } catch {
      // Non-blocking inspection failure
    }
  };

  // Load sample PDF from server
  const handleLoadSample = async (sampleType: 'invoice' | 'multipage' | 'resume') => {
    try {
      setIsLoadingSample(true);
      setError(null);
      const res = await fetch(`/api/sample/${sampleType}`);
      if (!res.ok) throw new Error('Failed to fetch sample PDF from server.');

      const blob = await res.blob();
      const sampleNames: Record<string, string> = {
        invoice: 'Sample_Invoice_INV1024.pdf',
        multipage: 'Sample_Bank_Statement_2Page.pdf',
        resume: 'Sample_Software_Engineer_Resume.pdf',
      };

      const sampleFile = new File([blob], sampleNames[sampleType] || 'sample.pdf', {
        type: 'application/pdf',
      });

      await handleFileSelect(sampleFile);
    } catch (err: any) {
      setError(`Failed to load sample: ${err.message}`);
    } finally {
      setIsLoadingSample(false);
    }
  };

  // Execute Extraction Pipeline
  const handleExtract = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setCurrentStep(1);

    // Stepper timer
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 450);

    const formData = new FormData();
    formData.append('file', file);

    const options = {
      engine: settings.engine,
      aiProvider: settings.aiProvider,
      ollamaUrl: settings.ollamaUrl,
      ollamaModel: settings.ollamaModel,
      geminiApiKey: settings.geminiApiKey,
      geminiModel: settings.geminiModel,
      openaiApiKey: settings.openaiApiKey,
      openaiModel: settings.openaiModel,
      customSchema: isSchemaEnabled && customSchema.trim() ? customSchema : null,
    };

    formData.append('options', JSON.stringify(options));

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      clearInterval(stepTimer);
      setCurrentStep(5);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg =
          typeof errData.error === 'object' && errData.error?.message
            ? errData.error.message
            : typeof errData.error === 'string'
            ? errData.error
            : `Server error (${response.status}): Could not process document.`;
        throw new Error(errMsg);
      }

      const extractResult: ExtractionResultData = await response.json();
      if (!extractResult.success) {
        const errMsg =
          typeof (extractResult as any).error === 'object' && (extractResult as any).error?.message
            ? (extractResult as any).error.message
            : typeof (extractResult as any).error === 'string'
            ? (extractResult as any).error
            : 'Extraction failed';
        throw new Error(errMsg);
      }

      // Transition to results state
      setTimeout(() => {
        setResult(extractResult);
        setIsProcessing(false);
        setViewMode('split'); // Default to side-by-side comparison
      }, 350);
    } catch (err: any) {
      clearInterval(stepTimer);
      setIsProcessing(false);
      setError(err.message || 'An unexpected error occurred during extraction.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileMeta(null);
    setResult(null);
    setError(null);
    setActiveHighlight(null);
    setSelectedFieldKey(null);
    setShowSchemaInResults(false);
  };

  const handleSelectField = (key: string | null, highlight?: HighlightBox | null) => {
    setSelectedFieldKey(key);
    setActiveHighlight(highlight || null);
  };

  // Flatten detected key-values from diagnostics for PDF overlay
  const detectedKeyValuesList = React.useMemo(() => {
    if (!result?.diagnostics?.pages) return [];
    const allKVs: Array<{
      key: string;
      value: string;
      confidence: string;
      bbox?: { x: number; y: number; width: number; height: number };
      page?: number;
    }> = [];

    result.diagnostics.pages.forEach((p: any) => {
      (p.detectedKeyValues || []).forEach((kv: any) => {
        allKVs.push({
          key: kv.key,
          value: kv.value,
          confidence: kv.confidence,
          bbox: kv.bbox,
          page: p.page,
        });
      });
    });

    return allKVs;
  }, [result]);

  return (
    <div className="app-container">
      <Header
        engineMode={settings.engine}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="hero-section">
        <h1 className="hero-title">Intelligent PDF to JSON Agent</h1>
        <p className="hero-subtitle">
          Extract logical document structures, tables, key-values, lists, and semantic hierarchies into clean, validated JSON with 100% local privacy and grounded extraction.
        </p>
      </div>

      {error && <ErrorAlert message={error} onRetry={handleExtract} onDismiss={() => setError(null)} />}

      {/* STATE 1: Before extraction is performed */}
      {!result ? (
        <div className="workspace-grid">
          {!file ? (
            <DropZone
              onFileSelect={handleFileSelect}
              onLoadSample={handleLoadSample}
              isLoadingSample={isLoadingSample}
            />
          ) : (
            <div className="pre-extract-layout">
              {/* Left Column: Uploaded File Info & Schema */}
              <div className="glass-card">
                <FileCard
                  file={file}
                  pageCount={fileMeta?.pageCount}
                  isScanned={fileMeta?.isScanned}
                  onRemove={handleReset}
                />

                <SchemaEditor
                  customSchema={customSchema}
                  isEnabled={isSchemaEnabled}
                  onChange={setCustomSchema}
                  onToggle={setIsSchemaEnabled}
                />

                {isProcessing && <ProcessingState currentStep={currentStep} />}

                {!isProcessing && (
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 20 }}
                    onClick={handleExtract}
                  >
                    <Play size={16} fill="currentColor" />
                    Convert to JSON
                  </button>
                )}
              </div>

              {/* Right Column: Live PDF Document Preview */}
              <div>
                <PdfPreview pdfFile={file} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* STATE 2: Extraction completed -> Persistent Pipeline Status & Side-by-Side Comparison */
        <div className="results-workspace">
          {/* Metadata & Classification Status Panel */}
          <MetadataPanel
            documentType={result.documentType}
            confidence={result.classificationConfidence}
            pageCount={result.metadata.pageCount}
            executionTimeMs={result.executionTimeMs}
            engineUsed={result.engineUsed}
            aiProvider={result.aiProviderUsed}
            isValidJson={result.validation.isValidJson}
            isRepaired={result.validation.repaired}
          />

          {/* PERSISTENT 5-STEP PIPELINE STATUS: Remains visible after passing */}
          <ProcessingState
            currentStep={5}
            isCompleted={true}
            executionTimeMs={result.executionTimeMs}
          />

          {/* Comparison Workspace Toolbar */}
          <div className="comparison-toolbar">
            <div className="comparison-toolbar-left">
              <div className="doc-summary-badge">
                <FileText size={14} color="var(--accent-cyan)" />
                <span className="doc-name">{result.metadata.fileName}</span>
                <span className="doc-meta-sep">•</span>
                <span className="doc-page-count">
                  {result.metadata.pageCount} {result.metadata.pageCount === 1 ? 'page' : 'pages'}
                </span>
              </div>

              <button
                type="button"
                className={`btn btn-toolbar-chip ${showSchemaInResults ? 'active' : ''}`}
                onClick={() => setShowSchemaInResults((prev) => !prev)}
                title="View schema template used"
              >
                <SlidersHorizontal size={13} />
                <span>Custom Schema</span>
              </button>
            </div>

            {/* View Mode Switcher: Split Comparison | JSON Only | PDF Only */}
            <div className="view-mode-group">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Side-by-side comparison: PDF on left, JSON on right"
              >
                <Columns size={13} />
                <span>Side-by-Side Comparison</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
                title="Full width JSON viewer"
              >
                <FileCode2 size={13} />
                <span>JSON Only</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'pdf' ? 'active' : ''}`}
                onClick={() => setViewMode('pdf')}
                title="Full width PDF preview"
              >
                <Eye size={13} />
                <span>PDF Only</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="comparison-toolbar-right">
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                <PlusCircle size={14} />
                <span>Upload Another</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleExtract}
                title="Reprocess with current options"
              >
                <RotateCcw size={14} />
                <span>Reprocess</span>
              </button>
            </div>
          </div>

          {/* Optional Schema Viewer Drawer in Results */}
          {showSchemaInResults && (
            <div className="glass-card" style={{ marginBottom: 20 }}>
              <SchemaEditor
                customSchema={customSchema}
                isEnabled={isSchemaEnabled}
                onChange={setCustomSchema}
                onToggle={setIsSchemaEnabled}
              />
            </div>
          )}

          {/* Side-by-Side Comparison Grid */}
          <div className={`workspace-grid is-comparison mode-${viewMode}`}>
            {/* LEFT PANE: Dedicated PDF Preview with Dynamic Highlight Sync */}
            {(viewMode === 'split' || viewMode === 'pdf') && file && (
              <div className="workspace-col workspace-pdf-col">
                <PdfPreview
                  pdfFile={file}
                  activeHighlight={activeHighlight}
                  detectedKeyValues={detectedKeyValuesList}
                  onSelectKey={(k) => handleSelectField(k)}
                />
              </div>
            )}

            {/* RIGHT PANE: Interactive JSON Inspector (Tree, Fields, Code, Tables) */}
            {(viewMode === 'split' || viewMode === 'json') && (
              <div className="workspace-col workspace-json-col">
                <JsonViewer
                  semanticJson={result.semanticJson}
                  structuralJson={result.structuralJson}
                  provenanceMap={result.provenanceMap}
                  diagnostics={result.diagnostics}
                  fileName={result.metadata.fileName}
                  selectedFieldKey={selectedFieldKey}
                  onSelectField={handleSelectField}
                  onReprocess={handleExtract}
                  onReset={handleReset}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newSet) => setSettings(newSet)}
      />
    </div>
  );
};

export default App;
