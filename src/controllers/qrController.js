// src/controllers/qrController.js
import crypto from "crypto";
import prisma from "../../config/db.js";
import jsQR from "jsqr";
import sharp from "sharp";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Jimp = require("jimp");
const QrCode = require("qrcode-reader");
/**
 * Create a cryptographically-strong opaque code.
 * (Opaque token rather than embedding payload in the code itself.)
 */
function generateOpaqueCode(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Minimal CSS sanitizer for inline style attributes.
// Accepts string or object, returns a safe inline CSS string with whitelisted properties only.
function sanitizeStyle(style) {
  const ALLOWED = new Set([
    'color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-align',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
    'border', 'border-color', 'border-width', 'border-style', 'border-radius',
    'display'
  ]);
  // If style is an object, convert to k:v string first
  let entries = [];
  if (!style) return '';
  if (typeof style === 'object') {
    entries = Object.entries(style).map(([k, v]) => [String(k).toLowerCase(), String(v || '')]);
  } else if (typeof style === 'string') {
    entries = style.split(';').map(part => part.trim()).filter(Boolean).map(rule => {
      const idx = rule.indexOf(':');
      if (idx === -1) return [null, null];
      const k = rule.slice(0, idx).trim().toLowerCase();
      const v = rule.slice(idx + 1).trim();
      return [k, v];
    }).filter(([k]) => !!k);
  } else {
    return '';
  }
  const safe = entries
    .filter(([k, v]) => ALLOWED.has(k) && !/expression\s*\(|javascript:/i.test(v))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  return safe;
}

async function createUniqueCode() {
  // Try a few times to avoid rare collisions
  for (let i = 0; i < 5; i++) {
    const code = generateOpaqueCode();
    const existing = await prisma.qrCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique qr code");
}

const qrController = {
  /**
   * POST /qr/generate  (GENERATOR only)
   * Body: {
   *   payload: any (string|object|number...),
   *   type?: string ("generic" default),
   *   oneTime?: boolean (default true),
   *   expiresAt?: string ISO date (optional)
   * }
   * Returns: { code, id, ... }
   */
  async generate(req, res) {
    try {
      const { payload, type = "generic", oneTime = true, expiresAt } = req.body;

      if (typeof payload === "undefined") {
        return res.status(400).json({ qr: null, message: "payload is required" });
      }

      // Optional: object payloads must include 'content'
      if (payload && typeof payload === 'object' && !Array.isArray(payload) && !payload.content) {
        return res.status(400).json({ qr: null, message: "Object payload must include 'content'" });
      }

      const code = await createUniqueCode();

      const record = await prisma.qrCode.create({
        data: {
          code,
          payload, // stored as JSON
          type,
          oneTime,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          createdBy: req.userId,
        },
        select: {
          id: true,
          code: true,
          payload: true,
          type: true,
          oneTime: true,
          isValid: true,
          createdAt: true,
          expiresAt: true,
          creator: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Ensure response send doesn't fail silently (e.g., serialization issues)
      try {
        const qr = {
          ...record,
          createdAt: record.createdAt?.toISOString?.() || null,
          expiresAt: record.expiresAt?.toISOString?.() || null,
        };
        return res.status(201).json({ qr });
      } catch (responseErr) {
        console.error("qr generate response error:", responseErr);
        return res.status(500).json({ qr: null, message: "Failed to send response" });
      }
    } catch (err) {
      console.error("qr generate error:", err);
      return res.status(500).json({ qr: null, message: "Server error" });
    }
  },

  async generatePage(req, res) {
  try {
    const { title, description, blocks, style } = req.body;
    
    if (!blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ message: "blocks array is required" });
    }

    // Create the page first
    const page = await prisma.qrPage.create({
      data: {
        title: title || null,
        description: description || null,
        style: style || {},
      },
    });

    // Create content blocks
    await Promise.all(
      blocks.map((block, index) => 
        prisma.contentBlock.create({
          data: {
            type: block.type,
            content: block.type === 'image' ? block.url : block.text,
            alt: block.type === 'image' ? (block.alt || null) : null,
            width: block.type === 'image' ? (block.width || null) : null,
            height: block.type === 'image' ? (block.height || null) : null,
            style: block.style || {},
            order: index,
            pageId: page.id,
          },
        })
      )
    );

    // Create qr code that points to this page
    const code = await createUniqueCode();
    const qr = await prisma.qrCode.create({
      data: {
        code,
        type: "page",
        oneTime: false,
        createdBy: req.userId,
        pageId: page.id,
      },
      select: {
        id: true,
        code: true,
        payload: true,
        type: true,
        oneTime: true,
        isValid: true,
        createdAt: true,
        expiresAt: true,
        pageId: true,
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Build a full URL to the renderable HTML endpoint
    const rawBase = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const baseUrl = rawBase.replace(/\/+$/, "");
    const url = `${baseUrl}/qr/page/${page.id}`;
    console.log('[qr/generate-page] Generated URL:', url);

    try {
      return res.status(201).json({ 
        qr: {
          ...qr,
          createdAt: qr.createdAt?.toISOString?.() || null,
          expiresAt: qr.expiresAt?.toISOString?.() || null,
        },
        url
      });
    } catch (responseErr) {
      console.error("qr generate-page response error:", responseErr);
      return res.status(500).json({ qr: null, message: "Failed to send response" });
    }
  } catch (err) {
    console.error("qr generate-page error:", err);
    return res.status(500).json({ message: "Server error" });
  }
},

// Update the renderPage endpoint
async renderPage(req, res) {
  try {
    const { id } = req.params;
    const page = await prisma.qrPage.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!page) {
      return res.status(404).send("Page not found");
    }

    // Return JSON for API consumers
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        title: page.title,
        description: page.description,
        style: page.style,
        blocks: page.blocks.map(block => ({
          type: block.type,
          content: block.content,
          style: block.style,
          alt: block.alt || null,
          width: block.width || null,
          height: block.height || null,
        }))
      });
    }

    // Render HTML for browser
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${page.title || "qr Page"}</title>
        <style>
          body {
            font-family: ${page.style?.fontFamily || "Arial, sans-serif"};
            background-color: ${page.style?.backgroundColor || "#fff"};
            color: ${page.style?.textColor || "#000"};
            max-width: ${page.style?.maxWidth || "800px"};
            margin: 0 auto;
            padding: ${page.style?.padding || "20px"};
          }
          img { 
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        ${page.title ? `<h1>${page.title}</h1>` : ''}
        ${page.description ? `<p>${page.description}</p>` : ''}
        ${page.blocks.map(block => {
          switch(block.type) {
            case 'heading':
              return `<h2 style="${sanitizeStyle(block.style)}">${block.content}</h2>`;
            case 'paragraph':
              return `<p style="${sanitizeStyle(block.style)}">${block.content}</p>`;
            case 'image':
              return `<img src="${block.content}" alt="${block.alt || ''}" ${block.width ? `width="${block.width}"` : ''} ${block.height ? `height="${block.height}"` : ''} style="${sanitizeStyle(block.style)}" />`;
            default:
              return '';
          }
        }).join('')}
      </body>
      </html>
    `;

    res.set("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    console.error("qr renderPage error:", err);
    return res.status(500).send("Server error");
  }
},

  /**
 * POST /qr/validate (GENERATOR only)
 * Body: { code: string }
 * Validates generic QR codes for the generator only, returns details, and invalidates one-time codes
 */
  async validate(req, res) {
    try {
      const { code } = req.body;
      console.log(`[QR Validate] Validating code: ${code} for user: ${req.userId}`);
      if (!code || typeof code !== "string") {
        return res
          .status(400)
          .json({ qr: null, message: "code (string) is required" });
      }
  
      const now = new Date();
  
      const result = await prisma.$transaction(async (tx) => {
        // Find the QR record
        const record = await tx.qrCode.findUnique({
          where: { code },
          select: {
            id: true,
            code: true,
            payload: true,
            type: true,
            oneTime: true,
            isValid: true,
            createdAt: true,
            validatedAt: true,
            expiresAt: true,
            createdBy: true,
            creator: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        });
        console.log('[QR Validate] Found record:', JSON.stringify(record, null, 2));
  
        if (!record) {
          throw { status: 404, message: "Invalid QR code" };
        }
  
        // Reject site/page QR codes
        if (record.type === "page") {
          throw {
            status: 400,
            message:
              "Page QR codes cannot be validated in-app. Scan with a mobile device to view the page.",
          };
        }
  
        // Validate ownership unless user has SCANNER or ADMIN role
        const canBypassOwnership = Array.isArray(req.roles) && (req.roles.includes("SCANNER") || req.roles.includes("ADMIN"));
        if (!canBypassOwnership && record.createdBy !== req.userId) {
          throw {
            status: 403,
            message: "Only the generator can validate this QR code",
          };
        }
  
        // Check validity and expiration
        if (!record.isValid) {
          throw {
            status: 400,
            message: "QR code is invalid or already used",
          };
        }
        if (record.expiresAt && record.expiresAt < now) {
          throw { status: 400, message: "QR code expired" };
        }
  
        let updated = record;
  
        // Invalidate if one-time
        if (record.oneTime) {
          // Atomically invalidate only if still valid to prevent race conditions
          const invalidate = await tx.qrCode.updateMany({
            where: { id: record.id, isValid: true },
            data: { isValid: false, validatedAt: now },
          });

          if (invalidate.count !== 1) {
            // Another concurrent validator already invalidated it
            throw { status: 400, message: "QR code is invalid or already used" };
          }

          // Record the scan after successful invalidation
          await tx.qrScan.create({
            data: {
              qrCodeId: record.id,
              userId: req.userId,
              scannedAt: now,
            },
          });

          // Re-read the latest state for response
          updated = await tx.qrCode.findUnique({
            where: { id: record.id },
            select: {
              id: true,
              code: true,
              payload: true,
              type: true,
              oneTime: true,
              isValid: true,
              createdAt: true,
              validatedAt: true,
              expiresAt: true,
              creator: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          });
        } else {
          // Non one-time: just record the scan
          await tx.qrScan.create({
            data: {
              qrCodeId: record.id,
              userId: req.userId,
              scannedAt: now,
            },
          });
        }
  
        return updated;
      });
  
      // Format human-readable response
      const humanReadable = {
        id: result.id,
        code: result.code,
        payload:
          typeof result.payload === "string"
            ? result.payload
            : result.payload?.content || "N/A",
        type: result.type,
        oneTime: result.oneTime,
        isValid: result.isValid,
        createdAt: result.createdAt.toISOString(),
        validatedAt: result.validatedAt
          ? result.validatedAt.toISOString()
          : null,
        expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
        creator: result.creator
          ? `${result.creator.firstName ?? ""} ${result.creator.lastName ?? ""}`.trim()
          : "Unknown",
      };
  
      const qr = {
        ...result,
        createdAt: result.createdAt?.toISOString?.() || null,
        validatedAt: result.validatedAt
          ? result.validatedAt.toISOString()
          : null,
        expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      };
  
      console.log(`[QR Validate] Validation successful for code: ${result.code}`);
      return res.status(200).json({
        qr,
        message: "QR code validated successfully",
        humanReadable,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ qr: null, message: err.message });
      }
      console.error("qr validate error:", err);
      return res.status(500).json({ qr: null, message: "Server error" });
    }
  },

  /**
 * POST /qr/scan-image (GENERATOR only)
 * Body: FormData with 'image' field (image file, e.g., PNG/JPEG)
 * Extracts and validates generic QR codes for the generator only
 */
async scanImage(req, res) {
  try {
    // Check if file is provided
    if (!req.file || !req.file.buffer) {
      console.error('[qr/scan-image] No file uploaded');
      return res.status(400).json({ qr: null, message: 'Image file is required' });
    }

    // Log file details
    console.log('[qr/scan-image] Uploaded file:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

    // Preprocess image with sharp: resize to 500x500, ensure RGBA
    const { data, info } = await sharp(req.file.buffer)
      .resize({ width: 500, height: 500, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toColorspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Log image details
    console.log('[qr/scan-image] Sharp output:', {
      width: info.width,
      height: info.height,
      channels: info.channels,
      size: data.length,
    });

    // Validate data length
    if (data.length !== info.width * info.height * info.channels) {
      console.error('[qr/scan-image] Invalid image data length:', {
        expected: info.width * info.height * info.channels,
        actual: data.length,
      });
      return res.status(400).json({ qr: null, message: 'Invalid image data' });
    }

    // Try jsQR first
    let qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (!qrCode || !qrCode.data) {
      console.warn('[qr/scan-image] jsQR failed, falling back to qrcode-reader');

      // Fallback to qrcode-reader with Jimp
      const jimpImage = await Jimp.read(req.file.buffer);
      const qr = new QrCode();
      const code = await new Promise((resolve, reject) => {
        qr.callback = (err, value) => {
          if (err) reject(err);
          resolve(value?.result);
        };
        qr.decode(jimpImage.bitmap);
      });
      if (!code) {
        console.error('[qr/scan-image] No QR code detected in image');
        return res.status(400).json({ qr: null, message: 'No QR code found in image' });
      }
      qrCode = { data: code };
    }

    const code = qrCode.data;
    console.log('[qr/scan-image] Detected QR code:', code);

    // Find QR code in database
    const record = await prisma.qrCode.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        payload: true,
        type: true,
        oneTime: true,
        isValid: true,
        createdAt: true,
        validatedAt: true,
        expiresAt: true,
        createdBy: true,
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!record) {
      console.error('[qr/scan-image] QR code not found in database:', code);
      return res.status(404).json({ qr: null, message: 'Invalid QR code' });
    }

    // Reject site/page QR codes
    if (record.type === 'page') {
      console.error('[qr/scan-image] Attempted to validate page QR code:', code);
      return res.status(400).json({
        qr: null,
        message: 'Page QR codes cannot be validated in-app. Scan with a mobile device to view the page.',
      });
    }

    // Handle generic QR codes (generator only)
    const canBypassOwnership = Array.isArray(req.roles) && (req.roles.includes('SCANNER') || req.roles.includes('ADMIN'));
    if (!canBypassOwnership && record.createdBy !== req.userId) {
      console.error('[qr/scan-image] Non-generator attempted validation:', { code, userId: req.userId });
      return res.status(403).json({ qr: null, message: 'Only the generator can validate this QR code' });
    }

    if (!record.isValid) {
      console.error('[qr/scan-image] QR code already invalid:', code);
      return res.status(400).json({ qr: null, message: 'QR code is invalid or already used' });
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      console.error('[qr/scan-image] QR code expired:', code);
      return res.status(400).json({ qr: null, message: 'QR code expired' });
    }

    // Record the scan
    await prisma.qrScan.create({
      data: {
        qrCodeId: record.id,
        userId: req.userId,
        scannedAt: new Date(),
      },
    });

    // Invalidate one-time generic QR codes
    let updated = record;
    if (record.oneTime) {
      updated = await prisma.qrCode.update({
        where: { code },
        data: { isValid: false, validatedAt: new Date() },
        select: {
          id: true,
          code: true,
          payload: true,
          type: true,
          oneTime: true,
          isValid: true,
          createdAt: true,
          validatedAt: true,
          expiresAt: true,
          creator: {
            select: { firstName: true, lastName: true },
          },
        },
      });
    }

    // Format human-readable response
    const humanReadable = {
      id: updated.id,
      code: updated.code,
      payload: typeof updated.payload === 'string' ? updated.payload : updated.payload?.content || 'N/A',
      type: updated.type,
      oneTime: updated.oneTime,
      isValid: updated.isValid,
      createdAt: updated.createdAt.toISOString(),
      validatedAt: updated.validatedAt ? updated.validatedAt.toISOString() : null,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      creator: updated.creator ? `${updated.creator.firstName} ${updated.creator.lastName}`.trim() : 'Unknown',
    };

    console.log('[qr/scan-image] Validation successful:', humanReadable);
    const qr = {
      ...updated,
      createdAt: updated.createdAt?.toISOString?.() || null,
      validatedAt: updated.validatedAt ? updated.validatedAt.toISOString() : null,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
    };
    return res.status(200).json({
      qr,
      message: 'QR code scanned successfully',
      humanReadable,
    });
  } catch (err) {
    console.error('[qr/scan-image] Error:', err);
    return res.status(500).json({ qr: null, message: `Failed to process image: ${err.message}` });
  }
},

    /**
 * GET /qr/history (GENERATOR only)
 * Returns all QR codes created by the user.
 */
async history(req, res) {
  try {
    console.log('[qr/history] User ID:', req.userId); // Debug log
    const generated = await prisma.qrCode.findMany({
      where: { createdBy: req.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        oneTime: true,
        isValid: true,
        createdAt: true,
        validatedAt: true,
        expiresAt: true,
        pageId: true,
        payload: true,
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const scanned = await prisma.qrScan.findMany({
      where: { userId: req.userId },
      orderBy: { scannedAt: 'desc' },
      select: {
        scannedAt: true,
        qrCode: {
          select: {
            id: true,
            type: true,
            oneTime: true,
            isValid: true,
            createdAt: true,
            validatedAt: true,
            expiresAt: true,
            pageId: true,
            payload: true,
            creator: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    const scannedHistory = scanned.map(scan => ({
      ...scan.qrCode,
      createdAt: scan.qrCode.createdAt?.toISOString?.() || null,
      validatedAt: scan.qrCode.validatedAt ? scan.qrCode.validatedAt.toISOString() : null,
      expiresAt: scan.qrCode.expiresAt ? scan.qrCode.expiresAt.toISOString() : null,
      scannedAt: scan.scannedAt?.toISOString?.() || null,
      scanned: true,
    }));

    const generatedHistory = generated.map(item => ({
      ...item,
      createdAt: item.createdAt?.toISOString?.() || null,
      validatedAt: item.validatedAt ? item.validatedAt.toISOString() : null,
      expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
      scanned: false,
      scannedAt: null,
    }));

    const items = [...generatedHistory, ...scannedHistory].sort((a, b) => {
      const dateA = a.scannedAt ?? a.createdAt;
      const dateB = b.scannedAt ?? b.createdAt;
      const tA = typeof dateA === 'string' ? Date.parse(dateA) : (dateA?.getTime?.() || 0);
      const tB = typeof dateB === 'string' ? Date.parse(dateB) : (dateB?.getTime?.() || 0);
      return tB - tA; // Compare as timestamps
    });

    return res.json({ items });
  } catch (err) {
    console.error('qr history error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
},

/**
 * GET /qr/history/:id (GENERATOR only)
 * Returns details of a specific QR code by ID.
 */
async getQrDetailsById(req, res) {
  try {
    console.log('[qr/:id] User ID:', req.userId, 'QR ID:', req.params.id); // Debug log
    const qrCode = await prisma.qrCode.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        code: true,
        type: true,
        oneTime: true,
        isValid: true,
        createdAt: true,
        expiresAt: true,
        validatedAt: true,
        pageId: true,
        payload: true,
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!qrCode) {
      return res.status(404).json({ message: 'QR code not found' });
    }

    const scan = await prisma.qrScan.findFirst({
      where: { qrCodeId: req.params.id, userId: req.userId },
    });

    if (qrCode.creator.id !== req.userId && !scan) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const response = {
      ...qrCode,
      scannedAt: scan ? scan.scannedAt.toISOString() : null,
      scanned: !!scan,
      ...(qrCode.type === 'page' && {
        url: typeof qrCode.payload === 'string' ? qrCode.payload : qrCode.payload?.content
      }),
      title: qrCode.payload?.title || (qrCode.type === 'page' ? 'Page QR Code' : 'QR Code'),
      isValid: qrCode.isValid ?? true,
      createdAt: qrCode.createdAt.toISOString(),
      expiresAt: qrCode.expiresAt ? qrCode.expiresAt.toISOString() : undefined,
      validatedAt: qrCode.validatedAt ? qrCode.validatedAt.toISOString() : undefined,
      payload: qrCode.payload,
    };

    return res.json(response);
  } catch (err) {
    console.error('QR code fetch error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
},

/**
 * DELETE /qr/history/:id
 * Removes a QR code history entry.
 */
async deleteHistory(req, res) {
  try {
    console.log('[qr/history/:id] User ID:', req.userId, 'QR ID:', req.params.id); // Debug log
    const { id } = req.params;

    const scan = await prisma.qrScan.findFirst({
      where: { qrCodeId: id, userId: req.userId },
    });

    if (scan) {
      await prisma.qrScan.delete({
        where: { id: scan.id },
      });
      return res.json({ message: 'Scanned history entry deleted successfully' });
    }

    const qrCode = await prisma.qrCode.findFirst({
      where: { id, createdBy: req.userId },
    });

    if (qrCode) {
      if (qrCode.pageId) {
        await prisma.contentBlock.deleteMany({
          where: { pageId: qrCode.pageId },
        });
        await prisma.qrPage.delete({
          where: { id: qrCode.pageId },
        });
      }

      await prisma.qrCode.delete({
        where: { id },
      });

      return res.json({ message: 'Generated QR code deleted successfully' });
    }

    return res.status(404).json({ message: 'History entry not found' });
  } catch (err) {
    console.error('qr deleteHistory error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
},
};

export default qrController;
