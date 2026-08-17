import { useEffect, useRef, useState } from 'react';
import { Brush, Check, Circle, Minus, RectangleHorizontal, Trash2, Undo2, X } from 'lucide-react';

const toolIcons = {
  brush: Brush,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  line: Minus
};

function pointFromEvent(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
}

function drawAnnotation(context, annotation, width, height) {
  if (annotation.type === 'brush') {
    const points = (Array.isArray(annotation.points) ? annotation.points : [])
      .map((point) => ({ x: point.x * width, y: point.y * height }));
    if (points.length < 2) return;
    context.save();
    context.strokeStyle = annotation.color;
    context.globalAlpha = 0.56;
    context.lineWidth = Math.max(8, annotation.strokeWidth * Math.min(width, height));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = Math.max(3, context.lineWidth * 0.24);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
    context.restore();
    return;
  }
  const x1 = annotation.x1 * width;
  const y1 = annotation.y1 * height;
  const x2 = annotation.x2 * width;
  const y2 = annotation.y2 * height;
  context.save();
  context.strokeStyle = annotation.color;
  context.lineWidth = Math.max(2, annotation.strokeWidth * Math.min(width, height));
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = 'rgba(0, 0, 0, 0.55)';
  context.shadowBlur = Math.max(2, context.lineWidth * 0.45);
  context.beginPath();
  if (annotation.type === 'line') {
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
  } else if (annotation.type === 'ellipse') {
    context.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.abs(x2 - x1) / 2,
      Math.abs(y2 - y1) / 2,
      0,
      0,
      Math.PI * 2
    );
  } else {
    context.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  context.stroke();
  context.restore();
}

export default function FreeImageReferenceEditor({ reference, language, onClose, onSave }) {
  const zh = language === 'zh';
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const startPointRef = useRef(null);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#facc15');
  const [strokeWidth, setStrokeWidth] = useState(42);
  const [annotations, setAnnotations] = useState(() => reference?.annotations || []);
  const [draft, setDraft] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setAnnotations(reference?.annotations || []);
    setDraft(null);
  }, [reference?.id]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1200;
      const maxHeight = 760;
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      imageRef.current = image;
      setDimensions({
        width: Math.max(1, Math.round(image.naturalWidth * scale)),
        height: Math.max(1, Math.round(image.naturalHeight * scale))
      });
    };
    image.src = reference.imageUrl;
    return () => {
      image.onload = null;
    };
  }, [reference.imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !dimensions.width || !dimensions.height) return;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    annotations.forEach((annotation) => drawAnnotation(context, annotation, dimensions.width, dimensions.height));
    if (draft) drawAnnotation(context, draft, dimensions.width, dimensions.height);
  }, [annotations, dimensions, draft]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function beginDrawing(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event, canvas);
    startPointRef.current = point;
    setDraft({
      type: tool,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      color,
      strokeWidth: strokeWidth / Math.max(1, Math.min(dimensions.width, dimensions.height)),
      ...(tool === 'brush' ? { points: [point] } : {})
    });
  }

  function continueDrawing(event) {
    if (!startPointRef.current || !draft) return;
    const point = pointFromEvent(event, canvasRef.current);
    setDraft((current) => {
      if (current.type !== 'brush') return { ...current, x2: point.x, y2: point.y };
      const previous = current.points?.at(-1) || startPointRef.current;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0025) return current;
      return {
        ...current,
        x2: point.x,
        y2: point.y,
        points: [...(current.points || []), point].slice(-512)
      };
    });
  }

  function finishDrawing(event) {
    if (!startPointRef.current || !draft) return;
    const point = pointFromEvent(event, canvasRef.current);
    const completed = draft.type === 'brush'
      ? { ...draft, x2: point.x, y2: point.y, points: [...(draft.points || []), point].slice(-512) }
      : { ...draft, x2: point.x, y2: point.y };
    const distance = Math.hypot(completed.x2 - completed.x1, completed.y2 - completed.y1);
    if (distance > 0.006 && (completed.type !== 'brush' || completed.points.length > 1)) {
      setAnnotations((current) => [...current, completed]);
    }
    startPointRef.current = null;
    setDraft(null);
  }

  function applyAnnotations() {
    let markedImageUrl = '';
    try {
      markedImageUrl = canvasRef.current?.toDataURL('image/png') || '';
    } catch {
      markedImageUrl = '';
    }
    onSave(annotations, markedImageUrl);
  }

  return (
    <div className="freeReferenceEditorBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="freeReferenceEditorDialog" role="dialog" aria-modal="true" aria-label={zh ? '标记参考图' : 'Mark reference image'}>
        <header>
          <div>
            <strong>{zh ? '标记修改区域' : 'Mark edit regions'}</strong>
            <span>{zh ? '彩色线框仅用于指示修改位置' : 'Colored outlines guide the edit only'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}><X size={18} /></button>
        </header>

        <div className="freeReferenceEditorToolbar">
          <div className="freeReferenceEditorTools" role="group" aria-label={zh ? '标记工具' : 'Annotation tools'}>
            {Object.entries(toolIcons).map(([value, Icon]) => (
              <button
                className={tool === value ? 'active' : ''}
                type="button"
                onClick={() => {
                  setTool(value);
                  setStrokeWidth((current) => value === 'brush' ? Math.max(28, current) : Math.min(16, current));
                }}
                aria-pressed={tool === value}
                key={value}
              >
                <Icon size={17} />
                {zh
                  ? value === 'brush' ? '涂抹' : value === 'rectangle' ? '矩形' : value === 'ellipse' ? '圆形' : '线条'
                  : value === 'brush' ? 'Brush' : value === 'rectangle' ? 'Rectangle' : value === 'ellipse' ? 'Ellipse' : 'Line'}
              </button>
            ))}
          </div>
          <label className="freeReferenceColorControl">
            <span>{zh ? '颜色' : 'Color'}</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label className="freeReferenceWidthControl">
            <span>{zh ? '线宽' : 'Width'}</span>
            <input
              type="range"
              min={tool === 'brush' ? 12 : 2}
              max={tool === 'brush' ? 96 : 16}
              step="1"
              value={strokeWidth}
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => setAnnotations((current) => current.slice(0, -1))} disabled={!annotations.length}>
            <Undo2 size={17} /> {zh ? '撤销' : 'Undo'}
          </button>
          <button type="button" onClick={() => setAnnotations([])} disabled={!annotations.length}>
            <Trash2 size={17} /> {zh ? '清空' : 'Clear'}
          </button>
        </div>

        <div className="freeReferenceEditorCanvasWrap">
          <canvas
            ref={canvasRef}
            onPointerDown={beginDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={finishDrawing}
            onPointerCancel={() => {
              startPointRef.current = null;
              setDraft(null);
            }}
          />
        </div>

        <footer>
          <span>{annotations.length} {zh ? '个标记' : annotations.length === 1 ? 'mark' : 'marks'}</span>
          <div>
            <button type="button" onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
            <button className="primary" type="button" onClick={applyAnnotations}>
              <Check size={17} /> {zh ? '应用标记' : 'Apply marks'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
