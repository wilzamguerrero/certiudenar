/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RoleType = 'estudiante' | 'egresado' | 'empresario';

export type StatusType = 'recibido' | 'correcto' | 'incorrecto';

export interface Registrant {
  id: string;
  name: string;
  identification: string;
  role: RoleType;
  email: string;
  status: StatusType;
  registeredAt: string;
  approvedAt?: string;
}

export interface FieldPosition {
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  fontSize: number; // in pt
  color: string; // hex code
  fontWeight: 'normal' | 'bold' | 'bolder' | 'black';
  enabled: boolean;
  align: 'left' | 'center' | 'right';
}

export interface TemplateConfig {
  bgImage: string | null; // Base64 representation of PNG/JPG or null for Default
  nameField: FieldPosition;
  idField: FieldPosition;
  roleField: FieldPosition;
}

export interface AdminSettings {
  dailyCode: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  senderEmail: string;
  template: TemplateConfig;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

