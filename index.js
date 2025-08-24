// 1. Setup
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDS, "base64").toString("utf8")
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"]
});

const reactionRolesConfig = {
  "1381632311992258755": {
    "✅": "Freikorps Infantry",
  },
  "1381635539169706044": {
    "✅": "Freikorps Cavalry",
  }
};

// 2. Ready
client.once("ready", async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  const channelsToWatch = [
    { channelId: "1381063009622819006", messageId: "1381632311992258755" }, // Fuß
    { channelId: "1381063055332343969", messageId: "1381635539169706044" }  // Pferd
  ];

  for (const { channelId, messageId } of channelsToWatch) {
    try {
      console.log(`🔍 Attempting to fetch channel ${channelId}`);
      const channel = await client.channels.fetch(channelId);

      if (!channel) {
        console.warn(`⚠️ Channel ${channelId} not found.`);
        continue;
      }

      if (channel?.isTextBased()) {
        console.log(`🗃️ Attempting to fetch message ${messageId} in ${channelId}`);
        const msg = await channel.messages.fetch(messageId);
        console.log(`📥 Cached message ${msg.id} in channel ${channelId}`);
      } else {
        console.warn(`⚠️ Channel ${channelId} is not text-based`);
      }
    } catch (err) {
      console.warn(`❌ Failed to fetch message ${messageId} in ${channelId}: ${err.message}`);
    }
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    console.log("🔔 messageReactionAdd triggered");

    if (reaction.partial) {
      console.log("📦 Reaction is partial, fetching...");
      await reaction.fetch();
    }
    if (reaction.message.partial) {
      console.log("📦 Message is partial, fetching...");
      await reaction.message.fetch();
    }

    if (user.bot) {
      console.log("🤖 Ignored bot reaction");
      return;
    }

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;

    console.log(`👤 ${user.tag} reacted with "${emoji}" on message ${messageId}`);

    const roleName = reactionRolesConfig[messageId]?.[emoji];
    if (!roleName) return console.log(`❌ Reaction on non-watched message: ${messageId}`);

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const roleToGive = guild.roles.cache.find(r => r.name === roleName);
    const unassignedRole = guild.roles.cache.find(r => r.name === "Unassigned");

    console.log(`🔎 Trying to give role: ${roleName}`);
    if (!roleToGive) {
      return console.warn(`❌ Role "${roleName}" not found in guild.`);
    }

    if (!member.roles.cache.has(roleToGive.id)) {
      console.log(`➕ Adding role ${roleToGive.name} to ${member.user.tag}`);
      await member.roles.add(roleToGive).catch(err => console.error("❌ Failed to add role:", err));
    } else {
      console.log(`ℹ️ Member already has the role ${roleToGive.name}`);
    }

    if (unassignedRole && member.roles.cache.has(unassignedRole.id)) {
      console.log(`➖ Removing Unassigned role from ${member.user.tag}`);
      await member.roles.remove(unassignedRole).catch(err => console.error("❌ Failed to remove Unassigned role:", err));
    } else {
      console.log(`ℹ️ No Unassigned role to remove or member doesn't have it`);
    }
  } catch (err) {
    console.error("❌ Error in messageReactionAdd:", err);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    console.log("🔕 messageReactionRemove triggered");

    if (reaction.partial) {
      console.log("📦 Reaction is partial, fetching...");
      await reaction.fetch();
    }
    if (reaction.message.partial) {
      console.log("📦 Message is partial, fetching...");
      await reaction.message.fetch();
    }

    if (user.bot) {
      console.log("🤖 Ignored bot reaction");
      return;
    }

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;

    console.log(`👤 ${user.tag} removed "${emoji}" reaction from message ${messageId}`);

    const roleName = reactionRolesConfig[messageId]?.[emoji];
    if (!roleName) {
      console.log(`❌ Reaction removed from untracked message: ${messageId}`);
      return;
    }

    const roleToRemove = guild.roles.cache.find(r => r.name === roleName);
    if (!roleToRemove) {
      console.log(`⚠️ Role "${roleName}" not found in server.`);
      return;
    }

    if (member.roles.cache.has(roleToRemove.id)) {
      await member.roles.remove(roleToRemove);
      console.log(`🗑️ Removed role "${roleName}" from ${user.tag}`);
    } else {
      console.log(`ℹ️ ${user.tag} does not have role "${roleName}"`);
    }
  } catch (err) {
    console.error("❌ Error in messageReactionRemove:", err);
  }
});

