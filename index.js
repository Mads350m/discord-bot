// 1. Setup
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const creds = require("./credentials.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// 2. Ready
client.once("ready", () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
});

// 3. Slash Command Handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const SHEET_ID = "1Qp8GrvR4hfCsJRnPHMDQUn2ckPLaWBuqZtzgf5UvSm4";
  const SHEET_NAME = "Roster";
  const GENERAL_CHANNEL_ID = "1363580534290382982";
  const ANNOUNCEMENT_CHANNEL_ID = "1365233230663385151";
  const BOTLOGS_CHANNEL_ID = "1374447452362510336";

  // === /enlist ===
  if (interaction.commandName === "enlist") {
    const ADMIN_ROLE = "Admin";
    const VERIFIED_ROLE = "Verified";
    const ENLIST_CHANNEL = "enlistment";
    const START_RANK = "Rekrut";
    const NEXT_RANK = "Gemeiner Reiter";
    const NEXT_RANK_POINTS = 20;

    try {
      await interaction.deferReply({ flags: 1 << 6 }); // Defer immediately, make ephemeral
      const channel = interaction.channel;
      const author = interaction.member;
      const targetUser = interaction.options.getUser("userid");
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      if (channel.name !== ENLIST_CHANNEL) {
        return interaction.reply({ content: "❌ Use this command in #enlistment only.", ephemeral: true });
      }

      if (!author.roles.cache.some(r => r.name === ADMIN_ROLE)) {
        return interaction.reply({ content: "❌ Only admins can use this command.", ephemeral: true });
      }

      if (!targetMember.roles.cache.some(r => r.name === VERIFIED_ROLE)) {
        return interaction.reply({ content: "❌ That user isn't verified.", ephemeral: true });
      }

      const robloxName = targetMember.nickname || targetUser.username;

      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];

      await sheet.addRow({
        RobloxUsername: robloxName,
        DiscordUserID: targetUser.id,
        OldRank: START_RANK,
        NewRank: NEXT_RANK,
        CurrentPoints: 0,
        NextRankPoints: NEXT_RANK_POINTS,
        PointsDiff: NEXT_RANK_POINTS,
        Kills: 0,
        Deaths: 0,
        Battles: 0
      });

      const extraRoles = [
        START_RANK,
        "4. Geschwader",
        "Regiment Königin-Dragoner",
        "ㅤㅤㅤㅤㅤGeschwaderㅤㅤㅤㅤㅤ"
      ];

      for (const roleName of extraRoles) {
        const role = interaction.guild.roles.cache.find(r => r.name.trim().toLowerCase() === roleName.trim().toLowerCase());
        if (role) {
          await targetMember.roles.add(role).catch(() => {});
        } else {
          console.warn(`⚠️ Role not found: "${roleName}"`);
        }
      }

      await targetMember.setNickname(robloxName).catch(() => {});
      await interaction.editReply({ content: `✅ <@${targetUser.id}> has been added to the roster as ${START_RANK}.` });

      const generalChannel = interaction.guild.channels.cache.get(GENERAL_CHANNEL_ID);
      if (generalChannel && generalChannel.isTextBased()) {
        generalChannel.send(`Welcome to the regiment <@${targetUser.id}>, you've been assigned as ${START_RANK}!`);
      }
    } catch (err) {
      console.error("❌ Error handling /enlist:", err);
      interaction.reply({ content: "⚠️ Something went wrong while enlisting this user.", ephemeral: true });
    }
  }

  // === /adduser ===
  if (interaction.commandName === "adduser") {
    try {
      const targetUser = interaction.options.getUser("userid");
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      const robloxName = targetMember.nickname || targetUser.username;

      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      // Extract valid ranks from column L
      const rankSet = new Set();
      for (const row of rows) {
        const rank = row._rawData[11]; // Column L
        if (rank) rankSet.add(rank);
      }

      // Find user's highest matching rank role
      const matchingRank = targetMember.roles.cache.find(r =>
        [...rankSet].some(validRank => validRank.trim().toLowerCase() === r.name.trim().toLowerCase())
      );

      const selectedRank = matchingRank ? matchingRank.name : "Rekrut";

      const existingRow = rows.find(row => row.DiscordUserID === targetUser.id);

      if (existingRow) {
        existingRow.RobloxUsername = robloxName;
        existingRow.OldRank = selectedRank;
        await existingRow.save();
        await interaction.reply({ content: `🔄 Updated <@${targetUser.id}> in the sheet.`, ephemeral: true });
      } else {
        await sheet.addRow({
          RobloxUsername: robloxName,
          DiscordUserID: targetUser.id,
          OldRank: selectedRank,
          NewRank: selectedRank,
          CurrentPoints: 0,
          NextRankPoints: 0,
          PointsDiff: 0,
          Kills: 0,
          Deaths: 0,
          Battles: 0
        });
        await interaction.reply({ content: `✅ Added <@${targetUser.id}> to the sheet as ${selectedRank}.`, ephemeral: true });
      }
    } catch (err) {
      console.error("❌ Error handling /adduser:", err);
      await interaction.reply({ content: "⚠️ Failed to add or update user.", ephemeral: true });
    }
  }

  // === /getservermembers ===
  if (interaction.commandName === "getservermembers") {
    const HIGHCOMMAND_ROLE = "highcode";
    if (!interaction.member.roles.cache.some(r => r.name === HIGHCOMMAND_ROLE)) {
      return interaction.reply({ content: "❌ You must be in HighCode to use this command.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const rankMap = {};
      const rankOrder = [];

      for (const row of rows) {
        const rank = row._rawData[11]; // Column L
        const points = row._rawData[12]; // Column M
        if (rank) {
          rankOrder.push(rank);
          if (points !== "N/A" && points !== undefined && points !== "") {
            rankMap[rank] = Number(points);
          }
        }
      }

      const members = await interaction.guild.members.fetch();
      const memberList = [...members.values()];
      const total = memberList.length;
      let added = 0;

      for (let i = 0; i < total; i++) {
        const member = memberList[i];
        const rankRole = member.roles.cache.find(role => Object.keys(rankMap).includes(role.name));
        if (!rankRole) continue;

        const robloxName = member.nickname || member.user.username;
        const oldRank = rankRole.name;
        const currentIndex = rankOrder.indexOf(oldRank);
        const newRank = rankOrder[currentIndex + 1] || oldRank;
        const nextPoints = rankMap[newRank] || 0;

        await sheet.addRow({
          RobloxUsername: robloxName,
          DiscordUserID: member.user.id,
          OldRank: oldRank,
          NewRank: newRank,
          CurrentPoints: 0,
          NextRankPoints: nextPoints,
          PointsDiff: nextPoints,
          Kills: 0,
          Deaths: 0,
          Battles: 0
        });

        added++;

        if (added % 5 === 0 || i === total - 1) {
          await interaction.editReply({ content: `📦 Importing members... ${added}/${total} done` });
        }

        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      await interaction.editReply({ content: `✅ Imported ${added} members to the sheet from the server.` });
    } catch (err) {
      console.error("❌ Error during /getservermembers:", err);
      await interaction.editReply({ content: "⚠️ Something went wrong while importing members." });
    }
  }
  
  // === /runpromotions ===
  if (interaction.commandName === "runpromotions") {
    const HIGHCOMMAND_ROLE = "highcode";

    if (!interaction.member.roles.cache.some(r => r.name === HIGHCOMMAND_ROLE)) {
      return interaction.reply({
        content: "❌ Only members of HighCode can run promotions.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();

      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const rankMap = [];

      for (const row of rows) {
        const rank = row._rawData[11]; // Column L: Rank name
        const points = row._rawData[12]; // Column M: Points required
        if (rank && points && !isNaN(Number(points)) || points === "N/A") {
          rankMap.push({ rank, points });
        }
      }

      const promotions = [];

      for (const row of rows) {
        const userId = row.DiscordUserID;
        const oldRank = row.OldRank;
        const currentPoints = Number(row.CurrentPoints || 0);
        const manualPromotion = (row.ManualPromotion || "").toLowerCase() === "yes";

        if (!userId || !oldRank) continue;

        const currentIndex = rankMap.findIndex(r => r.rank === oldRank);
        if (currentIndex === -1) continue;

        const nextIndex = currentIndex + 1;
        if (!rankMap[nextIndex]) continue;

        const nextRank = rankMap[nextIndex].rank;
        const nextPointsReq = rankMap[nextIndex].points;

        if (nextPointsReq === "N/A" && !manualPromotion) continue;

        const numericRequirement = Number(nextPointsReq);

        const eligible =
          manualPromotion ||
          (!isNaN(numericRequirement) && currentPoints >= numericRequirement);

        // Always update next rank info (even if not promoted)
        row.NextRank = nextRank;
        row.NextRankPoints = isNaN(numericRequirement) ? 0 : numericRequirement;

        // If eligible, promote
        if (eligible) {
          promotions.push({
            userId,
            oldRank,
            newRank: nextRank,
          });

          row.OldRank = row.NewRank;
          row.NewRank = nextRank;
          row.PointsDiff = isNaN(numericRequirement)
            ? 0
            : numericRequirement - currentPoints;
          row.ManualPromotion = ""; // Reset manual flag
        }

        // Save the row regardless
        await row.save();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Throttle writes to avoid rate limit
      }

      const logChannel = interaction.guild.channels.cache.get(BOTLOGS_CHANNEL_ID);
      const announceChannel = interaction.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
      const timestamp = new Date().toLocaleString();

      if (promotions.length > 0) {
        // Apply Discord role changes
        for (const { userId, oldRank, newRank } of promotions) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) continue;

          const oldRole = interaction.guild.roles.cache.find(r => r.name === oldRank);
          const newRole = interaction.guild.roles.cache.find(r => r.name === newRank);

          try {
            if (oldRole && member.roles.cache.has(oldRole.id)) {
              await member.roles.remove(oldRole);
            }
            if (newRole && !member.roles.cache.has(newRole.id)) {
              await member.roles.add(newRole);
            }
          } catch (e) {
            console.warn(`Role update failed for ${userId}:`, e.message);
          }
        }

        // Announce promotions
        const lines = promotions.map(
          p => `<:horsie:1367555119377551510> ${p.oldRank} → ${p.newRank}  [] <@${p.userId}>`
        ).join("\n");

        const announcement = `# 🌿 TO BE RAISED TO THE RANKS OF:\nThis week's dragoon promotions\n\n${lines}\n\nGood job everyone, keep up the good work!\n<@&1364050038623309886>`;

        if (announceChannel?.isTextBased()) {
          await announceChannel.send(announcement);
        }

        // Log summary
        if (logChannel?.isTextBased()) {
          const logMsg = `📅 Promotions run on ${timestamp}:\n` +
            promotions.map(p => `<@${p.userId}>: ${p.oldRank} → ${p.newRank}`).join("\n");
          await logChannel.send(logMsg);
        }

        await interaction.editReply({ content: `✅ ${promotions.length} users promoted.` });
      } else {
        await interaction.editReply({ content: `ℹ️ No eligible users for promotion.` });
        if (logChannel?.isTextBased()) {
          await logChannel.send(`📅 /runpromotions executed on ${timestamp} — No promotions.`);
        }
      }
    } catch (err) {
      console.error("❌ Error in /runpromotions:", err);
      await interaction.editReply({ content: "⚠️ Failed to process promotions." });
    }
  }


});
// 4. Login
client.login(process.env.DISCORD_TOKEN);