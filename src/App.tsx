/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import initHeroImg from './image/init.jpg';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  User, 
  CreditCard, 
  Briefcase, 
  Mail, 
  Send, 
  CheckCircle2, 
  Download, 
  ShieldAlert, 
  Settings as SettingsIcon,
  Search,
  BookOpen,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import { RoleType, StatusType, Registrant } from './types.js';
import AdminDashboard from './components/AdminDashboard.tsx';
import CertificateTemplate from './components/CertificateTemplate.tsx';

export default function App() {
  // Theme state: default light, but toggleable
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Navigation / Views
  // 'code' (Verify daily code) -> 'register' (Input form) -> 'success' (Registered banner)
  // 'download' (Check and fetch certificate)
  // 'admin' (Admin console dashboard)
  const [currentView, setCurrentView] = useState<'code' | 'register' | 'success' | 'download' | 'admin'>('code');
  
  // Notion integration states
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchProjectId, setSearchProjectId] = useState<string>('');
  const [lookupId, setLookupId] = useState<string>('');

  // Storage states
  const [dailyCode, setDailyCode] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');
  const [regName, setRegName] = useState('');
  const [regId, setRegId] = useState('');
  const [regRole, setRegRole] = useState<RoleType>('estudiante');
  const [regEmail, setRegEmail] = useState('');
  
  // Feedback status
  const [loading, setLoading] = useState(false);
  const [successResponse, setSuccessResponse] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search status for download tab
  const [searched, setSearched] = useState(false);
  const [matchingRegistrant, setMatchingRegistrant] = useState<Registrant | null>(null);

  // Admin login request
  const [showAdminPassPrompt, setShowAdminPassPrompt] = useState(false);
  const [adminPass, setAdminPass] = useState('');

  // Fetch Notion projects list on mount
  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/notion/projects');
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data);
        if (data.data.length > 0) {
          setSelectedProjectId(data.data[0].id);
          setSearchProjectId(data.data[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching projects list:', e);
    }
  };

  useEffect(() => {
    fetchProjects();
    
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const projectParam = params.get('project');
    const idParam = params.get('id');
    
    if (viewParam === 'download') {
      setCurrentView('download');
      if (idParam && projectParam) {
        setSearchProjectId(projectParam);
        setLookupId(idParam);
        // Automatically perform search
        setTimeout(() => {
          executeNotionLookup(projectParam, idParam);
        }, 600);
      }
    }
  }, []);

  // Sync projects list whenever shifting away from admin view to public views
  useEffect(() => {
    if (currentView !== 'admin') {
      fetchProjects();
    }
  }, [currentView]);

  // Helper to clear errors instantly
  const refreshMsg = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  // 1. Path: Verify Daily Code
  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!dailyCode.trim()) {
      setErrorMsg('Por favor ingresa un código.');
      return;
    }

    setLoading(true);
    refreshMsg();

    try {
      const response = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: dailyCode })
      });
      const data = await response.json();

      if (data.success) {
        setVerifiedCode(dailyCode.toUpperCase());
        setSelectedProjectId(data.projectId);
        setSearchProjectId(data.projectId);
        setCurrentView('register');
      } else {
        setErrorMsg(data.message || 'Código de asistencia de hoy incorrecto.');
      }
    } catch (err) {
      setErrorMsg('Fallo de conexión al verificar el código. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Path: Submit Attendance Registration
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regId.trim() || !regEmail.trim()) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }
    if (!selectedProjectId) {
      setErrorMsg('No se ha seleccionado ningún proyecto válido de la lista de Notion.');
      return;
    }

    setLoading(true);
    refreshMsg();

    try {
      const response = await fetch(`/api/notion/projects/${selectedProjectId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          identification: regId,
          role: regRole,
          email: regEmail
        })
      });
      
      const data = await response.json();

      if (data.success) {
        // Enriched success payload for displaying in successful banner
        setSuccessResponse({
          name: regName,
          identification: regId,
          role: regRole,
          email: regEmail,
          status: 'Recibido'
        });
        setSuccessMsg(data.message || 'Registro exitoso.');
        setCurrentView('success');
        // Clear registration fields (leaving document lookup state setup)
        setLookupId(regId);
        setSearchProjectId(selectedProjectId);
        setRegName('');
        setRegId('');
        setRegEmail('');
      } else {
        setErrorMsg(data.message || 'Error al guardar la asistencia.');
      }
    } catch (err) {
      setErrorMsg('Fallo de comunicación en el servidor. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Path: Look up certificate for download
  const handleLookupCertificate = (e: FormEvent) => {
    e.preventDefault();
    if (!searchProjectId) {
      setErrorMsg('Por favor selecciona el taller/proyecto.');
      return;
    }
    if (!lookupId.trim()) {
      setErrorMsg('Por favor ingresa tu número de identificación.');
      return;
    }
    executeNotionLookup(searchProjectId, lookupId);
  };

  const executeNotionLookup = async (projectId: string, idNumber: string) => {
    setLoading(true);
    refreshMsg();
    setSearched(true);
    setMatchingRegistrant(null);

    try {
      const response = await fetch(`/api/notion/projects/${projectId}/search?identification=${encodeURIComponent(idNumber.trim())}`);
      const data = await response.json();

      if (data.success) {
        if (data.found && data.data) {
          setMatchingRegistrant(data.data);
          if (data.data.status === 'certificado') {
            setSuccessMsg('¡Certificado disponible para descarga!');
          }
        } else {
          setErrorMsg('No se encontró asistencia registrada con esa identificación en este proyecto.');
        }
      } else {
        setErrorMsg(data.message || 'Fallo al consultar en Notion.');
      }
    } catch (e) {
      setErrorMsg('Ocurrió un problema de conectividad al buscar tu certificado en Notion.');
    } finally {
      setLoading(false);
    }
  };

  // Admin passcode verification
  const handleAdminVerify = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPass.trim() })
      });
      const data = await response.json();
      if (data.success) {
        setCurrentView('admin');
        setShowAdminPassPrompt(false);
        setAdminPass('');
        refreshMsg();
      } else {
        setErrorMsg(data.message || 'Contraseña de administrador incorrecta.');
      }
    } catch {
      setErrorMsg('Error de conexión al verificar contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col justify-between font-sans selection:bg-primary/20 selection:text-primary" id="app-viewport">
      
      {/* PUBLIC HEADER NAV */}
      {currentView !== 'admin' && (
        <header className="bg-surface/90 border-b border-outline-variant px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md shadow-sm" id="public-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-container flex items-center justify-center shadow-inner">
              <img 
                alt="Mascot" 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAHBkytAodl-DvKxfHoAJe4GN-xBa_piF1VIi_X2k8OXx5jwsL2cgiYVgwefEIuq6NZMz3TZEfcE3Koq4igtMTdbe79hExmeMZ9R4LPkIWQiIwS6JbaE3KfGr3Bo91RlXlGm8ysc38XElYmVr-u3MC_l50dXUOioZL--M1ht9W3Yg93_-_BPi23OY4ATH8uZGUKBsNc-gFrmgVke6Lli9rX-Bv6vc2q3jr9ubwVj5peghpKVJutsz6sIxvqm5NvnBIR5vMtOY9mEPo" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-primary font-sans">
                Certificados DG
              </h2>
              <p className="text-[10px] text-on-surface-variant font-medium">Universidad de Nariño • Departamento de Diseño</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1.5 bg-surface-container p-1 rounded-full border border-outline-variant/60">
              <button
                onClick={() => { setCurrentView('code'); refreshMsg(); }}
                className={`text-[11px] px-3 py-1.5 rounded-full transition-all font-bold ${
                  currentView === 'code' || currentView === 'register' || currentView === 'success'
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                }`}
              >
                Registro Asistencia
              </button>
              <button
                onClick={() => { setCurrentView('download'); refreshMsg(); setSearched(false); setMatchingRegistrant(null); }}
                className={`text-[11px] px-3 py-1.5 rounded-full transition-all font-bold ${
                  currentView === 'download' 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                }`}
                id="nav-btn-download"
              >
                Descargar Certificado
              </button>
            </nav>

            <button
              onClick={() => setDarkMode(!darkMode)}
              title="Cambiar Tema (Oscuro/Claro)"
              className="p-2 ml-1 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/60 text-on-surface-variant hover:text-primary transition-all flex items-center justify-center cursor-pointer shadow-sm"
              id="theme-toggler"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>

            {/* Admin access: gear icon or inline pass form */}
            {showAdminPassPrompt ? (
              <form onSubmit={handleAdminVerify} className="flex gap-1.5 animate-fade-in bg-surface-container p-1 rounded-xl border border-outline-variant">
                <input
                  type="password"
                  value={adminPass}
                  onChange={e => setAdminPass(e.target.value)}
                  className="bg-surface border border-outline-variant text-[11px] px-3 py-1.5 text-on-background rounded-lg w-28 focus:outline-none focus:border-primary text-center font-mono placeholder:text-outline/70"
                  placeholder="Contraseña"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-primary hover:bg-primary-container text-white font-bold px-3 py-1.5 text-[10px] rounded-lg cursor-pointer uppercase font-sans shadow-sm"
                >
                  {loading ? '...' : 'Entrar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdminPassPrompt(false); setAdminPass(''); refreshMsg(); }}
                  className="bg-surface hover:bg-surface-container text-on-surface-variant px-2 py-1.5 text-[10px] rounded-lg cursor-pointer font-sans border border-outline-variant"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowAdminPassPrompt(true)}
                title="Panel Administrativo"
                id="btn-admin-access"
                className="p-2 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/60 text-on-surface-variant hover:text-primary transition-all flex items-center justify-center cursor-pointer shadow-sm"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>
      )}

      {/* ADMIN CONSOLE COMPONENT INJECTION */}
      {currentView === 'admin' ? (
        <AdminDashboard 
          onBackToRegistry={() => setCurrentView('code')} 
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      ) : (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 py-8 md:py-12" id="form-container">
          
          {/* Hero Banner - Shared for public step views */}
          {(currentView === 'code' || currentView === 'register' || currentView === 'success') && (
            <div className="w-full max-w-lg mb-8 rounded-2xl overflow-hidden shadow-lg">
              <img
                alt="Banner Principal"
                className="w-full h-auto block"
                src={initHeroImg}
              />
            </div>
          )}

          <AnimatePresence mode="wait">
            
            {/* VIEW A: ENTER DAILY CODE */}
            {currentView === 'code' && (
              <motion.div
                key="code-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-lg bg-surface-container-lowest p-6 md:p-8 rounded-2xl border border-outline-variant shadow-sm space-y-6 relative overflow-hidden"
              >
                <div className="text-center space-y-1 relative">
                  <h3 className="font-extrabold text-primary text-xl tracking-tight">Certificaciones de Asistencia</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Ingresa el código diario del taller para registrar tu presencia y generar el certificado.</p>
                </div>

                {/* Validation errors */}
                {errorMsg && (
                  <div className="bg-error-container border border-error/20 rounded-xl p-3 text-xs text-on-error-container antialiased text-center font-semibold">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleVerifyCode} className="space-y-4 relative">
                  
                  {/* Destacado: Código de Entrada de Hoy */}
                  <div className="bg-secondary-fixed p-4 rounded-xl border-2 border-secondary-container">
                    <label className="text-xs font-bold text-on-secondary-fixed block mb-2 font-sans">
                      Código del Día
                    </label>
                    <div className="flex items-center gap-2">
                      <Key className="w-5 h-5 text-secondary shrink-0" />
                      <input
                        type="text"
                        value={dailyCode}
                        onChange={e => setDailyCode(e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 font-sans text-xl sm:text-2xl font-black text-on-secondary-container placeholder:text-on-secondary-container/20 uppercase tracking-widest outline-none"
                        placeholder="Ej: DISENO26"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    id="submit-daily-code"
                    className="w-full py-3.5 bg-secondary-container text-on-secondary-container font-extrabold rounded-full shadow-sm hover:bg-secondary-fixed-dim transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider text-xs"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Verificando...
                      </>
                    ) : 'Acceder al Registro'}
                  </button>
                </form>

              </motion.div>
            )}

            {/* VIEW B: PERSONAL DETAILS FORM */}
            {currentView === 'register' && (
              <motion.div
                key="register-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-lg bg-surface-container-lowest p-6 md:p-8 rounded-2xl border border-outline-variant shadow-sm space-y-6"
              >
                <div className="text-center space-y-1">
                  <div className="flex flex-col gap-1.5 items-center justify-center">
                    <span className="inline-block text-[10px] bg-primary/10 text-primary font-bold px-2.5 py-1 rounded-full border border-primary/20 uppercase tracking-widest font-mono">
                      Código Verificado: {verifiedCode}
                    </span>
                    <span className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold px-3 py-1 rounded-lg border border-amber-500/20 max-w-full text-center">
                      Proyecto Taller: {projects.find(p => p.id === selectedProjectId)?.title || 'Taller Autorizado'}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-primary text-xl tracking-tight mt-2.5">
                    Datos del Asistente
                  </h3>
                  <p className="text-xs text-on-surface-variant font-medium">Introduce tus datos para registrar la asistencia en Notion y firmar tu certificado.</p>
                </div>

                {errorMsg && (
                  <div className="bg-error-container border border-error/20 rounded-xl p-3 text-xs text-on-error-container text-center font-semibold">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                  
                  {/* Name field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-on-surface-variant">
                      Nombre Completo
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-outline">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={regName}
                        onChange={e => setRegName(e.target.value)}
                        className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-3.5 py-3 text-sm text-on-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors font-sans"
                        placeholder="Como deseas que aparezca en el Certificado"
                        required
                      />
                    </div>
                  </div>

                  {/* Identification CC field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-on-surface-variant">
                      Identificación o Documento (C.C.)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-outline">
                        <CreditCard className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={regId}
                        onChange={e => setRegId(e.target.value)}
                        className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-3.5 py-3 text-sm text-on-background font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        placeholder="Ejemplo: 1085123456"
                        required
                      />
                    </div>
                  </div>

                  {/* Role Type */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-on-surface-variant">
                      Tu Rol de Asistencia
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(projects.find(p => p.id === selectedProjectId)?.config?.roles || ['estudiante', 'egresado', 'empresario']).map((role: string) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setRegRole(role)}
                          id={`role-btn-${role}`}
                          className={`flex-1 min-w-[80px] py-2.5 px-3 text-xs font-bold capitalize rounded-xl border transition-all text-center cursor-pointer ${
                            regRole === role
                              ? 'bg-secondary-container text-on-secondary-container border-secondary-container shadow-sm'
                              : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-on-surface-variant">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-outline">
                        <Mail className="w-4 h-4" />
                      </span>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-3.5 py-3 text-sm text-on-background font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        placeholder="ejemplo@udenar.edu.co"
                        required
                      />
                    </div>
                  </div>

                  {/* Submission bar */}
                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setCurrentView('code'); refreshMsg(); }}
                      className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant text-xs font-bold py-3.5 rounded-full transition-all border border-outline-variant/60 cursor-pointer text-center"
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      id="submit-register"
                      className="flex-[2] bg-secondary-container hover:bg-secondary-fixed-dim text-on-secondary-container text-xs font-extrabold py-3.5 rounded-full transition-all cursor-pointer shadow-sm uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Registrando...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Solicitar Certificado
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* VIEW C: REGISTRATION SUCCESS SCREEN */}
            {currentView === 'success' && (
              <motion.div
                key="success-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-lg bg-surface-container-lowest p-6 md:p-8 rounded-2xl border border-outline-variant shadow-sm space-y-6 text-center"
              >
                <div className="space-y-1">
                  <div className="inline-flex p-3 rounded-full bg-primary/10 border border-primary/25 text-primary mb-2">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="font-extrabold text-primary text-xl tracking-tight">¡Registro Recibido con Éxito!</h3>
                  <p className="text-xs text-on-surface-variant font-medium leading-normal">
                    Tus datos se registraron correctamente para la firma digital del certificado.
                  </p>
                </div>

                {/* Details list card */}
                {successResponse && (
                  <div className="bg-surface border border-outline-variant rounded-xl p-4 text-left space-y-2.5 text-xs">
                    <p className="border-b border-outline-variant pb-1.5 text-[10px] text-primary font-bold uppercase tracking-wider">Tus Datos Registrados</p>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-on-surface-variant font-medium">Nombre:</span>
                      <span className="col-span-2 text-on-background font-bold">{successResponse.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-on-surface-variant font-medium">Documento:</span>
                      <span className="col-span-2 text-on-background font-mono font-bold">C.C. {successResponse.identification}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-on-surface-variant font-medium">Rol:</span>
                      <span className="col-span-2 text-primary font-bold capitalize">{successResponse.role}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-on-surface-variant font-medium">Correo:</span>
                      <span className="col-span-2 text-on-background font-mono">{successResponse.email}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-on-surface-variant font-medium">Estado:</span>
                      <span className="col-span-2 text-secondary font-bold capitalize flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                        {successResponse.status} (pendiente revisión)
                      </span>
                    </div>
                  </div>
                )}

                {/* What happens next instructions */}
                <div className="p-4 bg-surface-container border border-outline-variant/60 rounded-xl space-y-1.5 text-xs text-on-background text-left leading-relaxed">
                  <p className="font-bold text-primary text-center flex items-center justify-center gap-1">
                    <span>💡 ¿Qué pasará ahora?</span>
                  </p>
                  <ol className="list-decimal pl-4.5 space-y-1 text-on-surface-variant font-medium">
                    <li>La coordinación revisará tu solicitud en Notion.</li>
                    <li>Cuando sea aprobada, el estado cambiará a <strong className="text-primary">certificado</strong>.</li>
                    <li>Vuelve a esta sección <strong className="text-primary">"Descargar Certificado"</strong> e ingresa tu documento para obtenerlo.</li>
                  </ol>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setCurrentView('code'); refreshMsg(); }}
                    className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 text-xs rounded-full border border-outline-variant/60 transition-all cursor-pointer"
                  >
                    Hacer otro Registro
                  </button>
                  <button
                    onClick={() => {
                      if (successResponse) {
                        setLookupId(successResponse.identification);
                        setSearchProjectId(selectedProjectId);
                        executeNotionLookup(selectedProjectId, successResponse.identification);
                      }
                      setCurrentView('download');
                    }}
                    className="flex-1 bg-secondary-container hover:bg-secondary-fixed-dim text-on-secondary-container font-extrabold py-3 text-xs rounded-full transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Ir a Descargas
                  </button>
                </div>
              </motion.div>
            )}

            {/* VIEW D: DOWNLOAD/CHECK CERTIFICATE LOCKER */}
            {currentView === 'download' && (
              <motion.div
                key="download-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-4xl bg-surface-container-lowest p-4 md:p-8 rounded-2xl border border-outline-variant shadow-sm space-y-6"
              >
                <div className="text-center space-y-1 max-w-md mx-auto">
                  <div className="inline-flex p-3 rounded-full bg-primary/10 border border-primary/20 text-primary mb-1">
                    <Download className="w-6 h-6 animate-bounce" />
                  </div>
                  <h3 className="font-extrabold text-primary text-xl tracking-tight">Buscador de Certificados</h3>
                  <p className="text-xs text-on-surface-variant font-medium leading-normal">Selecciona el taller / proyecto de Notion e ingresa tu número de documento para descargar tu certificado.</p>
                </div>

                {/* Validation feedbacks */}
                {errorMsg && (
                  <div className="bg-error-container border border-error/25 rounded-xl p-3 text-xs text-on-error-container text-center font-semibold max-w-md mx-auto antialiased">
                    {errorMsg}
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 text-center font-semibold max-w-md mx-auto">
                    {successMsg}
                  </div>
                )}

                <form onSubmit={handleLookupCertificate} className="space-y-4 max-w-md mx-auto bg-surface-container p-5 rounded-2xl border border-outline-variant/60 shadow-sm">
                  {/* Workshop/Project Selection */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-bold text-on-surface-variant flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      Proyecto Taller de Certificación
                    </label>
                    <div className="relative">
                      <select
                        value={searchProjectId}
                        onChange={(e) => setSearchProjectId(e.target.value)}
                        className="w-full bg-surface border border-outline-variant text-on-background rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer font-bold shadow-sm"
                        required
                      >
                        {projects.length === 0 ? (
                          <option value="">Cargando talleres desde Notion...</option>
                        ) : (
                          projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Identification Document Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-bold text-on-surface-variant flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-primary" />
                      Número de Identificación (C.C.)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={lookupId}
                        onChange={e => setLookupId(e.target.value)}
                        className="flex-1 bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-background font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors font-bold"
                        placeholder="Ej: 1085333444"
                        required
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        id="btn-execute-lookup"
                        className="bg-primary hover:bg-primary-hover text-white font-extrabold px-5 text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wider shadow-sm"
                      >
                        {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 font-bold" />}
                        Buscar
                      </button>
                    </div>
                  </div>
                </form>

                {/* IF MATCH IS FOUND */}
                {searched && matchingRegistrant && (
                  <div className="border border-outline-variant bg-surface rounded-xl p-5 space-y-5 animate-fade-in">
                    
                    {/* 1. Status Certificado */}
                    {matchingRegistrant.status === 'certificado' ? (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 gap-3">
                          <div>
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 font-mono uppercase tracking-wider">
                              Verificado & Disponible
                            </span>
                            <p className="text-xs text-emerald-900 dark:text-emerald-300 font-bold mt-1.5 flex items-center gap-1.5 font-sans">
                              <span>¡Felicidades! Tu asistencia ha sido confirmada y tu certificado digital ya se encuentra firmado.</span>
                            </p>
                          </div>
                        </div>
 
                        {/* RENDER DIGITAL CERTIFICATE BOX WITH PROJECT-SPECIFIC DESIGN */}
                        <div className="w-full border border-outline-variant/60 p-2 md:p-3 bg-surface-container rounded-xl shadow-inner">
                          <CertificateTemplate
                            name={matchingRegistrant.name}
                            identification={matchingRegistrant.identification}
                            role={matchingRegistrant.role}
                            id={matchingRegistrant.id}
                            pageId={matchingRegistrant.id}
                            templateConfig={projects.find(p => p.id === searchProjectId)?.config}
                          />
                        </div>
                      </div>
                    ) : matchingRegistrant.status === 'incorrecto' ? (
                      /* 2. Status Incorrect / Rejected Block with Re-registration Invitation */
                      <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 space-y-3.5 text-center max-w-md mx-auto">
                        <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 font-black px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800 uppercase tracking-wide font-mono select-none">
                          Inconsistencia Detectada
                        </span>
                        
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold text-red-900 dark:text-red-300">Estimado(a) {matchingRegistrant.name},</p>
                          <p className="text-xs text-red-800 dark:text-red-400 font-medium leading-relaxed">
                            Detectamos inconsistencias en los datos proporcionados para el registro de tu asistencia en este taller (C.C. {matchingRegistrant.identification}). Por favor, vuelve a registrar la asistencia con los datos correctos para este taller.
                          </p>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={() => {
                              setCurrentView('code');
                              refreshMsg();
                            }}
                            className="bg-red-600 text-white font-extrabold px-5 py-2 text-xs rounded-full shadow-sm hover:bg-red-700 transition"
                          >
                            Ir a Registrar Correctamente
                          </button>
                        </div>
                      </div>
                    ) : ( 
                      /* 3. Status Received / Pending Block */
                      <div className="p-6 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/40 space-y-3.5 text-center max-w-md mx-auto">
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-black px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800 uppercase tracking-wide font-mono select-none">
                          Estado: Recibido (En Revisión)
                        </span>
                        
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Estimado(a) {matchingRegistrant.name},</p>
                          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                            Hemos recibido tu registro con identificación C.C. {matchingRegistrant.identification}, pero la coordinación del taller aún se encuentra validando las planillas de asistencia oficiales.
                          </p>
                        </div>
 
                        <div className="p-3 bg-surface-container rounded-xl text-[10px] text-on-surface-variant font-medium border border-outline-variant/60">
                          Una vez aprobado tu registro por parte de los coordinadores administrativos, podrás descargar el certificado inmediatamente desde este panel.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
