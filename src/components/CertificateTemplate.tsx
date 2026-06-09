import { useRef, useState, useEffect } from 'react';
import { Download, Check, RefreshCw } from 'lucide-react';
import { TemplateConfig, FieldConfig, DEFAULT_FIELDS, migrateTemplateConfig } from '../types.js';

interface CertificateProps {
  name: string;
  identification: string;
  role: string;
  id?: string;
  pageId?: string;
  onDownloaded?: () => void;
  templateConfig?: TemplateConfig | null;
}

/** Approximate auto-fit font size to fit within bounding box */
function autoFitSize(text: string, field: FieldConfig, svgW: number, svgH: number): number {
  if (!field.autoFit) return field.fontSize;
  const boxW = (field.width / 100) * svgW;
  const boxH = (field.height / 100) * svgH;
  const charRatio = field.fontWeight === 'normal' ? 0.55 : 0.62;
  const approxW = text.length * field.fontSize * charRatio;
  let size = field.fontSize;
  if (approxW > boxW) size = Math.floor(field.fontSize * (boxW / approxW));
  if (size > boxH * 0.85) size = Math.floor(boxH * 0.85);
  return Math.max(7, size);
}

export default function CertificateTemplate({
  name, identification, role, id = 'TEMP123', pageId, onDownloaded, templateConfig
}: CertificateProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<TemplateConfig | null>(null);

  useEffect(() => {
    if (!templateConfig) {
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data?.template) setLocalTemplate(res.data.template);
        })
        .catch(() => {});
    }
  }, [templateConfig]);

  const rawTemplate = templateConfig || localTemplate;
  const activeTemplate = rawTemplate ? migrateTemplateConfig(rawTemplate) : null;

  const SVG_W = 1200;
  const SVG_H = Math.round(SVG_W / (activeTemplate?.bgAspectRatio ?? (16 / 9)));
  const DL_W = 1920;
  const DL_H = Math.round(DL_W / (activeTemplate?.bgAspectRatio ?? (16 / 9)));

  const getFieldValue = (field: FieldConfig): string => {
    switch (field.dataKey) {
      case 'name': return name.toUpperCase();
      case 'identification': return identification;
      case 'role': return role.toUpperCase();
      case 'custom': return (field.staticValue || field.label || '').toUpperCase();
      default: return field.label.toUpperCase();
    }
  };

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const svgString = new XMLSerializer().serializeToString(svgRef.current);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = window.URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = DL_W;
        canvas.height = DL_H;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, DL_W, DL_H);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `Certificado_${name.replace(/\s+/g, '_')}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (pageId) {
            const downloadUrl = `${window.location.origin}/?view=download&id=${identification}`;
            fetch('/api/notion/registrants/mark-generated', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pageId, downloadUrl })
            }).catch(() => {});
          }
          setDownloaded(true);
          if (onDownloaded) onDownloaded();
          setTimeout(() => setDownloaded(false), 3000);
        }
        window.URL.revokeObjectURL(blobURL);
        setDownloading(false);
      };
      image.onerror = () => setDownloading(false);
      image.src = blobURL;
    } catch { setDownloading(false); }
  };

  const hasCustomBg = activeTemplate?.bgImage;
  const fields: FieldConfig[] = activeTemplate?.fields ?? DEFAULT_FIELDS;

  return (
    <div className="flex flex-col items-center gap-4 w-full" id={`cert-tmpl-${id}`}>
      <div className="w-full max-w-3xl shadow-2xl rounded-xl overflow-hidden bg-slate-900 border border-slate-700 select-none"
        style={{ aspectRatio: String(activeTemplate?.bgAspectRatio ?? (16 / 9)) }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {hasCustomBg ? (
            <>
              <image href={activeTemplate!.bgImage!} width={SVG_W} height={SVG_H} x="0" y="0" preserveAspectRatio="xMidYMid slice" />
              {fields.map(field => {
                if (!field.enabled) return null;
                const textVal = getFieldValue(field);
                const fSize = autoFitSize(textVal, field, SVG_W, SVG_H);
                const cx = SVG_W * (field.x / 100);
                const cy = SVG_H * (field.y / 100);
                const anchor = field.align === 'center' ? 'middle' : field.align === 'right' ? 'end' : 'start';
                return (
                  <text key={field.id}
                    x={cx} y={cy}
                    textAnchor={anchor}
                    fontFamily="'Inter', sans-serif"
                    fontWeight={field.fontWeight}
                    fontSize={fSize}
                    fill={field.color}
                  >{textVal}</text>
                );
              })}
            </>
          ) : (
            <>
              <image href="/assets/.aistudio/image_banner.jpg" width={SVG_W} height={SVG_H} x="0" y="0" preserveAspectRatio="xMidYMid slice" />
              <text x={270} y={418} textAnchor="middle" fontFamily="'Inter', sans-serif" fontWeight="bold" fontSize={32} fill="#1e1b4b">{name.toUpperCase()}</text>
              <text x={278} y={462} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight="normal" fontSize={18} fill="#1f2937">{identification}</text>
              <text x={270} y={495} textAnchor="middle" fontFamily="'Inter', sans-serif" fontWeight="bold" fontSize={15} fill="#4b5563">{role.toUpperCase()}</text>
            </>
          )}
        </svg>
      </div>

      <div className="flex gap-4">
        <button
          onClick={handleDownload}
          disabled={downloading}
          id="btn-download-cert"
          className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-700 hover:to-violet-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm md:text-base cursor-pointer"
        >
          {downloading ? <><RefreshCw className="w-5 h-5 animate-spin" /> Generando...</>
            : downloaded ? <><Check className="w-5 h-5 text-emerald-300" /> ¡Descargado!</>
            : <><Download className="w-5 h-5" /> Descargar Certificado PNG ({DL_W}×{DL_H})</>}
        </button>
      </div>
    </div>
  );
}
