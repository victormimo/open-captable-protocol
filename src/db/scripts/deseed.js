import { deseedDatabase } from "../../tests/integration/utils.ts";
import readline from "readline";
import chalk from "chalk";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const runDeseed = async () => {
    try {
        console.warn(chalk.yellow(`⚠️  Are you sure that you want to deseed the following DB: ${process.env.DATABASE_URL}? (y/n)`));
        rl.question("", async (answer) => {
            if (answer.toLowerCase() === "y") {
                await deseedDatabase();
                console.log(chalk.green("✅ Database deseeded successfully."));
            } else {
                console.log(chalk.red("❌ Deseeding aborted."));
            }
            rl.close();
        });
    } catch (err) {
        console.log(chalk.red("❌ Oops! Something went wrong while trying to deseed the database:"), err);
        rl.close();
    }
};

runDeseed();
