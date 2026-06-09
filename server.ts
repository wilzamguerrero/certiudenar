/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { AdminSettings } from './src/types.js';
import { Client } from '@notionhq/client';

// ─── Notion Credentials (loaded from .env) ────────────────────────────────────
const NOTION_SECRET = process.env.NOTION_SECRET || '';
const PARENT_PAGE_ID = process.env.PARENT_PAGE_ID || '';

if (!NOTION_SECRET || !PARENT_PAGE_ID) {
  console.error('⚠️  Missing NOTION_SECRET or PARENT_PAGE_ID in environment variables.');
}

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
    fields: [],
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

const BG_BLOCK_CAPTION_PREFIX = '__CERT_BG__';
const BG_IMG_BLOCK_CAPTION = '__CERT_BG_IMG__';
const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const NOTION_API_VER = '2022-06-28';
const BG_TEXT_CHUNK_SIZE = 1800;
const BG_TEXT_CHUNKS_PER_BLOCK = 80;
const NOTION_PLAIN_TEXT_LANGUAGE = 'plain text';

function richTextToPlainText(richText: any[] = []) {
  return richText.map((item: any) => item?.plain_text || item?.text?.content || '').join('');
}

function splitString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

function buildBgRichTextGroups(bgImage: string) {
  const textChunks = splitString(bgImage, BG_TEXT_CHUNK_SIZE).map(content => ({ type: 'text', text: { content } }));
  const groups: any[][] = [];
  for (let index = 0; index < textChunks.length; index += BG_TEXT_CHUNKS_PER_BLOCK) {
    groups.push(textChunks.slice(index, index + BG_TEXT_CHUNKS_PER_BLOCK));
  }
  return groups;
}

function getBgBlockCaption(block: any) {
  return richTextToPlainText(block?.code?.caption || []);
}

