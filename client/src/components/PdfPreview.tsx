import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Sparkles,
  MapPin,
  Eye,
  Layers,
} from 'lucide-react';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.0.379'}/pdf.worker.min.mjs`;
}

export interface HighlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
  label?: string;
  sourceValue?: any;
  confidence?: string | number;
  sourceMethod?: string;
  coordinateSpace?: 'idr_top_left' | 'ocr_image' | 'pdf_user_space';
  renderDimensions?: { width: number; height: number };
}

interface PdfPreviewProps {
  pdfFile: File;
  activeHighlight?: HighlightBox | null;
  detectedKeyValues?: Array<{
    key: string;
    value: string;
    confidence: string;
    bbox?: { x: number; y: number; width: number; height: number };
    page?: number;
  }>;
  onSelectKey?: (key: string) => void;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({
  pdfFile,
  activeHighlight,
  detectedKeyValues = [],
  onSelectKey,
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [fitMode, setFitMode] = useState<boolean>(true);
  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [activeViewport, setActiveViewport] = useState<any>(null);
  const [showAllOutlines, setShowAllOutlines] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load PDF Document
  useEffect(() => {
    if (!pdfFile) return;

    let isMounted = true;
    setIsLoading(true);

    const loadDocument = async () => {
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        if (isMounted) {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          setCurrentPage(1);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('PDF.js render init warning:', err);
        if (isMounted) setIsLoading(false);
      }
    };

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [pdfFile]);

  // Auto-switch page when an active highlight is provided for a different page
  useEffect(() => {
    if (
      activeHighlight &&
      typeof activeHighlight.page === 'number' &&
      activeHighlight.page >= 1 &&
      activeHighlight.page <= totalPages &&
      activeHighlight.page !== currentPage
    ) {
      setCurrentPage(activeHighlight.page);
    }
  }, [activeHighlight, totalPages, currentPage]);

  // Render Page to Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    let renderTask: any = null;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const rawViewport = page.getViewport({ scale: 1.0 });
      setPageDims({ width: rawViewport.width, height: rawViewport.height });

      // Determine scale based on fit mode or manual zoom
      const containerWidth = containerRef.current.clientWidth || 500;
      const baseScale = fitMode
        ? Math.max(0.6, (containerWidth - 32) / rawViewport.width)
        : zoomScale;

      const viewport = page.getViewport({ scale: baseScale });
      setActiveViewport(viewport);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Handle HiDPI displays
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.scale(dpr, dpr);

      const renderContext = {
        canvasContext: context,
        viewport,
      };

      renderTask = page.render(renderContext);
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('Canvas render error:', err);
      }
    }
  }, [pdfDoc, currentPage, fitMode, zoomScale]);

  useEffect(() => {
    renderCurrentPage();

    const handleResize = () => {
      if (fitMode) renderCurrentPage();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCurrentPage, fitMode]);

  // Transform coordinates to viewport CSS pixels
  const transformBox = useCallback(
    (box: { x: number; y: number; width: number; height: number }, coordSpace?: string) => {
      if (!activeViewport) return null;

      const space = coordSpace || 'idr_top_left';

      if (space === 'idr_top_left' && typeof activeViewport.convertToViewportPoint === 'function') {
        const pageHeight = pageDims.height || 842;
        const pdfX1 = box.x;
        const pdfY1 = pageHeight - box.y - 2;
        const pdfX2 = box.x + box.width;
        const pdfY2 = pageHeight - box.y + box.height;

        const p1 = activeViewport.convertToViewportPoint(pdfX1, pdfY1);
        const p2 = activeViewport.convertToViewportPoint(pdfX2, pdfY2);
        const p3 = activeViewport.convertToViewportPoint(pdfX1, pdfY2);
        const p4 = activeViewport.convertToViewportPoint(pdfX2, pdfY1);

        const allX = [p1[0], p2[0], p3[0], p4[0]];
        const allY = [p1[1], p2[1], p3[1], p4[1]];

        const minX = Math.min(...allX);
        const minY = Math.min(...allY);
        const w = Math.max(10, Math.max(...allX) - minX);
        const h = Math.max(12, Math.max(...allY) - minY);

        return { x: minX, y: minY, width: w, height: h };
      }

      // Fallback direct scale
      const s = activeViewport.scale || 1.0;
      return {
        x: box.x * s,
        y: box.y * s,
        width: Math.max(10, box.width * s),
        height: Math.max(12, box.height * s),
      };
    },
    [activeViewport, pageDims]
  );

  // Active Highlight calculation
  const computedHighlight = useMemo(() => {
    if (!activeHighlight) return null;
    const highlightPage = activeHighlight.page || 1;
    if (highlightPage !== currentPage) return null;

    const coords = transformBox(activeHighlight, activeHighlight.coordinateSpace);
    if (!coords) return null;

    return {
      ...coords,
      label: activeHighlight.label || 'Selected Field',
      sourceValue: activeHighlight.sourceValue,
      confidence: activeHighlight.confidence || 'high',
      sourceMethod: activeHighlight.sourceMethod || 'pdf_text',
    };
  }, [activeHighlight, currentPage, transformBox]);

  // Page level detected bounding boxes for outline toggle
  const currentDetectedBoxes = useMemo(() => {
    if (!showAllOutlines || !detectedKeyValues.length) return [];
    return detectedKeyValues
      .filter((kv) => (kv.page || 1) === currentPage && kv.bbox)
      .map((kv) => {
        const coords = transformBox(kv.bbox!);
        return {
          key: kv.key,
          value: kv.value,
          coords,
        };
      })
      .filter((item) => item.coords !== null);
  }, [showAllOutlines, detectedKeyValues, currentPage, transformBox]);

  const handleZoomIn = () => {
    setFitMode(false);
    setZoomScale((prev) => Math.min(2.5, Math.round((prev + 0.2) * 10) / 10));
  };

  const handleZoomOut = () => {
    setFitMode(false);
    setZoomScale((prev) => Math.max(0.5, Math.round((prev - 0.2) * 10) / 10));
  };

  const handleFitToggle = () => {
    setFitMode(true);
    setZoomScale(1.0);
  };

  return (
    <div className="glass-card pdf-preview-card" ref={containerRef}>
      {/* PDF Viewer Header Toolbar */}
      <div className="pdf-preview-toolbar">
        <div className="pdf-toolbar-left">
          <div className="pdf-title-badge" title={pdfFile.name}>
            <FileText size={15} color="var(--accent-cyan)" />
            <span className="pdf-filename">{pdfFile.name}</span>
          </div>

          {totalPages > 1 && (
            <div className="pdf-page-controls">
              <button
                type="button"
                className="btn btn-icon-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="pdf-page-indicator">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                type="button"
                className="btn btn-icon-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="pdf-toolbar-right">
          {detectedKeyValues.length > 0 && (
            <button
              type="button"
              className={`btn btn-toolbar-chip ${showAllOutlines ? 'active' : ''}`}
              onClick={() => setShowAllOutlines((prev) => !prev)}
              title="Toggle bounding boxes for all detected key-values"
            >
              <Layers size={13} />
              <span>All Bounds ({detectedKeyValues.length})</span>
            </button>
          )}

          <div className="pdf-zoom-group">
            <button
              type="button"
              className="btn btn-icon-sm"
              onClick={handleZoomOut}
              title="Zoom out"
              disabled={zoomScale <= 0.5}
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className={`btn btn-toolbar-chip ${fitMode ? 'active' : ''}`}
              onClick={handleFitToggle}
              title="Fit to container width"
            >
              <Maximize2 size={12} />
              <span>Fit</span>
            </button>
            <button
              type="button"
              className="btn btn-icon-sm"
              onClick={handleZoomIn}
              title="Zoom in"
              disabled={zoomScale >= 2.5}
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive PDF Canvas Area */}
      <div className="pdf-canvas-container">
        {isLoading && (
          <div className="pdf-loading-overlay">
            <Sparkles size={24} className="spinner" color="var(--accent-primary)" />
            <span>Loading high-fidelity PDF render...</span>
          </div>
        )}

        <div className="pdf-canvas-wrapper">
          <canvas ref={canvasRef} className="pdf-render-canvas" />

          {/* All Detected Outlines Layer */}
          {showAllOutlines &&
            currentDetectedBoxes.map((item, idx) => (
              <div
                key={idx}
                className="detected-outline-box"
                style={{
                  position: 'absolute',
                  left: `${item.coords!.x}px`,
                  top: `${item.coords!.y}px`,
                  width: `${item.coords!.width}px`,
                  height: `${item.coords!.height}px`,
                }}
                onClick={() => onSelectKey?.(item.key)}
                title={`Key: ${item.key}\nValue: ${item.value}`}
              />
            ))}

          {/* Active Field Illuminated Highlight */}
          {computedHighlight && (
            <div
              className="pdf-highlight-box"
              style={{
                position: 'absolute',
                left: `${computedHighlight.x}px`,
                top: `${computedHighlight.y}px`,
                width: `${computedHighlight.width}px`,
                height: `${computedHighlight.height}px`,
              }}
            >
              {/* Floating Tooltip Label */}
              <div className="pdf-highlight-badge">
                <MapPin size={11} />
                <span className="badge-label">{computedHighlight.label}</span>
                <span className="badge-confidence">
                  {typeof computedHighlight.confidence === 'number'
                    ? `${Math.round(computedHighlight.confidence * 100)}%`
                    : computedHighlight.confidence}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Hint / Info Bar */}
      <div className="pdf-preview-footer">
        <div className="pdf-footer-hint">
          <Eye size={13} color="var(--accent-cyan)" />
          <span>
            {computedHighlight
              ? `Inspecting "${computedHighlight.label}" • ${
                  computedHighlight.sourceMethod === 'ocr' ? 'OCR Recognized' : 'Native Text'
                }`
              : 'Click any key, value, or table row on the right to jump & illuminate it here.'}
          </span>
        </div>
      </div>
    </div>
  );
};
