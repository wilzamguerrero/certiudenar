/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Registrant, AdminSettings } from './src/types.js';
import { Client } from '@notionhq/client';

// Notion Credentials Setup
const NOTION_SECRET = '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';
const PARENT_PAGE_ID = '3794342425258020a1c5c133e287cb84';

const notion = new Client({ auth: NOTION_SECRET }) as any;

// Setup default paths and files
const DB_FILE = path.join(process.cwd(), 'db_store.json');
const EMAIL_LOG_FILE = path.join(process.cwd(), 'email_log.json');

// Helper to get default background image as Base64 from the uploaded banner file
function getBannerBase64(): string | null {
  try {
    const bannerPath = path.join(process.cwd(), 'assets', '.aistudio', 'image_banner.jpg');
    if (fs.existsSync(bannerPath)) {
      const bannerData = fs.readFileSync(bannerPath);
      if (bannerData.length > 0) {
        return `data:image/jpeg;base64,${bannerData.toString('base64')}`;
      }
    }
  } catch (e) {
    console.error('Error reading image_banner.jpg', e);
  }
  return null;
}

// Default initial settings with default coordinates over an aspect ratio template
const DEFAULT_SETTINGS: AdminSettings = {
  dailyCode: 'DISENO26', // Code for today
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587'),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  senderEmail: process.env.SENDER_EMAIL || 'certificados.diseno@udenar.edu.co',
  template: {
    bgImage: getBannerBase64() || '/assets/.aistudio/image_banner.jpg', // Default beautifully loaded background template
    nameField: { x: 22.5, y: 61.9, fontSize: 32, color: '#1e1b4b', fontWeight: 'bold', enabled: true, align: 'center' },
    idField: { x: 23.1, y: 68.4, fontSize: 18, color: '#1f2937', fontWeight: 'normal', enabled: true, align: 'center' },
    roleField: { x: 22.5, y: 73.3, fontSize: 15, color: '#4b5563', fontWeight: 'bold', enabled: true, align: 'center' }
  }
};

// Helper to read database
function readDb(): { registrants: Registrant[]; settings: AdminSettings; projectsConfig: Record<string, any> } {
  try {
    const bannerBg = getBannerBase64() || '/assets/.aistudio/image_banner.jpg';
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Deep merge settings
      const settings = { 
        ...DEFAULT_SETTINGS, 
        ...parsed.settings,
        template: {
          ...DEFAULT_SETTINGS.template,
          ...(parsed.settings?.template || {})
        }
      };
      
      // If template bgImage is null in stored file, attempt to load the banner image from assets
      if (!settings.template.bgImage) {
        settings.template.bgImage = bannerBg;
      }
      return { 
        registrants: parsed.registrants || [], 
        settings, 
        projectsConfig: parsed.projectsConfig || {} 
      };
    } else {
      // Create with banner populated if not exist
      const settings = { ...DEFAULT_SETTINGS };
      if (!settings.template.bgImage) {
        settings.template.bgImage = bannerBg;
      }
      return { registrants: [], settings, projectsConfig: {} };
    }
  } catch (e) {
    console.error('Error reading DB, using defaults', e);
  }
  return { registrants: [], settings: DEFAULT_SETTINGS, projectsConfig: {} };
}

// Helper to write database
function writeDb(registrants: Registrant[], settings: AdminSettings, projectsConfig: Record<string, any> = {}) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ registrants, settings, projectsConfig }, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing DB', e);
  }
}

// Helper to list toggle lists under parent page block
async function getNotionProjects(): Promise<Array<{ id: string; title: string }>> {
  try {
    const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const toggles = response.results.filter((block: any) => block.type === 'toggle');
    
    return toggles.map((block: any) => {
      const textArray = block.toggle?.rich_text || [];
      const title = textArray.map((t: any) => t.plain_text).join('');
      return {
        id: block.id,
        title: title || 'Proyecto sin título'
      };
    });
  } catch (e) {
    console.error('Error fetching Notion projects:', e);
    throw e;
  }
}

