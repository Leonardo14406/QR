// src/controllers/qrController.js
import crypto from "crypto";
import prisma from "../../config/db.js";
import jsQR from "jsqr";
import sharp from "sharp";    
/**
 * Create a cryptographically-strong opaque code.
 * (Opaque token rather than embedding payload in the code itself.)
 */
function generateOpaqueCode(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
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
            select: { firstName: true, lastName: true },
          },
        },
      });

      // Ensure response send doesn't fail silently (e.g., serialization issues)
      try {
        return res.status(201).json({ qr: record });
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
        type: true,
        createdAt: true,
        pageId: true,
      },
    });

    // Build a full URL to the renderable HTML endpoint
    const rawBase = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const baseUrl = rawBase.replace(/\/+$/, "");
    const url = `${baseUrl}/qr/page/${page.id}`;

    try {
      return res.status(201).json({ 
        qr,
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
          style: block.style
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
              return `<h2 style="${block.style || ''}">${block.content}</h2>`;
            case 'paragraph':
              return `<p style="${block.style || ''}">${block.content}</p>`;
            case 'image':
              return `<img src="${block.content}" alt="${block.alt || ''}" style="${block.style || ''}" />`;
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
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ qr: null, message: 'code (string) is required' });
    }

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
        createdBy: true, // Include to check generator
        creator: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!record) {
      return res.status(404).json({ qr: null, message: 'Invalid QR code' });
    }

    // Reject site/page QR codes
    if (record.type === 'page') {
      return res.status(400).json({
        qr: null,
        message: 'Page QR codes cannot be validated in-app. Scan with a mobile device to view the page.',
      });
    }

    // Handle generic QR codes (generator only)
    if (record.createdBy !== req.userId) {
      return res.status(403).json({ qr: null, message: 'Only the generator can validate this QR code' });
    }

    if (!record.isValid) {
      return res.status(400).json({ qr: null, message: 'QR code is invalid or already used' });
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
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

    return res.status(200).json({
      qr: updated,
      message: 'QR code validated successfully',
      humanReadable,
    });
  } catch (err) {
    console.error('qr validate error:', err);
    return res.status(500).json({ qr: null, message: 'Server error' });
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
          select: { firstName: true, lastName: true },
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
    if (record.createdBy !== req.userId) {
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
    return res.status(200).json({
      qr: updated,
      message: 'QR code scanned successfully',
      humanReadable,
    });
  } catch (err) {
    console.error('[qr/scan-image] Error:', err);
    return res.status(500).json({ qr: null, message: `Failed to process image: ${err.message}` });
  }
},

    /**
     * GET /qr/history  (GENERATOR only)
     * Returns all qr codes created by the user.
     * Includes both "generic" and "page" types.
     */
    async history(req, res) {
  try {
    // Generated QR codes
    const generated = await prisma.qrCode.findMany({
      where: { createdBy: req.userId },
      orderBy: { createdAt: "desc" },
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
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Scanned QR codes
      const scanned = await prisma.qrScan.findMany({
        where: { userId: req.userId },
        orderBy: { scannedAt: "desc" },
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
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      // Format scanned codes to match generated codes
      const scannedHistory = scanned.map(scan => ({
        ...scan.qrCode,
        scannedAt: scan.scannedAt,
        scanned: true,
      }));

      // Mark generated codes and add scannedAt: null
      const generatedHistory = generated.map(item => ({
        ...item,
        scanned: false,
        scannedAt: null,
      }));

      // Combine and sort by date (createdAt or scannedAt)
      const items = [...generatedHistory, ...scannedHistory].sort((a, b) => {
        const dateA = a.scannedAt ?? a.createdAt;
        const dateB = b.scannedAt ?? b.createdAt;
        return dateB - dateA;
      });

      return res.json({ items });
    } catch (err) {
      console.error("qr history error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  },
  /**
   * GET /qr/:id  (GENERATOR only)
   * Returns details of a specific qr code by ID.
   */
  async getQrDetailsById(req, res) {
    try {
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

    // Check if the user is the creator or has scanned the QR code
    const scan = await prisma.qrScan.findFirst({
      where: { qrCodeId: req.params.id, userId: req.userId },
    });

    if (qrCode.creator.id !== req.userId && !scan) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Construct response to match QRCodeResponse
    const response = {
      ...qrCode,
      scannedAt: scan ? scan.scannedAt.toISOString() : null,
      scanned: !!scan,
      url: typeof qrCode.payload === 'string' ? qrCode.payload : qrCode.payload?.content,
      title: qrCode.payload?.title || (qrCode.type === 'page' ? 'Page QR Code' : 'URL QR Code'),
      isValid: qrCode.isValid ?? true,
      createdAt: qrCode.createdAt.toISOString(),
      expiresAt: qrCode.expiresAt ? qrCode.expiresAt.toISOString() : undefined,
      validatedAt: qrCode.validatedAt ? qrCode.validatedAt.toISOString() : undefined,
      payload: qrCode.payload,
    };

    return res.json(response);
  } catch (err) {
      console.error('QR code fetch error:', err);
      return res.status(500).json({ message: "Server error" });
    }
  },
  /**
 * DELETE /qr/history/:id
 * Removes a QR code history entry.
 * - If it's a scanned QR: deletes the qrScan record.
 * - If it's a generated QR: deletes the qrCode (and associated data).
 */
  async deleteHistory(req, res) {
    try {
      const { id } = req.params;

      // First check if the user scanned this QR
      const scan = await prisma.qrScan.findFirst({
        where: { qrCodeId: id, userId: req.userId },
      });

      if (scan) {
        await prisma.qrScan.delete({
          where: { id: scan.id },
        });
        return res.json({ message: "Scanned history entry deleted successfully" });
      }

      // Otherwise, check if the user generated this QR
      const qrCode = await prisma.qrCode.findFirst({
        where: { id, createdBy: req.userId },
      });

      if (qrCode) {
        // If it's a page QR, also delete the page + content blocks
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

        return res.json({ message: "Generated QR code deleted successfully" });
      }

      return res.status(404).json({ message: "History entry not found" });
    } catch (err) {
      console.error("qr deleteHistory error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
};

export default qrController;
