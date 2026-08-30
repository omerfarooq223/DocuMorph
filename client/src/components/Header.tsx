import React from 'react';
import { FileJson, ShieldCheck, Sparkles, Settings } from 'lucide-react';

interface HeaderProps {
  engineMode: 'local' | 'ai';
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ engineMode, onOpenSettings }) => {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-wrapper">
          <div className="brand-icon-box">
            <FileJson size={22} color="#ffffff" />
          </div>
          <div className="brand-title">
            <span>PDF to JSON Agent</span>
            <span className="brand-badge">v1.0 Local</span>
          </div>
        </div>

        <div className="header-actions">
          {engineMode === 'local' ? (
            <div className="privacy-badge" title="100% Local Heuristic & Layout Engine. Zero data leaves your machine.">
              <span className="pulse-dot"></span>
              <ShieldCheck size={15} />
              <span>100% Local / Offline</span>
            </div>
          ) : (
            <div className="privacy-badge ai-mode" title="AI Agent Engine Enabled">
              <Sparkles size={15} />
              <span>AI Agent Mode</span>
            </div>
          )}

          <button
            className="btn btn-secondary btn-icon"
            onClick={onOpenSettings}
            title="Configure Engine & Providers"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
