import prisma from "../../config/db.js";

export const createEvent = async (req, res) => {
    try {
        const { name, description, startTime, location, date } = req.body;
        if(!name || !date || !description || !startTime || !location) {
            return res.status(400).json({ error: "Name, description, start time, location, and date are required" });
        }
        const event = await prisma.event.create({
            data: {
                name,
                description,
                startTime,
                location,
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
        const events = await prisma.event.findMany({
           orderBy: {
            date: "asc"
           }
        });
        return res.status(200).json({ events });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to get events" });
    }
}
