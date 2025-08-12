import prisma from "../../config/db.js";
import QRCode from "qrcode";
import cuid from "cuid"; // For generating unique codes

// Create Ticket (Admin only)
export async function createTicket(req, res) {
  try {
    const { eventId, assignedToId, metadata } = req.body;
    const adminId = req.user.id;

    // Validate event exists
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Generate a unique code for QR content 
    const code = cuid();

    // For simplicity, we embed only the code in the QR code
    const qrCodeData = code;

    // Generate QR code PNG data URL
    const qrCodeUrl = await QRCode.toDataURL(qrCodeData);

    // Create ticket in DB
    const ticket = await prisma.ticket.create({
      data: {
        code,
        eventId,
        assignedToId: assignedToId || null,
        createdById: adminId,
        metadata: metadata || null,
      },
      include: {
        event: true,
        assignedTo: true,
      },
    });

    res.json({ ticket, qrCodeUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating ticket' });
  }
}

// Get Tickets for User or Admin
export async function getTickets(req, res) {
  try {
    const user = req.user;
    let tickets;

    if (user.role === 'ADMIN') {
      // Admin sees all tickets created by them
      tickets = await prisma.ticket.findMany({
        where: { createdById: user.id },
        include: { event: true, assignedTo: true },
      });
    } else {
      // Ordinary user sees tickets assigned to them
      tickets = await prisma.ticket.findMany({
        where: { assignedToId: user.id },
        include: { event: true, assignedTo: true },
      });
    }

    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching tickets' });
  }
}

// Get Ticket by code (authenticated)
export async function getTicketByCode(req, res) {
  try {
    const { code } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { code },
      include: { event: true, assignedTo: true },
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Authorization: ordinary users can only see their own tickets
    if (req.user.role !== 'ADMIN' && ticket.assignedToId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching ticket' });
  }
}

// Validate & Invalidate Ticket (Admin only)
export async function validateTicket(req, res) {
  try {
    const { code } = req.params;

    const ticket = await prisma.ticket.findUnique({ where: { code } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!ticket.valid) return res.status(400).json({ error: 'Ticket already used' });

    // Mark ticket as invalid and record scannedAT
    const updated = await prisma.ticket.update({
      where: { code },
      data: { valid: false, scannedAT: new Date() },
    });

    res.json({ message: 'Ticket validated and invalidated', ticket: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error validating ticket' });
  }
}
