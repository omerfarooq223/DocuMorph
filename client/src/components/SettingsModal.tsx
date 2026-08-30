import React, { useState } from 'react';
import { X, ShieldCheck, Sparkles, Server, Info } from 'lucide-react';

export interface AppSettings {
  engine: 'local' | 'ai';
  aiProvider: 'ollama' | 'gemini' | 'openai';
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Server size={20} color="var(--accent-primary)" />
            Engine & AI Settings
          </h3>
          <button className="btn btn-secondary btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Engine Selection */}
          <div className="form-group">
            <label className="form-label">Extraction Engine</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    formData.engine === 'local' ? 'var(--color-success-border)' : 'var(--border-subtle)'
                  }`,
                  background: formData.engine === 'local' ? 'var(--color-success-bg)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                }}
                onClick={() => setFormData({ ...formData, engine: 'local' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--color-success)' }}>
                  <ShieldCheck size={16} />
                  <span>Local Engine</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  100% Offline & Private. Zero API keys or cloud calls.
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    formData.engine === 'ai' ? 'var(--accent-primary)' : 'var(--border-subtle)'
                  }`,
                  background: formData.engine === 'ai' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                }}
                onClick={() => setFormData({ ...formData, engine: 'ai' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  <Sparkles size={16} />
                  <span>AI Agent Mode</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  Optional Ollama / Gemini / OpenAI LLM enhancement.
                </div>
              </div>
            </div>
          </div>

          {/* AI Provider Config */}
          {formData.engine === 'ai' && (
            <>
              <div className="form-group">
                <label className="form-label">AI Provider</label>
                <select
                  className="form-select"
                  value={formData.aiProvider}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      aiProvider: e.target.value as 'ollama' | 'gemini' | 'openai',
                    })
                  }
                >
                  <option value="ollama">Ollama (Local LLM - llama3.2 / mistral / etc.)</option>
                  <option value="gemini">Google Gemini API (gemini-2.5-flash)</option>
                  <option value="openai">OpenAI API (gpt-4o-mini)</option>
                </select>
              </div>

              {formData.aiProvider === 'ollama' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Ollama Base URL</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.ollamaUrl}
                      onChange={(e) => setFormData({ ...formData, ollamaUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                    />
                    <div className="form-hint">Default local endpoint. Ensure Ollama is running.</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ollama Model</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.ollamaModel}
                      onChange={(e) => setFormData({ ...formData, ollamaModel: e.target.value })}
                      placeholder="llama3.2"
                    />
                  </div>
                </>
              )}

              {formData.aiProvider === 'gemini' && (
                <div className="form-group">
                  <label className="form-label">Gemini API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    value={formData.geminiApiKey}
                    onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                    placeholder="AIzaSy..."
                  />
                  <div className="form-hint">Stored only in your local browser storage.</div>
                </div>
              )}

              {formData.aiProvider === 'openai' && (
                <div className="form-group">
                  <label className="form-label">OpenAI API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    value={formData.openaiApiKey}
                    onChange={(e) => setFormData({ ...formData, openaiApiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                  <div className="form-hint">Stored only in your local browser storage.</div>
                </div>
              )}
            </>
          )}

          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              marginBottom: 20,
            }}
          >
            <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent-cyan)' }} />
            <span>
              <strong>Privacy Assurance:</strong> When the Local Engine is active, all PDF text parsing, table detection, OCR, and JSON formatting execute completely offline on your computer.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
