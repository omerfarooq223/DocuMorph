import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { DropZone } from './components/DropZone.js';
import { FileCard } from './components/FileCard.js';
import { SchemaEditor } from './components/SchemaEditor.js';
import { ProcessingState } from './components/ProcessingState.js';
import { JsonViewer } from './components/JsonViewer.js';
import { MetadataPanel } from './components/MetadataPanel.js';
import { SettingsModal, type AppSettings } from './components/SettingsModal.js';
import { ErrorAlert } from './components/ErrorAlert.js';
import { Play } from 'lucide-react';

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

    // Progress stepper animation timer
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
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const extractResult: ExtractionResultData = await response.json();
      if (!extractResult.success) {
        throw new Error((extractResult as any).error || 'Extraction failed');
      }

      // Small delay for smooth UI transition
      setTimeout(() => {
        setResult(extractResult);
        setIsProcessing(false);
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
  };

  return (
    <div className="app-container">
      <Header
        engineMode={settings.engine}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="hero-section">
        <h1 className="hero-title">Intelligent PDF to JSON Agent</h1>
        <p className="hero-subtitle">
          Extract logical document structures, tables, key-values, lists, and semantic hierarchies into clean, validated JSON with 100% local privacy and zero hallucinations.
        </p>
      </div>

      {error && <ErrorAlert message={error} onRetry={handleExtract} onDismiss={() => setError(null)} />}

      <div className={`workspace-grid ${result ? 'has-results' : ''}`}>
        {/* Left Column: Upload & Controls */}
        <div>
          {!file ? (
            <DropZone
              onFileSelect={handleFileSelect}
              onLoadSample={handleLoadSample}
              isLoadingSample={isLoadingSample}
            />
          ) : (
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

              {!isProcessing && !result && (
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

              {result && (
                <div style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-full"
                    onClick={handleReset}
                  >
                    Upload Another PDF
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: JSON Result Viewer */}
        {result && (
          <div>
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

            <JsonViewer
              semanticJson={result.semanticJson}
              structuralJson={result.structuralJson}
              fileName={result.metadata.fileName}
              onReprocess={handleExtract}
              onReset={handleReset}
            />
          </div>
        )}
      </div>

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


