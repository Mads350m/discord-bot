const { REST, Routes, SlashCommandBuilder } = require("discord.js");

// No dotenv required in Replit — Replit loads secrets automatically

// Define the /enlist command
const commands = [
  {
    name: "enlist",
    description: "Enlist a new user to the roster",
    options: [
      {
        name: "userid",
        description: "The user to enlist",
        type: 6, // USER
        required: true
      }
    ]
  },
  {
    name: "getservermembers",
    description: "Import all current Discord users to the Sheets roster"
  },
  {
    name: "runpromotions",
    description: "Promote users who meet rank requirements or are manually flagged"
  },
  {
    name: "adduser",
    description: "Add or update a user in the Sheets roster based on Discord info",
    options: [
      {
        name: "userid",
        description: "The user to add or update",
        type: 6, // USER
        required: true
      }
    ]
  }
];

// Pull secrets directly from Replit environment
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Create REST client and deploy command
const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
  
})();