// Helper to get or create database target block under a toggle block
async function getOrCreateDatabaseForProject(toggleBlockId: string, projectTitle: string): Promise<string> {
  try {
    // 1. First check if a child database or a link_to_database already exists inside the toggle list block
    const response = await notion.blocks.children.list({ block_id: toggleBlockId });
    const existingDb = response.results.find((block: any) => block.type === 'child_database');
    if (existingDb) {
      return existingDb.id;
    }

    const existingLink = response.results.find((block: any) => block.type === 'link_to_database');
    if (existingLink && existingLink.link_to_database?.database_id) {
      return existingLink.link_to_database.database_id;
    }

    // 2. Prevent duplicates by checking if a database with "Participantes - {projectTitle}" or "Participantes Registrados" exists under parent block
    const rootBlocks = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const fallbackDbName = `Participantes - ${projectTitle}`.toLowerCase().trim();
    const existingRootDb = rootBlocks.results.find((block: any) => {
      if (block.type === 'child_database') {
        const title = (block.child_database?.title || '').toLowerCase().trim();
        return title === fallbackDbName || title === 'participantes registrados';
      }
      return false;
    });
    if (existingRootDb) {
      // If it exists but is not linked inside the toggle yet, try to link it now for convenient user navigation!
      try {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [
            {
              object: 'block',
              type: 'link_to_database',
              link_to_database: {
                type: 'database_id',
                database_id: existingRootDb.id
              }
            }
          ]
        });
      } catch (linkErr) {
        console.warn('Could not link existing database to toggle list:', linkErr);
      }
      return existingRootDb.id;
    }

    // 3. Try creating nested inside the toggle block (acts as the parent) using block_id
    try {
      const db = await notion.databases.create({
        parent: { type: 'block_id', block_id: toggleBlockId },
        title: [{ type: 'text', text: { content: 'Participantes Registrados' } }],
        properties: {
          "Nombre": { title: {} },
          "Identificacion": { rich_text: {} },
          "Rol": {
            select: {
              options: [
                { name: "estudiante", color: "blue" },
                { name: "egresado", color: "purple" },
                { name: "empresario", color: "orange" }
              ]
            }
          },
          "Correo": { email: {} },
          "Estado": {
            select: {
              options: [
                { name: "recibido", color: "yellow" },
                { name: "incorrecto", color: "red" },
                { name: "certificado", color: "green" }
              ]
            }
          },
          "Certificado Generado": { url: {} }
        }
      });
      return db.id;
    } catch (innerErr) {
      console.warn('Creating database inside toggle via block_id failed, attempting parent page fallback and linking:', innerErr);
      // Fallback: Create under parent page with explicit prefix name
      const db = await notion.databases.create({
        parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
        title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }],
        properties: {
          "Nombre": { title: {} },
          "Identificacion": { rich_text: {} },
          "Rol": {
            select: {
              options: [
                { name: "estudiante", color: "blue" },
                { name: "egresado", color: "purple" },
                { name: "empresario", color: "orange" }
              ]
            }
          },
          "Correo": { email: {} },
          "Estado": {
            select: {
              options: [
                { name: "recibido", color: "yellow" },
                { name: "incorrecto", color: "red" },
                { name: "certificado", color: "green" }
              ]
            }
          },
          "Certificado Generado": { url: {} }
        }
      });

      // Now link this database inside the toggle block
      try {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [
            {
              object: 'block',
              type: 'link_to_database',
              link_to_database: {
                type: 'database_id',
                database_id: db.id
              }
            }
          ]
        });
        console.log(`Successfully appended link_to_database inside toggle ${toggleBlockId} for DB ${db.id}`);
      } catch (linkErr) {
        console.warn('Could not append link_to_database inside toggle list block:', linkErr);
      }

      return db.id;
    }
  } catch (err: any) {
    console.error('Error in getOrCreateDatabaseForProject:', err);
    throw err;
  }
}

