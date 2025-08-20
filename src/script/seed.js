import bcrypt from "bcrypt";
import prisma from "../../config/db.js";
import supabase from "../../config/supabase.js";

async function seedAdmin() {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: "emmanuelleosamuel2003@gmail.com",
            password: "admin123"
        });
        if (error) {
            console.error("Error signing up admin:", error.message);
            return;
        }
        const hashedPassword = await bcrypt.hash("admin123", 10);
        // Create admin user in the database
        await prisma.user.create({
            data: {
                id: data.user.id,
                username: "admin",
                email: "emmanuelleosamuel2003@gmail.com",
                name: "Admin",
                password: hashedPassword,
                role: "ADMIN",
            }
        });
        console.log("Admin user created successfully");
    } catch (error) {
        console.error("Error creating admin user:", error);
    } finally {
        await prisma.$disconnect();
    }
}

seedAdmin();