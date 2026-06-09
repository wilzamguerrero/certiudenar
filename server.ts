/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { AdminSettings } from './src/types.js';
import { Client } from '@notionhq/client';

// ─── Notion Credentials ───────────────────────────────────────────────────────
const NOTION_SECRET = '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';
const PARENT_PAGE_ID = '3794342425258020a1c5c133e287cb84';

const notion = new Client({ auth: NOTION_SECRET }) as any;

// ─── Local DB file path ────────────────────────────────────────────────────────
const DB_FILE = path.join(process.cwd(), 'db_store.json');

// ─── Helper: Banner image ──────────────────────────────────────────────────────
function getBannerBase64(): string | null {
  try {
    const bannerPath = path.join(process.cwd(), 'assets', '.aistudio', 'image_banner.jpg');
    if (fs.existsSync(bannerPath)) {
      const bannerData = fs.readFileSync(bannerPath);
      if (bannerData.length > 0) return `data:image/jpeg;base64,${bannerData.toString('base64')}`;
    }
  } catch (e) {
    console.error('Error reading image_banner.jpg', e);
  }
  return null;
}

// ─── Default settings (no SMTP) ───────────────────────────────────────────────
const DEFAULT_SETTINGS: AdminSettings = {
  dailyCode: 'DISENO26',
  template: {
    bgImage: getBannerBase64() || '/assets/.aistudio/image_banner.jpg',
    nameField: { x: 22.5, y: 61.9, fontSize: 32, color: '#1e1b4b', fontWeight: 'bold', enabled: true, align: 'center' },
    idField: { x: 23.1, y: 68.4, fontSize: 18, color: '#1f2937', fontWeight: 'normal', enabled: true, align: 'center' },
    roleField: { x: 22.5, y: 73.3, fontSize: 15, color: '#4b5563', fontWeight: 'bold', enabled: true, align: 'center' }
  }
};

// ─── DB helpers ───────────────────────────────────────────────────────────────
function readDb(): { settings: AdminSettings; projectsConfig: Record<string, any> } {
  try {
    const bannerBg = getBannerBase64() || '/assets/.aistudio/image_banner.jpg';
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const settings: AdminSettings = {
        dailyCode: parsed.settings?.dailyCode || DEFAULT_SETTINGS.dailyCode,
        template: { ...DEFAULT_SETTINGS.template, ...(parsed.settings?.template || {}) }
      };
      if (!settings.template.bgImage) settings.template.bgImage = bannerBg;
      return { settings, projectsConfig: parsed.projectsConfig || {} };
    }
    const settings = { ...DEFAULT_SETTINGS };
    if (!settings.template.bgImage) settings.template.bgImage = bannerBg;
    return { settings, projectsConfig: {} };
  } catch (e) {
    console.error('Error reading DB, using defaults', e);
  }
  return { settings: DEFAULT_SETTINGS, projectsConfig: {} };
}

function writeDb(settings: AdminSettings, projectsConfig: Record<string, any> = {}) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ settings, projectsConfig }, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing DB', e);
  }
}

// ─── Notion: list toggle blocks as projects ───────────────────────────────────
async function getNotionProjects(): Promise<Array<{ id: string; title: string }>> {
  try {
    const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const toggles = (response.results || []).filter((block: any) => block.type === 'toggle');
    return toggles.map((block: any) => {
      const textArray = block.toggle?.rich_text || [];
      const title = textArray.map((t: any) => t.plain_text).join('');
      return { id: block.id, title: title || 'Proyecto sin título' };
    });
  } catch (e) {
    console.error('Error fetching Notion projects:', e);
    throw e;
  }
}