function getBgBlockIndex(block: any) {
  const match = getBgBlockCaption(block).match(/^__CERT_BG__:(\d+)\/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isBgBlock(block: any) {
  if (block?.type !== 'code') return false;
  const language = (block?.code?.language || '').toLowerCase();
  if (language !== 'plaintext' && language !== NOTION_PLAIN_TEXT_LANGUAGE) return false;
  const caption = getBgBlockCaption(block);
  return caption.startsWith(BG_BLOCK_CAPTION_PREFIX) || caption.includes('Imagen de Fondo de Certificado') || caption.includes('Fondo');
}

function readBgImageFromBlocks(results: any[]) {
  const bgBlocks = (results || []).filter(isBgBlock);
  if (bgBlocks.length === 0) return null;

  const taggedBlocks = bgBlocks
    .filter(block => getBgBlockCaption(block).startsWith(BG_BLOCK_CAPTION_PREFIX))
    .sort((left, right) => getBgBlockIndex(left) - getBgBlockIndex(right));

  if (taggedBlocks.length > 0) {
    return taggedBlocks.map(block => richTextToPlainText(block.code?.rich_text || [])).join('') || null;
  }

  return richTextToPlainText(bgBlocks[0].code?.rich_text || []) || null;
}

async function saveBgImageBlocksToNotion(toggleBlockId: string, results: any[], bgImage: string | null) {
  const existingBgBlocks = (results || []).filter(isBgBlock).sort((left, right) => getBgBlockIndex(left) - getBgBlockIndex(right));

  if (!bgImage) {
    await Promise.all(existingBgBlocks.map(block => (notion.blocks.delete as any)({ block_id: block.id }).catch(() => null)));
    return;
  }

  const groups = buildBgRichTextGroups(bgImage);

  for (let index = 0; index < groups.length; index++) {
    const code = {
      caption: [{ type: 'text', text: { content: `${BG_BLOCK_CAPTION_PREFIX}:${index + 1}/${groups.length}` } }],
      rich_text: groups[index],
      language: NOTION_PLAIN_TEXT_LANGUAGE,
    };

    if (existingBgBlocks[index]) {
      await notion.blocks.update({ block_id: existingBgBlocks[index].id, code });
    } else {
      await notion.blocks.children.append({
        block_id: toggleBlockId,
        children: [{ object: 'block', type: 'code', code } as any],
      });
    }
  }

  for (let index = groups.length; index < existingBgBlocks.length; index++) {
    await (notion.blocks.delete as any)({ block_id: existingBgBlocks[index].id }).catch(() => null);
  }
}

// ─── Notion: upload background image as native Notion image block ──────────────
async function uploadBgImageToNotion(
  toggleBlockId: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ blockId: string; imageUrl: string } | null> {
  try {
    // Step 1: Init single-part file upload
    const initResp = await fetch(`${NOTION_API_BASE_URL}/file_uploads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_SECRET}`,
        'Notion-Version': NOTION_API_VER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'single_part', filename, content_type: mimeType }),
    });
    if (!initResp.ok) {
      console.error('Notion file upload init failed:', await initResp.text());
      return null;
    }
    const initData = (await initResp.json()) as any;
    const { id: uploadId, upload_url } = initData;

    // Step 2: Upload binary content via multipart form
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), filename);
    const uploadResp = await fetch(upload_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_SECRET}`,
        'Notion-Version': NOTION_API_VER,
      },
      body: formData,
    });
    if (!uploadResp.ok) {
      console.error('Notion file upload content failed:', await uploadResp.text());
      return null;
    }

    // Step 3: Remove old bg image block and old base64 code blocks
    const existingChildren = await notion.blocks.children.list({ block_id: toggleBlockId });
    const existingBlocks: any[] = existingChildren.results || [];
    const oldImgBlock = existingBlocks.find((b: any) =>
      b.type === 'image' &&
      (b.image?.caption || []).map((t: any) => t.plain_text).join('') === BG_IMG_BLOCK_CAPTION,
    );
    if (oldImgBlock) {
      await (notion.blocks.delete as any)({ block_id: oldImgBlock.id }).catch((e: any) =>
        console.warn('Failed to delete old image block:', e),
      );
    }
    for (const block of existingBlocks.filter(isBgBlock)) {
      await (notion.blocks.delete as any)({ block_id: block.id }).catch(() => null);
    }

    // Step 4: Append image block referencing the uploaded file
    const appendResp = await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [{
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: uploadId },
          caption: [{ type: 'text', text: { content: BG_IMG_BLOCK_CAPTION } }],
        } as any,
      } as any],
    });
    const newBlockId = (appendResp.results as any[])[0]?.id;
    if (!newBlockId) return null;

    // Step 5: Retrieve the block to get the fresh signed URL (retry up to 5× with backoff)
    let imageUrl = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 400 + attempt * 600));
      try {
        const blockDetail = await (notion.blocks.retrieve as any)({ block_id: newBlockId });
        imageUrl = blockDetail?.image?.file?.url || blockDetail?.image?.external?.url || '';
        if (imageUrl) break;
      } catch { /* will retry */ }
    }

    return { blockId: newBlockId, imageUrl };
  } catch (e: any) {
    console.error('uploadBgImageToNotion error:', e.message);
    return null;
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

// ─── Notion: ensure DB has required columns (repair if missing) ───────────────
async function ensureDbProperties(dbId: string): Promise<void> {
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const props = (db as any).properties || {};
    const existing = Object.keys(props);
    const toAdd: Record<string, any> = {};

    // Rename the title property to "Nombre" if it exists under another name
    const titleKey = existing.find(k => props[k].type === 'title' && k !== 'Nombre');
    if (titleKey) toAdd[titleKey] = { name: 'Nombre' };

    if (!existing.includes('Identificacion')) toAdd['Identificacion'] = { rich_text: {} };
    if (!existing.includes('Rol')) toAdd['Rol'] = {
      select: { options: [
        { name: 'estudiante', color: 'blue' },
        { name: 'egresado', color: 'purple' },
        { name: 'empresario', color: 'orange' }
      ]}
    };
    if (!existing.includes('Correo')) toAdd['Correo'] = { email: {} };
    if (!existing.includes('Estado')) toAdd['Estado'] = {
      select: { options: [
        { name: 'recibido', color: 'yellow' },
        { name: 'incorrecto', color: 'red' },
        { name: 'certificado', color: 'green' }
      ]}
    };
    if (!existing.includes('Generado')) toAdd['Generado'] = { date: {} };
    if (!existing.includes('Enlace Descarga')) toAdd['Enlace Descarga'] = { files: {} };
    if (Object.keys(toAdd).length > 0) {
      await notion.databases.update({ database_id: dbId, properties: toAdd });
      console.info(`Repaired DB ${dbId}: updated properties ${Object.keys(toAdd).join(', ')}`);
    }
  } catch (e) {
    console.warn(`Could not verify/repair DB ${dbId} properties:`, e);
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
      if (storedId) { await ensureDbProperties(storedId); return storedId; }
    }

    // 2. Check for inline child_database directly inside the toggle
    const inlineDb = results.find((b: any) => b.type === 'child_database');
    if (inlineDb) { await ensureDbProperties(inlineDb.id); return inlineDb.id; }

    // 3. Check for child_page inside toggle that contains the DB
    const childPage = results.find((b: any) => b.type === 'child_page');
    if (childPage) {
      try {
        const pageChildren = await notion.blocks.children.list({ block_id: childPage.id });
        const dbBlock = (pageChildren.results || []).find((b: any) => b.type === 'child_database');
        if (dbBlock) { await ensureDbProperties(dbBlock.id); return dbBlock.id; }
      } catch {}
    }

    // 4. Check at parent page level (legacy fallback for old projects)
    const parentChildren = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const matchingDb = (parentChildren.results || []).find((b: any) => {
      if (b.type !== 'child_database') return false;
      const t = (b.child_database?.title || '').trim().toLowerCase();
      return t === `participantes - ${projectTitle.toLowerCase()}`;
    });
    if (matchingDb) { await ensureDbProperties(matchingDb.id); return matchingDb.id; }

    // 5. PRIMARY: Create inline database with the toggle block's ID as parent page_id.
    //    Notion's API accepts block IDs in the page_id field for inline databases,
    //    which places the database visually inside the toggle.
    const DB_PROPERTIES = {
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
    };

    // 5. PRIMARY: Use pages.create with the toggle block ID as the parent page.
    //    This creates a child_page block INSIDE the toggle, then we put the DB inside that page.
    try {
      const subPage = await (notion.pages as any).create({
        parent: { page_id: toggleBlockId },
        properties: {
          title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }]
        }
      });
      const subPageId: string | undefined = (subPage as any).id;
      if (subPageId) {
        console.info(`Created sub-page inside toggle: ${subPageId}`);
        const db = await notion.databases.create({
          parent: { type: 'page_id', page_id: subPageId },
          is_inline: true,
          title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }],
          properties: DB_PROPERTIES,
        });
        console.info(`Created database inside toggle sub-page: ${db.id}`);
        await ensureDbProperties(db.id);
        return db.id;
      }
    } catch (subPageErr: any) {
      console.warn('Sub-page inside toggle failed:', subPageErr.message);
    }

    // 6. SECONDARY: Raw fetch to bypass SDK validation — databases.create with toggle as page_id
    try {
      const rawResp = await fetch(`${NOTION_API_BASE_URL}/databases`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_SECRET}`,
          'Notion-Version': NOTION_API_VER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { type: 'page_id', page_id: toggleBlockId },
          is_inline: true,
          title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }],
          properties: DB_PROPERTIES,
        }),
      });
      if (rawResp.ok) {
        const data = (await rawResp.json()) as any;
        if (data.id) {
          console.info(`Raw API created database inside toggle: ${data.id}`);
          await ensureDbProperties(data.id);
          return data.id;
        }
      } else {
        const errText = await rawResp.text();
        console.warn('Raw API databases.create with toggle parent failed:', errText);
      }
    } catch (rawErr: any) {
      console.warn('Raw API databases.create error:', rawErr.message);
    }

    // 7. Final fallback: create at parent page level + store __DB_ID__ reference inside toggle
    const db = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      is_inline: true,
      title: [{ type: 'text', text: { content: `Participantes - ${projectTitle}` } }],
      properties: DB_PROPERTIES,
    });

    const fallbackDbId: string = db.id;
    const dbId: string = fallbackDbId;

    // Store DB reference inside toggle for future lookups
    try {
      await (notion.blocks.children.append as any)({
        block_id: toggleBlockId,
        children: [
          {
            object: 'block', type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: {
                  content: `📋 Tabla de participantes: Participantes - ${projectTitle}`,
                  link: { url: `https://www.notion.so/${fallbackDbId.replace(/-/g, '')}` }
                }
              }]
            }
          },
          {
            object: 'block', type: 'code',
            code: {
              caption: [{ type: 'text', text: { content: '__DB_ID__' } }],
              rich_text: [{ type: 'text', text: { content: fallbackDbId } }],
              language: 'javascript'
            }
          }
        ]
      });
    } catch (appendErr) {
      console.warn('Could not append DB reference to toggle:', appendErr);
    }

    return fallbackDbId;
  } catch (err: any) {
    console.error('Error in getOrCreateDatabaseForProject:', err);
    throw err;
  }
}

