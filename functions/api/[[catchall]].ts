/**
 * Cloudflare Pages Function — handles all /api/* requests.
 * Replaces the Express server for production on Cloudflare Pages.
 */

interface Env {
  NOTION_SECRET: string;
  PARENT_PAGE_ID: string;
}

// ─── Minimal Notion REST client (works in Workers / Edge) ────────────────────
function createNotion(secret: string) {
  const base = 'https://api.notion.com/v1';
  const h = {
    Authorization: `Bearer ${secret}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const e: any = await res.json().catch(() => ({}));
      throw new Error(e.message || `Notion ${res.status} on ${path}`);
    }
    return res.json() as Promise<any>;
  }

  return {
    blocks: {
      children: {
        list: (p: { block_id: string }) =>
          req('GET', `/blocks/${p.block_id}/children?page_size=100`),
        append: (p: { block_id: string; children: unknown[] }) =>
          req('PATCH', `/blocks/${p.block_id}/children`, { children: p.children }),
      },
      delete: (p: { block_id: string }) => req('DELETE', `/blocks/${p.block_id}`),
      update: (p: { block_id: string; [k: string]: unknown }) => {
        const { block_id, ...rest } = p;
        return req('PATCH', `/blocks/${block_id}`, rest);
      },
    },
    databases: {
      create: (body: unknown) => req('POST', '/databases', body),
      retrieve: (p: { database_id: string }) => req('GET', `/databases/${p.database_id}`),
      update: (p: { database_id: string; properties: unknown }) =>
        req('PATCH', `/databases/${p.database_id}`, { properties: p.properties }),
      query: (p: { database_id: string; filter?: unknown; sorts?: unknown }) => {
        const { database_id, ...rest } = p;
        return req('POST', `/databases/${database_id}/query`, Object.keys(rest).length ? rest : {});
      },
    },
    pages: {
      create: (body: unknown) => req('POST', '/pages', body),
      update: (p: { page_id: string; [k: string]: unknown }) => {
        const { page_id, ...rest } = p;
        return req('PATCH', `/pages/${page_id}`, rest);
      },
    },
  };
}

type Notion = ReturnType<typeof createNotion>;

// ─── JSON response helper ────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Notion helpers ──────────────────────────────────────────────────────────
async function getNotionProjects(notion: Notion, parentPageId: string) {
  const response = await notion.blocks.children.list({ block_id: parentPageId });
  const toggles = (response.results || []).filter((b: any) => b.type === 'toggle');
  return toggles.map((b: any) => {
    const textArray = b.toggle?.rich_text || [];
    const title = textArray.map((t: any) => t.plain_text).join('');
    return { id: b.id, title: title || 'Proyecto sin título' };
  });
}

async function ensureDbProperties(notion: Notion, dbId: string) {
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const props = db.properties || {};
    const existing = Object.keys(props);
    const toAdd: Record<string, any> = {};
    const titleKey = existing.find((k: string) => props[k].type === 'title' && k !== 'Nombre');
    if (titleKey) toAdd[titleKey] = { name: 'Nombre' };
    if (!existing.includes('Identificacion')) toAdd['Identificacion'] = { rich_text: {} };
    if (!existing.includes('Rol'))
      toAdd['Rol'] = {
        select: {
          options: [
            { name: 'estudiante', color: 'blue' },
            { name: 'egresado', color: 'purple' },
            { name: 'empresario', color: 'orange' },
          ],
        },
      };
    if (!existing.includes('Correo')) toAdd['Correo'] = { email: {} };
    if (!existing.includes('Estado'))
      toAdd['Estado'] = {
        select: {
          options: [
            { name: 'recibido', color: 'yellow' },
            { name: 'incorrecto', color: 'red' },
            { name: 'certificado', color: 'green' },
          ],
        },
      };
    if (!existing.includes('Generado')) toAdd['Generado'] = { date: {} };
    if (!existing.includes('Enlace Descarga')) toAdd['Enlace Descarga'] = { files: {} };
    if (Object.keys(toAdd).length > 0) {
      await notion.databases.update({ database_id: dbId, properties: toAdd });
    }
  } catch (e) {
    console.warn('ensureDbProperties failed:', e);
  }
}

async function getOrCreateDatabaseForProject(
  notion: Notion,
  parentPageId: string,
  toggleBlockId: string,
  projectTitle: string,
): Promise<string> {
  const children = await notion.blocks.children.list({ block_id: toggleBlockId });
  const results: any[] = children.results || [];

  // 1. Legacy __DB_ID__ code block
  const dbIdBlock = results.find(
    (b: any) =>
      b.type === 'code' &&
      b.code?.language === 'javascript' &&
      (b.code?.caption || []).map((t: any) => t.plain_text).join('') === '__DB_ID__',
  );
  if (dbIdBlock) {
    const storedId = (dbIdBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('').trim();
    if (storedId) {
      await ensureDbProperties(notion, storedId);
      return storedId;
    }
  }

  // 2. Inline child_database inside toggle
  const inlineDb = results.find((b: any) => b.type === 'child_database');
  if (inlineDb) {
    await ensureDbProperties(notion, inlineDb.id);
    return inlineDb.id;
  }

  // 3. child_page inside toggle
  const childPage = results.find((b: any) => b.type === 'child_page');
  if (childPage) {
    try {
      const pageChildren = await notion.blocks.children.list({ block_id: childPage.id });
      const dbBlock = (pageChildren.results || []).find((b: any) => b.type === 'child_database');
      if (dbBlock) {
        await ensureDbProperties(notion, dbBlock.id);
        return dbBlock.id;
      }
    } catch {}
  }

  // 4. Legacy: child_database at parent page level
  const parentChildren = await notion.blocks.children.list({ block_id: parentPageId });
  const matchingDb = (parentChildren.results || []).find((b: any) => {
    if (b.type !== 'child_database') return false;
    const t = (b.child_database?.title || '').trim().toLowerCase();
    return t === `participantes - ${projectTitle.toLowerCase()}`;
  });
  if (matchingDb) {
    await ensureDbProperties(notion, matchingDb.id);
    return matchingDb.id;
  }

  // 5. Try to create inline inside toggle
  try {
    const resp = await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [
        {
          object: 'block',
          type: 'child_database',
          child_database: { title: `Participantes - ${projectTitle}` },
        } as any,
      ],
    });
    const newDbId = (resp as any).results?.[0]?.id;
    if (newDbId) {
      await ensureDbProperties(notion, newDbId);
      return newDbId;
    }
  } catch {}

  // 6. Fallback: create at parent page level
  const db: any = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    is_inline: true,
    title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }],
    properties: {
      Nombre: { title: {} },
      Identificacion: { rich_text: {} },
      Rol: {
        select: {
          options: [
            { name: 'estudiante', color: 'blue' },
            { name: 'egresado', color: 'purple' },
            { name: 'empresario', color: 'orange' },
          ],
        },
      },
      Correo: { email: {} },
      Estado: {
        select: {
          options: [
            { name: 'recibido', color: 'yellow' },
            { name: 'incorrecto', color: 'red' },
            { name: 'certificado', color: 'green' },
          ],
        },
      },
      Generado: { date: {} },
      'Enlace Descarga': { files: {} },
    },
  });
  const dbId: string = db.id;

  try {
    await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `📋 Tabla de participantes: Participantes - ${projectTitle}`,
                  link: { url: `https://www.notion.so/${dbId.replace(/-/g, '')}` },
                },
              },
            ],
          },
        } as any,
        {
          object: 'block',
          type: 'code',
          code: {
            caption: [{ type: 'text', text: { content: '__DB_ID__' } }],
            rich_text: [{ type: 'text', text: { content: dbId } }],
            language: 'javascript',
          },
        } as any,
      ],
    });
  } catch {}

  return dbId;
}

