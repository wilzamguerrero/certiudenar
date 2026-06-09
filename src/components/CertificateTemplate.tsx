/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useEffect } from 'react';
import { Download, Check, RefreshCw } from 'lucide-react';
import { TemplateConfig } from '../types.js';

interface CertificateProps {
  name: string;
  identification: string;
  role: string;
  id?: string;
  onDownloaded?: () => void;
  templateConfig?: TemplateConfig | null;
}

export default function CertificateTemplate({
  name,
  identification,
  role,
  id = 'TEMP123',
  onDownloaded,
  templateConfig
}: CertificateProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<TemplateConfig | null>(null);

  // If no template is provided in props, try to fetch the active Admin configuration
  useEffect(() => {
    if (!templateConfig) {
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data && res.data.template) {
            setLocalTemplate(res.data.template);
          }
        })
        .catch(err => console.error('Error loading default admin template in preview:', err));
    }
  }, [templateConfig]);

  const activeTemplate = templateConfig || localTemplate;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setDownloading(true);

    try {
      const svgElement = svgRef.current;
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = window.URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        // Output canvas in high-definition (1920x1080) for pristine quality
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const context = canvas.getContext('2d');
        
        if (context) {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, 1920, 1080);
          
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `Certificado_${name.replace(/\s+/g, '_')}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          
          setDownloaded(true);
          if (onDownloaded) onDownloaded();
          setTimeout(() => setDownloaded(false), 3000);
        }
        window.URL.revokeObjectURL(blobURL);
        setDownloading(false);
      };
      image.onerror = (err) => {
        console.error('Error rendering SVG representation to canvas:', err);
        setDownloading(false);
      };
      image.src = blobURL;
    } catch (e) {
      console.error('Download error:', e);
      setDownloading(false);
    }
  };

  // Check if we render custom design or default design
  const hasCustomBg = activeTemplate && activeTemplate.bgImage;

  return (
    <div className="flex flex-col items-center gap-4 w-full" id={`cert-tmpl-${id}`}>
      {/* Aspect Ratio Box that holds the SVG */}
      <div className="w-full max-w-3xl aspect-[16/9] shadow-2xl rounded-xl overflow-hidden bg-slate-900 border border-slate-700 select-none">
        <svg
          ref={svgRef}
          viewBox="0 0 1200 675"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {hasCustomBg && activeTemplate ? (
            <>
              {/* RENDER CUSTOM BACKGROUND TEMPLATE WITH MAPPED TEXTS */}
              <image href={activeTemplate.bgImage || ''} width="1200" height="675" x="0" y="0" preserveAspectRatio="xMidYMid slice" />

              {/* Name Field Overlay */}
              {activeTemplate.nameField?.enabled && (
                <text
                  x={1200 * (activeTemplate.nameField.x / 100)}
                  y={675 * (activeTemplate.nameField.y / 100)}
                  textAnchor={activeTemplate.nameField.align === 'center' ? 'middle' : (activeTemplate.nameField.align === 'right' ? 'end' : 'start')}
                  fontFamily="'Inter', sans-serif"
                  fontWeight={activeTemplate.nameField.fontWeight || 'bold'}
                  fontSize={activeTemplate.nameField.fontSize || 32}
                  fill={activeTemplate.nameField.color || '#1e3a8a'}
                >
                  {name.toUpperCase()}
                </text>
              )}

              {/* Identification Field Overlay */}
              {activeTemplate.idField?.enabled && (
                <text
                  x={1200 * (activeTemplate.idField.x / 100)}
                  y={675 * (activeTemplate.idField.y / 100)}
                  textAnchor={activeTemplate.idField.align === 'center' ? 'middle' : (activeTemplate.idField.align === 'right' ? 'end' : 'start')}
                  fontFamily="'JetBrains Mono', monospace, sans-serif"
                  fontWeight={activeTemplate.idField.fontWeight || 'normal'}
                  fontSize={activeTemplate.idField.fontSize || 18}
                  fill={activeTemplate.idField.color || '#374151'}
                >
                  {identification}
                </text>
              )}

              {/* Role Field Overlay */}
              {activeTemplate.roleField?.enabled && (
                <text
                  x={1200 * (activeTemplate.roleField.x / 100)}
                  y={675 * (activeTemplate.roleField.y / 100)}
                  textAnchor={activeTemplate.roleField.align === 'center' ? 'middle' : (activeTemplate.roleField.align === 'right' ? 'end' : 'start')}
                  fontFamily="'Inter', sans-serif"
                  fontWeight={activeTemplate.roleField.fontWeight || 'bold'}
                  fontSize={activeTemplate.roleField.fontSize || 16}
                  fill={activeTemplate.roleField.color || '#4b5563'}
                >
                  {role.toUpperCase()}
                </text>
              )}
            </>
          ) : (
            <>
              {/* FALLBACK BRAND TEMPLATE DIRECTLY USING THE SPECIFIED BANNER */}
              <image href="/assets/.aistudio/image_banner.jpg" width="1200" height="675" x="0" y="0" preserveAspectRatio="xMidYMid slice" />

              {/* Name Field Overlay */}
              <text
                x={270}
                y={418}
                textAnchor="middle"
                fontFamily="'Inter', sans-serif"
                fontWeight="bold"
                fontSize={32}
                fill="#1e1b4b"
              >
                {name.toUpperCase()}
              </text>

              {/* Identification Field Overlay */}
              <text
                x={278}
                y={462}
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace, sans-serif"
                fontWeight="normal"
                fontSize={18}
                fill="#1f2937"
              >
                {identification}
              </text>

              {/* Role Field Overlay */}
              <text
                x={270}
                y={495}
                textAnchor="middle"
                fontFamily="'Inter', sans-serif"
                fontWeight="bold"
                fontSize={15}
                fill="#4b5563"
              >
                {role.toUpperCase()}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* RENDER CONTROLS */}
      <div className="flex gap-4">
        <button
          onClick={handleDownload}
          disabled={downloading}
          id="btn-download-cert"
          className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-700 hover:to-violet-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm md:text-base cursor-pointer"
        >
          {downloading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Generando descarga HD...
            </>
          ) : downloaded ? (
            <>
              <Check className="w-5 h-5 text-emerald-300" />
              ¡Certificado Descargado!
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Descargar Certificado PNG (1920x1080)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
