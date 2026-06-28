/**
 * Reset a user's password from the command line (there is no email-based reset
 * in this local app).
 *
 *   npm run reset-password -- you@example.com newpassword123
 */
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run reset-password -- <email> <newPassword>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });
  console.log(`Password updated for ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