async function getAdminPassword(notion: Notion, parentPageId: string): Promise<string> {
  try {
    const response = await notion.blocks.children.list({ block_id: parentPageId });
    const quoteBlock = (response.results || []).find((b: any) => b.type === 'quote');
    if (quoteBlock) {
      const pwd = (quoteBlock.quote?.rich_text || [])
        .map((t: any) => t.plain_text)
        .join('')
        .trim();
      if (pwd) return pwd;
    }
  } catch {}
  return 'depadise2026';
}

async function getProjectDailyCode(notion: Notion, toggleBlockId: string): Promise<string | null> {
  try {
    const children = await notion.blocks.children.list({ block_id: toggleBlockId });
    const quoteBlock = (children.results || []).find((b: any) => b.type === 'quote');
    if (quoteBlock) {
      return (quoteBlock.quote?.rich_text || []).map((t: any) => t.plain_text).join('').trim() || null;
    }
  } catch {}
  return null;
}

async function saveProjectDailyCode(notion: Notion, toggleBlockId: string, code: string) {
  const children = await notion.blocks.children.list({ block_id: toggleBlockId });
  const existing = (children.results || []).find((b: any) => b.type === 'quote');
  const richText = [{ type: 'text', text: { content: code.toUpperCase() } }];
  if (existing) {
    await notion.blocks.update({ block_id: existing.id, quote: { rich_text: richText } });
  } else {
    await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [{ object: 'block', type: 'quote', quote: { rich_text: richText } } as any],
    });
  }
}

