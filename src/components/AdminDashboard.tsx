/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import {
  Users,
  Settings as SettingsIcon,
  FileCheck,
  Key,
  Check,
  X,
  Eye,
  RefreshCw,
  Trash2,
  Upload,
  Sparkles,
  Layers,
  Maximize2,
  FileSpreadsheet,
  Sun,
  Moon,
  Plus,
  Pencil,
  UserPlus,
  Award,
  Clock,
  AlertTriangle,
  Download,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Move,
  LayoutTemplate
} from 'lucide-react';
import { Registrant, FieldConfig, DEFAULT_FIELDS, migrateTemplateConfig } from '../types.js';
import CertificateTemplate from './CertificateTemplate.tsx';
import CertificateSvg, { SVG_BASE_WIDTH, getFieldBox } from './CertificateSvg.tsx';

interface AdminDashboardProps {
  onBackToRegistry: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

type TabType = 'registrants' | 'designer' | 'bulk' | 'settings';
type CertificatePreviewAction = 'view' | 'recertify';

export default function AdminDashboard({ onBackToRegistry, darkMode, setDarkMode }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('registrants');

  // Data
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [settings, setSettings] = useState<any>({
    dailyCode: 'DISENO26',
    template: { bgImage: null, bgAspectRatio: 16 / 9 }
  });

  // UI
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [previewingCert, setPreviewingCert] = useState<Registrant | null>(null);
  const [previewAction, setPreviewAction] = useState<CertificatePreviewAction>('view');
  const [recertifyQueue, setRecertifyQueue] = useState<Registrant[]>([]);

  // Designer – fields
  const [projectFields, setProjectFields] = useState<FieldConfig[]>(DEFAULT_FIELDS);
  const [activeFieldId, setActiveFieldId] = useState<string>('nameField');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasPxWidth, setCanvasPxWidth] = useState(600);

  // Refs for smooth drag/resize (no setState during pointermove)
  const fieldElemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<{ fieldId: string; startCX: number; startCY: number; startFX: number; startFY: number; startFW: number; startFH: number; lastX: number; lastY: number } | null>(null);
  const resizeRef = useRef<{ fieldId: string; handle: 'right' | 'bottom' | 'corner'; startCX: number; startCY: number; startW: number; startH: number; lastW: number; lastH: number } | null>(null);

