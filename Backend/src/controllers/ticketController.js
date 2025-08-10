import prisma from "../config/db.js";
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