import prisma from "../../config/db.js";
import QRCode from "qrcode";


//generate a unique token for the ticket
const generateToken = () => {
    return Math.random.toString(36).substring(2)+Date.now().toString(36);
}

export const createTicketAndGenerateQrCode = async (req, res) => {
    try {
        const { eventId } = req.body;
        if(!eventId) {
            return res.status(400).json({ error: "Event ID is required" });
        }
        const token = generateToken();

       const ticket = await prisma.ticket.create({
           data: {
               token,
               eventId,
               isValid: true
           }
       })
       // generate qr code as a data url
       const qrCodeUrl = await QRCode.toDataURL(token);

       return res.status(200).json({ ticket, qrCodeUrl });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to generate ticket" });
    }
}

export const validateTicket = async(req, res) => {
    try {
        const { token } = req.body;
        if(!token) {
            return res.status(400).json({ error: "Token is required" });
        }
        // find ticket by token
        const ticket = await prisma.ticket.findUnique({
            where: {
                token
            }
        })
        if(!ticket) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        if(!ticket.isValid) {
            return res.status(400).json({ error: "Ticket is already used" });
        }
        // update ticket to be invalid
        await prisma.ticket.update({
            where: {
                token
            },
            data: {
                isValid: false
            }
        })
        return res.status(200).json({ message: "Ticket validated successfully", ticket });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to validate ticket" });
    }
}

export const approveTicket = async (req, res) => {
    try {
        const { userId, eventId, quantity = 1 } = req.body; // Defaults to 1 ticket if quantity not specified
        if (!userId || !eventId) {
          return res.status(400).json({ error: 'userId and eventId are required' });
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
          return res.status(400).json({ error: 'quantity must be a positive integer' });
        }
    
        // Check if user and event exist
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const event = await prisma.event.findUnique({ where: { id: parseInt(eventId) } });
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        if (!event) {
          return res.status(404).json({ error: 'Event not found' });
        }
    
        // Create multiple tickets
        const tickets = [];
        for (let i = 0; i < quantity; i++) {
          const token = generateToken();
          const ticket = await prisma.ticket.create({
            data: {
              token,
              eventId: parseInt(eventId),
              userId,
              isValid: true,
            },
          });
          tickets.push(ticket);
        }
    
        return res.status(200).json({ 
          message: `Approved ${quantity} ticket(s) for user ${userId}`, 
          tickets,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to approve ticket purchase' });
      }
}

export const getTicketByUserId = async (req, res) => {
    try {
        const userId = req.user.id; 
    
        // Fetch tickets for the logged-in user
        const tickets = await prisma.ticket.findMany({
          where: { userId },
          include: { event: true }, 
        });
    
        // Generate QR codes on demand for each ticket
        const ticketsWithQr = await Promise.all(tickets.map(async (ticket) => {
          const qrCodeUrl = await QRCode.toDataURL(ticket.token);
          return { ...ticket, qrCodeUrl };
        }));
    
        return res.status(200).json(ticketsWithQr);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to fetch tickets' });
      }
}