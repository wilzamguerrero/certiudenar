/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  Users, 
  Settings as SettingsIcon, 
  Mail, 
  FileCheck, 
  Key, 
  Check, 
  X, 
  Eye, 
  RefreshCw, 
  Database, 
  Trash2,
  Upload,
  Sparkles,
  Layers,
  ChevronRight,
  Maximize2,
  Activity,
  FileSpreadsheet,
  AlertCircle,
  Sun,
  Moon,
  Plus,
  Pencil,
  UserPlus
} from 'lucide-react';
import { Registrant } from '../types.js';
import CertificateTemplate from './CertificateTemplate.tsx';

interface AdminDashboardProps {
  onBackToRegistry: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

type TabType = 'registrants' | 'designer' | 'bulk' | 'emails' | 'settings';

export default function AdminDashboard({ onBackToRegistry, darkMode, setDarkMode }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('registrants');
  
  // Data States
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [settings, setSettings] = useState<any>({
    dailyCode: 'DISENO26',
    template: {
      bgImage: '/assets/.aistudio/image_banner.jpg',
      nameField: { x: 22.5, y: 61.9, fontSize: 32, color: '#1e1b4b', fontWeight: 'bold', enabled: true, align: 'center' },
      idField: { x: 23.1, y: 68.4, fontSize: 18, color: '#1f2937', fontWeight: 'normal', enabled: true, align: 'center' },
      roleField: { x: 22.5, y: 73.3, fontSize: 15, color: '#4b5563', fontWeight: 'bold', enabled: true, align: 'center' }
    }
  });

  // UI / Feedback states
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [previewingCert, setPreviewingCert] = useState<Registrant | null>(null);
  
  // Designer States
  const [activeFieldKey, setActiveFieldKey] = useState<'nameField' | 'idField' | 'roleField'>('nameField');
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Bulk Upload States
  const [csvText, setCsvText] = useState('');
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [bulkStatus, setBulkStatus] = useState<{ status: 'idle' | 'processing' | 'success' | 'error', message: string }>({ status: 'idle', message: '' });

  // Create Project States
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [modalError, setModalError] = useState('');

  // Manual / Edit Registrant States
  const [editingReg, setEditingReg] = useState<Registrant | null>(null);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editRole, setEditRole] = useState<'estudiante' | 'egresado' | 'empresario'>('estudiante');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'recibido' | 'correcto' | 'incorrecto'>('recibido');
  const [updatingReg, setUpdatingReg] = useState(false);

