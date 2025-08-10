import prisma from "../config/db.js";

export const createEvent = async (req, res) => {
    try {
        const { name, date } = req.body;
        if(!name || !date) {
            return res.status(400).json({ error: "Name and date are required" });
        }
        const event = await prisma.event.create({
            data: {
                name,
                date
            }
        })
        return res.status(200).json({ event });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to create event" });
    }
}

export const getEvents = async (req, res) => {
    try {
        const events = await prisma.event.findMany();
        return res.status(200).json({ events });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to get events" });
    }
}
