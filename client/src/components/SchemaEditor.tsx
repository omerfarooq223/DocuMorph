import React, { useState } from 'react';
import { Sliders, ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react';

interface SchemaEditorProps {
  customSchema: string;
  isEnabled: boolean;
  onChange: (schema: string) => void;
  onToggle: (enabled: boolean) => void;
}

const TEMPLATES: Record<string, object> = {
  Invoice: {
    invoice_number: '',
    invoice_date: '',
    customer: '',
    items: [
      {
        description: '',
        quantity: 0,
        unit_price: 0,
        total: 0,
      },
    ],
    subtotal: 0,
    tax: 0,
    total: 0,
  },
  'Bank Statement': {
    account_holder: '',
    account_number: '',
    statement_period: '',
    opening_balance: 0,
    closing_balance: 0,
    transactions: [],
  },
  Resume: {
    name: '',
    email: '',
    phone: '',
    summary: '',
    skills: [],
    experience: [],
    education: [],
  },
  Generic: {
    title: '',
    key_information: {},
    sections: [],
  },
};

export const SchemaEditor: React.FC<SchemaEditorProps> = ({
  customSchema,
  isEnabled,
  onChange,
  onToggle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTextChange = (val: string) => {
    onChange(val);
    try {
      if (val.trim()) {
        JSON.parse(val);
      }
      setError(null);
    } catch (e: any) {
      setError('Invalid JSON syntax');
    }
  };

  const handleApplyTemplate = (name: string) => {
    const jsonStr = JSON.stringify(TEMPLATES[name], null, 2);
    onChange(jsonStr);
    setError(null);
    if (!isEnabled) {
      onToggle(true);
    }
  };

  return (
    <div className="schema-accordion">
      <div
        className="schema-accordion-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sliders size={16} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            Custom Schema / Output Template (Optional)
          </span>
          {isEnabled && (
            <span className="file-tag" style={{ color: 'var(--accent-cyan)' }}>
              Active
            </span>
          )}
        </div>
        <div>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </div>

      {isOpen && (
        <div className="schema-accordion-body">
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Define a custom JSON template to enforce the structure of the extracted data. Missing fields will be populated with <code>null</code> or empty arrays without hallucination.
          </p>

          <div className="schema-templates-bar">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center' }}>
              Load preset:
            </span>
            {Object.keys(TEMPLATES).map((tName) => (
              <button
                key={tName}
                type="button"
                className="schema-template-btn"
                onClick={() => handleApplyTemplate(tName)}
              >
                {tName}
              </button>
            ))}
          </div>

          <textarea
            className="schema-textarea"
            value={customSchema}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder='{\n  "field_name": ""\n}'
            spellCheck={false}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
            }}
          >
            <div>
              {error ? (
                <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                  {error}
                </span>
              ) : customSchema.trim() ? (
                <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={14} /> Valid JSON Schema
                </span>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {customSchema.trim() && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => {
                    onChange('');
                    onToggle(false);
                  }}
                >
                  <RefreshCw size={12} /> Clear / Auto-Detect
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