// Helper to save project's coordinate config & bg image in code blocks nested inside the Notion toggle list
async function saveNotionProjectConfigToNotion(toggleBlockId: string, config: any) {
  try {
    const listResponse = await notion.blocks.children.list({ block_id: toggleBlockId });
    const results = listResponse.results || [];
    
    // Config JSON Code Block
    const existingCodeBlock = results.find((block: any) => block.type === 'code' && block.code?.language === 'json');
    const serializeConfig = {
      nameField: config.nameField,
      idField: config.idField,
      roleField: config.roleField
    };
    const configJsonString = JSON.stringify(serializeConfig, null, 2);
    
    // Split text into 2000-char chunks for Notion RichText limits
    const jsonChunks: any[] = [];
    for (let i = 0; i < configJsonString.length; i += 2000) {
      jsonChunks.push({
        type: 'text',
        text: { content: configJsonString.substring(i, i + 2000) }
      });
    }

    if (existingCodeBlock) {
      await notion.blocks.update({
        block_id: existingCodeBlock.id,
        code: {
          rich_text: jsonChunks,
          language: 'json'
        }
      });
    } else {
      await notion.blocks.children.append({
        block_id: toggleBlockId,
        children: [
          {
            object: 'block',
            type: 'code',
            code: {
              caption: [{ type: 'text', text: { content: 'Configuración de Plantilla (JSON)' } }],
              rich_text: jsonChunks,
              language: 'json'
            }
          }
        ]
      });
    }

    // Background Image Plaintext Block
    if (config.bgImage) {
      const existingBgBlock = results.find((block: any) => block.type === 'code' && block.code?.language === 'plaintext' && block.code?.caption?.[0]?.text?.content?.includes('Fondo'));
      const bgString = config.bgImage;
      const bgChunks: any[] = [];
      for (let i = 0; i < bgString.length; i += 2000) {
        bgChunks.push({
          type: 'text',
          text: { content: bgString.substring(i, i + 2000) }
        });
      }

      if (existingBgBlock) {
        await notion.blocks.update({
          block_id: existingBgBlock.id,
          code: {
            rich_text: bgChunks,
            language: 'plaintext'
          }
        });
      } else {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [
            {
              object: 'block',
              type: 'code',
              code: {
                caption: [{ type: 'text', text: { content: 'Imagen de Fondo de Certificado (Base64/URL)' } }],
                rich_text: bgChunks,
                language: 'plaintext'
              }
            }
          ]
        });
      }
    }
  } catch (err) {
    console.error('Error synchronizing layout config to Notion:', err);
  }
}

