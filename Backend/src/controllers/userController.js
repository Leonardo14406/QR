import supabase from "../../config/supabase.js";
import prisma from "../../config/db.js";
import bcrypt from "bcrypt";

export const signUpUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });
        if (error) {
            return res.status(400).json({ error: error.message });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

     await prisma.user.create({
            data: {
                email,
                hashedPassword,
                role: "USER"
            }
        })
        return res.status(200).json({ user: data.user, message: "User signed up successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to sign up user", error: error.message });
    }
}

export const signInUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ user: data.user, token: data.session.access_token });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to sign in user", error: error.message });
    }
}

export const updateToAdminRole = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await prisma.user.findUnique({
            where: {
                email
            }
        })

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const updatedUser = await prisma.user.update({
            where: {
                email
            },
            data: {
                role: "ADMIN"
            }
        })
        return res.status(200).json({ user:updatedUser, message: "User updated to admin role" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to update user role", error: error.message });
    }
}