// ---- helper: load canonical rank ladder from columns L:M ----
async function loadRankLadder(sheet) {
  await sheet.loadCells('L1:M100'); // adjust if your list is longer

  const rankOrder = [];
  const rankPoints = {};

  for (let r = 1; r <= 100; r++) {
    const rankCell = sheet.getCell(r - 1, 11); // column L
    const ptsCell  = sheet.getCell(r - 1, 12); // column M

    const rank = (rankCell?.value ?? '').toString().trim();
    const raw = (ptsCell?.value ?? '').toString().trim();

    if (!rank) continue;
    if (rankOrder.includes(rank)) continue;

    const points = raw.toUpperCase?.() === 'N/A'
      ? 'N/A'
      : (raw ? Number(raw) : 0);

    rankOrder.push(rank);
    rankPoints[rank] = points;
  }

  if (rankOrder.length === 0) {
    throw new Error('Rank ladder not found in columns L:M');
  }

  return { rankOrder, rankPoints };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveRowWithRetry(row) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await row.save();
      return;
    } catch (err) {
      // Back off on quota errors and retry
      if (String(err?.message || '').includes('Quota exceeded') || String(err?.message || '').includes('[429]')) {
        const delay = Math.min(15000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
        await sleep(delay);
        continue;
      }
      throw err; // non-quota error -> bubble up
    }
  }
  throw new Error('Gave up saving row after repeated 429s');
}

// helper setter: marks row as 'changed' only when needed
function setIfChanged(row, key, value, changedRef) {
  const prev = row[key];
  if ((prev ?? '') !== (value ?? '')) {
    row[key] = value;
    changedRef.changed = true;
  }
}

