/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RoleType = string;

/** Tres estados posibles: recibido → (admin revisa) → certificado | incorrecto */
export type StatusType = 'recibido' | 'incorrecto' | 'certificado';

export interface Registrant {
  id: string;
  name: string;
  identification: string;
  role: RoleType;
  email: string;
  status: StatusType;
  registeredAt: string;
  approvedAt?: string;
  generatedAt?: string;
}

/** Configuración de un campo del certificado */
export interface FieldConfig {
  id: string;
  label: string;
  /** Qué dato del registrante muestra este campo */
  dataKey: 'name' | 'identification' | 'role' | 'custom';
  /** Texto fijo (solo cuando dataKey === 'custom') */
  staticValue?: string;
  /** Centro del campo como % del canvas */
  x: number;
  y: number;
  /** Tamaño del bounding box como % del canvas */
  width: number;
  height: number;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold' | 'bolder' | 'black';
  enabled: boolean;
  align: 'left' | 'center' | 'right';
  /** Reducir automáticamente el tamaño para que el texto quepa en el bounding box */
  autoFit: boolean;
}

/** Legacy — solo para backward-compat */
export interface FieldPosition {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold' | 'bolder' | 'black';
  enabled: boolean;
  align: 'left' | 'center' | 'right';
}

export interface TemplateConfig {
  bgImage: string | null;
  bgAspectRatio?: number; // ancho/alto, default 16/9
  fields: FieldConfig[];
  // Legacy (backward compat)
  nameField?: FieldPosition;
  idField?: FieldPosition;
  roleField?: FieldPosition;
}

export const DEFAULT_FIELDS: FieldConfig[] = [
  {
    id: 'nameField', label: 'Nombre', dataKey: 'name',
    x: 22.5, y: 61.9, width: 40, height: 8,
    fontSize: 32, color: '#1e1b4b', fontWeight: 'bold', enabled: true, align: 'center', autoFit: true
  },
  {
    id: 'idField', label: 'Cédula', dataKey: 'identification',
    x: 23.1, y: 68.4, width: 30, height: 6,
    fontSize: 18, color: '#1f2937', fontWeight: 'normal', enabled: true, align: 'center', autoFit: true
  },
  {
    id: 'roleField', label: 'Rol/Cargo', dataKey: 'role',
    x: 22.5, y: 73.3, width: 25, height: 5,
    fontSize: 15, color: '#4b5563', fontWeight: 'bold', enabled: true, align: 'center', autoFit: true
  }
];

/** Migra configuración antigua (nameField/idField/roleField) al nuevo formato fields[] */
export function migrateTemplateConfig(config: any): TemplateConfig {
  if (config?.fields && Array.isArray(config.fields) && config.fields.length > 0) {
    return {
      bgImage: config.bgImage ?? null,
      bgAspectRatio: config.bgAspectRatio ?? (16 / 9),
      fields: config.fields,
      nameField: config.nameField,
      idField: config.idField,
      roleField: config.roleField,
    };
  }
  const nf = config?.nameField;
  const idF = config?.idField;
  const rf = config?.roleField;
  return {
    bgImage: config?.bgImage ?? null,
    bgAspectRatio: config?.bgAspectRatio ?? (16 / 9),
    fields: [
      { id: 'nameField', label: 'Nombre', dataKey: 'name', x: nf?.x ?? 22.5, y: nf?.y ?? 61.9, width: 40, height: 8, fontSize: nf?.fontSize ?? 32, color: nf?.color ?? '#1e1b4b', fontWeight: nf?.fontWeight ?? 'bold', enabled: nf?.enabled ?? true, align: nf?.align ?? 'center', autoFit: true },
      { id: 'idField', label: 'Cédula', dataKey: 'identification', x: idF?.x ?? 23.1, y: idF?.y ?? 68.4, width: 30, height: 6, fontSize: idF?.fontSize ?? 18, color: idF?.color ?? '#1f2937', fontWeight: idF?.fontWeight ?? 'normal', enabled: idF?.enabled ?? true, align: idF?.align ?? 'center', autoFit: true },
      { id: 'roleField', label: 'Rol/Cargo', dataKey: 'role', x: rf?.x ?? 22.5, y: rf?.y ?? 73.3, width: 25, height: 5, fontSize: rf?.fontSize ?? 15, color: rf?.color ?? '#4b5563', fontWeight: rf?.fontWeight ?? 'bold', enabled: rf?.enabled ?? true, align: rf?.align ?? 'center', autoFit: true }
    ]
  };
}

export interface AdminSettings {
  dailyCode: string;
  template: TemplateConfig;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

