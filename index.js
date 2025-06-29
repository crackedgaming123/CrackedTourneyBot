// index.js

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');
require('dotenv').config();

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_TOKEN      = process.env.BOT_TOKEN;

const sessions = new Map();

let questions = [
  { key: 'tournamentName',    type: 'text',   text: '📝 What is the name of your tournament?' },
  { key: 'discordServerName', type: 'text',   text: '📛 What is the name of your Discord server?' },
  { key: 'startDate',         type: 'date',   text: '📅 Select the tournament start date (EST):' },
  { key: 'startTime',         type: 'select', text: '⏰ Select start time (EST):', options: [
      '12:00 AM EST','1:00 AM EST','2:00 AM EST','3:00 AM EST','4:00 AM EST','5:00 AM EST',
      '6:00 PM EST','7:00 PM EST','8:00 PM EST','9:00 PM EST','10:00 PM EST','11:00 PM EST',
      '12:00 PM EST','1:00 PM EST','2:00 PM EST','3:00 PM EST','4:00 PM EST','5:00 PM EST'
    ]
  },
  { key: 'multiDay',          type: 'buttons',text: '📆 Will the tournament run over multiple days?', options: ['No','Yes'] },
  { key: 'endDate',           type: 'date',   text: '📅 Select the tournament end date (EST):', skip: true },
  { key: 'endTime',           type: 'select', text: '⏰ Select end time (EST):', options: [
      '12:00 AM EST','1:00 AM EST','2:00 AM EST','3:00 AM EST','4:00 AM EST','5:00 AM EST',
      '6:00 PM EST','7:00 PM EST','8:00 PM EST','9:00 PM EST','10:00 PM EST','11:00 PM EST',
      '12:00 PM EST','1:00 PM EST','2:00 PM EST','3:00 PM EST','4:00 PM EST','5:00 PM EST'
    ], skip: true
  },
  { key: 'mainEvent',         type: 'buttons',text: '🎯 Do you want a main event after qualifiers?', options: ['No','Yes'] },
  { key: 'mainEventFormat',   type: 'buttons',text: '🏆 Choose elimination format for the main event', options: ['Single Elimination','Double Elimination'] },
  { key: 'teamsAdvancing',    type: 'text',   text: '🚀 How many players or teams should move on from qualifiers?' },
  { key: 'mainEventBO',       type: 'select', text: '🔢 What match format for the main event?', options: ['Best of 1','Best of 3','Best of 5'] },
  { key: 'seeding',           type: 'buttons',text: '🎲 Do you want seeding for the main event?', options: ['No','Yes'] },
  { key: 'gameMode',          type: 'select', text: '🎮 What gamemode are you playing?', options: ['1s','2s','3s','Dropshot','Rumble','Hoops','Hockey','Other'] },
  { key: 'gameModeOther',     type: 'text',   text: '📝 Please specify the other game mode:', skip: true },
  { key: 'rankSplits',        type: 'buttons',text: '🏅 Do you want rank splits?', options: ['No','Yes'] },
  { key: 'rules',             type: 'text',   text: '📜 Please paste any specific tournament rules or link them' },
  { key: 'region',            type: 'text',   text: '🌎 Are there region restrictions? (e.g., NA only, EU only, open to all)' },
  { key: 'prizeDistribution', type: 'text',   text: '💰 How should prizes be distributed? (Winner takes all, top 3 split)' },
  { key: 'updates',           type: 'buttons',text: '🔔 Automatic updates/reminders in server?', options: ['No','Yes'] },
  { key: 'updateChannel',     type: 'text',   text: '📢 Which channel for updates? (Please @mention the channel)' },
  { key: 'streaming',         type: 'buttons',text: '🎥 Will the tournament be streamed?', options: ['No','Yes'] },
  { key: 'streamingLink',     type: 'text',   text: '📺 Please provide your streaming link (Twitch/YouTube URL)', skip: true },
  { key: 'promoMaterials',    type: 'buttons',text: '🎨 Promotional materials or graphics? (earnings drop to $0.50/team)', options: ['No','Yes'] },
  { key: 'contact',           type: 'text',   text: '📩 Please provide your Discord tag for contact (e.g., RocketAdmin#1234)' },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  // register slash commands
  const cmds = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot status'),
    new SlashCommandBuilder().setName('info').setDescription('Learn about Cracked platform'),
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Start the tournament setup flow')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .setDMPermission(false),
  ].map(c => c.toJSON());
  await client.application.commands.set(cmds);
});

