import { useRef, useState, useEffect } from 'react';
import { Download, Check, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import { TemplateConfig, migrateTemplateConfig } from '../types.js';
import CertificateSvg from './CertificateSvg.tsx';

interface CertificateProps {
  name: string;
  identification: string;
  role: string;
  id?: string;
  pageId?: string;
  onDownloaded?: () => void;
  templateConfig?: TemplateConfig | null;
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

  const DL_W = 1920;
  const DL_H = Math.round(DL_W / (activeTemplate?.bgAspectRatio ?? (16 / 9)));

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

          // Convert to PDF using jsPDF — A4 landscape, preserve aspect ratio
          const pxToMm = 25.4 / 96;
          const pdfW = Math.round(DL_W * pxToMm * 10) / 10;
          const pdfH = Math.round(DL_H * pxToMm * 10) / 10;
          const pdf = new jsPDF({
            orientation: pdfW > pdfH ? 'l' : 'p',
            unit: 'mm',
            format: [pdfW, pdfH],
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
          pdf.save(`Certificado_${name.replace(/\s+/g, '_')}.pdf`);

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

  return (
    <div className="flex flex-col items-center gap-4 w-full" id={`cert-tmpl-${id}`}>
      <div className="w-full shadow-2xl rounded-xl overflow-hidden bg-slate-900 border border-slate-700 select-none"
        style={{ aspectRatio: String(activeTemplate?.bgAspectRatio ?? (16 / 9)) }}>
        <CertificateSvg
          ref={svgRef}
          templateConfig={activeTemplate}
          values={{ name, identification, role }}
          className="w-full h-full"
        />
      </div>

      <div className="flex gap-4 w-full justify-center">
        <button
          onClick={handleDownload}
          disabled={downloading}
          id="btn-download-cert"
          className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-700 hover:to-violet-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm cursor-pointer"
        >
          {downloading ? <><RefreshCw className="w-5 h-5 animate-spin" /> Generando...</>
            : downloaded ? <><Check className="w-5 h-5 text-emerald-300" /> ¡Descargado!</>
            : <><Download className="w-5 h-5" /> Descargar Certificado PDF</>}
        </button>
      </div>
    </div>
  );
}
