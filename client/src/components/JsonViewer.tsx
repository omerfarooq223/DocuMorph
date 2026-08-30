import React, { useState, useMemo } from 'react';
import {
  Copy,
  Download,
  Check,
  Search,
  Code,
  FolderTree,
  ChevronDown,
  RotateCcw,
  PlusCircle,
} from 'lucide-react';

interface JsonViewerProps {
  semanticJson: Record<string, any>;
  structuralJson: any;
  fileName: string;
  onReprocess: () => void;
  onReset: () => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  semanticJson,
  structuralJson,
  fileName,
  onReprocess,
  onReset,
}) => {
  const [outputType, setOutputType] = useState<'semantic' | 'structural'>('semantic');
  const [viewFormat, setViewFormat] = useState<'code' | 'tree'>('code');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const activeData = outputType === 'semantic' ? semanticJson : structuralJson;

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(activeData, null, 2);
    } catch {
      return '{}';
    }
  }, [activeData]);

  // Syntax highlighting for raw code view
  const highlightedHtml = useMemo(() => {
    if (!jsonString) return '';

    let json = jsonString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }, [jsonString]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  const handleDownload = () => {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const outName = `${baseName}_extracted_${outputType}.json`;
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = outName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card results-card">
      <div className="results-header">
        <div className="results-meta-chips">
          <div className="mode-toggle-group">
            <button
              className={`mode-toggle-btn ${outputType === 'semantic' ? 'active' : ''}`}
              onClick={() => setOutputType('semantic')}
            >
              Semantic JSON
            </button>
            <button
              className={`mode-toggle-btn ${outputType === 'structural' ? 'active' : ''}`}
              onClick={() => setOutputType('structural')}
            >
              Structural JSON
            </button>
          </div>

          <div className="mode-toggle-group" style={{ marginLeft: 8 }}>
            <button
              className={`mode-toggle-btn ${viewFormat === 'code' ? 'active' : ''}`}
              onClick={() => setViewFormat('code')}
              title="Code View"
            >
              <Code size={13} style={{ display: 'inline', marginRight: 4 }} />
              Code
            </button>
            <button
              className={`mode-toggle-btn ${viewFormat === 'tree' ? 'active' : ''}`}
              onClick={() => setViewFormat('tree')}
              title="Interactive Tree View"
            >
              <FolderTree size={13} style={{ display: 'inline', marginRight: 4 }} />
              Tree
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="json-search-input"
              placeholder="Search keys/values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search
              size={13}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="json-viewer-wrapper">
        {viewFormat === 'code' ? (
          <div
            className="json-code-content"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <div className="json-code-content">
            <JsonTreeNode data={activeData} filterQuery={searchQuery} />
          </div>
        )}
      </div>

      <div className="viewer-action-bar">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onReset}>
            <PlusCircle size={15} />
            Convert Another PDF
          </button>
          <button className="btn btn-secondary" onClick={onReprocess} title="Re-run extraction pipeline">
            <RotateCcw size={15} />
            Reprocess
          </button>
        </div>

        <div className="action-bar-right">
          <button className="btn btn-secondary" onClick={handleCopy}>
            {copied ? (
              <>
                <Check size={15} color="var(--color-success)" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={15} />
                Copy JSON
              </>
            )}
          </button>

          <button className="btn btn-primary" onClick={handleDownload}>
            <Download size={15} />
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Interactive Collapsible Tree View for JSON
 */
interface JsonTreeNodeProps {
  data: any;
  nodeKey?: string;
  filterQuery?: string;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  data,
  nodeKey,
  filterQuery,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const isObject = typeof data === 'object' && data !== null;
  const isArray = Array.isArray(data);

  if (!isObject) {
    let valStr = String(data);
    let valClass = 'json-string';

    if (typeof data === 'number') valClass = 'json-number';
    else if (typeof data === 'boolean') valClass = 'json-boolean';
    else if (data === null) {
      valStr = 'null';
      valClass = 'json-null';
    } else {
      valStr = `"${valStr}"`;
    }

    return (
      <div className="tree-node-row">
        {nodeKey && <span className="json-key">"{nodeKey}": </span>}
        <span className={valClass}>{valStr}</span>
      </div>
    );
  }

  const entries = Object.entries(data);
  const brackets = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <div>
      <div className="tree-node-row" onClick={() => setCollapsed(!collapsed)}>
        <span className={`tree-collapse-icon ${collapsed ? 'collapsed' : ''}`}>
          <ChevronDown size={14} />
        </span>
        {nodeKey && <span className="json-key">"{nodeKey}": </span>}
        <span className="json-punctuation">{brackets[0]}</span>
        {collapsed && (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', margin: '0 4px' }}>
            ... {entries.length} {isArray ? 'items' : 'keys'} ...
          </span>
        )}
        {collapsed && <span className="json-punctuation">{brackets[1]}</span>}
      </div>

      {!collapsed && (
        <div className="tree-indent">
          {entries.map(([k, v]) => (
            <JsonTreeNode key={k} data={v} nodeKey={isArray ? undefined : k} filterQuery={filterQuery} />
          ))}
          <div className="tree-node-row">
            <span className="json-punctuation">{brackets[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
};