// ─── Notion: save template config + bg inside toggle ─────────────────────────
async function saveNotionProjectConfigToNotion(toggleBlockId: string, config: any): Promise<{ bgImageBlockId?: string; bgImage?: string } | null> {
  try {
    const listResponse = await notion.blocks.children.list({ block_id: toggleBlockId });
    const results: any[] = listResponse.results || [];

    // ── Handle background image ───────────────────────────────────────────────
    // If bgImage is a data: URL, upload it to Notion as a native image block.
    // This replaces the old base64-in-code-block approach and avoids the
    // rich_text[].length ≤ 100 Notion API limit.
    let resolvedBgImage: string | null = config.bgImage || null;
    let resolvedBgImageBlockId: string | null = config.bgImageBlockId || null;

    if (resolvedBgImage && resolvedBgImage.startsWith('data:')) {
      const mimeMatch = resolvedBgImage.match(/^data:(image\/[^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = resolvedBgImage.split(',')[1];
      if (base64Data) {
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const filename = mimeType === 'image/png' ? 'background.png' : 'background.jpg';
        const uploadResult = await uploadBgImageToNotion(toggleBlockId, imageBuffer, mimeType, filename);
        if (uploadResult) {
          resolvedBgImage = uploadResult.imageUrl;
          resolvedBgImageBlockId = uploadResult.blockId;
          console.info('Background image uploaded to Notion:', uploadResult.blockId);
        } else {
          console.warn('Image upload to Notion failed; skipping bg image persistence.');
          resolvedBgImage = null;
        }
      }
    } else if (!resolvedBgImage) {
      // bgImage removed: delete any existing native image block
      const imgBlock = results.find((b: any) =>
        b.type === 'image' &&
        (b.image?.caption || []).map((t: any) => t.plain_text).join('') === BG_IMG_BLOCK_CAPTION,
      );
      if (imgBlock) {
        await (notion.blocks.delete as any)({ block_id: imgBlock.id }).catch(() => null);
      }
      // Also delete old base64 code blocks
      await saveBgImageBlocksToNotion(toggleBlockId, results, null);
    }
    // If bgImage is already a hosted URL (not data:), no action needed — it's already in Notion.

    // ── Save JSON config block ────────────────────────────────────────────────
    const serializeConfig = {
      fields: config.fields,
      bgAspectRatio: config.bgAspectRatio,
      roles: config.roles,
      bgImageBlockId: resolvedBgImageBlockId,
      // Legacy backward compat
      nameField: config.nameField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'nameField') : undefined),
      idField: config.idField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'idField') : undefined),
      roleField: config.roleField ?? (Array.isArray(config.fields) ? config.fields.find((f: any) => f.id === 'roleField') : undefined),
    };
    const configJsonString = JSON.stringify(serializeConfig, null, 2);

    // Notion limits rich_text to 100 items per block; split JSON across multiple blocks if needed
    const MAX_RT_ITEMS = 95; // safe margin below 100
    const CHUNK_SIZE = 2000;
    const allJsonChunks: any[] = [];
    for (let i = 0; i < configJsonString.length; i += CHUNK_SIZE) {
      allJsonChunks.push({ type: 'text', text: { content: configJsonString.substring(i, i + CHUNK_SIZE) } });
    }

    // Find existing JSON code blocks (may be multiple if config was previously split)
    const existingJsonBlocks = results.filter((b: any) => b.type === 'code' && b.code?.language === 'json');

    const jsonBlockGroups: any[][] = [];
    for (let i = 0; i < allJsonChunks.length; i += MAX_RT_ITEMS) {
      jsonBlockGroups.push(allJsonChunks.slice(i, i + MAX_RT_ITEMS));
    }
    // Ensure at least one block group (handles empty config)
    if (jsonBlockGroups.length === 0) jsonBlockGroups.push([{ type: 'text', text: { content: '{}' } }]);

    for (let idx = 0; idx < jsonBlockGroups.length; idx++) {
      const richText = jsonBlockGroups[idx];
      const caption = idx === 0
        ? [{ type: 'text', text: { content: 'Configuración de Plantilla (JSON)' } }]
        : [{ type: 'text', text: { content: `Configuración de Plantilla (JSON) parte ${idx + 1}` } }];
      if (existingJsonBlocks[idx]) {
        await notion.blocks.update({ block_id: existingJsonBlocks[idx].id, code: { rich_text: richText, language: 'json' } });
      } else {
        await notion.blocks.children.append({
          block_id: toggleBlockId,
          children: [{ object: 'block', type: 'code', code: { caption, rich_text: richText, language: 'json' } }],
        });
      }
    }
    // Remove extra old JSON blocks if we now need fewer
    for (let idx = jsonBlockGroups.length; idx < existingJsonBlocks.length; idx++) {
      await (notion.blocks.delete as any)({ block_id: existingJsonBlocks[idx].id }).catch(() => null);
    }

    return resolvedBgImageBlockId ? { bgImageBlockId: resolvedBgImageBlockId, bgImage: resolvedBgImage ?? undefined } : null;
  } catch (err) {
    console.error('Error synchronizing layout config to Notion:', err);
    return null;
  }
}

