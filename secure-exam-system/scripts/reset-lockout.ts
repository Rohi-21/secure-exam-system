import { prisma } from "../lib/db";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

async function reset() {
  await prisma.user.updateMany({
    data: {
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
    },
  });
  console.log("✅ All user accounts unlocked and failed attempt counters reset to 0.");
}

reset()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
