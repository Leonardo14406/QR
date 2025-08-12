import prisma from "../../config/db.js";
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';

const STATIC_BRACELET_DIR = path.resolve('./public/bracelets'); // or your preferred static folder

// Helper to generate static HTML page for bracelet
async function generateStaticPage({ slug, title, description, imagePath, designJson }) {
  // Simplified example: build HTML content using designJson
  const style = designJson
    ? `
      body { background-color: ${designJson.backgroundColor || '#fff'}; font-family: ${designJson.font || 'Arial'}; color: ${designJson.color || '#000'}; }
    `
    : 'body { background-color: #fff; font-family: Arial; color: #000; }';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>${title}</title><style>${style}</style></head>
    <body>
      <h1>${title}</h1>
      <p>${description || ''}</p>
      ${imagePath ? `<img src="${imagePath}" alt="Bracelet Image" style="max-width: 100%; height: auto;" />` : ''}
    </body>
    </html>
  `;

  await fs.mkdir(STATIC_BRACELET_DIR, { recursive: true });
  const filePath = path.join(STATIC_BRACELET_DIR, `${slug}.html`);
  await fs.writeFile(filePath, html, 'utf8');
  return `/bracelets/${slug}.html`;
}

// Create Bracelet (Admin only)
export async function createBracelet(req, res) {
  try {
    const { title, description, imagePath, designJson } = req.body;
    const adminId = req.user.id;

    // Generate a unique slug (can use nanoid for brevity)
    const slug = nanoid(10);

    // Create bracelet record in DB
    const bracelet = await prisma.bracelet.create({
      data: {
        title,
        description,
        imagePath,
        designJson,
        slug,
        createdById: adminId,
      },
    });

    // Generate static HTML page for the bracelet
    const publicUrl = await generateStaticPage({ slug, title, description, imagePath, designJson });

    // Update bracelet record with publicUrl
    await prisma.bracelet.update({
      where: { id: bracelet.id },
      data: { publicUrl },
    });

    res.json({ bracelet, publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating bracelet' });
  }
}

// List Bracelets for Admin
export async function listBracelets(req, res) {
  try {
    const adminId = req.user.id;

    const bracelets = await prisma.bracelet.findMany({
      where: { createdById: adminId },
    });

    res.json(bracelets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching bracelets' });
  }
}

// Serve Bracelet Static Page (Public)
export async function serveBraceletPage(req, res) {
  try {
    const { slug } = req.params;

    // Serve the static HTML file from public folder
    const filePath = path.resolve(`./public/bracelets/${slug}.html`);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send('Bracelet page not found');
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}