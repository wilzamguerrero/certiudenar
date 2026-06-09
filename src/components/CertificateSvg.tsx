import { forwardRef, useId } from 'react';
import { DEFAULT_FIELDS, FieldConfig, TemplateConfig, migrateTemplateConfig } from '../types.js';

export interface CertificateRenderData {
  name: string;
  identification: string;
  role: string;
}

interface CertificateSvgProps {
  templateConfig?: TemplateConfig | null;
  values: CertificateRenderData;
  className?: string;
  defaultBgImage?: string;
}

export const SVG_BASE_WIDTH = 1200;

export function getFieldBox(field: FieldConfig, svgW: number, svgH: number) {
  const width = (field.width / 100) * svgW;
  const height = (field.height / 100) * svgH;
  const left = (field.x / 100) * svgW - width / 2;
  const top = (field.y / 100) * svgH - height / 2;

  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function getFieldValue(field: FieldConfig, values: CertificateRenderData): string {
  switch (field.dataKey) {
    case 'name':
      return values.name.toUpperCase();
    case 'identification':
      return values.identification;
    case 'role':
      return values.role.toUpperCase();
    case 'custom':
      return (field.staticValue || field.label || '').toUpperCase();
    default:
      return field.label.toUpperCase();
  }
}

function autoFitSize(text: string, field: FieldConfig, svgW: number, svgH: number): number {
  if (!field.autoFit) return field.fontSize;

  const box = getFieldBox(field, svgW, svgH);
  const charRatio = field.fontWeight === 'normal' ? 0.55 : 0.62;
  const approxWidth = Math.max(1, text.length) * field.fontSize * charRatio;

  let size = field.fontSize;
  if (approxWidth > box.width) size = Math.floor(field.fontSize * (box.width / approxWidth));
  if (size > box.height * 0.85) size = Math.floor(box.height * 0.85);

  return Math.max(7, size);
}

const DEFAULT_BG_IMAGE = '/assets/.aistudio/image_banner.jpg';

const CertificateSvg = forwardRef<SVGSVGElement, CertificateSvgProps>(function CertificateSvg(
  {
    templateConfig,
    values,
    className = 'w-full h-full',
    defaultBgImage = DEFAULT_BG_IMAGE,
  },
  ref,
) {
  const clipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const activeTemplate = templateConfig
    ? migrateTemplateConfig(templateConfig)
    : {
        bgImage: null,
        bgAspectRatio: 16 / 9,
        fields: DEFAULT_FIELDS,
      };

  const fields = activeTemplate.fields?.length ? activeTemplate.fields : DEFAULT_FIELDS;
  const svgH = Math.round(SVG_BASE_WIDTH / (activeTemplate.bgAspectRatio ?? 16 / 9));
  const backgroundHref = activeTemplate.bgImage || defaultBgImage;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SVG_BASE_WIDTH} ${svgH}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {fields.map(field => {
          const box = getFieldBox(field, SVG_BASE_WIDTH, svgH);
          return (
            <clipPath key={field.id} id={`${clipPrefix}-${field.id}`}>
              <rect x={box.left} y={box.top} width={box.width} height={box.height} />
            </clipPath>
          );
        })}
      </defs>

      <image
        href={backgroundHref}
        width={SVG_BASE_WIDTH}
        height={svgH}
        x="0"
        y="0"
        preserveAspectRatio="xMidYMid slice"
      />

      {fields.map(field => {
        if (!field.enabled) return null;

        const box = getFieldBox(field, SVG_BASE_WIDTH, svgH);
        const textVal = getFieldValue(field, values);
        const fontSize = autoFitSize(textVal, field, SVG_BASE_WIDTH, svgH);
        const textAnchor = field.align === 'center' ? 'middle' : field.align === 'right' ? 'end' : 'start';
        const textX = field.align === 'center' ? box.centerX : field.align === 'right' ? box.left + box.width : box.left;

        return (
          <text
            key={field.id}
            x={textX}
            y={box.centerY}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontFamily="'Inter', sans-serif"
            fontWeight={field.fontWeight}
            fontSize={fontSize}
            fill={field.color}
            clipPath={`url(#${clipPrefix}-${field.id})`}
          >
            {textVal}
          </text>
        );
      })}
    </svg>
  );
});

export default CertificateSvg;