function makeProgressBar(current, total) {
  const filled = Math.round((current / total) * 10);
  return 'Progress: ' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${current}/${total}`;
}

client.on('interactionCreate', async ix => {
  if (!ix.isChatInputCommand()) return;
  const { commandName, member, user, channel } = ix;

  if (commandName === 'ping') {
    return ix.reply({ content: '🏓 Pong!' });
  }

  if (commandName === 'info') {
    const info = new EmbedBuilder()
      .setTitle('About Cracked')
      .setDescription('Free Rocket League tournament hosting with ladder qualifiers.')
      .addFields(
        { name: 'How to Use', value: 'Use `/setup` to configure a tournament.' },
        { name: 'Ladder System', value: 'Qualify through ladder for bracket seeding.' },
        { name: 'Payouts', value: 'Base $25 pool; $1/team, $2 adds per team.' },
        { name: 'Graphics Fee', value: 'Graphics lowers earnings to $0.50/team.' },
        { name: 'Website', value: '[crackedgaming.co](https://crackedgaming.co)' },
        { name: 'Free to Play', value: 'Hosting is completely free.' }
      )
      .setColor(0xff6600);
    return ix.reply({ embeds: [info] });
  }

  if (commandName === 'setup') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return ix.reply({
        content: '🚫 You need Manage Server permission to run setup.',
        flags: 1 << 6
      });
    }
    await ix.reply({ content: '📝 Starting setup…', flags: 1 << 6 });
    const uid = user.id;
    sessions.set(uid, {});
    let idx = 0;

    const askNext = async () => {
      while (questions[idx]?.skip) idx++;
      if (idx < questions.length) {
        const q = questions[idx];
        await channel.sendTyping();
        const embed = new EmbedBuilder()
          .setTitle(`Question ${idx + 1} of ${questions.length}`)
          .setDescription(q.text)
          .setFooter({ text: makeProgressBar(idx + 1, questions.length) });

        let collector;
        const filter = m => m.author.id === uid;

        if (q.type === 'text') {
          await channel.send({ embeds: [embed] });
          collector = channel.createMessageCollector({ filter, max: 1, time: 300000 });
        } else if (q.type === 'date') {
          const opts = [];
          for (let d = 0; d < 25; d++) {
            const dt = new Date();
            dt.setDate(dt.getDate() + d);
            opts.push({
              label: dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
              value: dt.toISOString().split('T')[0]
            });
          }
          const sel = new StringSelectMenuBuilder()
            .setCustomId(`date_${q.key}`)
            .setPlaceholder('Select a date')
            .addOptions(opts);
          await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(sel)] });
          collector = channel.createMessageComponentCollector({ filter: i => i.user.id === uid, max: 1, time: 300000 });
        } else if (q.type === 'select') {
          const sel = new StringSelectMenuBuilder()
            .setCustomId(`sel_${q.key}`)
            .setPlaceholder('Choose an option')
            .addOptions(q.options.map(o => ({ label: o, value: o })));
          await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(sel)] });
          collector = channel.createMessageComponentCollector({ filter: i => i.user.id === uid, max: 1, time: 300000 });
        } else {
          const row = new ActionRowBuilder();
          q.options.forEach(opt =>
            row.addComponents(new ButtonBuilder().setCustomId(opt).setLabel(opt).setStyle(ButtonStyle.Primary))
          );
          await channel.send({ embeds: [embed], components: [row] });
          collector = channel.createMessageComponentCollector({ filter: i => i.user.id === uid, max: 1, time: 300000 });
        }

        collector.on('collect', async col => {
          const sess = sessions.get(uid);
          let ans;
          if (q.type === 'text') {
            ans = col.content;
          } else if (q.type === 'date') {
            ans = col.values[0];
            await col.update({ content: `✅ Date set to **${ans}**`, embeds: [], components: [] });
          } else if (q.type === 'select') {
            ans = col.values[0];
            await col.update({ content: `✅ You chose **${ans}**`, embeds: [], components: [] });
          } else {
            ans = col.customId;
            await col.update({ content: `✅ You chose **${ans}**`, embeds: [], components: [] });
          }

          sess[q.key] = ans;

          // un-skip endDate/endTime if multi-day
          if (q.key === 'multiDay' && ans.toLowerCase() === 'yes') {
            questions.find(x => x.key === 'endDate').skip = false;
            questions.find(x => x.key === 'endTime').skip = false;
          }

          // validate end after start
          if (q.key === 'endTime') {
            const startDT = new Date(`${sess.startDate} ${sess.startTime}`);
            const endDT   = new Date(`${sess.endDate} ${sess.endTime}`);
            if (endDT <= startDT) {
              await channel.send('❌ End must be after start. Please re-pick.');
              idx = questions.findIndex(x => x.key === 'endDate');
              return askNext();
            }
          }

          // other conditionals
          if (q.key === 'gameMode' && ans === 'Other') {
            questions.find(x => x.key === 'gameModeOther').skip = false;
          }
          if (q.key === 'mainEvent' && ans.toLowerCase() === 'no') {
            ['mainEventFormat','teamsAdvancing','mainEventBO','seeding']
              .forEach(k => questions.find(x => x.key === k).skip = true);
          }
          if (q.key === 'updates' && ans.toLowerCase() === 'no') {
            questions.find(x => x.key === 'updateChannel').skip = true;
          }
          if (q.key === 'updateChannel') {
            const ch = col.mentions.channels.first();
            if (ch) sess.updateChannelId = ch.id;
            else {
              await channel.send('❌ Please @mention a valid channel.');
              sessions.delete(uid);
              return;
            }
          }
          if (q.key === 'streaming' && ans.toLowerCase() === 'yes') {
            questions.find(x => x.key === 'streamingLink').skip = false;
          }

          idx++;
          askNext();
        });

        collector.on('end', c => {
          if (!c.size) {
            channel.send('⏰ Time’s up! Restart with /setup');
            sessions.delete(uid);
          }
        });
      } else {
        // All done: send summary to invoking channel
        const sess = sessions.get(uid);
        const summary = new EmbedBuilder()
          .setTitle('🏁 Tournament Setup Complete!')
          .addFields(...Object.entries(sess).map(([k,v])=>({
            name: k,
            value: v.toString(),
            inline: true
          })));

        await channel.send({ embeds: [summary] });

        // And now mirror into your private log channel
        if (LOG_CHANNEL_ID) {
          try {
            const logCh = await client.channels.fetch(LOG_CHANNEL_ID);
            if (logCh.isTextBased()) {
              await logCh.send({
                content: `📥 New setup by <@${uid}>`,
                embeds: [summary]
              });
              console.log(`Logged submission for ${uid} in channel ${LOG_CHANNEL_ID}`);
            } else {
              console.warn(`Channel ${LOG_CHANNEL_ID} is not text-based`);
            }
          } catch (err) {
            console.error(`Failed to fetch/log channel ${LOG_CHANNEL_ID}:`, err);
          }
        }

        sessions.delete(uid);
      }
    };

    askNext();
  }
});

// mention-response
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.mentions.has(client.user)) {
    message.channel.send(`Hey ${message.author}! Ready to build your next Rocket League tournament?`);
  }
});

client.login(BOT_TOKEN);