// ─── Notion: admin password from first quote on parent page ──────────────────
async function getAdminPassword(): Promise<string> {
  try {
    const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
    const quoteBlock = (response.results || []).find((b: any) => b.type === 'quote');
    if (quoteBlock) {
      const pwd = (quoteBlock.quote?.rich_text || []).map((t: any) => t.plain_text).join('').trim();
      if (pwd) return pwd;
    }
  } catch (e) {
    console.warn('Could not read admin password from Notion:', e);
  }
  const { settings } = readDb();
  return (settings as any).adminPassword || 'depadise2026';
}

// ─── Notion: project daily code from quote block inside toggle ────────────────
async function getProjectDailyCode(toggleBlockId: string): Promise<string | null> {
  try {
    const children = await notion.blocks.children.list({ block_id: toggleBlockId });
    const quoteBlock = (children.results || []).find((b: any) => b.type === 'quote');
    if (quoteBlock) {
      return (quoteBlock.quote?.rich_text || []).map((t: any) => t.plain_text).join('').trim() || null;
    }
  } catch {}
  return null;
}

async function saveProjectDailyCode(toggleBlockId: string, code: string): Promise<void> {
  const children = await notion.blocks.children.list({ block_id: toggleBlockId });
  const existing = (children.results || []).find((b: any) => b.type === 'quote');
  const richText = [{ type: 'text', text: { content: code.toUpperCase() } }];
  if (existing) {
    await (notion.blocks as any).update({ block_id: existing.id, quote: { rich_text: richText } });
  } else {
    await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [{ object: 'block', type: 'quote', quote: { rich_text: richText } } as any]
    });
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

  // POST verify admin password (reads from Notion quote block on parent page)
  app.post('/api/admin/verify', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Contraseña requerida' });
    try {
      const validPassword = await getAdminPassword();
      if (password.trim() === validPassword) {
        return res.json({ success: true });
      }
      return res.json({ success: false, message: 'Contraseña de administrador incorrecta.' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST verify daily code — searches all project toggles for a matching quote block
  app.post('/api/verify-code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Código es requerido' });
    const upperCode = code.trim().toUpperCase();
    try {
      const projects = await getNotionProjects();
      for (const proj of projects) {
        const projCode = await getProjectDailyCode(proj.id);
        if (projCode && projCode.toUpperCase() === upperCode) {
          return res.json({ success: true, projectId: proj.id, projectTitle: proj.title, message: 'Código válido' });
        }
      }
      // Fallback: check against global daily code in local DB
      const { settings } = readDb();
      if (upperCode === (settings.dailyCode || '').toUpperCase() && projects.length > 0) {
        return res.json({ success: true, projectId: projects[0].id, projectTitle: projects[0].title, message: 'Código válido' });
      }
      return res.json({ success: false, message: 'Código incorrecto. Verifica el código del día e inténtalo de nuevo.' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
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

        // If cached config has a stale bgImage (base64 data URL or empty URL) but has a
        // bgImageBlockId, refresh the signed URL from Notion before serving.
        if (config && config.bgImageBlockId) {
          const isBase64 = typeof config.bgImage === 'string' && config.bgImage.startsWith('data:');
          const isEmpty = !config.bgImage;
          if (isBase64 || isEmpty) {
            try {
              const freshBlock = await (notion.blocks.retrieve as any)({ block_id: config.bgImageBlockId });
              const freshUrl: string = freshBlock?.image?.file?.url || freshBlock?.image?.external?.url || '';
              if (freshUrl) {
                config = { ...config, bgImage: freshUrl };
                projectsConfig[proj.id] = config;
                hasUpdates = true;
              } else if (isBase64) {
                // Can't refresh — clear the stored base64 to avoid polluting the cache
                config = { ...config, bgImage: null };
                projectsConfig[proj.id] = config;
                hasUpdates = true;
              }
            } catch { /* keep existing config */ }
          }
        } else if (config && typeof config.bgImage === 'string' && config.bgImage.startsWith('data:')) {
          // Legacy: base64 stored in cache but no block ID — clear it so we reload from Notion
          config = { ...config, bgImage: null };
          projectsConfig[proj.id] = config;
          hasUpdates = true;
          config = null as any; // force reload from Notion below
        }

        if (!config) {
          try {
            const listResponse = await notion.blocks.children.list({ block_id: proj.id });
            const blks: any[] = listResponse.results || [];
            const codeBlock = blks.find((b: any) => b.type === 'code' && b.code?.language === 'json');
            const quoteBlock = blks.find((b: any) => b.type === 'quote');
            const projectDailyCode = quoteBlock ? (quoteBlock.quote?.rich_text || []).map((t: any) => t.plain_text).join('').trim() : null;
            let parsedLayout: any = {};
            if (codeBlock) {
              const txt = (codeBlock.code?.rich_text || []).map((t: any) => t.plain_text).join('');
              if (txt) parsedLayout = JSON.parse(txt);
            }

            // Prefer native image block (new approach); fall back to base64 code blocks (legacy)
            const bgImgBlock = blks.find((b: any) =>
              b.type === 'image' &&
              (b.image?.caption || []).map((t: any) => t.plain_text).join('') === BG_IMG_BLOCK_CAPTION,
            );
            let parsedBg: string | null = null;
            let bgImageBlockId: string | null = parsedLayout.bgImageBlockId || null;
            if (bgImgBlock) {
              parsedBg = bgImgBlock.image?.file?.url || bgImgBlock.image?.external?.url || null;
              bgImageBlockId = bgImgBlock.id;
            } else if (bgImageBlockId) {
              // Block ID known but block not in first-page results — try to retrieve fresh URL
              try {
                const freshBlock = await (notion.blocks.retrieve as any)({ block_id: bgImageBlockId });
                parsedBg = freshBlock?.image?.file?.url || freshBlock?.image?.external?.url || null;
              } catch { bgImageBlockId = null; }
            }
            if (!parsedBg) {
              parsedBg = readBgImageFromBlocks(blks);
              // Legacy base64 from code blocks — keep it only as a last resort (no block ID to refresh from)
            }

            if (Object.keys(parsedLayout).length > 0 || parsedBg || projectDailyCode) {
              config = {
                bgImage: parsedBg,
                bgImageBlockId,
                bgAspectRatio: parsedLayout.bgAspectRatio ?? null,
                fields: parsedLayout.fields ?? null,
                roles: parsedLayout.roles ?? null,
                dailyCode: projectDailyCode,
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
            dailyCode: null,
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
      // Don't persist base64 images in the local JSON store — only store the Notion block URL/ID
      const cacheConfig = { ...config };
      if (cacheConfig.bgImage?.startsWith('data:')) delete cacheConfig.bgImage;
      projectsConfig[id] = cacheConfig;
      writeDb(settings, projectsConfig);
      const saveResult = await saveNotionProjectConfigToNotion(id, config);
      // If the save uploaded a new image, update the local cache with the Notion block data
      if (saveResult?.bgImageBlockId) {
        projectsConfig[id].bgImageBlockId = saveResult.bgImageBlockId;
        if (saveResult.bgImage) projectsConfig[id].bgImage = saveResult.bgImage;
        writeDb(settings, projectsConfig);
      }
      res.json({
        success: true,
        message: 'Configuración guardada',
        bgImage: saveResult?.bgImage ?? projectsConfig[id]?.bgImage ?? null,
        bgImageBlockId: saveResult?.bgImageBlockId ?? projectsConfig[id]?.bgImageBlockId ?? null,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST upload background image to Notion as native image block
  app.post('/api/notion/projects/:id/upload-bg-image', async (req, res) => {
    try {
      const { id } = req.params;
      const { imageDataUrl, mimeType } = req.body;
      if (!imageDataUrl?.startsWith('data:')) {
        return res.status(400).json({ success: false, message: 'imageDataUrl (base64 data URL) requerido' });
      }
      const base64Data = imageDataUrl.split(',')[1];
      if (!base64Data) {
        return res.status(400).json({ success: false, message: 'Imagen inválida' });
      }
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const safeMimeType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const filename = safeMimeType === 'image/png' ? 'background.png' : 'background.jpg';

      const uploadResult = await uploadBgImageToNotion(id, imageBuffer, safeMimeType, filename);
      if (!uploadResult) {
        return res.status(500).json({ success: false, message: 'Fallo al subir imagen a Notion. Revisa los logs del servidor.' });
      }

      // Update local cache with block ID + fresh URL
      const { settings, projectsConfig } = readDb();
      if (projectsConfig[id]) {
        projectsConfig[id].bgImage = uploadResult.imageUrl;
        projectsConfig[id].bgImageBlockId = uploadResult.blockId;
      }
      writeDb(settings, projectsConfig);

      res.json({ success: true, imageUrl: uploadResult.imageUrl, blockId: uploadResult.blockId });
    } catch (e: any) {
      console.error('Error in upload-bg-image:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST save daily code as quote block inside project toggle
  app.post('/api/notion/projects/:id/daily-code', async (req, res) => {
    try {
      const { id } = req.params;
      const { code } = req.body;
      if (!code?.trim()) return res.status(400).json({ success: false, message: 'Código requerido' });
      await saveProjectDailyCode(id, code.trim());
      // Also update local cache
      const { settings, projectsConfig } = readDb();
      if (projectsConfig[id]) projectsConfig[id].dailyCode = code.trim().toUpperCase();
      writeDb(settings, projectsConfig);
      res.json({ success: true, message: 'Código guardado en Notion' });
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

  // DELETE project toggle from Notion
  app.delete('/api/notion/projects/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await notion.blocks.delete({ block_id: id });
      const { settings, projectsConfig } = readDb();
      delete projectsConfig[id];
      writeDb(settings, projectsConfig);
      res.json({ success: true, message: 'Proyecto eliminado de Notion' });
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
        fields: template.fields || settings.template?.fields || [],
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