// 3. Slash Command Handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const options = interaction.options;

  const SHEET_ID = "1Qp8GrvR4hfCsJRnPHMDQUn2ckPLaWBuqZtzgf5UvSm4";
  const SHEET_NAME = "Roster";
  const GENERAL_CHANNEL_ID = "1363580534290382982";
  const ANNOUNCEMENT_CHANNEL_ID = "1365233230663385151";
  const BOTLOGS_CHANNEL_ID = "1374447452362510336";

  // === /enlist ===
  if (commandName === "enlist") {
    const ADMIN_ROLE = "Admin";
    const VERIFIED_ROLE = "Verified";
    const ENLIST_CHANNEL = "enlistment";
    const START_RANK = "Rekrut";
    const NEXT_RANK = "Gemeiner Reiter";
    const NEXT_RANK_POINTS = 20;

    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      const author = interaction.member;
      const targetUser = options.getUser("userid");
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      if (channel.name !== ENLIST_CHANNEL) {
        return interaction.editReply({ content: "❌ Use this command in #enlistment only." });
      }

      if (!author.roles.cache.some(r => r.name === ADMIN_ROLE)) {
        return interaction.editReply({ content: "❌ Only admins can use this command." });
      }

      if (!targetMember.roles.cache.some(r => r.name === VERIFIED_ROLE)) {
        return interaction.editReply({ content: "❌ That user isn't verified." });
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
        "Unassigned",
        "Cavalry Corp",
        "ㅤㅤㅤㅤㅤDesignationㅤㅤㅤㅤㅤ"
      ];

      for (const roleName of extraRoles) {
        const role = interaction.guild.roles.cache.find(r => r.name.trim().toLowerCase() === roleName.trim().toLowerCase());
        if (role) {
          await targetMember.roles.add(role).catch(() => {});
        }
      }

      await targetMember.setNickname(robloxName).catch(() => {});
      await interaction.editReply({ content: `✅ <@${targetUser.id}> has been added to the roster as ${START_RANK}.` });

      const generalChannel = interaction.guild.channels.cache.get(GENERAL_CHANNEL_ID);
      if (generalChannel?.isTextBased()) {
        generalChannel.send(`Welcome to the regiment <@${targetUser.id}>, you've been assigned as ${START_RANK}!`);
      }
    } catch (err) {
      console.error("❌ Error handling /enlist:", err);
      await interaction.editReply({ content: "⚠️ Something went wrong while enlisting this user." });
    }
  }

  // === /adduser ===
  if (commandName === "adduser") {
    try {
      const targetUser = options.getUser("userid");
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      const robloxName = targetMember.nickname || targetUser.username;

      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const rankSet = new Set();
      for (const row of rows) {
        const rank = row._rawData[11]; // Column L
        if (rank) rankSet.add(rank);
      }

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
  if (commandName === "getservermembers") {
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

        await sleep(1200);
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

      // ✅ Build canonical rank ladder from the dedicated rank table in columns L:M only
      await sheet.loadCells('L1:M100'); // adjust if your list is longer
      const rankOrder = [];
      const rankPoints = {}; // { rankName: number | "N/A" }

      for (let r = 1; r <= 100; r++) {
        const rankCell = sheet.getCell(r - 1, 11); // L (0-based index 11)
        const ptsCell  = sheet.getCell(r - 1, 12); // M (0-based index 12)

        const rank = (rankCell?.value ?? '').toString().trim();
        const raw  = (ptsCell?.value ?? '').toString().trim();

        if (!rank) continue;                    // skip blanks
        if (rankOrder.includes(rank)) continue; // skip duplicates

        const points = raw.toUpperCase?.() === 'N/A'
          ? 'N/A'
          : (raw ? Number(raw) : 0);

        rankOrder.push(rank);
        rankPoints[rank] = points;
      }

      const promotions = [];

      for (const row of rows) {
        const userId = row.DiscordUserID;
        const oldRank = (row.OldRank || '').trim();
        const currentPoints = Number(row.CurrentPoints || 0);
        const manualPromotion = (row.ManualPromotion || "").toLowerCase() === "yes";

        if (!userId || !oldRank) continue;

        const currentIndex = rankOrder.indexOf(oldRank);
        if (currentIndex === -1) continue;

        const nextIndex = currentIndex + 1;
        const nextRank = rankOrder[nextIndex] || oldRank; // if at top, stay
        const nextReq = rankPoints[nextRank];

        // Manual-only next rank (no flag) → just update "what's next" and skip saving if unchanged
        if (nextReq === "N/A" && !manualPromotion) {
          const changed = { changed: false };
          setIfChanged(row, 'NextRank', nextRank, changed);
          setIfChanged(row, 'NextRankPoints', 0, changed);
          setIfChanged(row, 'PointsDiff', 0, changed);

          if (changed.changed) {
            await saveRowWithRetry(row);
            await sleep(1200);
          }
          continue;
        }

        const numericRequirement = Number(nextReq);
        const eligible =
          manualPromotion ||
          (!isNaN(numericRequirement) && currentPoints >= numericRequirement);

        // Update fields & save ONLY if changed
        const nextReqNum = isNaN(numericRequirement) ? 0 : numericRequirement;

        const changed = { changed: false };
        setIfChanged(row, 'NextRank', nextRank, changed);
        setIfChanged(row, 'NextRankPoints', nextReqNum, changed);
        setIfChanged(row, 'PointsDiff', Math.max(0, nextReqNum - currentPoints), changed);

        if (eligible && nextRank !== oldRank) {
          promotions.push({ userId, oldRank, newRank: nextRank });
          setIfChanged(row, 'OldRank', oldRank, changed);   // keep current rank as OldRank
          setIfChanged(row, 'NewRank', nextRank, changed);  // set the new rank
          setIfChanged(row, 'ManualPromotion', '', changed);
        }

        if (changed.changed) {
          await saveRowWithRetry(row);
          await sleep(1200); // ~50 writes/minute
        }
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

        const lines = promotions.map(
          p => `<:horsie:1367555119377551510> ${p.oldRank} → ${p.newRank}  [] <@${p.userId}>`
        ).join("\n");

        const announcement = `# 🌿 TO BE RAISED TO THE RANKS OF:\nThis week's dragoon promotions\n\n${lines}\n\nGood job everyone, keep up the good work!\n<@&1364050038623309886>`;

        if (announceChannel?.isTextBased()) {
          await announceChannel.send(announcement);
        }

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

  // === /audit ===
  if (commandName === "audit") {
    try {
      await interaction.deferReply({ ephemeral: true });
      const input = options.getString("data");
      const PERFORMANCE_CHANNEL_ID = "1375629618039619584";

      // 1. Parse and accumulate stats per user
      const lines = input.trim().split("!");
      const userStats = {};

      for (const line of lines) {
        const [name, killsStr, deathsStr, assistsStr] = line.split(",");
        const kills = parseInt(killsStr);
        const deaths = parseInt(deathsStr);
        const assists = parseInt(assistsStr);
        const match = name.match(/\(@(.+?)\)$/);
        const key = match ? match[1].trim() : name.trim();

        if (!userStats[key]) {
          userStats[key] = { kills: 0, deaths: 0, assists: 0, entries: 0 };
        }
        userStats[key].kills += kills;
        userStats[key].deaths += deaths;
        userStats[key].assists += assists;
        userStats[key].entries += 1;
      }

      // 2. Determine topfrag
      let topfrag = null;
      let maxKills = -1;
      for (const [name, stats] of Object.entries(userStats)) {
        if (stats.kills > maxKills) {
          maxKills = stats.kills;
          topfrag = name;
        }
      }

      // 3. Load sheet
      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const replySummary = [];
      const announceSummary = [];

      for (const [robloxName, stats] of Object.entries(userStats)) {
        const row = rows.find(r => r.RobloxUsername?.toLowerCase() === robloxName.toLowerCase());

        if (!row) {
          replySummary.push(`⚠️ ${robloxName}: not found in sheet.`);
          continue;
        }

        const existingKills = Number(row.Kills) || 0;
        const existingDeaths = Number(row.Deaths) || 0;
        const existingAssists = Number(row.Assists) || 0;
        const existingPoints = Number(row.CurrentPoints) || 0;
        const existingBattles = Number(row.Battles) || 0;

        // 4. Calculate points
        let bonusPoints = 15 * stats.entries; // Attendance
        if (stats.kills >= 20) bonusPoints += 5;
        if (stats.assists >= 20) bonusPoints += 1;
        if (robloxName === topfrag) bonusPoints += 10;

        // 5. Update sheet
        row.Kills = existingKills + stats.kills;
        row.Deaths = existingDeaths + stats.deaths;
        row.Assists = existingAssists + stats.assists;
        row.CurrentPoints = existingPoints + bonusPoints;
        row.Battles = existingBattles + 1;

        const nextRankPoints = Number(row.NextRankPoints) || 0;
        row.PointsDiff = Math.max(0, nextRankPoints - row.CurrentPoints);

        await saveRowWithRetry(row);
        await sleep(1200);

        const statLine = `✅ ${robloxName}: +${bonusPoints} points (${stats.kills}K/${stats.deaths}D/${stats.assists}A)`;
        replySummary.push(statLine);
        announceSummary.push(statLine);
      }

      // 6. Send reply to user
      await interaction.editReply({
        content: replySummary.join("\n").slice(0, 2000)
      });

      // 7. Send announcement to channel
      const announceChannel = interaction.guild.channels.cache.get(PERFORMANCE_CHANNEL_ID);
      if (announceChannel?.isTextBased()) {
        const announcement =
          `Todays battles performance:\n\n` +
          announceSummary.join("\n") +
          `\n\n🏆 Topfragger: ${topfrag} with ${maxKills} kills\n\nGood job everyone!`;

        await announceChannel.send(announcement);
      }
    } catch (err) {
      console.error("❌ Error in /audit:", err);
      await interaction.editReply({
        content: "⚠️ Something went wrong during audit processing."
      });
    }
  }

  // === /update ===
  if (commandName === "update") {
    try {
      const targetUser = options.getUser("userid");
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      const robloxName = targetMember.nickname || targetUser.username;

      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const rankMap = [];
      for (const row of rows) {
        const rank = row._rawData[11];
        const points = row._rawData[12];
        if (rank) rankMap.push({ rank, points });
      }

      const matchingRole = targetMember.roles.cache.find(role =>
        rankMap.some(r => r.rank.trim().toLowerCase() === role.name.trim().toLowerCase())
      );

      if (!matchingRole) {
        return interaction.reply({
          content: "❌ This user has no rank role that matches the rank list.",
          ephemeral: true
        });
      }

      const currentRank = matchingRole.name;
      const currentIndex = rankMap.findIndex(r => r.rank === currentRank);
      const nextRank = rankMap[currentIndex + 1]?.rank || currentRank;
      const nextPoints = rankMap[currentIndex + 1]?.points || 0;

      const row = rows.find(r => r.DiscordUserID === targetUser.id);
      if (!row) {
        return interaction.reply({
          content: `⚠️ <@${targetUser.id}> is not listed in the sheet.`,
          ephemeral: true
        });
      }

      row.RobloxUsername = robloxName;
      row.OldRank = currentRank;
      row.NewRank = nextRank;
      row.NextRankPoints = isNaN(nextPoints) ? 0 : Number(nextPoints);

      const currentPoints = Number(row.CurrentPoints) || 0;
      row.PointsDiff = Math.max(0, row.NextRankPoints - currentPoints);

      await row.save();

      await interaction.reply({
        content: `✅ <@${targetUser.id}> has been updated to **${currentRank}** in the sheet.\n⚠️ Remember to update this user's rank manually in the Roblox group.`,
        ephemeral: true
      });
    } catch (err) {
      console.error("❌ Error in /update:", err);
      await interaction.reply({
        content: "⚠️ Something went wrong while updating this user.",
        ephemeral: true
      });
    }
  }

  // === /stats USERID ===
  if (commandName === "stats") {
    try {
      const targetUser = options.getUser("userid");

      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle[SHEET_NAME];
      const rows = await sheet.getRows();

      const row = rows.find(r => r.DiscordUserID === targetUser.id);
      if (!row) {
        return interaction.reply({
          content: `❌ ${targetUser} is not in the roster.`,
          ephemeral: true
        });
      }

      const rank = row.OldRank || "Unknown";
      const pointsDiff = row.PointsDiff ?? "N/A";
      const kills = row.Kills ?? 0;
      const deaths = row.Deaths ?? 0;

      const promoMsg = `${targetUser} is currently a ${rank} and ${pointsDiff} points from a promotion!`;
      const statsMsg = `${targetUser} currently has ${kills} kills and ${deaths} deaths.`;

      await interaction.reply(`${promoMsg}\n${statsMsg}`);
    } catch (err) {
      console.error("❌ Error handling /stats command:", err);
      return interaction.reply({
        content: "⚠️ Something went wrong while retrieving stats.",
        ephemeral: true
      });
    }
  }
});
