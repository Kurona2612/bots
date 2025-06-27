const Discord = require('discord.js');
const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.GuildMembers,
    Discord.GatewayIntentBits.MessageContent
  ]
});
const config = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();
const ms = require('ms');

// Инициализация таблиц
const economy = db.table('economy');
const levels = db.table('levels');
const warns = db.table('warns');
const farming = db.table('farming');
const modRoles = db.table('modRoles');
const adminRoles = db.table('adminRoles');
const premium = db.table('premium');
const logChannels = db.table('logChannels');
const joinChannels = db.table('joinChannels');
const tickets = db.table('tickets');
const ticketSettings = db.table('ticketSettings');
const businesses = db.table('businesses'); // Новая таблица для бизнесов

// Данные для фермерства
const shopItems = [
  { id: 1, name: "Помидор", emoji: "🍅", price: 100, minReward: 100, maxReward: 200, time: 10, description: "Быстрорастущий овощ" },
  { id: 2, name: "Морковь", emoji: "🥕", price: 50, minReward: 50, maxReward: 100, time: 5, description: "Растет очень быстро" },
  { id: 3, name: "Картофель", emoji: "🥔", price: 80, minReward: 150, maxReward: 300, time: 20, description: "Стабильный доход" },
  { id: 4, name: "Баклажан", emoji: "🍆", price: 120, minReward: 180, maxReward: 250, time: 15, description: "Экзотический овощ" },
  { id: 5, name: "Перец", emoji: "🌶️", price: 150, minReward: 200, maxReward: 400, time: 25, description: "Острый и прибыльный" },
  { id: 6, name: "Кукуруза", emoji: "🌽", price: 200, minReward: 300, maxReward: 500, time: 30, description: "Долго, но окупается" },
  { id: 7, name: "Гриб", emoji: "🍄", price: 75, minReward: 120, maxReward: 350, time: 12, description: "Рискованный выбор" },
  { id: 8, name: "Ананас", emoji: "🍍", price: 300, minReward: 500, maxReward: 800, time: 45, description: "Эксклюзивный фрукт" },
  { id: 9, name: "Клубника", emoji: "🍓", price: 180, minReward: 250, maxReward: 450, time: 18, description: "Сладкая ягода" },
  { id: 10, name: "Драконий фрукт", emoji: "🐉", price: 500, minReward: 800, maxReward: 1500, time: 60, description: "Редкий и ценный" }
];

// Данные о бизнесах
const businessTypes = [
  { 
    id: 1, 
    name: "Лавка фермера", 
    emoji: "🌾", 
    price: 10000, 
    baseIncome: 500, 
    description: "Продает свежие овощи и фрукты",
    upgradeCost: 5000 
  },
  { 
    id: 2, 
    name: "Магазин техники", 
    emoji: "🔧", 
    price: 25000, 
    baseIncome: 1200, 
    description: "Ремонтирует и продает гаджеты",
    upgradeCost: 10000 
  },
  { 
    id: 3, 
    name: "Кофейня", 
    emoji: "☕", 
    price: 50000, 
    baseIncome: 2500, 
    description: "Готовит лучший кофе в городе",
    upgradeCost: 15000 
  },
  { 
    id: 4, 
    name: "Крипто-ферма", 
    emoji: "💰", 
    price: 100000, 
    baseIncome: 5000, 
    description: "Добывает криптовалюту (рискованный бизнес)",
    upgradeCost: 30000 
  }
];

let currentShop = shopItems.slice(0, 5);
let lastShopUpdate = Date.now();

