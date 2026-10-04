import React, { useState, useMemo, useCallback } from 'react';
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
  Activity,
  MapPin,
  Table,
  Sparkles,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import type { HighlightBox } from './PdfPreview.js';

interface JsonViewerProps {
  semanticJson: Record<string, any>;
  structuralJson: any;
  provenanceMap?: Record<string, any>;
  diagnostics?: any;
  fileName: string;
  selectedFieldKey?: string | null;
  onSelectField?: (key: string | null, highlight?: HighlightBox | null) => void;
  onReprocess: () => void;
  onReset: () => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  semanticJson,
  structuralJson,
  provenanceMap,
  diagnostics,
  fileName,
  selectedFieldKey,
  onSelectField,
  onReprocess,
  onReset,
}) => {
  const [activeTab, setActiveTab] = useState<'tree' | 'fields' | 'code' | 'tables' | 'diagnostics'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Set of all keys that have provenance mapping
  const provenanceKeys = useMemo(() => {
    const set = new Set<string>();
    if (provenanceMap) {
      Object.keys(provenanceMap).forEach((k) => set.add(k));
    }
    // Also include keys detected in diagnostics
    if (diagnostics?.pages) {
      for (const p of diagnostics.pages) {
        p.detectedKeyValues?.forEach((kv: any) => {
          if (kv.key) set.add(kv.key);
        });
      }
    }
    return set;
  }, [provenanceMap, diagnostics]);

  // Handler when any key or field is selected to trigger PDF highlight
  const handleKeyClick = useCallback(
    (key: string, val?: any) => {
      if (!onSelectField) return;

      // 1. Check direct provenanceMap
      if (provenanceMap && provenanceMap[key]) {
        const prov = provenanceMap[key];
        const rawBox = prov.boundingBox || prov.bbox;
        if (rawBox) {
          onSelectField(key, {
            x: rawBox.x,
            y: rawBox.y,
            width: rawBox.width,
            height: rawBox.height,
            page: prov.page || 1,
            label: key,
            sourceValue: prov.sourceValue || prov.value || val,
            confidence: prov.confidence || 'high',
            sourceMethod: prov.sourceMethod || 'pdf_text',
            coordinateSpace: prov.coordinateSpace || (prov.sourceMethod === 'ocr' ? 'ocr_image' : 'idr_top_left'),
            renderDimensions: prov.renderDimensions,
          });
          return;
        }
      }

      // 2. Check diagnostics detectedKeyValues
      if (diagnostics?.pages) {
        for (const p of diagnostics.pages) {
          const match = p.detectedKeyValues?.find(
            (kv: any) => kv.key?.toLowerCase() === key.toLowerCase()
          );
          if (match && match.bbox) {
            onSelectField(key, {
              x: match.bbox.x,
              y: match.bbox.y,
              width: match.bbox.width,
              height: match.bbox.height,
              page: p.page || 1,
              label: key,
              sourceValue: match.value || val,
              confidence: match.confidence || 'high',
              sourceMethod: p.ocrUsed ? 'ocr' : 'pdf_text',
              coordinateSpace: 'idr_top_left',
            });
            return;
          }
        }
      }

      // Fallback
      onSelectField(key, null);
    },
    [provenanceMap, diagnostics, onSelectField]
  );

  // Table selection handler
  const handleTableClick = useCallback(
    (tableIndex: number) => {
      const table = structuralJson?.tables?.[tableIndex];
      if (!table || !onSelectField) return;

      const rawBox = table.boundingBox || table.bbox;
      if (rawBox) {
        onSelectField(`table_${tableIndex}`, {
          x: rawBox.x,
          y: rawBox.y,
          width: rawBox.width,
          height: rawBox.height,
          page: table.pages?.[0] || 1,
          label: `Table #${tableIndex + 1}`,
          sourceValue: `${table.rows?.length || 0} rows`,
          confidence: table.confidence || 'high',
          sourceMethod: 'pdf_text',
          coordinateSpace: 'idr_top_left',
        });
      } else {
        onSelectField(`table_${tableIndex}`, null);
      }
    },
    [structuralJson, onSelectField]
  );

  // JSON string for raw code view
  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(semanticJson, null, 2);
    } catch {
      return '{}';
    }
  }, [semanticJson]);

  // Syntax highlighting for code view
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

  // Flat list of semantic fields for quick scanning
  const flatFields = useMemo(() => {
    const list: Array<{ key: string; value: any; hasProvenance: boolean; confidence?: string }> = [];

    const recurse = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([k, v]) => {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          recurse(v, fullKey);
        } else {
          const prov = provenanceMap?.[k] || provenanceMap?.[fullKey];
          list.push({
            key: fullKey,
            value: v,
            hasProvenance: provenanceKeys.has(k) || provenanceKeys.has(fullKey),
            confidence: prov?.confidence || 'high',
          });
        }
      });
    };

    recurse(semanticJson);
    return list;
  }, [semanticJson, provenanceKeys, provenanceMap]);

  // Filtered flat fields based on search
  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return flatFields;
    const q = searchQuery.toLowerCase();
    return flatFields.filter(
      (f) => f.key.toLowerCase().includes(q) || JSON.stringify(f.value).toLowerCase().includes(q)
    );
  }, [flatFields, searchQuery]);

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
    const safeBaseName = (fileName || 'document')
      .replace(/^.*[\\\/]/, '')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-\.]+/g, '_')
      .slice(0, 64);
    const outName = `${safeBaseName || 'document'}_extracted.json`;
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

  const tablesList = structuralJson?.tables || [];

  return (
    <div className="glass-card results-card">
      {/* Viewer Header Tabs & Search */}
      <div className="results-header">
        <div className="results-meta-chips">
          <div className="mode-toggle-group">
            <button
              type="button"
              className={`mode-toggle-btn ${activeTab === 'tree' ? 'active' : ''}`}
              onClick={() => setActiveTab('tree')}
              title="Interactive JSON Tree with click-to-highlight on PDF"
            >
              <FolderTree size={13} style={{ display: 'inline', marginRight: 4 }} />
              Interactive Tree
            </button>

            <button
              type="button"
              className={`mode-toggle-btn ${activeTab === 'fields' ? 'active' : ''}`}
              onClick={() => setActiveTab('fields')}
              title="Semantic Fields list with PDF provenance links"
            >
              <Tag size={13} style={{ display: 'inline', marginRight: 4 }} />
              Semantic Fields ({flatFields.length})
            </button>

            <button
              type="button"
              className={`mode-toggle-btn ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
              title="Formatted JSON Code view"
            >
              <Code size={13} style={{ display: 'inline', marginRight: 4 }} />
              Code
            </button>

            {tablesList.length > 0 && (
              <button
                type="button"
                className={`mode-toggle-btn ${activeTab === 'tables' ? 'active' : ''}`}
                onClick={() => setActiveTab('tables')}
                title="Extracted Table Grids"
              >
                <Table size={13} style={{ display: 'inline', marginRight: 4 }} />
                Tables ({tablesList.length})
              </button>
            )}

            <button
              type="button"
              className={`mode-toggle-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => setActiveTab('diagnostics')}
              title="Developer Diagnostics & Invariant Integrity"
            >
              <Activity size={13} style={{ display: 'inline', marginRight: 4 }} />
              Diagnostics
            </button>
          </div>
        </div>

        {/* Search input */}
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

      {/* Interactive Helper Banner */}
      <div className="viewer-hint-banner">
        <Sparkles size={13} color="var(--accent-cyan)" />
        <span>
          Click any key or value below to <strong>jump & illuminate</strong> its exact physical location on the PDF preview.
        </span>
      </div>

      {/* TAB 1: Interactive Tree View */}
      {activeTab === 'tree' && (
        <div className="json-viewer-wrapper">
          <div className="json-code-content">
            <JsonTreeNode
              data={semanticJson}
              filterQuery={searchQuery}
              onSelectKey={handleKeyClick}
              selectedKey={selectedFieldKey}
              provenanceKeys={provenanceKeys}
            />
          </div>
        </div>
      )}

      {/* TAB 2: Semantic Fields Explorer */}
      {activeTab === 'fields' && (
        <div className="json-viewer-wrapper">
          <div className="fields-explorer-container">
            {filteredFields.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                No fields match your search filter "{searchQuery}".
              </div>
            ) : (
              <div className="fields-table-wrap">
                <table className="fields-table">
                  <thead>
                    <tr>
                      <th>Key / Field</th>
                      <th>Extracted Value</th>
                      <th style={{ textAlign: 'center' }}>PDF Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFields.map((f) => {
                      const isSelected = selectedFieldKey === f.key;
                      return (
                        <tr
                          key={f.key}
                          className={`field-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleKeyClick(f.key, f.value)}
                        >
                          <td className="field-key-cell">
                            <span className="field-key-name">{f.key}</span>
                          </td>
                          <td className="field-val-cell">
                            <span className="field-val-text">
                              {typeof f.value === 'object'
                                ? JSON.stringify(f.value)
                                : String(f.value)}
                            </span>
                          </td>
                          <td className="field-action-cell">
                            {f.hasProvenance ? (
                              <button
                                type="button"
                                className={`btn-highlight-target ${isSelected ? 'active' : ''}`}
                                title="Click to view & highlight on PDF"
                              >
                                <MapPin size={12} />
                                <span>Illuminate</span>
                              </button>
                            ) : (
                              <span className="text-dim-small">Inferred</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Raw Code View */}
      {activeTab === 'code' && (
        <div className="json-viewer-wrapper">
          <div
            className="json-code-content"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </div>
      )}

      {/* TAB 4: Extracted Tables View */}
      {activeTab === 'tables' && (
        <div className="json-viewer-wrapper">
          <div className="tables-viewer-container">
            {tablesList.map((t: any, idx: number) => {
              const isSelected = selectedFieldKey === `table_${idx}`;
              return (
                <div key={idx} className={`table-block-card ${isSelected ? 'selected' : ''}`}>
                  <div className="table-block-header">
                    <div>
                      <strong>Table #{idx + 1}</strong> • {t.headers?.length || 0} columns,{' '}
                      {t.rows?.length || 0} rows (Page {t.pages?.join(', ') || 1})
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon-sm"
                      onClick={() => handleTableClick(idx)}
                      title="Highlight table on PDF preview"
                    >
                      <MapPin size={12} />
                      <span>Highlight on PDF</span>
                    </button>
                  </div>

                  <div className="table-scroll-container">
                    <table className="extracted-data-table">
                      {t.headers && t.headers.length > 0 && (
                        <thead>
                          <tr>
                            {t.headers.map((h: string, hi: number) => (
                              <th key={hi}>{h || `Col ${hi + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {(t.rows || []).map((row: string[], ri: number) => (
                          <tr key={ri}>
                            {row.map((cell: string, ci: number) => (
                              <td key={ci}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: Developer Diagnostics & Invariants */}
      {activeTab === 'diagnostics' && (
        <div className="json-viewer-wrapper">
          <div className="diagnostics-container">
            <div className="diag-section">
              <h4>Pipeline Execution & Timing Breakdown</h4>
              <div className="diag-metrics-grid">
                {Object.entries(diagnostics?.stageTimings || {}).map(([stage, time]) => (
                  <div key={stage} className="diag-metric-box">
                    <span className="diag-metric-label">{stage.replace(/Ms$/, '')}:</span>
                    <span className="diag-metric-value">{String(time)}ms</span>
                  </div>
                ))}
              </div>
            </div>

            {diagnostics?.invariantsCheck && (
              <div className="diag-section" style={{ marginTop: 16 }}>
                <h4>Extraction Invariants Verification</h4>
                <div
                  className={`invariants-badge ${
                    diagnostics.invariantsCheck.valid ? 'success' : 'warning'
                  }`}
                >
                  <ShieldCheck size={16} />
                  <span>
                    Status: {diagnostics.invariantsCheck.valid ? 'Passed All Invariant Checks' : 'Review Notes'}
                  </span>
                </div>
                {diagnostics.invariantsCheck.violations?.length > 0 && (
                  <ul className="diag-violations-list">
                    {diagnostics.invariantsCheck.violations.map((v: string, i: number) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="diag-section" style={{ marginTop: 16 }}>
              <h4>Raw IDR Diagnostics Data</h4>
              <pre className="diag-raw-pre">
                {JSON.stringify(diagnostics || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Footer Action Bar */}
      <div className="viewer-action-bar">
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            <PlusCircle size={15} />
            Upload Another PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReprocess}
            title="Re-run extraction pipeline"
          >
            <RotateCcw size={15} />
            Reprocess
          </button>
        </div>

        <div className="action-bar-right">
          <button type="button" className="btn btn-secondary" onClick={handleCopy}>
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

          <button type="button" className="btn btn-primary" onClick={handleDownload}>
            <Download size={15} />
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Interactive Collapsible Tree View for JSON with Click-to-Highlight
 */
interface JsonTreeNodeProps {
  data: any;
  nodeKey?: string;
  filterQuery?: string;
  onSelectKey?: (key: string, val: any) => void;
  selectedKey?: string | null;
  provenanceKeys?: Set<string>;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  data,
  nodeKey,
  filterQuery,
  onSelectKey,
  selectedKey,
  provenanceKeys,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const isObject = typeof data === 'object' && data !== null;
  const isArray = Array.isArray(data);

  const hasProvenance = nodeKey ? provenanceKeys?.has(nodeKey) : false;
  const isSelected = nodeKey ? selectedKey === nodeKey : false;

  const handleRowClick = (e: React.MouseEvent) => {
    if (nodeKey && onSelectKey) {
      e.stopPropagation();
      onSelectKey(nodeKey, data);
    }
  };

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
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''} ${hasProvenance ? 'has-prov' : ''}`}
        onClick={handleRowClick}
        title={hasProvenance ? `Click to highlight "${nodeKey}" on PDF preview` : undefined}
      >
        {nodeKey && (
          <span className="json-key">
            "{nodeKey}":{' '}
            {hasProvenance && (
              <MapPin size={10} className="tree-pinpoint-icon" color="var(--accent-cyan)" />
            )}
          </span>
        )}
        <span className={valClass}>{valStr}</span>
      </div>
    );
  }

  const entries = Object.entries(data);
  const brackets = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <div>
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''}`}
        onClick={() => {
          if (nodeKey && onSelectKey) onSelectKey(nodeKey, data);
          setCollapsed(!collapsed);
        }}
      >
        <span className={`tree-collapse-icon ${collapsed ? 'collapsed' : ''}`}>
          <ChevronDown size={14} />
        </span>
        {nodeKey && (
          <span className="json-key">
            "{nodeKey}":{' '}
            {hasProvenance && (
              <MapPin size={10} className="tree-pinpoint-icon" color="var(--accent-cyan)" />
            )}
          </span>
        )}
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
            <JsonTreeNode
              key={k}
              data={v}
              nodeKey={isArray ? undefined : k}
              filterQuery={filterQuery}
              onSelectKey={onSelectKey}
              selectedKey={selectedKey}
              provenanceKeys={provenanceKeys}
            />
          ))}
          <div className="tree-node-row">
            <span className="json-punctuation">{brackets[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
};