// ─── Notion: get or create DB for a project toggle ───────────────────────────
async function getOrCreateDatabaseForProject(toggleBlockId: string, projectTitle: string): Promise<string> {
  try {
    const toggleChildren = await notion.blocks.children.list({ block_id: toggleBlockId });
    const results: any[] = toggleChildren.results || [];

    // 1. Legacy: Check for __DB_ID__ code block stored inside toggle
    const dbIdBlock = results.find((b: any) =>
      b.type === 'code' && b.code?.language === 'javascript' &&
      (b.code?.caption || []).map((t: any) => t.plain_text).join('') === '__DB_ID__'
    );
    if (dbIdBlock) {
      const storedId = (dbIdBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('').trim();
      if (storedId) return storedId;
    }

    // 2. Check for existing child_page inside toggle that contains the DB
    const childPage = results.find((b: any) => b.type === 'child_page');
    if (childPage) {
      try {
        const pageChildren = await notion.blocks.children.list({ block_id: childPage.id });
        const dbBlock = (pageChildren.results || []).find((b: any) => b.type === 'child_database');
        if (dbBlock) return dbBlock.id;
      } catch {}
    }

    // 3. Check if a child_database with matching name exists under parent page (fallback)
    const parentChildren = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const matchingDb = (parentChildren.results || []).find((b: any) => {
      if (b.type !== 'child_database') return false;
      const t = (b.child_database?.title || '').trim().toLowerCase();
      return t === `participantes - ${projectTitle.toLowerCase()}`;
    });
    if (matchingDb) return matchingDb.id;

    // 4. Determine where to create the DB
    // Try to create a child_page inside the toggle for clean structure
    let dbParentPageId: string = PARENT_PAGE_ID;
    if (!childPage) {
      try {
        const pageResp = await (notion.blocks.children.append as any)({
          block_id: toggleBlockId,
          children: [{
            object: 'block',
            type: 'child_page',
            child_page: { title: `📋 Participantes — ${projectTitle}` }
          }]
        });
        if (pageResp.results?.[0]?.id) {
          dbParentPageId = pageResp.results[0].id;
        }
      } catch {
        console.info('child_page inside toggle not supported, using parent page');
        dbParentPageId = PARENT_PAGE_ID;
      }
    } else {
      dbParentPageId = childPage.id;
    }

    // 5. Create the database
    const db = await notion.databases.create({
      parent: { type: 'page_id', page_id: dbParentPageId },
      is_inline: true,
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
        "Generado": { date: {} },
        "Enlace Descarga": { files: {} }
      }
    });

    const dbId: string = db.id;

    // 6. If DB was placed at root level, add reference inside toggle for navigation
    if (dbParentPageId === PARENT_PAGE_ID) {
      try {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [
            {
              object: 'block', type: 'heading_3',
              heading_3: { rich_text: [{ type: 'text', text: { content: '📋 Base de Datos de Participantes' } }] }
            },
            {
              object: 'block', type: 'paragraph',
              paragraph: {
                rich_text: [{
                  type: 'text',
                  text: {
                    content: `→ Ver tabla: Participantes - ${projectTitle}`,
                    link: { url: `https://www.notion.so/${dbId.replace(/-/g, '')}` }
                  }
                }]
              }
            },
            {
              object: 'block', type: 'code',
              code: {
                caption: [{ type: 'text', text: { content: '__DB_ID__' } }],
                rich_text: [{ type: 'text', text: { content: dbId } }],
                language: 'javascript'
              }
            }
          ]
        });
      } catch (appendErr) {
        console.warn('Could not append DB reference to toggle:', appendErr);
      }
    }

    return dbId;
  } catch (err: any) {
    console.error('Error in getOrCreateDatabaseForProject:', err);
    throw err;
  }
}