async function saveNotionProjectConfigToNotion(notion: Notion, toggleBlockId: string, config: any) {
  const listResponse = await notion.blocks.children.list({ block_id: toggleBlockId });
  const results: any[] = listResponse.results || [];

  const serializeConfig = {
    fields: config.fields,
    bgAspectRatio: config.bgAspectRatio,
    roles: config.roles,
    nameField: config.nameField,
    idField: config.idField,
    roleField: config.roleField,
  };
  const configJsonString = JSON.stringify(serializeConfig, null, 2);
  const jsonChunks: any[] = [];
  for (let i = 0; i < configJsonString.length; i += 2000) {
    jsonChunks.push({ type: 'text', text: { content: configJsonString.substring(i, i + 2000) } });
  }

  const existingCodeBlock = results.find(
    (b: any) => b.type === 'code' && b.code?.language === 'json',
  );
  if (existingCodeBlock) {
    await notion.blocks.update({
      block_id: existingCodeBlock.id,
      code: { rich_text: jsonChunks, language: 'json' },
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
            language: 'json',
          },
        } as any,
      ],
    });
  }

  if (config.bgImage) {
    const existingBgBlock = results.find(
      (b: any) =>
        b.type === 'code' &&
        b.code?.language === 'plaintext' &&
        (b.code?.caption || []).map((t: any) => t.plain_text).join('').includes('Fondo'),
    );
    const bgChunks: any[] = [];
    for (let i = 0; i < config.bgImage.length; i += 2000) {
      bgChunks.push({ type: 'text', text: { content: config.bgImage.substring(i, i + 2000) } });
    }
    if (existingBgBlock) {
      await notion.blocks.update({
        block_id: existingBgBlock.id,
        code: { rich_text: bgChunks, language: 'plaintext' },
      });
    } else {
      await notion.blocks.children.append({
        block_id: toggleBlockId,
        children: [
          {
            object: 'block',
            type: 'code',
            code: {
              caption: [
                { type: 'text', text: { content: 'Imagen de Fondo de Certificado (Base64/URL)' } },
              ],
              rich_text: bgChunks,
              language: 'plaintext',
            },
          } as any,
        ],
      });
    }
  }
}

function parseStatus(raw: string): 'recibido' | 'incorrecto' | 'certificado' {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'certificado' || s === 'correcto') return 'certificado';
  if (s === 'incorrecto' || s === 'error') return 'incorrecto';
  return 'recibido';
}

