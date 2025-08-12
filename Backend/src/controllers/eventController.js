// eventController.js
import prisma from '../../config/db.js';

export async function getAllEvents(req, res) {
  const events = await prisma.event.findMany();
  res.json(events);
}

export async function getEventById(req, res) {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
}

export async function createEvent(req, res) {
  const { name, description, date, location } = req.body;
  const event = await prisma.event.create({
    data: { name, description, date: new Date(date), location }
  });
  res.status(201).json(event);
}

export async function updateEvent(req, res) {
  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(event);
}

export async function deleteEvent(req, res) {
  await prisma.event.delete({ where: { id: req.params.id } });
  res.json({ message: 'Event deleted' });
}