// ─── Notion: save template config + bg inside toggle ─────────────────────────
async function saveNotionProjectConfigToNotion(toggleBlockId: string, config: any) {
  try {
    const listResponse = await notion.blocks.children.list({ block_id: toggleBlockId });
    const results: any[] = listResponse.results || [];

    const existingCodeBlock = results.find((b: any) => b.type === 'code' && b.code?.language === 'json');
    const serializeConfig = {
      fields: config.fields,
      bgAspectRatio: config.bgAspectRatio,
      roles: config.roles,
      // Legacy backward compat
      nameField: config.nameField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'nameField') : undefined),
      idField: config.idField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'idField') : undefined),
      roleField: config.roleField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'roleField') : undefined),
    };
    const configJsonString = JSON.stringify(serializeConfig, null, 2);
    const jsonChunks: any[] = [];
    for (let i = 0; i < configJsonString.length; i += 2000) {
      jsonChunks.push({ type: 'text', text: { content: configJsonString.substring(i, i + 2000) } });
    }

    if (existingCodeBlock) {
      await notion.blocks.update({ block_id: existingCodeBlock.id, code: { rich_text: jsonChunks, language: 'json' } });
    } else {
      await notion.blocks.children.append({
        block_id: toggleBlockId,
        children: [{
          object: 'block', type: 'code',
          code: { caption: [{ type: 'text', text: { content: 'Configuración de Plantilla (JSON)' } }], rich_text: jsonChunks, language: 'json' }
        }]
      });
    }

    if (config.bgImage) {
      const existingBgBlock = results.find((b: any) =>
        b.type === 'code' && b.code?.language === 'plaintext' &&
        (b.code?.caption || []).map((t: any) => t.plain_text).join('').includes('Fondo')
      );
      const bgChunks: any[] = [];
      for (let i = 0; i < config.bgImage.length; i += 2000) {
        bgChunks.push({ type: 'text', text: { content: config.bgImage.substring(i, i + 2000) } });
      }
      if (existingBgBlock) {
        await notion.blocks.update({ block_id: existingBgBlock.id, code: { rich_text: bgChunks, language: 'plaintext' } });
      } else {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [{
            object: 'block', type: 'code',
            code: { caption: [{ type: 'text', text: { content: 'Imagen de Fondo de Certificado (Base64/URL)' } }], rich_text: bgChunks, language: 'plaintext' }
          }]
        });
      }
    }
  } catch (err) {
    console.error('Error synchronizing layout config to Notion:', err);
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

  // Verify daily code
  app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;
    const { settings } = readDb();
    if (!code) return res.status(400).json({ success: false, message: 'Código es requerido' });
    const isValid = code.trim().toUpperCase() === settings.dailyCode.trim().toUpperCase();
    if (isValid) return res.json({ success: true, message: 'Código válido' });
    return res.json({ success: false, message: 'Código de asistencia incorrecto o vencido' });
  });

  // GET projects list with configs
  app.get('/api/notion/projects', async (req, res) => {
    try {
      const projects = await getNotionProjects();
      const { settings, projectsConfig } = readDb();
      let hasUpdates = false;
      const enrichedProjects = [];

      for (const proj of projects) {
        let config = projectsConfig[proj.id];
        if (!config) {
          try {
            const listResponse = await notion.blocks.children.list({ block_id: proj.id });
            const blks: any[] = listResponse.results || [];
            const codeBlock = blks.find((b: any) => b.type === 'code' && b.code?.language === 'json');
            const bgBlock = blks.find((b: any) =>
              b.type === 'code' && b.code?.language === 'plaintext' &&
              (b.code?.caption || []).map((t: any) => t.plain_text).join('').includes('Fondo')
            );
            let parsedLayout: any = {};
            if (codeBlock) {
              const txt = (codeBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('');
              if (txt) parsedLayout = JSON.parse(txt);
            }
            const parsedBg = bgBlock ? (bgBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('') || null : null;
            if (Object.keys(parsedLayout).length > 0 || parsedBg) {
              config = {
                bgImage: parsedBg,
                bgAspectRatio: parsedLayout.bgAspectRatio ?? null,
                fields: parsedLayout.fields ?? null,
                roles: parsedLayout.roles ?? null,
                nameField: parsedLayout.nameField || DEFAULT_SETTINGS.template.nameField,
                idField: parsedLayout.idField || DEFAULT_SETTINGS.template.idField,
                roleField: parsedLayout.roleField || DEFAULT_SETTINGS.template.roleField
              };
              projectsConfig[proj.id] = config;
              hasUpdates = true;
            }
          } catch (err) {
            console.warn(`Could not load config for project ${proj.id}:`, err);
          }
        }
        if (!config) {
          config = {
            bgImage: null,
            bgAspectRatio: null,
            fields: null,
            roles: null,
            nameField: DEFAULT_SETTINGS.template.nameField,
            idField: DEFAULT_SETTINGS.template.idField,
            roleField: DEFAULT_SETTINGS.template.roleField
          };
        }
        enrichedProjects.push({ id: proj.id, title: proj.title, config });
      }

      if (hasUpdates) writeDb(settings, projectsConfig);
      res.json({ success: true, data: enrichedProjects });
    } catch (e: any) {
      res.status(500).json({ success: false, message: `Error al cargar proyectos: ${e.message}` });
    }
  });

  // POST create new project
  app.post('/api/notion/projects', async (req, res) => {
    try {
      const { title } = req.body;
      if (!title?.trim()) return res.status(400).json({ success: false, message: 'El nombre del taller es obligatorio' });

      const existingProjects = await getNotionProjects();
      const duplicate = existingProjects.find(p => p.title.toLowerCase() === title.trim().toLowerCase());
      if (duplicate) return res.status(400).json({ success: false, message: 'Ya existe un taller con ese nombre en Notion.' });

      const appendResponse = await notion.blocks.children.append({
        block_id: PARENT_PAGE_ID,
        children: [{ object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: title.trim() } }] } }]
      });

      const newToggleBlock = appendResponse.results?.[0];
      if (!newToggleBlock?.id) throw new Error('No se pudo recuperar el ID del bloque toggle');

      const databaseId = await getOrCreateDatabaseForProject(newToggleBlock.id, title.trim());

      const hostUrl = process.env.APP_URL || `https://${req.get('host')}`;
      try {
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            "Nombre": { title: [{ text: { content: "Ejemplo Participante (Eliminar)" } }] },
            "Identificacion": { rich_text: [{ text: { content: "00000000" } }] },
            "Rol": { select: { name: "estudiante" } },
            "Correo": { email: "ejemplo@udenar.edu.co" },
            "Estado": { select: { name: "recibido" } },
            "Enlace Descarga": { files: [{ type: "external", name: "Descargar Certificado", external: { url: `${hostUrl}/?view=download&project=${newToggleBlock.id}&id=00000000` } }] }
          }
        });
      } catch (seedErr) {
        console.error('Error seeding sample row:', seedErr);
      }

      res.json({ success: true, message: '¡Taller creado con éxito en Notion!', data: { id: newToggleBlock.id, title: title.trim(), databaseId } });
    } catch (e: any) {
      console.error('Error creating project:', e);
      res.status(500).json({ success: false, message: `Error al crear el taller: ${e.message}` });
    }
  });

  // POST save config for a project
  app.post('/api/notion/projects/:id/config', async (req, res) => {
    try {
      const { id } = req.params;
      const { config } = req.body;
      const { settings, projectsConfig } = readDb();
      projectsConfig[id] = config;
      writeDb(settings, projectsConfig);
      await saveNotionProjectConfigToNotion(id, config);
      res.json({ success: true, message: 'Configuración guardada' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST register attendee
  app.post('/api/notion/projects/:id/register', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, identification, role, email } = req.body;
      if (!name || !identification || !role || !email) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
      }

      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      const searchRes = await notion.databases.query({
        database_id: databaseId,
        filter: { property: 'Identificacion', rich_text: { equals: identification.trim() } }
      });

      if (searchRes.results.length > 0) {
        const existingPage = searchRes.results[0] as any;
        const rawStatus = (existingPage.properties.Estado?.select?.name || '').toLowerCase().trim();
        if (rawStatus === 'incorrecto' || rawStatus === 'error') {
          await notion.pages.update({ page_id: existingPage.id, archived: true });
        } else if (rawStatus === 'certificado' || rawStatus === 'correcto') {
          return res.status(400).json({ success: false, message: 'Ya tienes un certificado generado. Descárgalo en la sección de certificados.' });
        } else {
          return res.status(400).json({ success: false, message: 'Tu registro ya fue recibido y está en revisión.' });
        }
      }

      const cleanId = identification.trim();
      const hostUrl = process.env.APP_URL || `https://${req.get('host')}`;
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          "Nombre": { title: [{ text: { content: name.trim() } }] },
          "Identificacion": { rich_text: [{ text: { content: cleanId } }] },
          "Rol": { select: { name: role } },
          "Correo": { email: email.trim().toLowerCase() },
          "Estado": { select: { name: "recibido" } },
          "Enlace Descarga": { files: [{ type: "external", name: "Descargar Certificado", external: { url: `${hostUrl}/?view=download&project=${id}&id=${cleanId}` } }] }
        }
      });

      res.json({ success: true, message: '¡Solicitud de certificado guardada en Notion!' });
    } catch (e: any) {
      console.error('Error registering:', e);
      res.status(500).json({ success: false, message: `Error al guardar en Notion: ${e.message}` });
    }
  });

  // GET search participant by identification
  app.get('/api/notion/projects/:id/search', async (req, res) => {
    try {
      const { id } = req.params;
      const { identification } = req.query;
      if (!identification) return res.status(400).json({ success: false, message: 'Identificación requerida' });

      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      const response = await notion.databases.query({
        database_id: databaseId,
        filter: { property: 'Identificacion', rich_text: { equals: String(identification).trim() } }
      });

      if (response.results.length === 0) return res.json({ success: true, found: false });

      const page = response.results[0] as any;
      const rawStatus = (page.properties.Estado?.select?.name || 'recibido').toLowerCase().trim();
      const generatedDate = page.properties.Generado?.date?.start || null;

      let status: 'recibido' | 'incorrecto' | 'certificado' = 'recibido';
      if (rawStatus === 'certificado' || rawStatus === 'correcto') status = 'certificado';
      else if (rawStatus === 'incorrecto' || rawStatus === 'error') status = 'incorrecto';

      res.json({
        success: true, found: true,
        data: {
          id: page.id,
          name: page.properties.Nombre?.title?.[0]?.plain_text || 'Participante',
          identification: String(identification).trim(),
          role: page.properties.Rol?.select?.name || 'estudiante',
          email: page.properties.Correo?.email || '',
          status,
          generatedAt: generatedDate,
          registeredAt: page.created_time
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // GET all registrants for admin
  app.get('/api/notion/projects/:id/registrants', async (req, res) => {
    try {
      const { id } = req.params;
      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      const response = await notion.databases.query({ database_id: databaseId });

      const list = (response.results || []).map((page: any) => {
        const rawStatus = (page.properties.Estado?.select?.name || 'recibido').toLowerCase().trim();
        let status: 'recibido' | 'incorrecto' | 'certificado' = 'recibido';
        if (rawStatus === 'certificado' || rawStatus === 'correcto') status = 'certificado';
        else if (rawStatus === 'incorrecto' || rawStatus === 'error') status = 'incorrecto';

        return {
          id: page.id,
          name: page.properties.Nombre?.title?.[0]?.plain_text || 'Participante',
          identification: page.properties.Identificacion?.rich_text?.[0]?.plain_text || '',
          role: page.properties.Rol?.select?.name || 'estudiante',
          email: page.properties.Correo?.email || '',
          status,
          registeredAt: page.created_time,
          generatedAt: page.properties.Generado?.date?.start || null
        };
      });

      res.json({ success: true, data: list });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST update participant
  app.post('/api/notion/registrants/update', async (req, res) => {
    try {
      const { pageId, status, name, identification, role, email } = req.body;
      if (!pageId) return res.status(400).json({ success: false, message: 'pageId es requerido' });

      const updateProps: any = {};
      if (status !== undefined) {
        let notionStatus = 'recibido';
        if (status === 'certificado' || status === 'correcto') notionStatus = 'certificado';
        else if (status === 'incorrecto') notionStatus = 'incorrecto';
        updateProps["Estado"] = { select: { name: notionStatus } };
        if (notionStatus === 'certificado') {
          updateProps["Generado"] = { date: { start: new Date().toISOString().split('T')[0] } };
        }
      }
      if (name !== undefined) updateProps["Nombre"] = { title: [{ text: { content: name.trim() } }] };
      if (identification !== undefined) updateProps["Identificacion"] = { rich_text: [{ text: { content: identification.trim() } }] };
      if (role !== undefined) updateProps["Rol"] = { select: { name: role } };
      if (email !== undefined) updateProps["Correo"] = { email: email.trim().toLowerCase() };

      await notion.pages.update({ page_id: pageId, properties: updateProps });
      res.json({ success: true, message: 'Participante actualizado en Notion' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST mark certificate as downloaded/generated
  app.post('/api/notion/registrants/mark-generated', async (req, res) => {
    try {
      const { pageId, downloadUrl } = req.body;
      if (!pageId) return res.status(400).json({ success: false, message: 'pageId es requerido' });
      const props: any = {
        "Generado": { date: { start: new Date().toISOString().split('T')[0] } }
      };
      if (downloadUrl) {
        props["Enlace Descarga"] = {
          files: [{ type: 'external', name: 'Descargar Certificado', external: { url: downloadUrl } }]
        };
      }
      await notion.pages.update({ page_id: pageId, properties: props });
      res.json({ success: true, message: 'Certificado marcado como generado' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST delete participant
  app.post('/api/notion/registrants/delete', async (req, res) => {
    try {
      const { pageId } = req.body;
      await notion.pages.update({ page_id: pageId, archived: true });
      res.json({ success: true, message: 'Participante eliminado de Notion' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST bulk register
  app.post('/api/notion/projects/:id/bulk', async (req, res) => {
    try {
      const { id } = req.params;
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Lista requerida' });

      const projects = await getNotionProjects();
      const activeProj = projects.find(p => p.id === id);
      if (!activeProj) return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });

      const databaseId = await getOrCreateDatabaseForProject(id, activeProj.title);
      let count = 0;
      for (const item of items) {
        if (!item.name || !item.identification || !item.role || !item.email) continue;
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            "Nombre": { title: [{ text: { content: item.name.trim() } }] },
            "Identificacion": { rich_text: [{ text: { content: String(item.identification).trim() } }] },
            "Rol": { select: { name: item.role.trim().toLowerCase() } },
            "Correo": { email: item.email.trim().toLowerCase() },
            "Estado": { select: { name: "recibido" } }
          }
        });
        count++;
      }
      res.json({ success: true, message: `${count} participantes cargados en Notion` });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // GET admin settings
  app.get('/api/admin/settings', (req, res) => {
    const { settings } = readDb();
    res.json({ success: true, data: { dailyCode: settings.dailyCode, template: settings.template || DEFAULT_SETTINGS.template } });
  });

  // POST save admin settings
  app.post('/api/admin/settings', (req, res) => {
    const { dailyCode, template } = req.body;
    const { settings, projectsConfig } = readDb();
    if (dailyCode) settings.dailyCode = dailyCode.trim().toUpperCase();
    if (template) {
      settings.template = {
        bgImage: template.bgImage !== undefined ? template.bgImage : settings.template?.bgImage,
        nameField: template.nameField ? { ...(settings.template?.nameField || DEFAULT_SETTINGS.template.nameField), ...template.nameField } : (settings.template?.nameField || DEFAULT_SETTINGS.template.nameField),
        idField: template.idField ? { ...(settings.template?.idField || DEFAULT_SETTINGS.template.idField), ...template.idField } : (settings.template?.idField || DEFAULT_SETTINGS.template.idField),
        roleField: template.roleField ? { ...(settings.template?.roleField || DEFAULT_SETTINGS.template.roleField), ...template.roleField } : (settings.template?.roleField || DEFAULT_SETTINGS.template.roleField)
      };
    }
    writeDb(settings, projectsConfig);
    res.json({ success: true, message: 'Ajustes guardados', data: settings });
  });

  // Vite / static
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor activo en http://localhost:${PORT}\n`);
  });
}

startServer();