  const [showAddRegModal, setShowAddRegModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState<'estudiante' | 'egresado' | 'empresario'>('estudiante');
  const [addEmail, setAddEmail] = useState('');
  const [addingReg, setAddingReg] = useState(false);
  const [addRegError, setAddRegError] = useState('');

  // 1. Fetch Notion Projects (Toggle lists)
  const fetchProjectsList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notion/projects');
      const d = await res.json();
      if (d.success && Array.isArray(d.data)) {
        setProjects(d.data);
        if (d.data.length > 0) {
          setSelectedProjectId(prev => {
            const exists = d.data.some(p => p.id === prev);
            return exists ? prev : d.data[0].id;
          });
        }
      } else {
        setErrorMsg('Fallo al obtener proyectos desde Notion.');
      }
    } catch (e) {
      console.error('Error fetching projects list:', e);
      setErrorMsg('No se pudo establecer conexión para obtener la lista de proyectos.');
    } finally {
      setLoading(false);
    }
  };

  // 1.8. Handle creation of a new Notion project / workshop
  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    setCreatingProject(true);
    setModalError('');
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await fetch('/api/notion/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newProjectTitle.trim() })
      });
      const data = await response.json();

      if (data.success) {
        // Clear inputs and modal error
        setNewProjectTitle('');
        setModalError('');
        setShowCreateProjectModal(false);

        // Success notice
        setSuccessMsg(`¡Taller "${data.data?.title || 'Nuevo'}" creado con éxito en Notion con su planilla!`);

        // Refresh list
        setLoading(true);
        const res = await fetch('/api/notion/projects');
        const d = await res.json();
        if (d.success && Array.isArray(d.data)) {
          setProjects(d.data);
          if (data.data && data.data.id) {
            setSelectedProjectId(data.data.id);
          }
        }
      } else {
        setModalError(data.message || 'Error al intentar crear el taller en Notion.');
      }
    } catch (err) {
      console.error('Error creating project:', err);
      setModalError('Ocurrió un error al conectar con el servidor.');
    } finally {
      setCreatingProject(false);
      setLoading(false);
    }
  };

  // 2. Fetch registrants for the active project from Notion
  const fetchProjectRegistrants = async (projectId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notion/projects/${projectId}/registrants`);
      const d = await res.json();
      if (d.success && Array.isArray(d.data)) {
        setRegistrants(d.data);
      }
    } catch (err) {
      console.error('Error fetching registrants:', err);
      setErrorMsg('Error al cargar asistentes registrados desde la tabla de Notion.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch projects on mount
  useEffect(() => {
    fetchProjectsList();
    
    // Also load general passcode settings
    const fetchGeneralSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings');
        const d = await res.json();
        if (d.success && d.data) {
          setSettings(prev => ({
            ...prev,
            dailyCode: d.data.dailyCode
          }));
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchGeneralSettings();
  }, []);

  // Update layout template coordinates whenever active project changes
  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      fetchProjectRegistrants(selectedProjectId);

      const activeProject = projects.find(p => p.id === selectedProjectId);
      if (activeProject && activeProject.config) {
        setSettings(prev => ({
          ...prev,
          template: activeProject.config
        }));
      }
    }
  }, [selectedProjectId, projects]);

  const fetchData = async () => {
    if (selectedProjectId) {
      await fetchProjectsList();
      await fetchProjectRegistrants(selectedProjectId);
    } else {
      await fetchProjectsList();
    }
  };

  // 3. Save coordinates/image for the ACTIVE project only
  const handleSaveSettings = async () => {
    if (!selectedProjectId) return;
    setSavingSettings(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await fetch(`/api/notion/projects/${selectedProjectId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: settings.template })
      });
      const result = response.ok ? await response.json() : null;

      if (result && result.success) {
        setSuccessMsg('Diseño de plantilla personalizado guardado exitosamente.');
        // Update loaded projects state to keep in sync
        setProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, config: settings.template } : p));
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg('Fallo al guardar diseño en disco.');
      }
    } catch (err) {
      setErrorMsg('Error de red al actualizar los parámetros.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Save general passcode helper
  const handleSavePasscodeOnly = async (newCode: string) => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCode: newCode })
      });
      const d = await res.json();
      if (d.success) {
        setSuccessMsg('Código de asistencia guardado correctamente.');
        setSettings(prev => ({ ...prev, dailyCode: newCode }));
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) {
      setErrorMsg('Error al guardar el código de asistencia.');
    } finally {
      setSavingSettings(false);
    }
  };

  // 4. Delete participant inside Notion (archives database page)
  const handleDeleteRegistrant = async (id: string, name: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar permanentemente a "${name}" de la tabla de Notion?`)) {
      return;
    }
    try {
      const res = await fetch('/api/notion/registrants/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Participante eliminado con éxito de Notion.');
        setRegistrants(prev => prev.filter(r => r.id !== id));
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg(data.message || 'No se pudo eliminar de Notion.');
      }
    } catch (e) {
      setErrorMsg('Error de red al comunicarse con el servidor.');
    }
  };

  // 5. Update Status in Notion Database
  const handleUpdateStatus = async (id: string, newStatus: 'recibido' | 'correcto' | 'incorrecto') => {
    try {
      const response = await fetch('/api/notion/registrants/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id, status: newStatus })
      });
      const result = await response.json();
      
      if (result.success) {
        setSuccessMsg('Estado sincronizado en tiempo real con Notion.');
        setRegistrants(prev => prev.map(r => r.id === id ? { 
          ...r, 
          status: newStatus === 'correcto' ? 'correcto' : newStatus
        } : r));
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg('No se pudo actualizar el estado.');
      }
    } catch (e) {
      setErrorMsg('Fallo de red al guardar estado.');
    }
  };

  // 5.5. Edit full properties of participant in Notion
  const handleSaveEditRegistrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingReg) return;
    if (!editName.trim() || !editId.trim() || !editEmail.trim()) {
      setErrorMsg('Por favor completa todos los campos del participante.');
      return;
    }

    setUpdatingReg(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await fetch('/api/notion/registrants/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: editingReg.id,
          name: editName,
          identification: editId,
          role: editRole,
          email: editEmail,
          status: editStatus
        })
      });
      const result = await response.json();

      if (result.success) {
        setSuccessMsg('Participante actualizado correctamente en Notion.');
        // Update local state
        setRegistrants(prev => prev.map(r => r.id === editingReg.id ? {
          ...r,
          name: editName,
          identification: editId,
          role: editRole,
          email: editEmail,
          status: editStatus
        } : r));
        setEditingReg(null); // close modal
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg(result.message || 'No se pudo actualizar los campos del participante.');
      }
    } catch (err) {
      setErrorMsg('Fallo de conexión al actualizar participante.');
    } finally {
      setUpdatingReg(false);
    }
  };

  // 5.6. Manually register a single participant into Notion
  const handleManualAddRegistrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setAddRegError('No se ha seleccionado ningún taller activo.');
      return;
    }
    if (!addName.trim() || !addId.trim() || !addEmail.trim()) {
      setAddRegError('Por favor completa todos los campos obligatorios.');
      return;
    }

    setAddingReg(true);
    setAddRegError('');

    try {
      const response = await fetch(`/api/notion/projects/${selectedProjectId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          identification: addId.trim(),
          role: addRole,
          email: addEmail.trim()
        })
      });
      const result = await response.json();

      if (result.success) {
        setSuccessMsg('Participante registrado exitosamente en Notion.');
        // Clear forms
        setAddName('');
        setAddId('');
        setAddRole('estudiante');
        setAddEmail('');
        setShowAddRegModal(false);
        // Refresh registrants list
        await fetchProjectRegistrants(selectedProjectId);
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setAddRegError(result.message || 'No se pudo registrar el participante en Notion.');
      }
    } catch (err) {
      setAddRegError('Fallo de red al registrar participante.');
    } finally {
      setAddingReg(false);
    }
  };

  // DRAG & DROP DESIGNER LOGIC
  const handleLogoUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert("El archivo seleccionado supera el límite recomendado de 15MB. Sube una imagen más optimizada.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event: any) => {
      const updatedSettings = {
        ...settings,
        template: {
          ...settings.template,
          bgImage: event.target.result
        }
      };
      setSettings(updatedSettings);
    };
    reader.readAsDataURL(file);
  };

  const handleClearTemplateImg = () => {
    const updatedSettings = {
      ...settings,
      template: {
        ...settings.template,
        bgImage: null
      }
    };
    setSettings(updatedSettings);
  };

  const updateFieldProperty = (fieldKey: 'nameField' | 'idField' | 'roleField', property: string, value: any) => {
    const updatedSettings = {
      ...settings,
      template: {
        ...settings.template,
        [fieldKey]: {
          ...settings.template[fieldKey],
          [property]: value
        }
      }
    };
    setSettings(updatedSettings);
  };

  // Convert click/drag on aspect frame container to coordinates
  const calculateCoordinates = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only capture click if not dragging
    if (isDragging) return;
    const coords = calculateCoordinates(e.clientX, e.clientY);
    if (coords) {
      updateFieldProperty(activeFieldKey, 'x', coords.x);
      updateFieldProperty(activeFieldKey, 'y', coords.y);
    }
  };

  // Draggable pointers
  const handlePointerDown = (fieldKey: 'nameField' | 'idField' | 'roleField', e: React.PointerEvent) => {
    e.stopPropagation();
    setActiveFieldKey(fieldKey);
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const coords = calculateCoordinates(e.clientX, e.clientY);
    if (coords) {
      updateFieldProperty(activeFieldKey, 'x', coords.x);
      updateFieldProperty(activeFieldKey, 'y', coords.y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // CSV BATCH PARSING ENGINE
  const handleCsvTextChange = (text: string) => {
    setCsvText(text);
    parseCsvString(text);
  };

  const handleCsvFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event: any) => {
      const text = event.target.result;
      setCsvText(text);
      parseCsvString(text);
    };
    reader.readAsText(file);
  };

  const parseCsvString = (text: string) => {
    if (!text.trim()) {
      setParsedItems([]);
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // Detect separator (comma or semicolon)
    let sep = ',';
    if (lines[0].includes(';')) sep = ';';

    const parsed: any[] = [];
    let headers: string[] = [];

    // Simple heuristic to check if first line is headers
    const firstLineCols = lines[0].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const hasHeaders = firstLineCols.some(c => c.includes('nom') || c.includes('cc') || c.includes('correo') || c.includes('mail') || c.includes('rol'));

    let startIndex = 0;
    if (hasHeaders) {
      headers = firstLineCols;
      startIndex = 1;
    } else {
      headers = ['nombre', 'identificacion', 'rol', 'correo'];
    }

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
      if (cols.length < 3) continue;

      let item: any = { name: '', identification: '', role: 'estudiante', email: '', rowNum: i + 1, valid: true, error: '' };

      if (hasHeaders) {
        headers.forEach((h, colIdx) => {
          const val = cols[colIdx] || '';
          if (h.includes('nom')) item.name = val;
          else if (h.includes('cc') || h.includes('ident') || h.includes('doc')) item.identification = val;
          else if (h.includes('rol')) item.role = val.toLowerCase();
          else if (h.includes('cor') || h.includes('mail')) item.email = val;
        });
      } else {
        item.name = cols[0] || '';
        item.identification = cols[1] || '';
        item.role = (cols[2] || '').toLowerCase();
        item.email = cols[3] || '';
      }

      // Normalization of roles
      if (item.role.includes('est') || item.role.includes('es')) {
        item.role = 'estudiante';
      } else if (item.role.includes('egr') || item.role.includes('eg')) {
        item.role = 'egresado';
      } else if (item.role.includes('emp') || item.role.includes('pres')) {
        item.role = 'empresario';
      } else {
        item.role = 'estudiante'; // defaults
      }

      // Simple validation rules
      if (!item.name) {
        item.valid = false;
        item.error += 'Falta Nombre. ';
      }
      if (!item.identification) {
        item.valid = false;
        item.error += 'Falta Identificación. ';
      }
      if (!item.email || !item.email.includes('@')) {
        item.valid = false;
        item.error += 'Correo inválido. ';
      }

      parsed.push(item);
    }

    setParsedItems(parsed);
  };

  const handleExecuteBulkRegister = async () => {
    if (!selectedProjectId) {
      setBulkStatus({ status: 'error', message: 'No se ha seleccionado ningún proyecto activo.' });
      return;
    }
    const validItems = parsedItems.filter(item => item.valid);
    if (validItems.length === 0) {
      setBulkStatus({ status: 'error', message: 'No hay registros válidos cargados para procesar.' });
      return;
    }

    setBulkStatus({ status: 'processing', message: `Insertando ${validItems.length} registros directamente en la tabla de Notion...` });

    try {
      const res = await fetch(`/api/notion/projects/${selectedProjectId}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems })
      });
      const data = await res.json();
      
      if (data.success) {
        setBulkStatus({ 
          status: 'success', 
          message: `¡Carga masiva en Notion completada! ${validItems.length} registros guardados exitosamente transaccionalmente.` 
        });
        setCsvText('');
        setParsedItems([]);
        fetchProjectRegistrants(selectedProjectId);
      } else {
        setBulkStatus({ status: 'error', message: data.message || 'Ocurrió un error en Notion.' });
      }
    } catch (e) {
      setBulkStatus({ status: 'error', message: 'Fallo de conectividad en el lote hacia Notion.' });
    }
  };

  // Metrics
  const totalCount = registrants.length;
  const correctCount = registrants.filter(r => r.status === 'correcto').length;
  const receivedCount = registrants.filter(r => r.status === 'recibido').length;

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200" id="admin-view-root">
      
      {/* Dynamic Top Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm dark:shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-600 flex items-center justify-center font-bold text-white shadow-md">
            UD
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
              Panel Administrativo <span className="text-xs bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded border border-pink-500/30 font-mono">Control Total</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Universidad de Nariño — Coordinación de Asistencias & Certificaciones</p>
          </div>
        </div>

        {/* Dynamic Project Selector */}
        <div className="flex-1 max-w-xs mx-auto sm:mx-0 sm:ml-4 flex items-center bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm focus-within:ring-1 focus-within:ring-pink-500/50 transition-all font-sans">
          <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2 border-r border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap select-none">Proyecto:</span>
            <select 
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-transparent text-xs font-extrabold text-slate-800 dark:text-white border-0 p-0 m-0 focus:outline-none focus:ring-0 cursor-pointer truncate"
            >
              {projects.length === 0 ? (
                <option value="">Cargando proyectos...</option>
              ) : (
                projects.map(p => (
                  <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900">{p.title}</option>
                ))
              )}
            </select>
          </div>
          <button
            onClick={() => setShowCreateProjectModal(true)}
            className="pl-2 pr-0.5 text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300 transition-colors cursor-pointer flex items-center justify-center font-bold"
            title="Crear nuevo taller directamente en Notion"
          >
            <Plus className="w-4 h-4 font-extrabold" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onBackToRegistry}
            id="admin-btn-back"
            className="text-xs font-semibold py-2 px-4 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
          >
            Volver al Registro Público
          </button>
          <button
            onClick={fetchData}
            id="admin-btn-refresh"
            className="p-2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
            title="Refrescar Datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            title="Cambiar Tema (Oscuro/Claro)"
            className="p-2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer shadow-sm"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>
        </div>
      </header>

      {/* Main Core Layout: Sidebar + Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* SIDEBAR NAVIGATION BLOCK */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          
          {/* Quick Stats Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md">
            <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Métricas Activas
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 dark:bg-slate-950/80 border border-slate-100 dark:border-slate-800/40 shadow-inner">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Solicitudes</span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{totalCount}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 dark:bg-slate-950/80 border border-slate-100 dark:border-slate-800/40 shadow-inner">
                <span className="text-xs text-slate-500 dark:text-slate-400">Correcto / Enviado</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{correctCount}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 dark:bg-slate-950/80 border border-slate-100 dark:border-slate-800/40 shadow-inner">
                <span className="text-xs text-slate-500 dark:text-slate-400">Recibidos (Pendientes)</span>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-500">{receivedCount}</span>
              </div>
            </div>
          </div>

          {/* Core Tab Group Buttons */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-2 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <button
              onClick={() => { setActiveTab('registrants'); setPreviewingCert(null); }}
              className={`w-full text-left py-3 px-4 rounded-lg flex items-center justify-between font-semibold text-xs transition-all cursor-pointer ${
                activeTab === 'registrants' 
                  ? 'bg-pink-50 dark:bg-pink-600/10 text-pink-600 dark:text-pink-300 border-l-4 border-pink-500 font-bold' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Control de Asistentes</span>
              </div>
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold font-mono">
                {totalCount}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('designer'); setPreviewingCert(null); }}
              className={`w-full text-left py-3 px-4 rounded-lg flex items-center justify-between font-semibold text-xs transition-all cursor-pointer ${
                activeTab === 'designer' 
                  ? 'bg-pink-50 dark:bg-pink-600/10 text-pink-600 dark:text-pink-300 border-l-4 border-pink-500 font-bold' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>Diseñador del Certificado</span>
              </div>
              {settings.template?.bgImage ? (
                <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider font-extrabold border border-emerald-500/30">Activo</span>
              ) : (
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] px-2 py-0.5 rounded font-mono uppercase">Por Defecto</span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('bulk'); setPreviewingCert(null); }}
              className={`w-full text-left py-3 px-4 rounded-lg flex items-center justify-between font-semibold text-xs transition-all cursor-pointer ${
                activeTab === 'bulk' 
                  ? 'bg-pink-50 dark:bg-pink-600/10 text-pink-600 dark:text-pink-300 border-l-4 border-pink-500 font-bold' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Carga en Lote (CSV)</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('settings'); setPreviewingCert(null); }}
              className={`w-full text-left py-3 px-4 rounded-lg flex items-center justify-between font-semibold text-xs transition-all cursor-pointer ${
                activeTab === 'settings' 
                  ? 'bg-pink-50 dark:bg-pink-600/10 text-pink-600 dark:text-pink-300 border-l-4 border-pink-500 font-bold' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-4 h-4" />
                <span>Código Diario de Registro</span>
              </div>
            </button>
          </div>

          {/* Active Code Box */}
          <div className="bg-gradient-to-br from-indigo-950 to-pink-950 border border-indigo-500/20 rounded-xl p-4 shadow-md text-slate-100 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-indigo-300">
              <Key className="w-4 h-4 animate-pulse" />
              <h4 className="text-xs font-bold uppercase tracking-widest">Código de Hoy</h4>
            </div>
            <div className="bg-black/45 rounded-lg p-2.5 border border-white/5">
              <p className="font-mono text-lg font-black tracking-widest text-white selection:bg-indigo-600">{settings.dailyCode || 'DEPADISE2026'}</p>
            </div>
            <p className="text-[10px] text-slate-300 leading-normal">
              Código indispensable que deben ingresar los asistentes públicos.
            </p>
          </div>
        </div>

        {/* ACTIVE WORKSPACE WORKPAD */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Messages Alert Panels */}
          {errorMsg && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 flex items-center gap-2">
              <X className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-300 flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: REGISTRANTS MANAGEMENT TABLE */}
          {activeTab === 'registrants' && !previewingCert && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
               <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                 <div>
                   <h2 className="font-bold text-slate-900 dark:text-white text-base">Asistencia y Listado Público</h2>
                   <p className="text-xs text-slate-500 dark:text-slate-400">Verifica, elimina, aprueba, edita o registra participantes para firmas de certificados.</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <button
                     onClick={() => {
                       setAddName('');
                       setAddId('');
                       setAddRole('estudiante');
                       setAddEmail('');
                       setAddRegError('');
                       setShowAddRegModal(true);
                     }}
                     className="text-xs font-bold px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded border border-pink-500 selection:bg-pink-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                   >
                     <UserPlus className="w-3.5 h-3.5" />
                     Manual
                   </button>
                   <div className="text-xs font-semibold px-3 py-1.5 bg-pink-50 dark:bg-slate-950 rounded text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-slate-800">
                     Total inscritos: {totalCount}
                   </div>
                 </div>
               </div>

              {registrants.length === 0 ? (
                <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
                  <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-semibold text-slate-850 dark:text-slate-200">No se han registrado participantes todavía.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Usa la interfaz pública con tu código activo para poblar la base de datos.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-100 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Nombre / Identificación</th>
                        <th className="px-5 py-3.5">Rol de Asistencia</th>
                        <th className="px-5 py-3.5">Correo Electrónico</th>
                        <th className="px-5 py-3.5">Estado Envío</th>
                        <th className="px-5 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {registrants.map((reg) => (
                        <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-900 dark:text-white">{reg.name}</div>
                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                              C.C. {reg.identification}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize border ${
                              reg.role === 'empresario' ? 'bg-amber-100/40 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25' :
                              reg.role === 'egresado' ? 'bg-pink-100/40 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/25' :
                              'bg-indigo-100/40 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/25'
                            }`}>
                              {reg.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">
                            {reg.email}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${
                                reg.status === 'correcto' ? 'bg-emerald-500' : 
                                reg.status === 'incorrecto' ? 'bg-rose-500' : 'bg-amber-500'
                              }`} />
                              <span className={`text-xs font-semibold capitalize ${
                                reg.status === 'correcto' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 
                                reg.status === 'incorrecto' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-500'
                              }`}>
                                {reg.status === 'correcto' ? 'Establecido como Certificado' : 
                                 reg.status === 'incorrecto' ? 'Datos Incorrectos' : 'Recibido'}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-0.5">
                              {reg.id}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end items-center gap-2">
                              {reg.status !== 'correcto' && (
                                <button
                                  onClick={() => handleUpdateStatus(reg.id, 'correcto')}
                                  id={`btn-approve-${reg.id}`}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1.5 px-3 rounded flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                  title="Aprobar y generar certificado"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Aprobar Certificado
                                </button>
                              )}

                              {reg.status === 'correcto' && (
                                <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold italic border border-dashed border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 select-none">
                                  Certificado Generado
                                </span>
                              )}

                              {reg.status !== 'incorrecto' && reg.status !== 'correcto' && (
                                <button
                                  onClick={() => handleUpdateStatus(reg.id, 'incorrecto')}
                                  className="bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-semibold text-xs py-1.5 px-3 rounded flex items-center gap-1 transition-all border border-rose-100 dark:border-rose-900/30 cursor-pointer shadow-sm"
                                  title="Marcar con datos incorrectos para corrección"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Incorrecto
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setEditingReg(reg);
                                  setEditName(reg.name);
                                  setEditId(reg.identification);
                                  setEditRole(reg.role);
                                  setEditEmail(reg.email);
                                  setEditStatus(reg.status);
                                }}
                                className="bg-slate-105 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-705 dark:text-slate-300 font-semibold text-xs py-1.5 px-2.5 rounded flex items-center gap-1 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
                                title="Editar Datos Participante"
                              >
                                <Pencil className="w-3.5 h-3.5 text-pink-500" />
                                Editar
                              </button>

                              <button
                                onClick={() => setPreviewingCert(reg)}
                                id={`btn-preview-${reg.id}`}
                                className="bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 font-semibold text-xs py-1.5 px-2.5 rounded flex items-center gap-1 transition-all border border-indigo-100 dark:border-indigo-700/35 cursor-pointer shadow-sm"
                                title="Ver Certificado"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Ver
                              </button>

                              <button
                                onClick={() => handleDeleteRegistrant(reg.id, reg.name)}
                                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-colors cursor-pointer"
                                title="Eliminar del Registro de Notion"
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
              )}
            </div>
          )}

          {/* DYNAMIC VIEW PREVIEW PORTAL */}
          {previewingCert && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                    <Sparkles className="w-4.5 h-4.5 text-pink-500 dark:text-pink-400" />
                    Vista Previa de Certificado
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Asistente: <span className="text-slate-800 dark:text-white font-semibold">{previewingCert.name}</span> | CC: <span className="font-mono">{previewingCert.identification}</span></p>
                </div>
                <button
                  onClick={() => setPreviewingCert(null)}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
                >
                  Cerrar Previsualización
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-850 flex justify-center shadow-inner">
                <CertificateTemplate
                  name={previewingCert.name}
                  identification={previewingCert.identification}
                  role={previewingCert.role}
                  id={previewingCert.id}
                  templateConfig={settings.template}
                />
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE CERTIFICATE DESIGNER */}
          {activeTab === 'designer' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              
              {/* Controls Column */}
              <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-6 shadow-md h-fit">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                    <Layers className="w-5 h-5 text-pink-500" />
                    Diseño y Posicionamiento
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Inserta el diseño del certificado, selecciona variables y colócalas arrastrándolas o afinando sus ejes.
                  </p>
                </div>

                {/* Uploder Base image */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Imagen de Fondo Base (Template)</label>
                  {!settings.template?.bgImage ? (
                    <div className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-pink-500 rounded-lg p-5 text-center transition-all bg-slate-50/60 dark:bg-slate-950/50">
                      <input 
                        type="file" 
                        accept="image/*" 
                        id="bg-upload-field" 
                        className="hidden" 
                        onChange={handleLogoUpload}
                      />
                      <label htmlFor="bg-upload-field" className="cursor-pointer flex flex-col items-center justify-center gap-1">
                        <Upload className="w-8 h-8 text-pink-500 hover:scale-105 transition-transform" />
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">Elegir Archivo PNG o JPG</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Se recomienda fondo HD optimizado (1920x1080)</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 bg-slate-200 dark:bg-slate-900 border border-slate-350 dark:border-slate-800 rounded overflow-hidden flex items-center justify-center">
                          <img src={settings.template.bgImage} className="w-full h-full object-cover" alt="fondo" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white block">Diseño subido</span>
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">Formato Base64 Activo</span>
                        </div>
                      </div>
                      <button
                        onClick={handleClearTemplateImg}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-red-500 dark:text-red-400 text-xs py-1 px-2.5 rounded border border-slate-200 dark:border-slate-800 cursor-pointer transition-colors shadow-sm"
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>

                {/* Variable Selector */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Variable Activa para Posicionar</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'nameField', label: 'Nombre' },
                      { key: 'idField', label: 'Cédula / ID' },
                      { key: 'roleField', label: 'Rol / Cargo' }
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setActiveFieldKey(f.key as any)}
                        className={`py-2 px-1 text-xs font-bold rounded border transition-all text-center cursor-pointer ${
                          activeFieldKey === f.key
                            ? 'bg-pink-50 dark:bg-pink-600/10 border-pink-500 text-pink-600 dark:text-pink-300'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Range sliders */}
                <div className="space-y-4 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-205 dark:border-slate-850 shadow-inner">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold text-pink-600 dark:text-pink-400 capitalize">Ejes de: {activeFieldKey === 'nameField' ? 'Nombre' : activeFieldKey === 'idField' ? 'Cédula' : 'Rol'}</span>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      <input 
                        type="checkbox"
                        checked={settings.template[activeFieldKey]?.enabled}
                        onChange={(e) => updateFieldProperty(activeFieldKey, 'enabled', e.target.checked)}
                      />
                      Habilitado
                    </label>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    {/* Position X Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                        <span>Alineación Horizontal (Posición X %)</span>
                        <span className="font-mono text-pink-600 dark:text-pink-300 font-bold">{settings.template[activeFieldKey]?.x}%</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        step="0.5"
                        value={settings.template[activeFieldKey]?.x || 50}
                        onChange={(e) => updateFieldProperty(activeFieldKey, 'x', parseFloat(e.target.value))}
                        className="w-full accent-pink-500 cursor-pointer"
                      />
                    </div>

                    {/* Position Y Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                        <span>Alineación Vertical (Posición Y %)</span>
                        <span className="font-mono text-pink-600 dark:text-pink-300 font-bold">{settings.template[activeFieldKey]?.y}%</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        step="0.5"
                        value={settings.template[activeFieldKey]?.y || 50}
                        onChange={(e) => updateFieldProperty(activeFieldKey, 'y', parseFloat(e.target.value))}
                        className="w-full accent-pink-500 cursor-pointer"
                      />
                    </div>

                    {/* Custom Properties Row */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Tamaño de Fuente (pt)</label>
                        <input 
                          type="number"
                          value={settings.template[activeFieldKey]?.fontSize || 20}
                          onChange={(e) => updateFieldProperty(activeFieldKey, 'fontSize', parseInt(e.target.value) || 12)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-slate-900 dark:text-white text-xs px-2.5 py-1 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Color de Texto</label>
                        <div className="flex gap-1.5 font-mono">
                          <input 
                            type="color"
                            value={settings.template[activeFieldKey]?.color || '#000000'}
                            onChange={(e) => updateFieldProperty(activeFieldKey, 'color', e.target.value)}
                            className="bg-transparent border-0 outline-none w-8 h-7 cursor-pointer"
                          />
                          <input 
                            type="text"
                            value={settings.template[activeFieldKey]?.color || ''}
                            onChange={(e) => updateFieldProperty(activeFieldKey, 'color', e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-slate-900 dark:text-white text-[10px] uppercase px-1.5 py-1 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Text Weight and Alignment */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Grosor Letra</label>
                        <select
                          value={settings.template[activeFieldKey]?.fontWeight || 'normal'}
                          onChange={(e) => updateFieldProperty(activeFieldKey, 'fontWeight', e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs px-2.5 py-1 text-slate-800 dark:text-slate-300 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Negrita (Bold)</option>
                          <option value="bolder">Gruesa (Bolder)</option>
                          <option value="black">Negra Extrema (Black)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Alineación</label>
                        <select
                          value={settings.template[activeFieldKey]?.align || 'center'}
                          onChange={(e) => updateFieldProperty(activeFieldKey, 'align', e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs px-2.5 py-1 text-slate-800 dark:text-slate-300 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                        >
                          <option value="center">Centrado (Middle)</option>
                          <option value="left">Izquierda (Start)</option>
                          <option value="right">Derecha (End)</option>
                        </select>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Designer Submit Button */}
                <div className="pt-2">
                  <button
                    onClick={() => handleSaveSettings()}
                    disabled={savingSettings}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer uppercase tracking-wider disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <>
                        <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                        Guardando Plantilla...
                      </>
                    ) : (
                      <>
                        <Check className="w-4.5 h-4.5" />
                        Guardar Diseño de Posicionamiento
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Graphical Editor Box Workspace */}
              <div className="xl:col-span-7 flex flex-col gap-3">
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs shadow-sm">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />
                    <span>Arrastra los nombres directamente sobre el papel o haz clic en cualquier lugar para ubicar <strong>{activeFieldKey === 'nameField' ? '[Nombre]' : activeFieldKey === 'idField' ? '[Cédula]' : '[Rol]'}</strong></span>
                  </div>
                </div>

                {/* Aspect 16/9 Interactive Box */}
                <div className="bg-slate-100 dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-xl overflow-hidden shadow-lg relative">
                  <div 
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="w-full aspect-[16/9] relative select-none cursor-crosshair overflow-hidden touch-none"
                    style={{
                      backgroundImage: settings.template?.bgImage ? `url(${settings.template.bgImage})` : 'none',
                      backgroundSize: '100% 100%',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      backgroundColor: darkMode ? '#0c071a' : '#fbf9ff'
                    }}
                  >
                    {/* Placeholder Grid lines if no custom design image uploaded */}
                    {!settings.template?.bgImage && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-25">
                        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, #db2777 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                        <Maximize2 className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" />
                        <p className="text-xs font-bold font-mono tracking-widest text-slate-600 dark:text-slate-400 text-center uppercase">PREVIEW DE COMPOSICIÓN</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-600 font-mono mt-1">Sube un fondo en la izquierda para maquinar tu mapeo</p>
                      </div>
                    )}

                    {/* NAME ELEMENT DRAGGABLE REPRESENTATION */}
                    {settings.template?.nameField?.enabled && (
                      <div 
                        onPointerDown={(e) => handlePointerDown('nameField', e)}
                        className={`absolute select-none p-1.5 rounded transition-all cursor-move border flex items-center justify-center text-center ${
                          activeFieldKey === 'nameField' 
                            ? 'border-pink-500 bg-pink-500/20 text-slate-900 dark:text-white shadow-lg ring-1 ring-pink-500 scale-102 font-bold z-30' 
                            : 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 z-10 shadow-sm'
                        }`}
                        style={{
                          left: `${settings.template.nameField.x}%`,
                          top: `${settings.template.nameField.y}%`,
                          transform: `translate(${
                            settings.template.nameField.align === 'center' ? '-50%' : (settings.template.nameField.align === 'right' ? '-100%' : '0%')
                          }, -50%)`,
                        }}
                      >
                        <span 
                          style={{
                            fontSize: `${settings.template.nameField.fontSize * 0.4}px`, // scaled for view container
                            fontWeight: settings.template.nameField.fontWeight || 'bold',
                            color: settings.template.nameField.color || '#1e3a8a'
                          }}
                        >
                          [NOMBRE COMPLETO]
                        </span>
                      </div>
                    )}

                    {/* CC INDENTIFICATION ELEMENT DRAGGABLE REPRESENTATION */}
                    {settings.template?.idField?.enabled && (
                      <div 
                        onPointerDown={(e) => handlePointerDown('idField', e)}
                        className={`absolute select-none p-1.5 rounded transition-all cursor-move border flex items-center justify-center text-center ${
                          activeFieldKey === 'idField' 
                            ? 'border-pink-500 bg-pink-500/20 text-slate-900 dark:text-white shadow-lg ring-1 ring-pink-500 scale-102 font-bold z-30' 
                            : 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 z-10 shadow-sm'
                        }`}
                        style={{
                          left: `${settings.template.idField.x}%`,
                          top: `${settings.template.idField.y}%`,
                          transform: `translate(${
                            settings.template.idField.align === 'center' ? '-50%' : (settings.template.idField.align === 'right' ? '-100%' : '0%')
                          }, -50%)`,
                        }}
                      >
                        <span 
                          style={{
                            fontSize: `${settings.template.idField.fontSize * 0.4}px`,
                            fontWeight: settings.template.idField.fontWeight || 'normal',
                            color: settings.template.idField.color || '#374151'
                          }}
                        >
                          C.C. 1.085.123.456
                        </span>
                      </div>
                    )}

                    {/* ROLE ELEMENT DRAGGABLE REPRESENTATION */}
                    {settings.template?.roleField?.enabled && (
                      <div 
                        onPointerDown={(e) => handlePointerDown('roleField', e)}
                        className={`absolute select-none p-1 rounded transition-all cursor-move border flex items-center justify-center text-center ${
                          activeFieldKey === 'roleField' 
                            ? 'border-pink-500 bg-pink-500/20 text-slate-900 dark:text-white shadow-lg ring-1 ring-pink-500 scale-102 font-bold z-30' 
                            : 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 z-10 shadow-sm'
                        }`}
                        style={{
                          left: `${settings.template.roleField.x}%`,
                          top: `${settings.template.roleField.y}%`,
                          transform: `translate(${
                            settings.template.roleField.align === 'center' ? '-50%' : (settings.template.roleField.align === 'right' ? '-100%' : '0%')
                          }, -50%)`,
                        }}
                      >
                        <span 
                          style={{
                            fontSize: `${settings.template.roleField.fontSize * 0.4}px`,
                            fontWeight: settings.template.roleField.fontWeight || 'bold',
                            color: settings.template.roleField.color || '#ea580c'
                          }}
                        >
                          ROL: EGRESADO / ESTUDIANTE
                        </span>
                      </div>
                    )}

                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 mt-1 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-pink-500" />
                    Consejo Técnico
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Los valores X e Y se guardan en porcentajes (0-100%). Esto asegura que se escalen de manera fluida tanto en dispositivos móviles en el buscador interactivo público como en las planillas de descarga HD en resolución 1920x1080.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: BATCH CSV FILE AND PASTE REGISTRATION */}
          {activeTab === 'bulk' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-md space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
                  Carga Masiva de Inscritos (En lote)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ingresa una lista de asistentes desde Excel o un archivo CSV. Los registros válidos se añadirán y se les despachará su certificado de inmediato.
                </p>
              </div>

              {/* Dual upload section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Method A: Paste comma separated string */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Método 1: Pegar Texto delimitado (Excel / CSV)</label>
                  <textarea
                    rows={8}
                    value={csvText}
                    onChange={(e) => handleCsvTextChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-xs text-slate-800 dark:text-slate-300 p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed"
                    placeholder={`nombre,identificacion,rol,correo\nJuan Rosero,1085200300,egresado,juan.rosero@udenar.edu.co\nMaria Gomez,1085300400,estudiante,maria.gomez@gmail.com\nCarlos Lopez,1085400500,empresario,carlos.lopez@yahoo.com`}
                  />
                  <span className="text-[10px] text-slate-500 block leading-normal">
                    Delimitador soportado de manera automática: comas (,) o puntos y comas (;). Roles soportados: estudiante, egresado o empresario.
                  </span>
                </div>

                {/* Method B: Or drag CSV file */}
                <div className="space-y-2 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Método 2: Cargar un archivo .CSV / .TXT</label>
                    <div className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-lg p-9 text-center transition-all bg-slate-50/60 dark:bg-slate-950/60 mt-2">
                      <input 
                        type="file" 
                        accept=".csv,.txt" 
                        id="csv-file-field" 
                        className="hidden" 
                        onChange={handleCsvFileUpload}
                      />
                      <label htmlFor="csv-file-field" className="cursor-pointer flex flex-col items-center justify-center gap-1.5">
                        <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">Elegir Archivo Planilla</span>
                        <span className="text-[10px] text-slate-550 dark:text-slate-500 mt-0.5">TXT o CSV con encabezado delimitado</span>
                      </label>
                    </div>
                  </div>

                  {/* Help formats info */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 p-3 rounded-lg text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                    <strong className="text-slate-700 dark:text-slate-300 font-bold">Encabezados ideales: </strong>
                    <code className="text-pink-600 dark:text-pink-400 font-mono">nombre | identificacion | rol | correo</code>. <br />
                    Si no incluyes encabezados, el sistema asumirá ese orden exacto por columna de izquierda a derecha.
                  </div>
                </div>

              </div>

              {/* PARSED ITEMS PREVIEW PANEL */}
              {parsedItems.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-350 flex items-center gap-1">
                      <span>Previsualización de Lote</span>
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-650 dark:text-slate-400">{parsedItems.length} registros</span>
                    </span>
                    <span className="text-slate-500">Filtrando repetidos de manera automática en la base de datos</span>
                  </div>

                  <div className="max-h-[220px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-105 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-205 dark:border-slate-800 uppercase text-[9px] tracking-wider">
                        <tr>
                          <th className="p-2.5">Fila</th>
                          <th className="p-2.5">Asistente (Nombre)</th>
                          <th className="p-2.5">Cédula</th>
                          <th className="p-2.5">Rol</th>
                          <th className="p-2.5">Correo Destino</th>
                          <th className="p-2.5">Estado Filtros</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-850/60 font-mono">
                        {parsedItems.map((item, idx) => (
                          <tr key={idx} className={item.valid ? 'hover:bg-slate-100/40 dark:hover:bg-slate-900/40 text-slate-700 dark:text-slate-300' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'}>
                            <td className="p-2">{item.rowNum}</td>
                            <td className="p-2 font-sans font-bold">{item.name || '—'}</td>
                            <td className="p-2">{item.identification || '—'}</td>
                            <td className="p-2 capitalize text-[10px]">{item.role}</td>
                            <td className="p-2">{item.email || '—'}</td>
                            <td className="p-2">
                              {item.valid ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                  <Check className="w-3 h-3" />
                                  Listo
                                </span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5 font-sans" title={item.error}>
                                  <AlertCircle className="w-3 h-3" />
                                  {item.error.substring(0, 15)}...
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Execut Button trigger with feedback details */}
                  <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal max-w-lg">
                      Al procesar el lote, cada participante de la lista se registrará en estado <strong className="text-indigo-950 dark:text-white font-bold">correcto (aprobado)</strong>, guardándose y disparando el micro-generador para enviar el certificado de forma inmediata.
                    </p>

                    <button
                      onClick={handleExecuteBulkRegister}
                      disabled={bulkStatus.status === 'processing'}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow disabled:opacity-50 uppercase tracking-widest"
                    >
                      {bulkStatus.status === 'processing' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-4 h-4" />
                          Generar Lote Completo
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {bulkStatus.status !== 'idle' && (
                <div className={`p-3.5 rounded-lg border text-sm ${
                  bulkStatus.status === 'processing' ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300' :
                  bulkStatus.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 animate-fade-in' :
                  'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {bulkStatus.status === 'processing' && <RefreshCw className="w-4 h-4 animate-spin" />}
                    {bulkStatus.status === 'success' && <Check className="w-4 h-4" />}
                    {bulkStatus.status === 'error' && <X className="w-4 h-4" />}
                    <span className="font-semibold">{bulkStatus.message}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PASSCODE SETTINGS */}
          {activeTab === 'settings' && (
            <form onSubmit={(e) => { e.preventDefault(); handleSavePasscodeOnly(settings.dailyCode); }} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5">
                  <Database className="w-5 h-5 text-indigo-500" />
                  Código Diario de Registro Público
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configura el código indispensable que deben ingresar los participantes para poder inscribirse en las planillas.</p>
              </div>

              <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Código de Acceso Diario</label>
                  <input
                    type="text"
                    value={settings.dailyCode}
                    onChange={e => setSettings({...settings, dailyCode: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white text-sm px-3.5 py-2 rounded focus:outline-none focus:ring-1 focus:ring-pink-500 transition-colors uppercase"
                    placeholder="Por ejemplo: DISENO26"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Este código valida el ingreso en la puerta de enlace pública.</p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-850 text-xs text-slate-600 dark:text-slate-400 leading-normal">
                  <p className="font-semibold text-slate-850 dark:text-slate-300">💡 Integración en Tiempo Real con Notion</p>
                  <p className="mt-1">
                    Cada vez que un estudiante llena el formulario con el código diario correcto, se crea una fila automáticamente en la base de datos de Notion bajo la categoría del proyecto seleccionado.
                  </p>
                </div>
              </div>

              {/* Guardar Settings Submit Bar */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-[10px] text-slate-500">
                  Cambios se aplican instantáneamente en todo el ecosistema.
                </span>
                
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-5 rounded-lg flex items-center gap-1.5 hover:shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Guardar Código Diario
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>

      {/* CREATE WORKSHOP PROJECT MODAL */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/60 dark:bg-slate-950/60 backdrop-blur-sm select-none animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6 space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5 font-sans">
                <Sparkles className="w-5 h-5 text-pink-500" />
                Crear Nuevo Taller en Notion
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Esto creará un nuevo bloque de tipo toggle y su base de datos asociada directamente en tu espacio de Notion.
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 font-sans">
                  Nombre / Título del Taller
                </label>
                <input
                  type="text"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="Ej: Taller de Identidad Visual"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                  required
                  autoFocus
                />
              </div>

              {modalError && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3 text-xs text-rose-600 dark:text-rose-400 font-semibold leading-normal font-sans">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateProjectModal(false);
                    setNewProjectTitle('');
                    setModalError('');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer uppercase tracking-wider font-sans"
                  disabled={creatingProject}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 uppercase tracking-wider font-sans disabled:opacity-50"
                  disabled={creatingProject}
                >
                  {creatingProject ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    'Crear Taller'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL REGISTER PARTICIPANT MODAL */}
      {showAddRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/60 dark:bg-slate-950/60 backdrop-blur-sm select-none animate-fade-in animate-duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6 space-y-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5 font-sans">
                <UserPlus className="w-5 h-5 text-pink-500" />
                Registrar Participante Manualmente
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                La información se guardará al instante en el proyecto activo de Notion de forma segura.
              </p>
            </div>

            <form onSubmit={handleManualAddRegistrant} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Ej: Sebastián Gómez"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Identificación (C.C.)
                </label>
                <input
                  type="text"
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                  placeholder="Ej: 1085432109"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-mono font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Rol de Asistencia
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                >
                  <option value="estudiante">estudiante</option>
                  <option value="egresado">egresado</option>
                  <option value="empresario">empresario</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="ejemplo@usuario.com"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-mono font-semibold"
                  required
                />
              </div>

              {addRegError && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-105 dark:border-rose-900/30 rounded-xl p-3 text-xs text-rose-600 dark:text-rose-400 font-semibold font-sans">
                  {addRegError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddRegModal(false);
                    setAddRegError('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer uppercase tracking-wider font-sans"
                  disabled={addingReg}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 uppercase tracking-wider font-sans disabled:opacity-50"
                  disabled={addingReg}
                >
                  {addingReg ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    'Guardar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PARTICIPANT PROPERTIES MODAL */}
      {editingReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/60 dark:bg-slate-950/60 backdrop-blur-sm select-none animate-fade-in animate-duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6 space-y-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-1.5 font-sans">
                <Pencil className="w-4.5 h-4.5 text-pink-500" />
                Editar Datos de Asistente
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Modifica los datos del participante y sincronízalos directamente en la tabla de Notion.
              </p>
            </div>

            <form onSubmit={handleSaveEditRegistrant} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nombre en el certificado"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Identificación (C.C.)
                </label>
                <input
                  type="text"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  placeholder="Documento nacional"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-mono font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Rol de Asistencia
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                >
                  <option value="estudiante">estudiante</option>
                  <option value="egresado">egresado</option>
                  <option value="empresario">empresario</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-mono font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Estado de Certificado
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all font-semibold"
                >
                  <option value="recibido">recibido</option>
                  <option value="correcto">correcto (certificado aprobado)</option>
                  <option value="incorrecto">incorrecto (marcado con error)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReg(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer uppercase tracking-wider font-sans"
                  disabled={updatingReg}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 uppercase tracking-wider font-sans disabled:opacity-50"
                  disabled={updatingReg}
                >
                  {updatingReg ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    'Sincronizar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