  // Custom fields in settings
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldDataKey, setNewFieldDataKey] = useState<'name' | 'identification' | 'role' | 'custom'>('custom');

  // Bulk
  const [csvText, setCsvText] = useState('');
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [bulkStatus, setBulkStatus] = useState<{ status: 'idle' | 'processing' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  // Create Project
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [modalError, setModalError] = useState('');

  // Edit Registrant
  const [editingReg, setEditingReg] = useState<Registrant | null>(null);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editRole, setEditRole] = useState<string>('estudiante');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'recibido' | 'incorrecto' | 'certificado'>('recibido');
  const [updatingReg, setUpdatingReg] = useState(false);

  // Add Registrant
  const [showAddRegModal, setShowAddRegModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState<string>('estudiante');
  const [addEmail, setAddEmail] = useState('');
  const [addingReg, setAddingReg] = useState(false);
  const [addRegError, setAddRegError] = useState('');

  // Background image upload state
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadError, setBgUploadError] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Project roles config
  const [projectRoles, setProjectRoles] = useState<string[]>(['estudiante', 'egresado', 'empresario']);
  const [newRoleInput, setNewRoleInput] = useState('');

  const flash = (msg: string, isError = false) => {
    if (isError) { setErrorMsg(msg); setTimeout(() => setErrorMsg(''), 5000); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 5000); }
  };

  const closeCertificatePreview = useCallback(() => {
    setPreviewAction('view');
    setRecertifyQueue([]);
    setPreviewingCert(null);
  }, []);

  const fetchProjectsList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notion/projects');
      const d = await res.json();
      if (d.success && Array.isArray(d.data)) {
        setProjects(d.data);
        if (d.data.length > 0) {
          setSelectedProjectId(prev => {
            const exists = d.data.some((p: any) => p.id === prev);
            return exists ? prev : d.data[0].id;
          });
        }
      } else flash('Fallo al obtener proyectos desde Notion.', true);
    } catch (e) {
      flash('No se pudo conectar para obtener la lista de proyectos.', true);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectRegistrants = async (projectId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notion/projects/${projectId}/registrants`);
      const d = await res.json();
      if (d.success && Array.isArray(d.data)) setRegistrants(d.data);
    } catch { flash('Error al cargar participantes.', true); }
    finally { setLoading(false); }
  };

  const fetchGeneralSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const d = await res.json();
      if (d.success && d.data) setSettings((prev: any) => ({ ...prev, dailyCode: d.data.dailyCode }));
    } catch { /* silent */ }
  };

  useEffect(() => { fetchProjectsList(); fetchGeneralSettings(); }, []);

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      fetchProjectRegistrants(selectedProjectId);
      setSelectedIds(new Set());
      setRecertifyQueue([]);
      setPreviewingCert(null);
      const activeProject = projects.find(p => p.id === selectedProjectId);
      const migrated = migrateTemplateConfig(activeProject?.config || { bgImage: null, bgAspectRatio: 16 / 9, fields: DEFAULT_FIELDS });
      setSettings((prev: any) => ({
        ...prev,
        template: { bgImage: migrated.bgImage, bgAspectRatio: migrated.bgAspectRatio ?? (16 / 9) },
        dailyCode: activeProject?.config?.dailyCode || ''
      }));
      setProjectFields(migrated.fields.length > 0 ? migrated.fields : DEFAULT_FIELDS);
      setActiveFieldId(migrated.fields[0]?.id ?? 'nameField');
      if (Array.isArray(activeProject?.config?.roles) && activeProject.config.roles.length > 0) {
        setProjectRoles(activeProject.config.roles);
      } else {
        setProjectRoles(['estudiante', 'egresado', 'empresario']);
      }
    }
  }, [selectedProjectId, projects]);

  // Canvas pixel width for preview scale
  useEffect(() => {
    const update = () => { if (canvasRef.current) setCanvasPxWidth(canvasRef.current.offsetWidth); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Window-level pointer events for smooth drag/resize (no React re-renders during move)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (dragRef.current) {
        const dx = ((e.clientX - dragRef.current.startCX) / rect.width) * 100;
        const dy = ((e.clientY - dragRef.current.startCY) / rect.height) * 100;
        const halfW = dragRef.current.startFW / 2;
        const halfH = dragRef.current.startFH / 2;
        const nx = Math.max(halfW, Math.min(100 - halfW, dragRef.current.startFX + dx));
        const ny = Math.max(halfH, Math.min(100 - halfH, dragRef.current.startFY + dy));
        dragRef.current.lastX = nx;
        dragRef.current.lastY = ny;
        const el = fieldElemRefs.current.get(dragRef.current.fieldId);
        if (el) {
          el.style.left = `${nx - halfW}%`;
          el.style.top = `${ny - halfH}%`;
        }
      }
      if (resizeRef.current) {
        const dx = ((e.clientX - resizeRef.current.startCX) / rect.width) * 100;
        const dy = ((e.clientY - resizeRef.current.startCY) / rect.height) * 100;
        const el = fieldElemRefs.current.get(resizeRef.current.fieldId);
        let nW = resizeRef.current.startW;
        let nH = resizeRef.current.startH;
        if (resizeRef.current.handle !== 'bottom') { nW = Math.max(4, Math.min(95, resizeRef.current.startW + dx)); resizeRef.current.lastW = nW; }
        if (resizeRef.current.handle !== 'right') { nH = Math.max(2, Math.min(50, resizeRef.current.startH + dy)); resizeRef.current.lastH = nH; }
        if (el) { el.style.width = `${nW}%`; el.style.height = `${nH}%`; }
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        const { fieldId, lastX, lastY } = dragRef.current;
        setProjectFields(prev => prev.map(f => f.id === fieldId ? { ...f, x: Math.round(lastX * 10) / 10, y: Math.round(lastY * 10) / 10 } : f));
        dragRef.current = null;
      }
      if (resizeRef.current) {
        const { fieldId, lastW, lastH, handle } = resizeRef.current;
        const upd: Partial<FieldConfig> = {};
        if (handle !== 'bottom') upd.width = Math.round(lastW * 10) / 10;
        if (handle !== 'right') upd.height = Math.round(lastH * 10) / 10;
        setProjectFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...upd } : f));
        resizeRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  const handleDeleteProject = async () => {
    if (!selectedProjectId) { flash('No hay proyecto activo para eliminar.', true); return; }
    const currentProj = projects.find(p => p.id === selectedProjectId);
    if (!window.confirm(`¿Eliminar el proyecto "${currentProj?.title || 'este proyecto'}" de Notion?\n\nSe eliminará el toggle y su configuración. Los datos de participantes en la tabla NO se borran de Notion automáticamente.\n\nEsta acción no se puede deshacer.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notion/projects/${selectedProjectId}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        flash('Proyecto eliminado de Notion.');
        const remaining = projects.filter(p => p.id !== selectedProjectId);
        setProjects(remaining);
        setSelectedProjectId(remaining.length > 0 ? remaining[0].id : '');
        setRegistrants([]);
      } else flash(d.message || 'No se pudo eliminar el proyecto.', true);
    } catch { flash('Error de conexión al eliminar.', true); }
    finally { setLoading(false); }
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;
    setCreatingProject(true);
    setModalError('');
    try {
      const response = await fetch('/api/notion/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newProjectTitle.trim() })
      });
      const data = await response.json();
      if (data.success) {
        setNewProjectTitle('');
        setShowCreateProjectModal(false);
        flash(`¡Taller "${data.data?.title || 'Nuevo'}" creado con éxito!`);
        setLoading(true);
        const res = await fetch('/api/notion/projects');
        const d = await res.json();
        if (d.success && Array.isArray(d.data)) {
          setProjects(d.data);
          if (data.data?.id) setSelectedProjectId(data.data.id);
        }
        setLoading(false);
      } else setModalError(data.message || 'Error al crear el taller.');
    } catch { setModalError('Error de conexión.'); }
    finally { setCreatingProject(false); }
  };

  const handleSaveSettings = async () => {
    if (!selectedProjectId) return;
    setSavingSettings(true);
    try {
      const activeProject = projects.find((p: any) => p.id === selectedProjectId);
      // Never send a base64 data URL as bgImage — the server would re-upload it and the
      // client would get a stale signed URL back. Instead send the cached Notion URL (if any)
      // or null, and let the server retrieve the current one from its own cache.
      const bgImageToSend =
        settings.template.bgImage && !settings.template.bgImage.startsWith('data:')
          ? settings.template.bgImage
          : activeProject?.config?.bgImage ?? null;
      const configToSave = {
        bgImage: bgImageToSend,
        bgImageBlockId: activeProject?.config?.bgImageBlockId || null,
        bgAspectRatio: settings.template.bgAspectRatio ?? (16 / 9),
        fields: projectFields,
        roles: projectRoles,
        // Legacy backward compat
        nameField: projectFields.find(f => f.id === 'nameField') ?? DEFAULT_FIELDS[0],
        idField: projectFields.find(f => f.id === 'idField') ?? DEFAULT_FIELDS[1],
        roleField: projectFields.find(f => f.id === 'roleField') ?? DEFAULT_FIELDS[2],
      };
      const res = await fetch(`/api/notion/projects/${selectedProjectId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configToSave })
      });
      const result = await res.json();
      if (result.success) {
        flash('Diseño guardado exitosamente.');
        // Use the server-confirmed bgImage (Notion signed URL) if returned;
        // otherwise keep whatever is already stored in the project config.
        const confirmedBgImage = result.bgImage || bgImageToSend;
        const confirmedBlockId = result.bgImageBlockId || activeProject?.config?.bgImageBlockId || null;
        setProjects(prev => prev.map(p => p.id === selectedProjectId ? {
          ...p,
          config: {
            ...configToSave,
            bgImage: confirmedBgImage,
            bgImageBlockId: confirmedBlockId,
          }
        } : p));
        if (confirmedBgImage && confirmedBgImage !== settings.template.bgImage) {
          setSettings((prev: any) => ({ ...prev, template: { ...prev.template, bgImage: confirmedBgImage } }));
        }
      } else flash(result.message || 'Error al guardar.', true);
    } catch { flash('Error de red al guardar.', true); }
    finally { setSavingSettings(false); }
  };

  const handleSavePasscode = async (newCode: string) => {
    if (!selectedProjectId) { flash('Selecciona un proyecto primero.', true); return; }
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/notion/projects/${selectedProjectId}/daily-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode })
      });
      const d = await res.json();
      if (d.success) {
        flash('Código guardado en Notion.');
        setSettings((prev: any) => ({ ...prev, dailyCode: newCode.toUpperCase() }));
        setProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, config: { ...p.config, dailyCode: newCode.toUpperCase() } } : p));
      } else flash(d.message || 'Error al guardar código.', true);
    } catch { flash('Error al guardar código.', true); }
    finally { setSavingSettings(false); }
  };

  const handleDeleteRegistrant = async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar a "${name}" de Notion?`)) return;
    try {
      const res = await fetch('/api/notion/registrants/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: id }) });
      const d = await res.json();
      if (d.success) { flash('Participante eliminado.'); setRegistrants(prev => prev.filter(r => r.id !== id)); }
      else flash(d.message || 'No se pudo eliminar.', true);
    } catch { flash('Error de red.', true); }
  };

  const handleCertify = async (id: string) => {
    try {
      const res = await fetch('/api/notion/registrants/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id, status: 'certificado' })
      });
      const result = await res.json();
      if (result.success) {
        flash('Estado actualizado a Certificado en Notion.');
        setRegistrants(prev => prev.map(r => r.id === id ? { ...r, status: 'certificado' } : r));
      } else flash(result.message || 'No se pudo actualizar.', true);
    } catch { flash('Error de red.', true); }
  };

  const handleMarkIncorrect = async (id: string) => {
    try {
      const res = await fetch('/api/notion/registrants/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id, status: 'incorrecto' })
      });
      const result = await res.json();
      if (result.success) {
        flash('Marcado como incorrecto en Notion.');
        setRegistrants(prev => prev.map(r => r.id === id ? { ...r, status: 'incorrecto' } : r));
      } else flash(result.message || 'No se pudo actualizar.', true);
    } catch { flash('Error de red.', true); }
  };

  const openCertificatePreview = useCallback((registrant: Registrant, queue: Registrant[] = [], action: CertificatePreviewAction = 'view') => {
    setPreviewAction(action);
    setRecertifyQueue(queue);
    setPreviewingCert(registrant);
  }, []);

  const handleRecertify = useCallback((registrant: Registrant) => {
    openCertificatePreview(registrant, [], 'recertify');
  }, [openCertificatePreview]);

  const handleBulkRecertify = useCallback(() => {
    const selectedRegistrants = registrants.filter(reg => selectedIds.has(reg.id) && reg.status === 'certificado');
    if (selectedRegistrants.length === 0) {
      flash('Selecciona al menos un participante ya certificado para recertificar.', true);
      return;
    }

    const [firstRegistrant, ...remainingRegistrants] = selectedRegistrants;
    openCertificatePreview(firstRegistrant, remainingRegistrants, 'recertify');
    flash(
      remainingRegistrants.length > 0
        ? 'Se abrió la recertificación masiva. Descarga cada PDF para avanzar al siguiente participante.'
        : 'Se abrió la recertificación del participante seleccionado.'
    );
  }, [openCertificatePreview, registrants, selectedIds]);

  const handleCertificateDownloaded = useCallback(() => {
    if (!previewingCert) return;

    const generatedAt = new Date().toISOString().split('T')[0];
    const currentRegistrantId = previewingCert.id;
    const currentRegistrantName = previewingCert.name;

    setRegistrants(prev => prev.map(reg =>
      reg.id === currentRegistrantId
        ? { ...reg, status: previewAction === 'recertify' ? 'certificado' : reg.status, generatedAt }
        : reg
    ));

    if (recertifyQueue.length > 0) {
      const [nextRegistrant, ...remainingQueue] = recertifyQueue;
      setRecertifyQueue(remainingQueue);
      setPreviewingCert(nextRegistrant);
      flash(`Certificado actualizado para ${currentRegistrantName}. Sigue con ${nextRegistrant.name}.`);
      return;
    }

    setPreviewingCert(prev => prev ? { ...prev, status: previewAction === 'recertify' ? 'certificado' : prev.status, generatedAt } : prev);
    flash(previewAction === 'recertify'
      ? 'Certificado recertificado con el diseño actual.'
      : 'Certificado descargado con el diseño actual.'
    );
  }, [previewAction, previewingCert, recertifyQueue]);

  const handleSaveEditRegistrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingReg || !editName.trim() || !editId.trim() || !editEmail.trim()) {
      flash('Completa todos los campos.', true); return;
    }
    setUpdatingReg(true);
    try {
      const res = await fetch('/api/notion/registrants/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: editingReg.id, name: editName, identification: editId, role: editRole, email: editEmail, status: editStatus })
      });
      const result = await res.json();
      if (result.success) {
        flash('Participante actualizado en Notion.');
        setRegistrants(prev => prev.map(r => r.id === editingReg.id ? { ...r, name: editName, identification: editId, role: editRole, email: editEmail, status: editStatus } : r));
        setEditingReg(null);
      } else flash(result.message || 'No se pudo actualizar.', true);
    } catch { flash('Error de conexión.', true); }
    finally { setUpdatingReg(false); }
  };

  const handleManualAddRegistrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) { setAddRegError('No hay taller activo.'); return; }
    if (!addName.trim() || !addId.trim() || !addEmail.trim()) { setAddRegError('Completa todos los campos.'); return; }
    setAddingReg(true);
    setAddRegError('');
    try {
      const res = await fetch(`/api/notion/projects/${selectedProjectId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), identification: addId.trim(), role: addRole, email: addEmail.trim() })
      });
      const result = await res.json();
      if (result.success) {
        flash('Participante registrado en Notion.');
        setAddName(''); setAddId(''); setAddRole('estudiante'); setAddEmail('');
        setShowAddRegModal(false);
        await fetchProjectRegistrants(selectedProjectId);
      } else setAddRegError(result.message || 'No se pudo registrar.');
    } catch { setAddRegError('Error de conexión.'); }
    finally { setAddingReg(false); }
  };

  const handleLogoUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { alert('Archivo demasiado grande. Máximo 15MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev: any) => {
      const sourceDataUrl = ev.target.result as string;
      const img = new Image();
      img.onload = async () => {
        const maxWidth = 1920;
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const optimizedDataUrl = mimeType === 'image/png'
          ? canvas.toDataURL(mimeType)
          : canvas.toDataURL(mimeType, 0.9);
        const ar = width / height;

        // Set local preview immediately
        setSettings((prev: any) => ({ ...prev, template: { ...prev.template, bgImage: optimizedDataUrl, bgAspectRatio: ar } }));

        // Auto-save to Notion immediately using the existing /config endpoint
        // so the image persists across browsers without needing a manual "Guardar" click.
        if (selectedProjectId) {
          setBgUploading(true);
          setBgUploadError('');
          try {
            const activeProject = projects.find((p: any) => p.id === selectedProjectId);
            const configToSave = {
              bgImage: optimizedDataUrl,
              bgAspectRatio: ar,
              bgImageBlockId: activeProject?.config?.bgImageBlockId || null,
              fields: projectFields,
              roles: projectRoles,
              nameField: projectFields.find(f => f.id === 'nameField') ?? DEFAULT_FIELDS[0],
              idField: projectFields.find(f => f.id === 'idField') ?? DEFAULT_FIELDS[1],
              roleField: projectFields.find(f => f.id === 'roleField') ?? DEFAULT_FIELDS[2],
            };
            const res = await fetch(`/api/notion/projects/${selectedProjectId}/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: configToSave }),
            });
            const result = await res.json();
            if (!result.success) {
              setBgUploadError(result.message || 'Error al guardar imagen en Notion');
            } else {
              // If the server uploaded the image to Notion, replace the local base64 with the hosted URL
              const notionBgImage = result.bgImage;
              const notionBlockId = result.bgImageBlockId;
              if (notionBgImage && notionBgImage !== optimizedDataUrl) {
                setSettings((prev: any) => ({ ...prev, template: { ...prev.template, bgImage: notionBgImage } }));
              }
              setProjects((prev: any[]) => prev.map(p =>
                p.id === selectedProjectId ? {
                  ...p,
                  config: {
                    ...(p.config || {}),
                    // Only store a proper URL in the projects cache — never base64.
                    // If the Notion URL isn't ready yet (empty string), store null so the
                    // server's refresh logic will fetch a fresh URL on the next load.
                    bgImage: (notionBgImage && notionBgImage !== optimizedDataUrl) ? notionBgImage : (p.config?.bgImage ?? null),
                    bgAspectRatio: ar,
                    bgImageBlockId: notionBlockId || p.config?.bgImageBlockId,
                  }
                } : p
              ));
            }
          } catch {
            setBgUploadError('Error de red al guardar imagen en Notion');
          } finally {
            setBgUploading(false);
          }
        }
      };
      img.src = sourceDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBulkUpdate = async (status: 'certificado' | 'incorrecto' | 'recibido') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setLoading(true);
    let done = 0;
    for (const id of ids) {
      try {
        await fetch('/api/notion/registrants/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: id, status })
        });
        done++;
      } catch {}
    }
    setRegistrants(prev => prev.map(r => selectedIds.has(r.id) ? { ...r, status } : r));
    setSelectedIds(new Set());
    setLoading(false);
    flash(`${done} participante(s) actualizados a "${status === 'certificado' ? 'Certificado' : status === 'incorrecto' ? 'Incorrecto' : 'Recibido'}".`);
  };

  const updateProjectField = useCallback((fieldId: string, updates: Partial<FieldConfig>) => {
    setProjectFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  }, []);

  // CSV parsing
  const parseCsvString = (text: string) => {
    if (!text.trim()) { setParsedItems([]); return; }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let sep = lines[0].includes(';') ? ';' : ',';
    const firstCols = lines[0].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const hasHeaders = firstCols.some(c => c.includes('nom') || c.includes('cc') || c.includes('correo') || c.includes('rol'));
    let headers = hasHeaders ? firstCols : ['nombre', 'identificacion', 'rol', 'correo'];
    const parsed: any[] = [];
    for (let i = hasHeaders ? 1 : 0; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
      if (cols.length < 3) continue;
      let item: any = { name: '', identification: '', role: 'estudiante', email: '', rowNum: i + 1, valid: true, error: '' };
      if (hasHeaders) {
        headers.forEach((h, ci) => {
          const val = cols[ci] || '';
          if (h.includes('nom')) item.name = val;
          else if (h.includes('cc') || h.includes('ident') || h.includes('doc')) item.identification = val;
          else if (h.includes('rol')) item.role = val.toLowerCase();
          else if (h.includes('cor') || h.includes('mail')) item.email = val;
        });
      } else {
        [item.name, item.identification, item.role, item.email] = [cols[0], cols[1], (cols[2] || '').toLowerCase(), cols[3] || ''];
      }
      if (item.role.includes('egr')) item.role = 'egresado';
      else if (item.role.includes('emp')) item.role = 'empresario';
      else item.role = 'estudiante';
      if (!item.name) { item.valid = false; item.error += 'Falta Nombre. '; }
      if (!item.identification) { item.valid = false; item.error += 'Falta ID. '; }
      if (!item.email || !item.email.includes('@')) { item.valid = false; item.error += 'Correo inválido. '; }
      parsed.push(item);
    }
    setParsedItems(parsed);
  };

  const handleExecuteBulkRegister = async () => {
    if (!selectedProjectId) { setBulkStatus({ status: 'error', message: 'No hay proyecto activo.' }); return; }
    const validItems = parsedItems.filter(item => item.valid);
    if (validItems.length === 0) { setBulkStatus({ status: 'error', message: 'No hay registros válidos.' }); return; }
    setBulkStatus({ status: 'processing', message: `Insertando ${validItems.length} registros en Notion...` });
    try {
      const res = await fetch(`/api/notion/projects/${selectedProjectId}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems })
      });
      const data = await res.json();
      if (data.success) {
        setBulkStatus({ status: 'success', message: `¡${validItems.length} registros guardados en Notion!` });
        setCsvText(''); setParsedItems([]);
        fetchProjectRegistrants(selectedProjectId);
      } else setBulkStatus({ status: 'error', message: data.message || 'Error en Notion.' });
    } catch { setBulkStatus({ status: 'error', message: 'Fallo de conexión.' }); }
  };

  const totalCount = registrants.length;
  const certCount = registrants.filter(r => r.status === 'certificado').length;
  const receivedCount = registrants.filter(r => r.status === 'recibido').length;
  const incorrectCount = registrants.filter(r => r.status === 'incorrecto').length;

  const currentProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">

      {/* ── Top Header ────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3 flex flex-wrap gap-3 justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-pink-600 flex items-center justify-center font-black text-white text-sm shadow">UD</div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Panel Administrativo</h1>
            <p className="text-[10px] text-slate-400">Universidad de Nariño — Certificaciones Digitales</p>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 min-w-[220px] max-w-sm flex-1 md:flex-none">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Proyecto:</span>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="flex-1 bg-transparent text-xs font-bold text-slate-800 dark:text-white border-0 p-0 focus:outline-none focus:ring-0 cursor-pointer truncate"
          >
            {projects.length === 0
              ? <option value="">Cargando...</option>
              : projects.map(p => <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900">{p.title}</option>)
            }
          </select>
          <button onClick={() => setShowCreateProjectModal(true)} className="text-pink-500 hover:text-pink-700 transition-colors" title="Crear proyecto">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={handleDeleteProject} className="text-slate-400 hover:text-red-500 transition-colors" title="Eliminar proyecto activo">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onBackToRegistry} className="text-xs font-semibold px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer">
            ← Registro Público
          </button>
          <button onClick={() => { fetchProjectsList(); if (selectedProjectId) fetchProjectRegistrants(selectedProjectId); }}
            className="p-2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer" title="Refrescar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer" title="Tema">
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>
        </div>
      </header>

      {/* ── Tab Navigation ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 flex items-center gap-1 overflow-x-auto">
        {([
          { key: 'registrants', icon: Users, label: 'Participantes', badge: totalCount },
          { key: 'designer', icon: Layers, label: 'Diseñador Cert.' },
          { key: 'bulk', icon: FileSpreadsheet, label: 'Carga CSV' },
          { key: 'settings', icon: SettingsIcon, label: 'Configuración' }
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key as TabType); closeCertificatePreview(); }}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {'badge' in tab && tab.badge !== undefined && (
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] px-1.5 py-0.5 rounded-full font-mono">{tab.badge}</span>
            )}
          </button>
        ))}
        {/* Daily code chip in tab bar */}
        <div className="ml-auto flex items-center gap-2 py-2 pl-4 border-l border-slate-200 dark:border-slate-800 shrink-0">
          <Key className="w-3.5 h-3.5 text-pink-500" />
          <span className="text-[10px] text-slate-400 font-medium">Código hoy:</span>
          <code className="text-xs font-black font-mono text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 px-2 py-0.5 rounded border border-pink-200 dark:border-pink-800/40 tracking-widest">{settings.dailyCode || '...'}</code>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      {(errorMsg || successMsg) && (
        <div className="px-4 md:px-6 pt-3">
          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <X className="w-4 h-4 shrink-0" /> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" /> {successMsg}
            </div>
          )}
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="flex-1 p-4 md:p-6">

        {/* ════ TAB: REGISTRANTS ════════════════════════════════════════ */}
        {activeTab === 'registrants' && !previewingCert && (
          <div className="flex flex-col gap-5">

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total', value: totalCount, color: 'text-slate-700 dark:text-white', bg: 'bg-white dark:bg-slate-900', icon: Users },
                { label: 'Certificados', value: certCount, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: Award },
                { label: 'Recibidos', value: receivedCount, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: Clock },
                { label: 'Incorrectos', value: incorrectCount, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', icon: AlertTriangle }
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm`}>
                  <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
                    <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Table card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    {currentProject ? `Participantes — ${currentProject.title}` : 'Participantes'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Gestiona, certifica o marca participantes del proyecto activo.</p>
                </div>
                <button
                  onClick={() => { setAddName(''); setAddId(''); setAddRole('estudiante'); setAddEmail(''); setAddRegError(''); setShowAddRegModal(true); }}
                  className="text-xs font-bold px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded border border-pink-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Agregar manual
                </button>
              </div>

              {registrants.length === 0 ? (
                <div className="p-16 text-center flex flex-col items-center gap-3">
                  <Users className="w-12 h-12 text-slate-200 dark:text-slate-700" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin participantes aún.</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Los registros aparecen aquí cuando alguien completa el formulario público.</p>
                </div>
              ) : (
                <>
                  {/* Bulk action toolbar */}
                  {selectedIds.size > 0 && (
                    <div className="px-5 py-2.5 bg-pink-50 dark:bg-pink-950/20 border-b border-pink-200 dark:border-pink-800/30 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-pink-700 dark:text-pink-300">{selectedIds.size} seleccionado(s)</span>
                      <div className="flex gap-1.5 ml-auto flex-wrap">
                        <button onClick={() => handleBulkUpdate('certificado')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm">
                          <Award className="w-3 h-3" /> Certificar seleccionados
                        </button>
                        <button onClick={handleBulkRecertify}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm">
                          <RefreshCw className="w-3 h-3" /> Recertificar seleccionados
                        </button>
                        <button onClick={() => handleBulkUpdate('incorrecto')}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm">
                          <X className="w-3 h-3" /> Marcar incorrectos
                        </button>
                        <button onClick={() => handleBulkUpdate('recibido')}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm">
                          <Clock className="w-3 h-3" /> Pasar a recibido
                        </button>
                        <button onClick={() => setSelectedIds(new Set())}
                          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700 transition-all">
                          <X className="w-3 h-3" /> Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                      <tr>
                        <th className="px-3 py-3.5 w-9">
                          <input type="checkbox"
                            checked={registrants.length > 0 && selectedIds.size === registrants.length}
                            ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < registrants.length; }}
                            onChange={e => setSelectedIds(e.target.checked ? new Set(registrants.map(r => r.id)) : new Set())}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-pink-600 cursor-pointer"
                          />
                        </th>
                        <th className="px-5 py-3.5">Participante</th>
                        <th className="px-4 py-3.5">Rol</th>
                        <th className="px-4 py-3.5">Correo</th>
                        <th className="px-4 py-3.5">Estado</th>
                        <th className="px-4 py-3.5">Generado</th>
                        <th className="px-4 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {registrants.map(reg => (
                        <tr key={reg.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors ${selectedIds.has(reg.id) ? 'bg-pink-50/60 dark:bg-pink-950/10' : ''}`}>
                          <td className="px-3 py-3.5">
                            <input type="checkbox"
                              checked={selectedIds.has(reg.id)}
                              onChange={e => setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(reg.id); else next.delete(reg.id);
                                return next;
                              })}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-pink-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-900 dark:text-white text-sm">{reg.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">C.C. {reg.identification}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border capitalize ${
                              reg.role === 'empresario' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/30' :
                              reg.role === 'egresado' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-700/30' :
                              'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700/30'
                            }`}>{reg.role}</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-mono text-slate-500 dark:text-slate-400">{reg.email}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                reg.status === 'certificado' ? 'bg-emerald-500' :
                                reg.status === 'incorrecto' ? 'bg-red-500' : 'bg-amber-400'
                              }`} />
                              <span className={`text-xs font-semibold capitalize ${
                                reg.status === 'certificado' ? 'text-emerald-600 dark:text-emerald-400' :
                                reg.status === 'incorrecto' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                              }`}>
                                {reg.status === 'certificado' ? 'Certificado' : reg.status === 'incorrecto' ? 'Incorrecto' : 'Recibido'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {(reg as any).generatedAt
                              ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">{(reg as any).generatedAt}</span>
                              : <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                            }
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex justify-end items-center gap-1.5 flex-wrap">
                              {reg.status !== 'certificado' && (
                                <button
                                  onClick={() => handleCertify(reg.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] py-1.5 px-2.5 rounded flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                  title="Certificar participante"
                                >
                                  <Award className="w-3 h-3" /> Certificar
                                </button>
                              )}
                              {reg.status === 'certificado' && (
                                <>
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800/40 px-2 py-1 rounded">
                                    ✓ Certificado
                                  </span>
                                  <button
                                    onClick={() => handleRecertify(reg)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] py-1.5 px-2.5 rounded flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                    title="Regenerar el certificado con el diseño actual"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Recertificar
                                  </button>
                                </>
                              )}
                              {reg.status === 'recibido' && (
                                <button
                                  onClick={() => handleMarkIncorrect(reg.id)}
                                  className="bg-red-50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400 font-semibold text-[10px] py-1.5 px-2.5 rounded flex items-center gap-1 transition-all border border-red-100 dark:border-red-900/30 cursor-pointer shadow-sm"
                                >
                                  <X className="w-3 h-3" /> Incorrecto
                                </button>
                              )}
                              <button
                                onClick={() => { setEditingReg(reg); setEditName(reg.name); setEditId(reg.identification); setEditRole(reg.role); setEditEmail(reg.email); setEditStatus(reg.status as any); }}
                                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[10px] py-1.5 px-2.5 rounded flex items-center gap-1 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
                              >
                                <Pencil className="w-3 h-3 text-pink-500" /> Editar
                              </button>
                              <button
                                onClick={() => openCertificatePreview(reg)}
                                className="bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px] py-1.5 px-2.5 rounded flex items-center gap-1 transition-all border border-indigo-100 dark:border-indigo-700/30 cursor-pointer shadow-sm"
                              >
                                <Eye className="w-3 h-3" /> Ver
                              </button>
                              <button
                                onClick={() => handleDeleteRegistrant(reg.id, reg.name)}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 p-1.5 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Preview certificate (overlay within registrants) */}
        {activeTab === 'registrants' && previewingCert && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-pink-500" /> Vista Previa
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{previewingCert.name} — C.C. {previewingCert.identification}</p>
                {previewAction === 'recertify' && recertifyQueue.length > 0 && (
                  <p className="text-[10px] text-indigo-500 mt-1 font-semibold">Quedan {recertifyQueue.length} participante(s) pendientes en esta recertificación.</p>
                )}
              </div>
              <button onClick={closeCertificatePreview} className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 cursor-pointer">
                Cerrar
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
              <CertificateTemplate
                name={previewingCert.name}
                identification={previewingCert.identification}
                role={previewingCert.role}
                id={previewingCert.id}
                pageId={previewingCert.id}
                onDownloaded={handleCertificateDownloaded}
                templateConfig={settings.template}
              />
            </div>
          </div>
        )}

        {/* ════ TAB: DESIGNER ════════════════════════════════════════════ */}
        {activeTab === 'designer' && (() => {
          const activeField = projectFields.find(f => f.id === activeFieldId) ?? projectFields[0];
          const ar = settings.template?.bgAspectRatio ?? (16 / 9);
          const svgH = Math.round(SVG_BASE_WIDTH / ar);

          const dataKeyColors: Record<string, string> = {
            name: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
            identification: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
            role: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            custom: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
          };

          return (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* ── Controls panel ── */}
              <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm h-fit">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-pink-500" /> Diseñador
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Arrastra campos o usa los controles. Escala con los handles de borde/esquina.</p>
                </div>

                {/* BG Upload */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Imagen de Fondo</label>
                  {!settings.template?.bgImage ? (
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-pink-500 rounded-xl p-5 text-center transition-all bg-slate-50 dark:bg-slate-950/40">
                      <input type="file" accept="image/*" id="bg-upload-field" className="hidden" onChange={handleLogoUpload} disabled={bgUploading} />
                      <label htmlFor="bg-upload-field" className={`cursor-pointer flex flex-col items-center gap-1.5 ${bgUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Upload className="w-7 h-7 text-pink-500" />
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Elegir PNG o JPG</span>
                        <span className="text-[10px] text-slate-400">El canvas se ajustará al tamaño de la imagen</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                      <div className="flex items-center gap-2">
                        <img src={settings.template.bgImage} className="w-12 h-8 object-cover rounded border border-slate-300 dark:border-slate-700" alt="fondo" />
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-white block">Fondo activo</span>
                          {bgUploading
                            ? <span className="text-[10px] text-amber-500 font-semibold animate-pulse">Guardando en Notion…</span>
                            : <span className="text-[10px] text-emerald-500 font-mono">{ar.toFixed(2)}:1</span>}
                        </div>
                      </div>
                      <button onClick={() => setSettings((p: any) => ({ ...p, template: { ...p.template, bgImage: null, bgAspectRatio: 16 / 9 } }))}
                        disabled={bgUploading}
                        className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-40">
                        Remover
                      </button>
                    </div>
                  )}
                  {bgUploadError && (
                    <p className="text-[10px] text-red-500 mt-1">{bgUploadError}</p>
                  )}
                </div>

                {/* Field selector */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Campo activo</label>
                  <div className="flex flex-wrap gap-1.5">
                    {projectFields.map(f => (
                      <button key={f.id} type="button" onClick={() => setActiveFieldId(f.id)}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          activeFieldId === f.id
                            ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-500 text-pink-600 dark:text-pink-300'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >{f.label}</button>
                    ))}
                  </div>
                </div>

                {/* Field properties */}
                {activeField && (
                  <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-pink-600 dark:text-pink-400 truncate">{activeField.label}</span>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold cursor-pointer shrink-0">
                        <input type="checkbox" checked={activeField.enabled}
                          onChange={e => updateProjectField(activeFieldId, { enabled: e.target.checked })} />
                        Habilitado
                      </label>
                    </div>

                    {/* Position sliders */}
                    <div className="space-y-2 text-xs">
                      {[
                        { label: 'Posición X', prop: 'x' as const, max: 100, step: 0.5 },
                        { label: 'Posición Y', prop: 'y' as const, max: 100, step: 0.5 },
                        { label: 'Ancho', prop: 'width' as const, max: 100, step: 0.5, min: 3 },
                        { label: 'Alto', prop: 'height' as const, max: 50, step: 0.5, min: 1 },
                      ].map(sl => (
                        <div key={sl.prop} className="space-y-0.5">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>{sl.label} (%)</span>
                            <span className="font-mono text-pink-500 font-bold">{(activeField[sl.prop] as number).toFixed(1)}%</span>
                          </div>
                          <input type="range" min={sl.min ?? 0} max={sl.max} step={sl.step}
                            value={activeField[sl.prop] as number}
                            onChange={e => updateProjectField(activeFieldId, { [sl.prop]: parseFloat(e.target.value) })}
                            className="w-full accent-pink-500 cursor-pointer" />
                        </div>
                      ))}
                    </div>

                    {/* Text options */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Fuente (pt)</label>
                        <input type="number" min={6} max={200} value={activeField.fontSize}
                          onChange={e => updateProjectField(activeFieldId, { fontSize: parseInt(e.target.value) || 12 })}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono text-xs px-2.5 py-1.5 focus:ring-1 focus:ring-pink-500 focus:outline-none text-slate-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Color</label>
                        <div className="flex gap-1">
                          <input type="color" value={activeField.color}
                            onChange={e => updateProjectField(activeFieldId, { color: e.target.value })}
                            className="w-8 h-8 border-0 bg-transparent cursor-pointer rounded" />
                          <input type="text" value={activeField.color}
                            onChange={e => updateProjectField(activeFieldId, { color: e.target.value })}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono text-[10px] uppercase px-1.5 py-1 focus:ring-1 focus:ring-pink-500 focus:outline-none text-slate-900 dark:text-white" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Grosor</label>
                        <select value={activeField.fontWeight}
                          onChange={e => updateProjectField(activeFieldId, { fontWeight: e.target.value as any })}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs px-2 py-1.5 text-slate-800 dark:text-slate-300 focus:ring-1 focus:ring-pink-500 focus:outline-none">
                          <option value="normal">Normal</option>
                          <option value="bold">Negrita</option>
                          <option value="bolder">Gruesa</option>
                          <option value="black">Negra</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Alineación</label>
                        <div className="flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                          {(['left', 'center', 'right'] as const).map(a => (
                            <button key={a} type="button" onClick={() => updateProjectField(activeFieldId, { align: a })}
                              className={`flex-1 py-1.5 flex items-center justify-center cursor-pointer transition-colors ${
                                activeField.align === a ? 'bg-pink-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}>
                              {a === 'left' ? <AlignLeft className="w-3 h-3" /> : a === 'center' ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold cursor-pointer">
                      <input type="checkbox" checked={activeField.autoFit}
                        onChange={e => updateProjectField(activeFieldId, { autoFit: e.target.checked })} />
                      Auto-ajustar texto al bounding box
                    </label>
                    {activeField.dataKey === 'custom' && (
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Valor fijo</label>
                        <input type="text" value={activeField.staticValue ?? ''}
                          onChange={e => updateProjectField(activeFieldId, { staticValue: e.target.value })}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs px-2.5 py-1.5 focus:ring-1 focus:ring-pink-500 focus:outline-none text-slate-900 dark:text-white"
                          placeholder="Ej: Universidad de Nariño" />
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleSaveSettings} disabled={savingSettings}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer uppercase tracking-wider disabled:opacity-50">
                  {savingSettings ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</> : <><Check className="w-4 h-4" /> Guardar Diseño</>}
                </button>
              </div>

              {/* ── Canvas ── */}
              <div className="xl:col-span-8 flex flex-col gap-3">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center gap-2 text-xs shadow-sm">
                  <Move className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400">
                    Arrastra campos · Handles <span className="text-pink-500 font-bold">→ ancho</span> / <span className="text-pink-500 font-bold">↓ alto</span> / <span className="text-pink-500 font-bold">↘ ambos</span> · Campo activo: <strong className="text-pink-500">{activeField?.label}</strong>
                  </span>
                </div>

                <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div
                    ref={el => {
                      (canvasRef as any).current = el;
                      if (el) setCanvasPxWidth(el.offsetWidth);
                    }}
                    className="w-full relative select-none overflow-hidden touch-none"
                    style={{
                      aspectRatio: String(ar),
                      backgroundColor: darkMode ? '#0c071a' : '#f8f5ff'
                    }}
                  >
                    <CertificateSvg
                      templateConfig={{
                        ...settings.template,
                        bgAspectRatio: ar,
                        fields: projectFields,
                      }}
                      values={{
                        name: 'NOMBRE COMPLETO',
                        identification: '1.085.XXX.XXX',
                        role: 'ROL / CARGO',
                      }}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />

                    {projectFields.map(field => {
                      if (!field.enabled) return null;
                      const isActive = activeFieldId === field.id;
                      const box = getFieldBox(field, SVG_BASE_WIDTH, svgH);
                      return (
                        <div
                          key={field.id}
                          ref={el => { if (el) fieldElemRefs.current.set(field.id, el); else fieldElemRefs.current.delete(field.id); }}
                          onPointerDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveFieldId(field.id);
                            dragRef.current = {
                              fieldId: field.id,
                              startCX: e.clientX,
                              startCY: e.clientY,
                              startFX: field.x,
                              startFY: field.y,
                              startFW: field.width,
                              startFH: field.height,
                              lastX: field.x,
                              lastY: field.y,
                            };
                          }}
                          className={`absolute select-none rounded overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${
                            isActive
                              ? 'border-2 border-pink-500 shadow-lg ring-2 ring-pink-500/40 z-30'
                              : 'border border-white/50 z-10 shadow-sm'
                          }`}
                          style={{
                            left: `${(box.left / SVG_BASE_WIDTH) * 100}%`,
                            top: `${(box.top / svgH) * 100}%`,
                            width: `${(box.width / SVG_BASE_WIDTH) * 100}%`,
                            height: `${(box.height / svgH) * 100}%`,
                            backgroundColor: isActive ? 'rgba(236,72,153,0.12)' : 'rgba(255,255,255,0.04)',
                          }}
                        >
                          {/* Resize handles – only when active */}
                          {isActive && (
                            <>
                              {/* Right edge */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize z-40 flex items-center justify-center"
                                onPointerDown={e => {
                                  e.preventDefault(); e.stopPropagation();
                                  resizeRef.current = { fieldId: field.id, handle: 'right', startCX: e.clientX, startCY: e.clientY, startW: field.width, startH: field.height, lastW: field.width, lastH: field.height };
                                }}
                              >
                                <div className="w-1 h-8 bg-pink-500 rounded-full opacity-80" />
                              </div>
                              {/* Bottom edge */}
                              <div
                                className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize z-40 flex items-center justify-center"
                                onPointerDown={e => {
                                  e.preventDefault(); e.stopPropagation();
                                  resizeRef.current = { fieldId: field.id, handle: 'bottom', startCX: e.clientX, startCY: e.clientY, startW: field.width, startH: field.height, lastW: field.width, lastH: field.height };
                                }}
                              >
                                <div className="h-1 w-8 bg-pink-500 rounded-full opacity-80" />
                              </div>
                              {/* Corner */}
                              <div
                                className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50 flex items-end justify-end p-0.5"
                                onPointerDown={e => {
                                  e.preventDefault(); e.stopPropagation();
                                  resizeRef.current = { fieldId: field.id, handle: 'corner', startCX: e.clientX, startCY: e.clientY, startW: field.width, startH: field.height, lastW: field.width, lastH: field.height };
                                }}
                              >
                                <div className="w-3 h-3 border-r-2 border-b-2 border-pink-500" />
                              </div>
                              {/* Field info badge */}
                              <div className="absolute -top-5 left-0 text-[9px] font-bold bg-pink-600 text-white px-1.5 py-0.5 rounded-t whitespace-nowrap z-50">
                                {field.label} · {field.width.toFixed(0)}%×{field.height.toFixed(0)}%
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ════ TAB: BULK CSV ════════════════════════════════════════════ */}
        {activeTab === 'bulk' && (
          <div className="max-w-3xl mx-auto flex flex-col gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5 mb-1">
                <FileSpreadsheet className="w-4 h-4 text-pink-500" /> Carga Masiva CSV
              </h2>
              <p className="text-xs text-slate-400 mb-4">Columnas: Nombre, Identificacion, Rol (estudiante|egresado|empresario), Correo. Separador coma o punto y coma.</p>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input type="file" accept=".csv,.txt" id="csv-file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { const t = ev.target?.result as string; setCsvText(t); parseCsvString(t); }; r.readAsText(f); }} />
                  <label htmlFor="csv-file" className="cursor-pointer text-xs font-bold px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Cargar archivo CSV
                  </label>
                  <span className="text-xs text-slate-400">o pega el contenido abajo</span>
                </div>
                <textarea
                  value={csvText}
                  onChange={e => { setCsvText(e.target.value); parseCsvString(e.target.value); }}
                  className="w-full h-32 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-pink-500 focus:outline-none resize-none"
                  placeholder={"Nombre,Identificacion,Rol,Correo\nJuan Pérez,1085123456,estudiante,juan@udenar.edu.co"}
                />
              </div>

              {parsedItems.length > 0 && (
                <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-950 px-4 py-2.5 flex justify-between items-center border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-200">{parsedItems.length} filas detectadas · {parsedItems.filter(i => i.valid).length} válidas</span>
                    <span className="text-red-500">{parsedItems.filter(i => !i.valid).length} con errores</span>
                  </div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 text-[10px] uppercase">
                        <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">ID</th><th className="px-3 py-2 text-left">Rol</th><th className="px-3 py-2 text-left">Correo</th><th className="px-3 py-2 text-left">Estado</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {parsedItems.map((item, i) => (
                          <tr key={i} className={item.valid ? '' : 'bg-red-50 dark:bg-red-950/20'}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{item.rowNum}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.name || '—'}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{item.identification || '—'}</td>
                            <td className="px-3 py-2 capitalize text-slate-500">{item.role}</td>
                            <td className="px-3 py-2 text-slate-500">{item.email || '—'}</td>
                            <td className="px-3 py-2">{item.valid ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <span className="text-red-500 text-[10px]">{item.error}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {bulkStatus.status !== 'idle' && (
                <div className={`mt-3 p-3 rounded-xl text-xs font-semibold ${bulkStatus.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40' : bulkStatus.status === 'error' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40' : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40'}`}>
                  {bulkStatus.status === 'processing' && <RefreshCw className="w-3.5 h-3.5 inline-block mr-1 animate-spin" />}
                  {bulkStatus.message}
                </div>
              )}

              <button
                onClick={handleExecuteBulkRegister}
                disabled={parsedItems.filter(i => i.valid).length === 0 || bulkStatus.status === 'processing'}
                className="mt-4 w-full bg-pink-600 hover:bg-pink-700 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow disabled:opacity-40"
              >
                {bulkStatus.status === 'processing' ? <><RefreshCw className="w-4 h-4 animate-spin" /> Procesando...</> : <><FileCheck className="w-4 h-4" /> Subir {parsedItems.filter(i => i.valid).length} registros a Notion</>}
              </button>
            </div>
          </div>
        )}

        {/* ════ TAB: SETTINGS ════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-5">

            {/* Custom Fields Config */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                <LayoutTemplate className="w-4 h-4 text-pink-500" /> Campos del Certificado
              </h2>
              <p className="text-xs text-slate-400">Campos que aparecerán en el certificado. Edita el nombre, quita o añade campos. Posición y tamaño en el Diseñador.</p>

              <div className="space-y-2">
                {projectFields.map((field, idx) => (
                  <div key={field.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg">
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => setProjectFields(prev => prev.map(f => f.id === field.id ? { ...f, label: e.target.value } : f))}
                      className="flex-1 bg-transparent font-bold text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500 rounded px-1 min-w-0"
                    />
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      field.dataKey === 'name' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' :
                      field.dataKey === 'identification' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' :
                      field.dataKey === 'role' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                      'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {field.dataKey === 'name' ? 'Nombre' : field.dataKey === 'identification' ? 'Cédula' : field.dataKey === 'role' ? 'Rol' : 'Texto fijo'}
                    </span>
                    {projectFields.length > 1 && (
                      <button type="button" onClick={() => setProjectFields(prev => prev.filter(f => f.id !== field.id))}
                        className="text-slate-400 hover:text-red-500 cursor-pointer transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={e => {
                e.preventDefault();
                if (!newFieldLabel.trim()) return;
                const newField: FieldConfig = {
                  id: `field_${Date.now()}`, label: newFieldLabel.trim(), dataKey: newFieldDataKey,
                  x: 50, y: 50, width: 30, height: 6, fontSize: 18,
                  color: '#1e1b4b', fontWeight: 'normal', enabled: true, align: 'center', autoFit: true,
                  staticValue: newFieldDataKey === 'custom' ? '' : undefined
                };
                setProjectFields(prev => [...prev, newField]);
                setNewFieldLabel('');
              }} className="space-y-2">
                <input type="text" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)}
                  maxLength={40} placeholder="Nombre del campo (ej: Fecha, Evento...)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500" />
                <div className="flex gap-2">
                  <select value={newFieldDataKey} onChange={e => setNewFieldDataKey(e.target.value as any)}
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-500">
                    <option value="name">→ Nombre del participante</option>
                    <option value="identification">→ Cédula / ID</option>
                    <option value="role">→ Rol / Cargo</option>
                    <option value="custom">→ Texto fijo (configurable)</option>
                  </select>
                  <button type="submit" disabled={!newFieldLabel.trim()}
                    className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 cursor-pointer shadow flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
              </form>

              <button onClick={handleSaveSettings} disabled={savingSettings || !selectedProjectId}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow disabled:opacity-40">
                {savingSettings ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : <><Check className="w-3.5 h-3.5" /> Guardar Campos del Proyecto</>}
              </button>
            </div>

            {/* Roles Config */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                <Users className="w-4 h-4 text-pink-500" /> Roles de Participantes
              </h2>
              <p className="text-xs text-slate-400">Personaliza los roles disponibles para el proyecto activo. Estos aparecerán en el formulario público y en los filtros.</p>

              <div className="flex flex-wrap gap-2">
                {projectRoles.map((role, idx) => (
                  <div key={role} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold capitalize">
                    <span>{role}</span>
                    {projectRoles.length > 1 && (
                      <button type="button"
                        onClick={() => setProjectRoles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-500 ml-1 cursor-pointer transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={e => {
                e.preventDefault();
                const val = newRoleInput.trim().toLowerCase();
                if (val && !projectRoles.includes(val)) {
                  setProjectRoles(prev => [...prev, val]);
                  setNewRoleInput('');
                }
              }} className="flex gap-2">
                <input type="text" value={newRoleInput} onChange={e => setNewRoleInput(e.target.value)}
                  maxLength={30} placeholder="Ej: docente, investigador..."
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500 lowercase" />
                <button type="submit" disabled={!newRoleInput.trim()}
                  className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 cursor-pointer shadow transition-all flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </form>

              <button onClick={handleSaveSettings} disabled={savingSettings || !selectedProjectId}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow disabled:opacity-40">
                {savingSettings ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : <><Check className="w-3.5 h-3.5" /> Guardar Roles del Proyecto</>}
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                <Key className="w-4 h-4 text-pink-500" /> Código Diario de Registro
              </h2>
              <p className="text-xs text-slate-400">El código que los asistentes deben ingresar para acceder al formulario de registro.</p>

              <div className="bg-gradient-to-br from-indigo-950 to-pink-950 rounded-xl p-4 text-center border border-indigo-500/20">
                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-2">Código activo hoy</p>
                <code className="font-mono text-2xl font-black text-white tracking-widest">{settings.dailyCode || '...'}</code>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Cambiar código</label>
                <form onSubmit={e => { e.preventDefault(); const input = (e.currentTarget.elements.namedItem('newCode') as HTMLInputElement); if (input?.value?.trim()) handleSavePasscode(input.value.trim().toUpperCase()); }}
                  className="flex gap-2">
                  <input type="text" name="newCode" maxLength={20}
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-pink-500"
                    placeholder="NUEVO-CODIGO" />
                  <button type="submit" disabled={savingSettings}
                    className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50 flex items-center gap-1.5">
                    {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Guardar
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── Create Project Modal ────────────────────────────────────────── */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">Nuevo Taller / Proyecto</h3>
            <p className="text-xs text-slate-400 mb-4">Se creará un toggle en Notion con su base de datos de participantes.</p>

            {modalError && <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg p-2.5 text-xs text-red-700 dark:text-red-300 mb-3">{modalError}</div>}

            <form onSubmit={handleCreateProject} className="space-y-3">
              <input
                type="text"
                value={newProjectTitle}
                onChange={e => setNewProjectTitle(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                placeholder="Ej: Taller Diseño Mayo 2026"
                autoFocus
                required
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowCreateProjectModal(false); setNewProjectTitle(''); setModalError(''); }}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={creatingProject || !newProjectTitle.trim()}
                  className="flex-[2] bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {creatingProject ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creando...</> : <><Plus className="w-3.5 h-3.5" /> Crear Taller</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Registrant Modal ───────────────────────────────────────── */}
      {editingReg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">Editar Participante</h3>

            <form onSubmit={handleSaveEditRegistrant} className="space-y-3">
              {[
                { label: 'Nombre', state: editName, setter: setEditName, type: 'text', placeholder: 'Nombre completo' },
                { label: 'Identificación', state: editId, setter: setEditId, type: 'text', placeholder: 'C.C.' },
                { label: 'Correo', state: editEmail, setter: setEditEmail, type: 'email', placeholder: 'correo@udenar.edu.co' }
              ].map(f => (
                <div key={f.label}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{f.label}</label>
                  <input type={f.type} value={f.state} onChange={e => f.setter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                    placeholder={f.placeholder} required />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Rol</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-500">
                    {projectRoles.map(r => (
                      <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Estado</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-500">
                    <option value="recibido">Recibido</option>
                    <option value="incorrecto">Incorrecto</option>
                    <option value="certificado">Certificado</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingReg(null)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all hover:bg-slate-200 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={updatingReg}
                  className="flex-[2] bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer shadow disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all">
                  {updatingReg ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : <><Check className="w-3.5 h-3.5" /> Guardar cambios</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Registrant Modal ────────────────────────────────────────── */}
      {showAddRegModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">Agregar Participante</h3>

            {addRegError && <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg p-2.5 text-xs text-red-700 dark:text-red-300 mb-3">{addRegError}</div>}

            <form onSubmit={handleManualAddRegistrant} className="space-y-3">
              {[
                { label: 'Nombre', state: addName, setter: setAddName, type: 'text', placeholder: 'Nombre completo' },
                { label: 'Identificación', state: addId, setter: setAddId, type: 'text', placeholder: 'C.C.' },
                { label: 'Correo', state: addEmail, setter: setAddEmail, type: 'email', placeholder: 'correo@udenar.edu.co' }
              ].map(f => (
                <div key={f.label}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{f.label}</label>
                  <input type={f.type} value={f.state} onChange={e => f.setter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                    placeholder={f.placeholder} required />
                </div>
              ))}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Rol</label>
                <div className="flex flex-wrap gap-1.5">
                  {projectRoles.map(r => (
                    <button key={r} type="button" onClick={() => setAddRole(r)}
                      className={`flex-1 min-w-[60px] py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer capitalize ${addRole === r ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-500 text-pink-600 dark:text-pink-300' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddRegModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={addingReg}
                  className="flex-[2] bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer shadow disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all">
                  {addingReg ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Registrando...</> : <><UserPlus className="w-3.5 h-3.5" /> Registrar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