// Функции
function createProgressBar(percentage, length = 10) {
  const filled = Math.round(percentage * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

function createErrorEmbed(description) {
  return new Discord.EmbedBuilder()
    .setColor('#ff0000')
    .setDescription(description)
    .setTimestamp();
}

function createSuccessEmbed(description) {
  return new Discord.EmbedBuilder()
    .setColor('#00ff00')
    .setDescription(description)
    .setTimestamp();
}

async function isMod(member) {
  const roles = await modRoles.get(`roles_${member.guild.id}`) || [];
  return member.permissions.has(Discord.PermissionFlagsBits.ManageMessages) || 
         roles.some(r => member.roles.cache.has(r));
}

async function isAdmin(member) {
  const roles = await adminRoles.get(`roles_${member.guild.id}`) || [];
  return member.permissions.has(Discord.PermissionFlagsBits.Administrator) || 
         roles.some(r => member.roles.cache.has(r));
}

async function isPremium(userId) {
  const data = await premium.get(`user_${userId}`);
  return data?.expires > Date.now();
}

function getPremiumMultiplier(userId) {
  return isPremium(userId) ? 1.2 : 1.0;
}

function updateShop() {
  currentShop = [...shopItems].sort(() => 0.5 - Math.random()).slice(0, 5);
  lastShopUpdate = Date.now();
}

// Функция для расчета дохода бизнеса
function calculateBusinessIncome(business, level) {
  let income = business.baseIncome * level;
  // Крипто-ферма может дать 0 или x2
  if (business.id === 4 && Math.random() < 0.3) return 0;
  if (business.id === 4 && Math.random() < 0.1) return income * 2;
  return income;
}

// Функция для отправки логов модерации
async function sendModLog(action, target, moderator, reason = 'Не указана', duration = null, guild) {
  const channelId = await logChannels.get(`modLog_${guild.id}`);
  if (!channelId) return;
  
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  
  const embed = new Discord.EmbedBuilder()
    .setTitle(`🛡 Действие модератора`)
    .setColor('#ff9900')
    .addFields(
      { name: 'Действие', value: action, inline: true },
      { name: 'Модератор', value: `${moderator} (${moderator.id})`, inline: true },
      { name: 'Участник', value: `${target} (${target.id})`, inline: true },
      { name: 'Причина', value: reason }
    )
    .setTimestamp();
  
  if (duration) embed.addFields({ name: 'Длительность', value: ms(duration, { long: true }) });
  
  channel.send({ embeds: [embed] }).catch(console.error);
}

// Функция для отправки логов участников
async function sendUserLog(action, user, guild, details = '') {
  const channelId = await logChannels.get(`userLog_${guild.id}`);
  if (!channelId) return;
  
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  
  const embed = new Discord.EmbedBuilder()
    .setTitle(`👤 Действие участника`)
    .setColor('#00b0f4')
    .addFields(
      { name: 'Действие', value: action },
      { name: 'Участник', value: `${user} (${user.id})` },
      { name: 'Детали', value: details || 'Нет дополнительной информации' }
    )
    .setTimestamp();
  
  channel.send({ embeds: [embed] }).catch(console.error);
}

// ========== СИСТЕМА ТИКЕТОВ ==========
async function createTicket(guild, user, categoryName = 'default') {
  const categoryId = await ticketSettings.get(`category_${guild.id}_${categoryName}`);
  if (!categoryId) return null;

  const ticketCount = (await tickets.get(`count_${guild.id}`) || 0) + 1;
  await tickets.set(`count_${guild.id}`, ticketCount);

  const channelName = `ticket-${ticketCount}`;
  
  const channel = await guild.channels.create({
    name: channelName,
    type: Discord.ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [Discord.PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          Discord.PermissionFlagsBits.ViewChannel,
          Discord.PermissionFlagsBits.SendMessages,
          Discord.PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  // Добавляем права модераторам
  const modRolesList = await modRoles.get(`roles_${guild.id}`) || [];
  for (const roleId of modRolesList) {
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      SendMessages: true,
      ManageMessages: true
    });
  }

  await tickets.set(`ticket_${guild.id}_${channel.id}`, {
    user: user.id,
    category: categoryName,
    createdAt: Date.now(),
    status: 'open'
  });

  return channel;
}

async function closeTicket(channel) {
  await tickets.set(`ticket_${channel.guild.id}_${channel.id}.status`, 'closed');
  await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: false });
  
  // Логируем закрытие тикета
  const ticketData = await tickets.get(`ticket_${channel.guild.id}_${channel.id}`);
  if (ticketData) {
    const user = await client.users.fetch(ticketData.user).catch(() => null);
    await sendModLog(
      'Тикет закрыт', 
      user || { id: ticketData.user, tag: 'Unknown#0000' }, 
      client.user, 
      `Канал: ${channel.name}`,
      null,
      channel.guild
    );
  }
}

// Инициализация
client.on('ready', () => {
  console.log(`Бот ${client.user.tag} готов!`);
  updateShop();
  setInterval(updateShop, 5 * 60 * 1000);
});

// Объединённый обработчик сообщений
client.on('messageCreate', async message => {
  try {
    if (message.author.bot || !message.guild) return;
    
    // Система уровней
    const xpAdd = Math.floor(Math.random() * 10) + 5;
    const premiumBonus = await isPremium(message.author.id) ? 1.2 : 1.0;
    const finalXp = Math.floor(xpAdd * premiumBonus);
    
    const level = await levels.get(`level_${message.guild.id}_${message.author.id}`) || 0;
    const xp = await levels.get(`xp_${message.guild.id}_${message.author.id}`) || 0;
    const neededXP = level * 100 + 100;
    
    await levels.add(`xp_${message.guild.id}_${message.author.id}`, finalXp);
    
    if (xp + finalXp >= neededXP) {
      await levels.set(`xp_${message.guild.id}_${message.author.id}`, 0);
      await levels.add(`level_${message.guild.id}_${message.author.id}`, 1);
      const levelUpReward = (level + 1) * 100;
      await economy.add(`money_${message.guild.id}_${message.author.id}`, levelUpReward);
      
      const levelUpEmbed = new Discord.EmbedBuilder()
        .setTitle('🎉 Уровень UP!')
        .setDescription(`Теперь у вас ${level + 1} уровень!`)
        .addFields({ name: 'Награда', value: `+${levelUpReward} монет` })
        .setColor('#00ff00')
        .setTimestamp();
      
      await message.reply({ embeds: [levelUpEmbed] });
    }

    // Обработка команд
    if (!message.content.startsWith(config.prefix)) return;
    
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ========== БИЗНЕСЫ ==========
    if (command === 'biz') {
      const subCommand = args[0]?.toLowerCase();

      if (!subCommand || subCommand === 'help') {
        const embed = new Discord.EmbedBuilder()
          .setTitle('🏢 Помощь по бизнесам')
          .setDescription(`Префикс: \`${config.prefix}biz\``)
          .setColor('#3498db')
          .addFields(
            { name: 'Команды', value: 
              '`list` - Список бизнесов\n' +
              '`buy <id>` - Купить бизнес\n' +
              '`sell <id>` - Продать бизнес\n' +
              '`upgrade <id>` - Улучшить бизнес\n' +
              '`my` - Мои бизнесы\n' +
              '`collect` - Забрать доход' }
          );
        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'list') {
        const embed = new Discord.EmbedBuilder()
          .setTitle('🏪 Доступные бизнесы')
          .setDescription('Используйте `!biz buy <id>` для покупки')
          .setColor('#2ecc71');

        businessTypes.forEach(biz => {
          embed.addFields({
            name: `${biz.emoji} ${biz.name} (Цена: ${biz.price}💰)`,
            value: `${biz.description}\nДоход: ${biz.baseIncome}💰/час`,
            inline: false
          });
        });

        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'buy') {
        const bizId = parseInt(args[1]);
        const business = businessTypes.find(b => b.id === bizId);
        
        if (!business) return message.reply({ embeds: [createErrorEmbed('❌ Неверный ID бизнеса')] });
        
        const balance = await economy.get(`money_${message.guild.id}_${message.author.id}`) || 0;
        if (balance < business.price) {
          return message.reply({ embeds: [createErrorEmbed(`❌ Недостаточно денег. Нужно: ${business.price}💰`)] });
        }

        const userBiz = await businesses.get(`user_${message.author.id}_${bizId}`);
        if (userBiz) {
          return message.reply({ embeds: [createErrorEmbed('❌ У вас уже есть этот бизнес')] });
        }

        await businesses.set(`user_${message.author.id}_${bizId}`, {
          type: bizId,
          level: 1,
          lastCollect: Date.now(),
          profit: 0
        });

        await economy.sub(`money_${message.guild.id}_${message.author.id}`, business.price);
        
        const embed = new Discord.EmbedBuilder()
          .setTitle(`✅ Вы купили ${business.emoji} ${business.name}`)
          .setDescription(`${business.description}\nТеперь вы получаете ${business.baseIncome}💰 каждый час`)
          .setColor('#2ecc71')
          .setFooter({ text: `Используйте ${config.prefix}biz collect для сбора дохода` });
        
        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'my') {
        const userBusinesses = [];
        
        for (const biz of businessTypes) {
          const data = await businesses.get(`user_${message.author.id}_${biz.id}`);
          if (data) userBusinesses.push({ ...biz, ...data });
        }

        if (userBusinesses.length === 0) {
          return message.reply({ embeds: [createErrorEmbed('❌ У вас нет бизнесов')] });
        }

        const embed = new Discord.EmbedBuilder()
          .setTitle(`🏦 Ваши бизнесы (${userBusinesses.length}/4)`)
          .setColor('#f1c40f');

        userBusinesses.forEach(biz => {
          const income = calculateBusinessIncome(biz, biz.level);
          embed.addFields({
            name: `${biz.emoji} ${biz.name} (Ур. ${biz.level})`,
            value: `Доход: ${income}💰/час\nНакоплено: ${biz.profit}💰`,
            inline: true
          });
        });

        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'collect') {
        let totalCollected = 0;
        const collectedBiz = [];
        
        for (const biz of businessTypes) {
          const data = await businesses.get(`user_${message.author.id}_${biz.id}`);
          if (data) {
            const hoursPassed = Math.floor((Date.now() - data.lastCollect) / (1000 * 60 * 60));
            if (hoursPassed > 0) {
              const income = calculateBusinessIncome(biz, data.level) * hoursPassed;
              await businesses.add(`user_${message.author.id}_${biz.id}.profit`, income);
              await businesses.set(`user_${message.author.id}_${biz.id}.lastCollect`, Date.now());
              totalCollected += income;
              collectedBiz.push(`${biz.emoji} ${biz.name}: ${income}💰`);
            }
          }
        }

        if (totalCollected === 0) {
          return message.reply({ embeds: [createErrorEmbed('❌ Нет дохода для сбора')] });
        }

        await economy.add(`money_${message.guild.id}_${message.author.id}`, totalCollected);
        
        const embed = new Discord.EmbedBuilder()
          .setTitle(`💰 Вы собрали доход`)
          .setDescription(`Общая сумма: ${totalCollected}💰`)
          .setColor('#2ecc71')
          .addFields({
            name: 'Бизнесы',
            value: collectedBiz.join('\n')
          });
        
        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'upgrade') {
        const bizId = parseInt(args[1]);
        const business = businessTypes.find(b => b.id === bizId);
        
        if (!business) return message.reply({ embeds: [createErrorEmbed('❌ Неверный ID бизнеса')] });
        
        const userBiz = await businesses.get(`user_${message.author.id}_${bizId}`);
        if (!userBiz) {
          return message.reply({ embeds: [createErrorEmbed('❌ У вас нет этого бизнеса')] });
        }

        const upgradeCost = business.upgradeCost * userBiz.level;
        const balance = await economy.get(`money_${message.guild.id}_${message.author.id}`) || 0;
        
        if (balance < upgradeCost) {
          return message.reply({ embeds: [createErrorEmbed(`❌ Недостаточно денег. Нужно: ${upgradeCost}💰`)] });
        }

        await businesses.add(`user_${message.author.id}_${bizId}.level`, 1);
        await economy.sub(`money_${message.guild.id}_${message.author.id}`, upgradeCost);
        
        const newIncome = calculateBusinessIncome(business, userBiz.level + 1);
        
        const embed = new Discord.EmbedBuilder()
          .setTitle(`🆙 Вы улучшили ${business.emoji} ${business.name}`)
          .setDescription(`Теперь уровень: ${userBiz.level + 1}\nНовый доход: ${newIncome}💰/час`)
          .setColor('#00ff00');
        
        return message.reply({ embeds: [embed] });
      }

      if (subCommand === 'sell') {
        const bizId = parseInt(args[1]);
        const business = businessTypes.find(b => b.id === bizId);
        
        if (!business) return message.reply({ embeds: [createErrorEmbed('❌ Неверный ID бизнеса')] });
        
        const userBiz = await businesses.get(`user_${message.author.id}_${bizId}`);
        if (!userBiz) {
          return message.reply({ embeds: [createErrorEmbed('❌ У вас нет этого бизнеса')] });
        }

        // Продажная цена = 60% от стоимости + 50% от улучшений
        const sellPrice = Math.floor((business.price * 0.6) + (business.upgradeCost * userBiz.level * 0.5));
        
        await businesses.delete(`user_${message.author.id}_${bizId}`);
        await economy.add(`money_${message.guild.id}_${message.author.id}`, sellPrice);
        
        const embed = new Discord.EmbedBuilder()
          .setTitle(`🛒 Вы продали ${business.emoji} ${business.name}`)
          .setDescription(`Получено: ${sellPrice}💰`)
          .setColor('#e74c3c');
        
        return message.reply({ embeds: [embed] });
      }
    }

    // ========== ТИКЕТЫ ==========
    if (command === 'ticket') {
      // ... (существующий код тикетов остается без изменений)
    }

    // ========== ЭКОНОМИКА ==========
    if (command === 'economy') {
      // ... (существующий код экономики остается без изменений)
    }

    // ========== ФЕРМЕРСТВО ==========
    if (command === 'farming') {
      // ... (существующий код фермерства остается без изменений)
    }

    // ========== МОДЕРАЦИЯ ==========
    if (command === 'a') {
      // ... (существующий код модерации остается без изменений)
    }

    // ========== ПРЕМИУМ СИСТЕМА ==========
    if (command === 'premium') {
      // ... (существующий код премиум системы остается без изменений)
    }

  } catch (error) {
    console.error('Ошибка в обработчике сообщений:', error);
  }
});

// Обработчики событий
client.on('guildMemberAdd', async member => {
  // ... (существующий код остается без изменений)
});

client.on('guildMemberRemove', async member => {
  // ... (существующий код остается без изменений)
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // ... (существующий код остается без изменений)
});

client.login(config.token);