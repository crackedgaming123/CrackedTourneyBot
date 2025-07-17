const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder, TextChannel } = require('discord.js');
require('dotenv').config();

// Scheduling and templating libraries
const { DateTime } = require('luxon');
const schedule = require('node-schedule');
const { shuffle } = require('lodash');

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_TOKEN      = process.env.BOT_TOKEN;
const SETUP_ROLE_ID = process.env.SETUP_ROLE_ID;  // add this right under your BOT_TOKEN/LOG_CHANNEL_ID


// In-memory session store for /setup
const sessions = new Map();

// Generate continuous EST times from 12AM to 11PM
function makeTimeOptions() {
  return Array.from({ length: 24 }, (_, h) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm   = h < 12 ? 'AM' : 'PM';
    return `${hour12}:00 ${ampm} EST`;
  });
}

// Dynamic embed color based on progress (red → yellow → green)
function getEmbedColor(current, total) {
  const fraction = current / total;
  if (fraction < 0.33) return 0xff0000;
  if (fraction < 0.66) return 0xffff00;
  return 0x00ff00;
}

// Simple progress bar text
function makeProgressBar(current, total) {
  const filled = Math.round((current / total) * 10);
  return 'Progress: ' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${current}/${total}`;
}

// Questions for the /setup flow
let questions = [
  { key: 'tournamentName',    type: 'text',   text: '📝 What is the name of your tournament?' },
  { key: 'discordServerName', type: 'text',   text: '📛 What is the name of your Discord server?' },
  { key: 'startDate',         type: 'date',   text: '📅 Select the tournament start date:' },
  { key: 'startTime',         type: 'select', text: '⏰ Select start time (EST):', options: makeTimeOptions() },
  { key: 'endDate',           type: 'date',   text: '📅 Select the tournament end date:' },
  { key: 'endTime',           type: 'select', text: '⏰ Select end time (EST):', options: makeTimeOptions() },
  { key: 'gameMode',          type: 'select', text: '🎮 What gamemode are you playing?', options: ['1s', '2s', '3s', 'Dropshot', 'Rumble', 'Hoops', 'Hockey', 'Other'] },
  { key: 'gameModeOther',     type: 'text',   text: '📝 Please specify the other game mode:', skip: true },
  { key: 'rankSplits',        type: 'buttons',text: '🏅 Do you want rank splits?', options: ['No', 'Yes'] },
  { key: 'rules',             type: 'text',   text: '📜 Please paste any specific tournament rules or link them' },
  { key: 'region',            type: 'text',   text: '🌎 Are there region restrictions? (e.g., NA only, EU only, open to all)' },
  { key: 'prizeDistribution', type: 'text',   text: '💰 How should prizes be distributed? (Winner takes all, top 3 split)' },
  { key: 'streaming',         type: 'buttons',text: '🎥 Will the tournament be streamed?', options: ['No', 'Yes'] },
  { key: 'streamingLink',     type: 'text',   text: '📺 Please provide your streaming link (Twitch/YouTube URL)', skip: true },
  { key: 'contact',           type: 'text',   text: '📩 Please provide your Discord tag for contact (e.g., RocketAdmin#1234)' }
];

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Register slash commands & schedule existing
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  const cmds = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot status'),
    new SlashCommandBuilder().setName('info').setDescription('Learn about Cracked platform'),
    new SlashCommandBuilder().setName('help').setDescription('Show available commands and permissions'),
    new SlashCommandBuilder().setName('welcome').setDescription('Get started with Cracked Bot'),
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Start a tournament setup (admins only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .setDMPermission(false),
    new SlashCommandBuilder().setName('cancelsetup').setDescription('Cancel your active tournament setup')
  ].map(cmd => cmd.toJSON());
  await client.application.commands.set(cmds);
  // TODO: load saved tournaments and call scheduleTournamentAnnouncements
});

// Welcome on bot join
client.on('guildCreate', async guild => {
  try {
    const channel = guild.channels.cache.find(ch =>
      ch.isTextBased() && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
    );
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle('👋 Thanks for adding Cracked Bot!')
      .setDescription(
        'Thanks for downloading Cracked Bot! 🎮\n\n' +
        'Use `/welcome` to get started and learn how to set up your first tournament.\n' +
        'Or try `/setup` whenever you’re ready to create a tournament.\n\n' +
        'Need help? Reach out to @cracked.gaming on Discord.'
      )
      .setColor(0xff6600);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(err);
  }
});

// Interaction handler
client.on('interactionCreate', async ix => {
  if (!ix.isChatInputCommand()) return;
  const { commandName, member, user, channel } = ix;
  const uid = user.id;
  switch (commandName) {
    case 'ping':
      return ix.reply('🏓 Pong!');
    case 'info': {
      const info = new EmbedBuilder()
        .setTitle('About Cracked')
        .setDescription('Free Rocket League tournament hosting with ladder based compeititon.')
        .addFields(
          { name: 'Platform', value: 'Create free tournaments for all ranks. Quick BO1s rule in this format, but players are able to play as many games as they want!' },
          { name: 'Prize Pool', value: 'Automatic $25 base + $1/team' },
          { name: 'Creator Earnings', value: '$0.33 per player joined' },
        )
        .setColor(0xff6600);
      return ix.reply({ embeds: [info] });
    }
    case 'help': {
      const help = new EmbedBuilder()
        .setTitle('📖 Cracked Bot Help')
        .setDescription('Commands available:')
        .addFields(
          { name: '/ping', value: 'Check bot status.' },
          { name: '/info', value: 'Learn about Cracked.' },
          { name: '/welcome', value: 'Intro and setup guide.' },
          { name: '/setup', value: 'Run through tournament setup.' },
          { name: '/cancelsetup', value: 'Cancel your active setup.' }
        )
        .setColor(0xff6600);
      return ix.reply({ embeds: [help] });
    }
    case 'welcome': {
      const welcome = new EmbedBuilder()
        .setTitle('👋 Welcome to Cracked!')
        .setDescription(
          'Cracked is an online, free-to-play Rocket League tournament platform for all ranks of players. ' +
          'By using this bot, you can create a tournament on https://crackedgaming.co, which uses a unique ladder system.\n\n' +
          '🎁 Prize pool is automatically covered starting at $25, plus $1 for each team that joins. ' +
          'As the tournament creator, you earn $0.33 for every player you bring in. However, you must have at LEAST 10 teams signed up 12 hours before the event begins to launch the tournament.' +
          'Thank you so much for using Cracked! If you have any questions, reach out to @cracked.gaming on Discord.'
        )
        .setColor(0x00ff00);
      return ix.reply({ embeds: [welcome] });
    }
    case 'cancelsetup':
      if (sessions.has(uid)) {
        sessions.delete(uid);
        return ix.reply({ content: '❌ Your setup has been canceled.', ephemeral: true });
      }
      return ix.reply({ content: '⚠️ No active setup to cancel.', ephemeral: true });
    case 'setup': {
      if (sessions.has(uid)) return ix.reply({ content: '🚨 Finish current setup or use `/cancelsetup` first.', ephemeral: true });
      if (!member.roles.cache.has(SETUP_ROLE_ID))
  return ix.reply({
    content: `🚫 You need the <@&${SETUP_ROLE_ID}> role to run this.`,
    ephemeral: true
  });
      await ix.reply({ content: '📝 Starting setup…', ephemeral: true });
      sessions.set(uid, {});
      let idx = 0;
      const askNext = async () => {
        while (idx < questions.length && questions[idx]?.skip) idx++;
        if (idx >= questions.length) {
          const sess = sessions.get(uid);
          const summary = new EmbedBuilder()
            .setTitle('🏁 Tournament Setup Complete!')
            .setColor(0x00ff00)
            .addFields(...Object.entries(sess).map(([k,v]) => ({ name: k, value: v.toString(), inline: true })));
          await channel.send({ embeds: [summary] });
          const dmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dm_summary').setLabel('📬 DM Summary').setStyle(ButtonStyle.Success)
          );
          await channel.send({ content: 'DM a copy?', components: [dmRow] });
          const dmc = channel.createMessageComponentCollector({ filter: i => i.user.id===uid, max:1, time:60000 });
          dmc.on('collect', async btn => { await user.send({ embeds: [summary] }); await btn.update({ content:'✅ Sent!', components:[] }); });
         if (LOG_CHANNEL_ID) {
  try {
    const logCh = await client.channels.fetch(LOG_CHANNEL_ID);
    // in v14+, use isTextBased() so you don’t accidentally skip real text channels
    if (logCh.isTextBased()) {
      await logCh.send({
        // @here guarantees you get a ping
        content: `@andy 📥 New tournament setup by <@${uid}> in **${channel.guild.name}**!`,
        embeds: [summary]
      });
    }
  } catch (err) {
    console.error('Failed to send setup log:', err);
  }
}

        }
        const q = questions[idx];
        const embed = new EmbedBuilder().setTitle(`Question ${idx+1}/${questions.length}`).setDescription(q.text).setColor(getEmbedColor(idx+1,questions.length)).setFooter({ text: makeProgressBar(idx+1,questions.length) });
        let collector;
        if (q.type==='text') {
          await channel.send({ embeds:[embed] });
          collector = channel.createMessageCollector({ filter:m=>m.author.id===uid, max:1, time:300000 });
        } else if (q.type==='date') {
          const opts=[];
          const start = q.key==='endDate' ? new Date(sessions.get(uid).startDate) : null;
          for (let d=0; d<25; d++) {
            const dt=new Date(); dt.setDate(dt.getDate()+d);
            if (start && dt<start) continue;
            let label;
            if (d===0) label=`Today (${dt.toLocaleDateString('en-US')})`;
            else if (d===1) label=`Tomorrow (${dt.toLocaleDateString('en-US')})`;
            else label=dt.toLocaleDateString('en-US',{month:'long', day:'numeric', year:'numeric'});
            opts.push({ label, value: dt.toISOString().split('T')[0] });
          }
          const menu = new StringSelectMenuBuilder().setCustomId(`date_${q.key}`).setPlaceholder('Select a date').addOptions(opts);
          await channel.send({ embeds:[embed], components:[new ActionRowBuilder().addComponents(menu)] });
          collector = channel.createMessageComponentCollector({ filter:i=>i.user.id===uid, max:1, time:300000 });
        } else if (q.type==='select') {
          const menu=new StringSelectMenuBuilder().setCustomId(`sel_${q.key}`).setPlaceholder('Choose one').addOptions(q.options.map(o=>({label:o,value:o})));
          await channel.send({embeds:[embed],components:[new ActionRowBuilder().addComponents(menu)]});
          collector=channel.createMessageComponentCollector({filter:i=>i.user.id===uid,max:1,time:300000});
        } else {
          const row=new ActionRowBuilder();
          q.options.forEach(opt=>row.addComponents(new ButtonBuilder().setCustomId(opt).setLabel(opt).setStyle(ButtonStyle.Primary)));
          await channel.send({embeds:[embed],components:[row]});
          collector=channel.createMessageComponentCollector({filter:i=>i.user.id===uid,max:1,time:300000});
        }
        const reminder=setTimeout(()=>{ if(sessions.has(uid)) channel.send(`<@${uid}> ⏳ Still there? Finish setup!`); },120000);
       collector.on('collect', async col => {
  clearTimeout(reminder);
  const sess = sessions.get(uid);
  let ans;
  if (q.type === 'text') {
    ans = col.content;
  } else if (q.type === 'date' || q.type === 'select') {
    ans = col.values[0];
    await col.update({ content: `✅ Set to **${ans}**`, embeds: [], components: [] });
  } else {
    ans = col.customId;
    await col.update({ content: `✅ Chose **${ans}**`, embeds: [], components: [] });
  }
  sess[q.key] = ans;

  // validate endTime comes after start
  if (q.key === 'endTime') {
    const s = new Date(`${sess.startDate} ${sess.startTime}`);
    const e = new Date(`${sess.endDate} ${sess.endTime}`);
    if (e <= s) {
      await channel.send('❌ End must be after start.');
      idx = questions.findIndex(x => x.key === 'endDate');
      return askNext();
    }
  }
  if (q.key === 'gameMode' && ans === 'Other') {
    questions.find(x => x.key === 'gameModeOther').skip = false;
  }
  if (q.key === 'mainEvent' && ans.toLowerCase() === 'no') {
    ['mainEventFormat', 'teamsAdvancing', 'mainEventBO', 'seeding']
      .forEach(k => questions.find(x => x.key === k).skip = true);
  }
  if (q.key === 'streaming' && ans.toLowerCase() === 'yes') {
    questions.find(x => x.key === 'streamingLink').skip = false;
  }
  idx++;
  askNext();
});
        collector.on('end',c=>{ clearTimeout(reminder); if(!c.size){ channel.send('⏰ Time’s up! Use `/setup` to restart.'); sessions.delete(uid); }});
      };
      askNext();
      break;
    }
  }
});

// Respond to direct mentions
client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.mentions.has(client.user)) {
    message.channel.send(`Hey ${message.author}, ready to build your next Rocket League tournament?`);
  }
});

// Login
client.login(BOT_TOKEN);