// ─── Route handler ───────────────────────────────────────────────────────────
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method.toUpperCase();

  const notion = createNotion(env.NOTION_SECRET);
  const PARENT = env.PARENT_PAGE_ID;

  let body: any = {};
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      body = await request.json();
    } catch {}
  }

  try {
    // ── POST /api/verify-code ───────────────────────────────────────────────
    if (path === '/api/verify-code' && method === 'POST') {
      const { code } = body;
      if (!code) return json({ success: false, message: 'Código es requerido' }, 400);
      const upperCode = code.trim().toUpperCase();
      const projects = await getNotionProjects(notion, PARENT);
      for (const proj of projects) {
        const projCode = await getProjectDailyCode(notion, proj.id);
        if (projCode && projCode.toUpperCase() === upperCode) {
          return json({ success: true, projectId: proj.id, projectTitle: proj.title });
        }
      }
      return json({ success: false, message: 'Código incorrecto. Verifica el código del día e inténtalo de nuevo.' });
    }

    // ── POST /api/admin/verify ──────────────────────────────────────────────
    if (path === '/api/admin/verify' && method === 'POST') {
      const { password } = body;
      if (!password) return json({ success: false, message: 'Contraseña requerida' }, 400);
      const validPassword = await getAdminPassword(notion, PARENT);
      if (password.trim() === validPassword) return json({ success: true });
      return json({ success: false, message: 'Contraseña de administrador incorrecta.' });
    }

    // ── GET /api/admin/settings ─────────────────────────────────────────────
    if (path === '/api/admin/settings' && method === 'GET') {
      return json({ success: true, data: { dailyCode: '', template: { bgImage: null, fields: [], bgAspectRatio: 16 / 9 } } });
    }

    // ── POST /api/admin/settings ────────────────────────────────────────────
    if (path === '/api/admin/settings' && method === 'POST') {
      // Settings are now stored per-project in Notion; global settings not persisted in edge
      return json({ success: true, message: 'Ajustes aceptados' });
    }

    // ── GET /api/notion/projects ────────────────────────────────────────────
    if (path === '/api/notion/projects' && method === 'GET') {
      const projects = await getNotionProjects(notion, PARENT);
      const enriched = await Promise.all(
        projects.map(async (proj) => {
          try {
            const blks: any[] = (await notion.blocks.children.list({ block_id: proj.id })).results || [];
            const codeBlock = blks.find((b: any) => b.type === 'code' && b.code?.language === 'json');
            const bgBlock = blks.find(
              (b: any) =>
                b.type === 'code' &&
                b.code?.language === 'plaintext' &&
                (b.code?.caption || []).map((t: any) => t.plain_text).join('').includes('Fondo'),
            );
            const quoteBlock = blks.find((b: any) => b.type === 'quote');
            const dailyCode = quoteBlock
              ? (quoteBlock.quote?.rich_text || []).map((t: any) => t.plain_text).join('').trim()
              : null;
            let layout: any = {};
            if (codeBlock) {
              const txt = (codeBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('');
              if (txt) layout = JSON.parse(txt);
            }
            const bgImage = bgBlock
              ? (bgBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('') || null
              : null;
            return {
              id: proj.id,
              title: proj.title,
              config: {
                bgImage,
                bgAspectRatio: layout.bgAspectRatio ?? null,
                fields: layout.fields ?? null,
                roles: layout.roles ?? null,
                dailyCode,
                nameField: layout.nameField ?? null,
                idField: layout.idField ?? null,
                roleField: layout.roleField ?? null,
              },
            };
          } catch {
            return { id: proj.id, title: proj.title, config: null };
          }
        }),
      );
      return json({ success: true, data: enriched });
    }

    // ── POST /api/notion/projects ───────────────────────────────────────────
    if (path === '/api/notion/projects' && method === 'POST') {
      const { title } = body;
      if (!title?.trim()) return json({ success: false, message: 'El nombre del taller es obligatorio' }, 400);
      const existing = await getNotionProjects(notion, PARENT);
      if (existing.find((p) => p.title.toLowerCase() === title.trim().toLowerCase())) {
        return json({ success: false, message: 'Ya existe un taller con ese nombre.' }, 400);
      }
      const appendResp: any = await notion.blocks.children.append({
        block_id: PARENT,
        children: [
          {
            object: 'block',
            type: 'toggle',
            toggle: { rich_text: [{ type: 'text', text: { content: title.trim() } }] },
          } as any,
        ],
      });
      const newBlock = appendResp.results?.[0];
      if (!newBlock?.id) throw new Error('No se pudo crear el toggle');
      await getOrCreateDatabaseForProject(notion, PARENT, newBlock.id, title.trim());
      return json({ success: true, message: '¡Taller creado!', data: { id: newBlock.id, title: title.trim() } });
    }

    // ── DELETE /api/notion/projects/:id ────────────────────────────────────
    const deleteProjectMatch = path.match(/^\/api\/notion\/projects\/([^/]+)$/);
    if (deleteProjectMatch && method === 'DELETE') {
      const [, id] = deleteProjectMatch;
      await notion.blocks.delete({ block_id: id });
      return json({ success: true, message: 'Proyecto eliminado de Notion' });
    }

    // ── POST /api/notion/projects/:id/config ───────────────────────────────
    const configMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/config$/);
    if (configMatch && method === 'POST') {
      const [, id] = configMatch;
      const { config } = body;
      await saveNotionProjectConfigToNotion(notion, id, config);
      return json({ success: true, message: 'Configuración guardada' });
    }

    // ── POST /api/notion/projects/:id/daily-code ───────────────────────────
    const dailyCodeMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/daily-code$/);
    if (dailyCodeMatch && method === 'POST') {
      const [, id] = dailyCodeMatch;
      const { code } = body;
      if (!code?.trim()) return json({ success: false, message: 'Código requerido' }, 400);
      await saveProjectDailyCode(notion, id, code.trim());
      return json({ success: true, message: 'Código guardado en Notion' });
    }

    // ── POST /api/notion/projects/:id/register ─────────────────────────────
    const registerMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/register$/);
    if (registerMatch && method === 'POST') {
      const [, id] = registerMatch;
      const { name, identification, role, email } = body;
      if (!name || !identification || !role || !email) {
        return json({ success: false, message: 'Todos los campos son obligatorios' }, 400);
      }
      const projects = await getNotionProjects(notion, PARENT);
      const proj = projects.find((p) => p.id === id);
      if (!proj) return json({ success: false, message: 'Proyecto no encontrado' }, 404);

      const dbId = await getOrCreateDatabaseForProject(notion, PARENT, id, proj.title);
      const search: any = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Identificacion', rich_text: { equals: identification.trim() } },
      });
      if (search.results.length > 0) {
        const existing = search.results[0] as any;
        const s = parseStatus(existing.properties.Estado?.select?.name || '');
        if (s === 'incorrecto') {
          await notion.pages.update({ page_id: existing.id, archived: true });
        } else if (s === 'certificado') {
          return json({ success: false, message: 'Ya tienes un certificado generado. Descárgalo en la sección de certificados.' }, 400);
        } else {
          return json({ success: false, message: 'Tu registro ya fue recibido y está en revisión.' }, 400);
        }
      }
      const hostUrl = `https://${new URL(request.url).hostname}`;
      await notion.pages.create({
        parent: { database_id: dbId },
        properties: {
          Nombre: { title: [{ text: { content: name.trim() } }] },
          Identificacion: { rich_text: [{ text: { content: identification.trim() } }] },
          Rol: { select: { name: role } },
          Correo: { email: email.trim().toLowerCase() },
          Estado: { select: { name: 'recibido' } },
          'Enlace Descarga': {
            files: [
              {
                type: 'external',
                name: 'Descargar Certificado',
                external: { url: `${hostUrl}/?view=download&project=${id}&id=${identification.trim()}` },
              },
            ],
          },
        },
      });
      return json({ success: true, message: '¡Solicitud de certificado guardada en Notion!' });
    }

    // ── GET /api/notion/projects/:id/search ────────────────────────────────
    const searchMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/search$/);
    if (searchMatch && method === 'GET') {
      const [, id] = searchMatch;
      const identification = url.searchParams.get('identification');
      if (!identification) return json({ success: false, message: 'Identificación requerida' }, 400);
      const projects = await getNotionProjects(notion, PARENT);
      const proj = projects.find((p) => p.id === id);
      if (!proj) return json({ success: false, message: 'Proyecto no encontrado' }, 404);
      const dbId = await getOrCreateDatabaseForProject(notion, PARENT, id, proj.title);
      const response: any = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Identificacion', rich_text: { equals: identification.trim() } },
      });
      if (!response.results.length) return json({ success: true, found: false });
      const page = response.results[0] as any;
      return json({
        success: true,
        found: true,
        data: {
          id: page.id,
          name: page.properties.Nombre?.title?.[0]?.plain_text || 'Participante',
          identification: identification.trim(),
          role: page.properties.Rol?.select?.name || 'estudiante',
          email: page.properties.Correo?.email || '',
          status: parseStatus(page.properties.Estado?.select?.name || ''),
          generatedAt: page.properties.Generado?.date?.start || null,
          registeredAt: page.created_time,
        },
      });
    }

    // ── GET /api/notion/projects/:id/registrants ───────────────────────────
    const registrantsMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/registrants$/);
    if (registrantsMatch && method === 'GET') {
      const [, id] = registrantsMatch;
      const projects = await getNotionProjects(notion, PARENT);
      const proj = projects.find((p) => p.id === id);
      if (!proj) return json({ success: false, message: 'Proyecto no encontrado' }, 404);
      const dbId = await getOrCreateDatabaseForProject(notion, PARENT, id, proj.title);
      const response: any = await notion.databases.query({ database_id: dbId });
      const list = (response.results || []).map((page: any) => ({
        id: page.id,
        name: page.properties.Nombre?.title?.[0]?.plain_text || 'Participante',
        identification: page.properties.Identificacion?.rich_text?.[0]?.plain_text || '',
        role: page.properties.Rol?.select?.name || 'estudiante',
        email: page.properties.Correo?.email || '',
        status: parseStatus(page.properties.Estado?.select?.name || ''),
        registeredAt: page.created_time,
        generatedAt: page.properties.Generado?.date?.start || null,
      }));
      return json({ success: true, data: list });
    }

    // ── POST /api/notion/projects/:id/bulk ─────────────────────────────────
    const bulkMatch = path.match(/^\/api\/notion\/projects\/([^/]+)\/bulk$/);
    if (bulkMatch && method === 'POST') {
      const [, id] = bulkMatch;
      const { items } = body;
      if (!items || !Array.isArray(items)) return json({ success: false, message: 'Lista requerida' }, 400);
      const projects = await getNotionProjects(notion, PARENT);
      const proj = projects.find((p) => p.id === id);
      if (!proj) return json({ success: false, message: 'Proyecto no encontrado' }, 404);
      const dbId = await getOrCreateDatabaseForProject(notion, PARENT, id, proj.title);
      let count = 0;
      for (const item of items) {
        if (!item.name || !item.identification || !item.role || !item.email) continue;
        await notion.pages.create({
          parent: { database_id: dbId },
          properties: {
            Nombre: { title: [{ text: { content: item.name.trim() } }] },
            Identificacion: { rich_text: [{ text: { content: String(item.identification).trim() } }] },
            Rol: { select: { name: item.role.trim().toLowerCase() } },
            Correo: { email: item.email.trim().toLowerCase() },
            Estado: { select: { name: 'recibido' } },
          },
        });
        count++;
      }
      return json({ success: true, message: `${count} participantes cargados en Notion` });
    }

    // ── POST /api/notion/registrants/update ────────────────────────────────
    if (path === '/api/notion/registrants/update' && method === 'POST') {
      const { pageId, status, name, identification, role, email } = body;
      if (!pageId) return json({ success: false, message: 'pageId es requerido' }, 400);
      const props: any = {};
      if (status !== undefined) {
        const s = parseStatus(status);
        props['Estado'] = { select: { name: s } };
        if (s === 'certificado') props['Generado'] = { date: { start: new Date().toISOString().split('T')[0] } };
      }
      if (name !== undefined) props['Nombre'] = { title: [{ text: { content: name.trim() } }] };
      if (identification !== undefined) props['Identificacion'] = { rich_text: [{ text: { content: identification.trim() } }] };
      if (role !== undefined) props['Rol'] = { select: { name: role } };
      if (email !== undefined) props['Correo'] = { email: email.trim().toLowerCase() };
      await notion.pages.update({ page_id: pageId, properties: props });
      return json({ success: true, message: 'Participante actualizado en Notion' });
    }

    // ── POST /api/notion/registrants/mark-generated ────────────────────────
    if (path === '/api/notion/registrants/mark-generated' && method === 'POST') {
      const { pageId, downloadUrl } = body;
      if (!pageId) return json({ success: false, message: 'pageId es requerido' }, 400);
      const props: any = { Generado: { date: { start: new Date().toISOString().split('T')[0] } } };
      if (downloadUrl) {
        props['Enlace Descarga'] = {
          files: [{ type: 'external', name: 'Descargar Certificado', external: { url: downloadUrl } }],
        };
      }
      await notion.pages.update({ page_id: pageId, properties: props });
      return json({ success: true, message: 'Certificado marcado como generado' });
    }

    // ── POST /api/notion/registrants/delete ────────────────────────────────
    if (path === '/api/notion/registrants/delete' && method === 'POST') {
      const { pageId } = body;
      if (!pageId) return json({ success: false, message: 'pageId es requerido' }, 400);
      await notion.pages.update({ page_id: pageId, archived: true });
      return json({ success: true, message: 'Participante eliminado de Notion' });
    }

    return json({ success: false, message: `Ruta no encontrada: ${method} ${path}` }, 404);
  } catch (e: any) {
    console.error(`API error ${method} ${path}:`, e);
    return json({ success: false, message: e.message || 'Error interno del servidor' }, 500);
  }
};