// Helper to read email logs
function readEmailLogs(): any[] {
  try {
    if (fs.existsSync(EMAIL_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(EMAIL_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading email logs', e);
  }
  return [];
}

// Helper to log a sent email
function logEmail(to: string, subject: string, body: string, metadata: any) {
  try {
    const logs = readEmailLogs();
    logs.unshift({
      id: Math.random().toString(36).substring(7),
      to,
      subject,
      body,
      metadata,
      sentAt: new Date().toISOString()
    });
    // Keep last 100 emails
    fs.writeFileSync(EMAIL_LOG_FILE, JSON.stringify(logs.slice(0, 100), null, 2), 'utf8');
  } catch (e) {
    console.error('Error logging email', e);
  }
}

// Helper function to send email via SMTP or simulate inside email_log.json
async function sendCertificateEmail(registrant: Registrant, settings: AdminSettings): Promise<boolean> {
  const emailSubject = `🎓 Tu Certificado del Taller - Universidad de Nariño`;
  const emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 28px;">🎓</span>
        <h2 style="color: #1e3a8a; margin: 10px 0 5px 0;">¡Felicidades, ${registrant.name}!</h2>
        <p style="color: #666; font-size: 14px; margin: 0;">Tu asistencia al Taller de Diseño ha sido procesada e inscrita.</p>
      </div>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
        <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Código de Registro:</strong> ${registrant.id}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Identificación / C.C.:</strong> ${registrant.identification}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Rol de Participación:</strong> ${registrant.role.toUpperCase()}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Fecha Registro:</strong> ${new Date(registrant.registeredAt).toLocaleDateString('es-ES')}</p>
      </div>

      <p style="font-size: 15px; line-height: 1.5; color: #374151;">
        Tu certificado digital oficial ha sido generado. Puedes verlo, guardarlo e imprimirlo directamente desde el siguiente enlace:
      </p>
      
      <div style="text-align: center; margin: 25px 0;">
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/?view=download&email=${encodeURIComponent(registrant.email)}" 
           style="background-color: #1e3a8a; color: white !important; display: inline-block; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 15px; box-shadow: 0 4px 6px rgba(30, 58, 138, 0.15);">
           Descargar Certificado Oficial (PDF/Imagen)
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; line-height: 1.4;">
        Si tienes problemas con el botón anterior, copia y pega el siguiente enlace en tu navegador:<br />
        <span style="word-break: break-all; color: #2563eb;">${process.env.APP_URL || 'http://localhost:3000'}/?view=download&email=${encodeURIComponent(registrant.email)}</span>
      </p>

      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      
      <p style="font-size: 11px; color: #999; text-align: center; margin-bottom: 0; line-height: 1.4;">
        <strong>Universidad de Nariño</strong> - Departamento de Diseño <br />
        Construir conocimiento también es crear conexiones
      </p>
    </div>
  `;

  // Log/Save simulated email in filesystem
  logEmail(registrant.email, emailSubject, emailBody, {
    registrantId: registrant.id,
    name: registrant.name,
    cc: registrant.identification,
    role: registrant.role
  });

  // Simple SMTP support if fully configured
  if (settings.smtpHost && settings.smtpUser && settings.smtpPass) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass
        }
      });

      await transporter.sendMail({
        from: `"${settings.senderEmail.split('@')[0]}" <${settings.senderEmail}>`,
        to: registrant.email,
        subject: emailSubject,
        html: emailBody
      });
      console.log(`Real email sent to ${registrant.email}`);
      return true;
    } catch (smtpErr) {
      console.error('SMTP Delivery error (Will fallback to simulated mail log):', smtpErr);
    }
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits to allow the coordinator to upload the custom high-res certificate backgrounds
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Serve static assets folder
  app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

  // API Route: Verify daily code
  app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;
    const { settings } = readDb();
    
    if (!code) {
      return res.status(400).json({ success: false, message: 'Código es requerido' });
    }

    const isValid = code.trim().toUpperCase() === settings.dailyCode.trim().toUpperCase();
    if (isValid) {
      return res.json({ success: true, message: 'Código válido' });
    } else {
      return res.json({ success: false, message: 'Código de asistencia incorrecto o vencido' });
    }
  });

  // 1. Fetch Notion Projects (Toggle lists) and their custom layout configurations
  app.get('/api/notion/projects', async (req, res) => {
    try {
      const projects = await getNotionProjects();
      const { registrants, settings, projectsConfig } = readDb();
      let hasUpdates = false;
      
      const enrichedProjects = [];
      for (const proj of projects) {
        let config = projectsConfig[proj.id];
        
        // Dynamic Fallback: if not cached in db_store.json, read config directly from Notion toggle block's children
        if (!config) {
          try {
            const listResponse = await notion.blocks.children.list({ block_id: proj.id });
            const results = listResponse.results || [];
            
            // Find code block of type language: 'json'
            const codeBlock = results.find((block: any) => block.type === 'code' && block.code?.language === 'json');
            // Find code block of type language: 'plaintext' which includes caption "Fondo"
            const bgBlock = results.find((block: any) => block.type === 'code' && block.code?.language === 'plaintext' && block.code?.caption?.[0]?.text?.content?.includes('Fondo'));

            let parsedLayout: any = {};
            if (codeBlock) {
              const textContent = codeBlock.code?.rich_text?.map((t: any) => t.plain_text).join('') || '';
              if (textContent) {
                parsedLayout = JSON.parse(textContent);
              }
            }

            let parsedBg = null;
            if (bgBlock) {
              parsedBg = bgBlock.code?.rich_text?.map((t: any) => t.plain_text).join('') || null;
            }

            if (Object.keys(parsedLayout).length > 0 || parsedBg) {
              config = {
                bgImage: parsedBg,
                nameField: parsedLayout.nameField || DEFAULT_SETTINGS.template.nameField,
                idField: parsedLayout.idField || DEFAULT_SETTINGS.template.idField,
                roleField: parsedLayout.roleField || DEFAULT_SETTINGS.template.roleField
              };
              projectsConfig[proj.id] = config;
              hasUpdates = true;
            }
          } catch (err) {
            console.warn(`Could not load cache copy from Notion for project ${proj.id}:`, err);
          }
        }

        if (!config) {
          config = {
            bgImage: null,
            nameField: DEFAULT_SETTINGS.template.nameField,
            idField: DEFAULT_SETTINGS.template.idField,
            roleField: DEFAULT_SETTINGS.template.roleField
          };
        }

        enrichedProjects.push({
          id: proj.id,
          title: proj.title,
          config
        });
      }

      if (hasUpdates) {
        writeDb(registrants, settings, projectsConfig);
      }
      
      res.json({ success: true, data: enrichedProjects });
    } catch (e: any) {
      console.error('Error in /api/notion/projects:', e);
      res.status(500).json({ success: false, message: `Error al cargar proyectos de Notion: ${e.message}` });
    }
  });

  // 1.5. Create a new Notion Project (toggle block) and initialize its database
  app.post('/api/notion/projects', async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'El nombre del taller es obligatorio' });
      }

      // Check if project title already exists
      const existingProjects = await getNotionProjects();
      const duplicate = existingProjects.find(p => p.title.toLowerCase() === title.trim().toLowerCase());
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Ya existe un taller con ese nombre en Notion.' });
      }

      // Create a toggle block under the PARENT_PAGE_ID
      const appendResponse = await notion.blocks.children.append({
        block_id: PARENT_PAGE_ID,
        children: [
          {
            object: 'block',
            type: 'toggle',
            toggle: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: title.trim()
                  }
                }
              ]
            }
          }
        ]
      });

      const newToggleBlock = appendResponse.results?.[0];
      if (!newToggleBlock || !newToggleBlock.id) {
        throw new Error('No se pudo recuperar el ID del bloque creado en Notion');
      }

      // Create database inside the block immediately so everything is ready
      const databaseId = await getOrCreateDatabaseForProject(newToggleBlock.id, title.trim());

      // Seed 1 sample participant row so the table has visible data instantly!
      const hostUrl = process.env.APP_URL || `https://${req.get('host')}`;
      try {
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            "Nombre": {
              title: [
                { text: { content: "Juan Pérez (Registro de Prueba)" } }
              ]
            },
            "Identificacion": {
              rich_text: [
                { text: { content: "12345678" } }
              ]
            },
            "Rol": {
              select: { name: "estudiante" }
            },
            "Correo": {
              email: "juan.perez@example.com"
            },
            "Estado": {
              select: { name: "recibido" }
            },
            "Certificado Generado": {
              url: `${hostUrl}/?view=download&project=${newToggleBlock.id}&id=12345678`
            }
          }
        });
        console.log(`Seeded initial sample participant in database ${databaseId}`);
      } catch (seedErr) {
        console.error('Error seeding sample participant row:', seedErr);
      }

      res.json({
        success: true,
        message: '¡Taller creado con éxito en Notion con su planilla de asistencia!',
        data: {
          id: newToggleBlock.id,
          title: title.trim(),
          databaseId
        }
      });
    } catch (e: any) {
      console.error('Error creating project in Notion:', e);
      res.status(500).json({ success: false, message: `Error al crear el taller en Notion: ${e.message}` });
    }
  });

  // 2. Save layout configuration for a specific project
  app.post('/api/notion/projects/:id/config', async (req, res) => {
    try {
      const { id } = req.params;
      const { config } = req.body;
      const { registrants, settings, projectsConfig } = readDb();
      
      projectsConfig[id] = config;
      writeDb(registrants, settings, projectsConfig);
      
      // Perform background sync to Notion inside the toggle block (acts as JSON configuration file and background image text block)
      await saveNotionProjectConfigToNotion(id, config);
      
      res.json({ success: true, message: 'Configuración de diseño guardada para este proyecto' });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 3. Register participant for a specific project
  app.post('/api/notion/projects/:id/register', async (req, res) => {
    try {
      const { id } = req.params; // project Notion block ID
      const { name, identification, role, email } = req.body;
      
      if (!name || !identification || !role || !email) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
      }

      // Fetch projects list to obtain title
      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) {
        return res.status(404).json({ success: false, message: 'Proyecto no encontrado en Notion' });
      }

      // Get or create database for this toggle project
      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);

      // Simple duplicate prevention check in this Notion DB
      const searchRes = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Identificacion',
          rich_text: {
            equals: identification.trim()
          }
        }
      });

      if (searchRes.results.length > 0) {
        const existingPage = searchRes.results[0] as any;
        const rawStatus = (existingPage.properties.Estado?.select?.name || '').toLowerCase().trim();
        
        if (rawStatus === 'incorrecto' || rawStatus === 'error') {
          // If duplicate has error state, archive the old one and let them submit new one
          await notion.pages.update({
            page_id: existingPage.id,
            archived: true
          });
        } else if (rawStatus === 'certificado' || rawStatus === 'correcto') {
          return res.status(400).json({ 
            success: false, 
            message: 'Ya tienes un certificado aprobado para este proyecto. Puedes descargarlo en la pestaña de descargas.' 
          });
        } else {
          return res.status(400).json({ 
            success: false, 
            message: 'Tu registro ya fue recibido para este proyecto y está en proceso de revisión.' 
          });
        }
      }

      // Insert new participant row in Notion
      const cleanId = identification.trim();
      const hostUrl = process.env.APP_URL || `https://${req.get('host')}`;
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          "Nombre": {
            title: [
              { text: { content: name.trim() } }
            ]
          },
          "Identificacion": {
            rich_text: [
              { text: { content: cleanId } }
            ]
          },
          "Rol": {
            select: { name: role }
          },
          "Correo": {
            email: email.trim().toLowerCase()
          },
          "Estado": {
            select: { name: "recibido" }
          },
          "Certificado Generado": {
            url: `${hostUrl}/?view=download&project=${id}&id=${cleanId}`
          }
        }
      });

      res.json({ 
        success: true, 
        message: '¡Registro del taller guardado correctamente en la tabla de Notion!' 
      });
    } catch (e: any) {
      console.error('Error registering to Notion:', e);
      res.status(500).json({ success: false, message: `Error al interactuar con Notion: ${e.message}` });
    }
  });

  // 4. Search participant status or generate download link
  app.get('/api/notion/projects/:id/search', async (req, res) => {
    try {
      const { id } = req.params; // project Notion block ID
      const { identification } = req.query;
      
      if (!identification) {
        return res.status(400).json({ success: false, message: 'La identificación es requerida' });
      }

      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) {
        return res.status(404).json({ success: false, message: 'Proyecto no encontrado en Notion' });
      }

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      
      // Query database
      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Identificacion',
          rich_text: {
            equals: String(identification).trim()
          }
        }
      });

      if (response.results.length === 0) {
        return res.json({ success: true, found: false });
      }

      const page = response.results[0] as any;
      const name = page.properties.Nombre?.title?.[0]?.plain_text || 'Participante';
      const role = page.properties.Rol?.select?.name || 'estudiante';
      const email = page.properties.Correo?.email || '';
      const rawStatus = (page.properties.Estado?.select?.name || 'recibido').toLowerCase().trim();
      
      // Normalize rawStatus to 'recibido' | 'incorrecto' | 'certificado'
      let status = 'recibido';
      if (rawStatus === 'certificado' || rawStatus === 'correcto') {
        status = 'certificado';
      } else if (rawStatus === 'incorrecto' || rawStatus === 'error') {
        status = 'incorrecto';
      }

      res.json({
        success: true,
        found: true,
        data: {
          id: page.id, // Notion page ID
          name,
          identification: String(identification).trim(),
          role,
          email,
          status
        }
      });
    } catch (e: any) {
      console.error('Error searching in Notion:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 5. Fetch all registrants for a specific project database (for Administrative Panel)
  app.get('/api/notion/projects/:id/registrants', async (req, res) => {
    try {
      const { id } = req.params;
      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) {
        return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
      }

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      const response = await notion.databases.query({ database_id: databaseId });

      const list = response.results.map((page: any) => {
        const name = page.properties.Nombre?.title?.[0]?.plain_text || 'Participante';
        const cc = page.properties.Identificacion?.rich_text?.[0]?.plain_text || '';
        const role = page.properties.Rol?.select?.name || 'estudiante';
        const email = page.properties.Correo?.email || '';
        const rawStatus = (page.properties.Estado?.select?.name || 'recibido').toLowerCase().trim();
        
        // Map to UI values
        let status = 'recibido';
        if (rawStatus === 'certificado' || rawStatus === 'correcto') {
          status = 'correcto';
        } else if (rawStatus === 'incorrecto' || rawStatus === 'error') {
          status = 'incorrecto';
        }

        return {
          id: page.id, // Notion page ID
          name,
          identification: cc,
          role,
          email,
          status,
          registeredAt: page.created_time
        };
      });

      res.json({ success: true, data: list });
    } catch (e: any) {
      console.error('Error showing registrants:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 6. Update attendee properties directly in Notion (allows editing name, identification, role, email, and status)
  app.post('/api/notion/registrants/update', async (req, res) => {
    try {
      const { pageId, status, name, identification, role, email } = req.body; // pageId is Notion page ID
      if (!pageId) {
        return res.status(400).json({ success: false, message: 'El ID del participante (pageId) es requerido.' });
      }

      const updateProps: any = {};

      if (status !== undefined) {
        // Map UI values: 'correcto' -> 'certificado', 'recibido' -> 'recibido', etc.
        let notionStatus = 'recibido';
        if (status === 'correcto') {
          notionStatus = 'certificado';
        } else if (status === 'incorrecto') {
          notionStatus = 'incorrecto';
        }
        updateProps["Estado"] = {
          select: { name: notionStatus }
        };
      }

      if (name !== undefined) {
        updateProps["Nombre"] = {
          title: [
            { text: { content: name.trim() } }
          ]
        };
      }

      if (identification !== undefined) {
        updateProps["Identificacion"] = {
          rich_text: [
            { text: { content: identification.trim() } }
          ]
        };
      }

      if (role !== undefined) {
        updateProps["Rol"] = {
          select: { name: role }
        };
      }

      if (email !== undefined) {
        updateProps["Correo"] = {
          email: email.trim().toLowerCase()
        };
      }

      await notion.pages.update({
        page_id: pageId,
        properties: updateProps
      });

      res.json({ success: true, message: 'Información del participante actualizada con éxito en Notion' });
    } catch (e: any) {
      console.error('Error updating participant in Notion:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 7. Bulk register in Notion
  app.post('/api/notion/projects/:id/bulk', async (req, res) => {
    try {
      const { id } = req.params;
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Se requiere una lista' });
      }

      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) {
        return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
      }

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      let count = 0;

      for (const item of items) {
        if (!item.name || !item.identification || !item.role || !item.email) continue;
        
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            "Nombre": { title: [ { text: { content: item.name.trim() } } ] },
            "Identificacion": { rich_text: [ { text: { content: String(item.identification).trim() } } ] },
            "Rol": { select: { name: item.role.trim().toLowerCase() } },
            "Correo": { email: item.email.trim().toLowerCase() },
            "Estado": { select: { name: "recibido" } }
          }
        });
        count++;
      }

      res.json({ success: true, message: `Se cargaron ${count} participantes en Notion correctamente` });
    } catch (e: any) {
      console.error('Error in Notion bulk load:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 8. Delete a participant page in Notion
  app.post('/api/notion/registrants/delete', async (req, res) => {
    try {
      const { pageId } = req.body;
      await notion.pages.update({
        page_id: pageId,
        archived: true
      });
      res.json({ success: true, message: 'Participante eliminado correctamente de la tabla Notion' });
    } catch (e: any) {
      console.error('Error deleting resident in Notion:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // API Route: Get Admin Settings
  app.get('/api/admin/settings', (req, res) => {
    const { settings } = readDb();
    res.json({
      success: true,
      data: {
        dailyCode: settings.dailyCode,
        template: settings.template || DEFAULT_SETTINGS.template
      }
    });
  });

  // API Route: Update Admin Settings (Including custom template mapping)
  app.post('/api/admin/settings', (req, res) => {
    const { 
      dailyCode, 
      template
    } = req.body;
    
    const { registrants, settings, projectsConfig } = readDb();

    if (dailyCode) {
      settings.dailyCode = dailyCode.trim().toUpperCase();
    }

    if (template) {
      settings.template = {
        bgImage: template.bgImage !== undefined ? template.bgImage : settings.template?.bgImage,
        nameField: template.nameField ? { ...(settings.template?.nameField || DEFAULT_SETTINGS.template.nameField), ...template.nameField } : (settings.template?.nameField || DEFAULT_SETTINGS.template.nameField),
        idField: template.idField ? { ...(settings.template?.idField || DEFAULT_SETTINGS.template.idField), ...template.idField } : (settings.template?.idField || DEFAULT_SETTINGS.template.idField),
        roleField: template.roleField ? { ...(settings.template?.roleField || DEFAULT_SETTINGS.template.roleField), ...template.roleField } : (settings.template?.roleField || DEFAULT_SETTINGS.template.roleField)
      };
    }

    writeDb(registrants, settings, projectsConfig);
    res.json({ success: true, message: 'Ajustes guardados correctamente', data: settings });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
