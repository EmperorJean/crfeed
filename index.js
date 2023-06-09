const MTProto = require('@mtproto/core');
const prompts = require('prompts');
const path = require("path")
const api_id = "17618410"; // insert api_id here
const api_hash = '97b4a7d4f44acf01649f40487a7ece56'; // insert api_hash here
const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Collection, Client, Intents, MessageEmbed, Permissions } = require('discord.js');
const dotenv = require('dotenv').config();
const token = process.env.token;
const guildId = process.env.guildId;
const clientId = process.env.clientId;
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const accessHass = 15511652361780280856;
const { SlashCommandBuilder } = require('@discordjs/builders');
const chId = process.env.chId ;

const mtproto = new MTProto({
    api_id,
    api_hash,
    storageOptions: {
        path: path.resolve(__dirname, './data/1.json'),
    },
});


// //Loading Commands
client.commands = new Collection();

const joinCommand = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a telegram channel')
        .addStringOption((option) =>
            option
                .setName('channel')
                .setRequired(true)
                .setDescription('Channel you want to join')
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply("You don't have permission to use this command");
        }

        const channelUsername = interaction.options.getString('channel');
        const channelInfo = await getChannelInfo(channelUsername);

        try {
            let res = await joinChannel(channelInfo);
            interaction.reply({ content: res, ephemeral: true });
        } catch (error) {
            console.error(error);
            interaction.reply({ content: 'Failed to join the channel', ephemeral: true });
        }
    },
};

const leaveCommand = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave a telegram channel')
        .addStringOption((option) =>
            option
                .setName('channel')
                .setRequired(true)
                .setDescription('Channel you want to leave')
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply("You don't have permission to use this command");
        }

        const channelUsername = interaction.options.getString('channel');
        const channelInfo = await getChannelInfo(channelUsername);

        try {
           await leaveChannel(channelInfo);
            interaction.reply({ content: 'Left the channel', ephemeral: true });
        } catch (error) {
            console.error(error);
            interaction.reply({ content: 'Failed to leave the channel', ephemeral: true });
        }
    },
};


async function getChannelsAndGroups() {
    // Get the list of dialogs from the Telegram API
    const dialogs = await mtproto.call('messages.getDialogs', { offset_date: 0, offset_id: 0, offset_peer: { _: 'inputPeerEmpty' }, limit: 100 });
    if (!dialogs || !Array.isArray(dialogs.chats)) {
      throw new Error('Failed to retrieve list of channels and groups');
    }
  
    const chats = await Promise.all(dialogs.chats.map(async chat => {
      let link;
      if (chat.username) {
        link = `https://t.me/${chat.username}`;
      } else {
        try {
          const exportedInvite = await mtproto.call('messages.exportChatInvite', { peer: { _: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash } });
          link = exportedInvite.link;
        } catch (error) {
          // Ignore errors (e.g. if the user is not allowed to export the invite link)
        }
      }
      return {
        id: chat.id,
        title: chat.title,
        type: chat._ === 'channel' ? 'channel' : 'group',
        link
      };
    }));
  
    return chats;
  }
  
  const listChatsCommand = {
    data: new SlashCommandBuilder()
      .setName('listchats')
      .setDescription('List available Telegram channels and groups'),
    async execute(interaction) {
      const chats = await getChannelsAndGroups();
      const embed = new MessageEmbed()
        .setTitle('Available Telegram Channels and Groups')
        .setDescription(chats.map(chat => `Title: ${chat.title}, Type: ${chat.type}, Link: ${chat.link || 'N/A'}`).join('\n'))
        .setFooter('Use the link to remove the channel/group');
      interaction.reply({ embeds: [embed] });
    },
  };
  
client.commands.set(listChatsCommand.data.name, listChatsCommand);
client.commands.set(joinCommand.data.name, joinCommand);
client.commands.set(leaveCommand.data.name, leaveCommand);

async function loadCommands() {
    const rest = new REST({ version: '9' }).setToken(token);

    try {
        console.log('Started refreshing application (/) commands.');

        const commands = client.commands.map((command) => command.data.toJSON());

        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
        });

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

client.once('ready', async () => {
    await loadCommands();
    console.log('Ready!');
    run();
});

client.on('interactionCreate', async interaction => {
    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        return interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});



async function getChannelInfo(channelInput) {
    let username = '';


    // Case 1: Input is in the format of a direct username (@username)
    const directUsernameRegex = /^@(\w+)$/;
    const directUsernameMatch = channelInput.match(directUsernameRegex);
    if (directUsernameMatch) {
        username = directUsernameMatch[1];
    }

    // Case 2: Input is a Telegram channel URL (https://t.me/username)
    const channelUrlRegex = /^https?:\/\/t\.me\/(?:joinchat\/)?(?:invite\/)?(?:c\/)?(?:s\/)?(\w+)(?:\/\w+)*$/;
    const channelUrlMatch = channelInput.match(channelUrlRegex);
    if (channelUrlMatch) {
        username = channelUrlMatch[1];
    }
    console.log(channelInput + ", " + username);

    try {
        const result = await mtproto.call('contacts.resolveUsername', {
            username,
        });

        let data = [];
        data.push(result.chats[0].id);
        data.push(result.chats[0].access_hash);
        return data;

    } catch (error) {
        console.error(error);
    }
}

async function leaveChannel(channelInfo) {
    try {
        const result = await mtproto.call('channels.leaveChannel', {
            channel: {
                _: 'inputChannel',
                channel_id: channelInfo[0],
                access_hash: channelInfo[1],
            },
        });

        console.log('Left the channel:', result);
        return result;
    } catch (error) {
        console.error(error);

    }
}


async function joinChannel(data) {
    try {
        const result = await mtproto.call('channels.joinChannel', {
            channel: {
                _: 'inputChannel',
                channel_id: data[0],
                access_hash: data[1],
            },
        });

        return "success";
    } catch (error) {
        console.error(error);
        if (error.error_message) {
            return "error: " + error.error_message;
        }
        return "error";
    }
}




function run() {
    async function getPhone() {
        return (await prompts({
            type: 'text',
            name: 'phone',
            message: 'Enter your phone number:'
        })).phone
    }

    async function getCode() {
        // you can implement your code fetching strategy here
        return (await prompts({
            type: 'text',
            name: 'code',
            message: 'Enter the code sent:',
        })).code
    }

    async function getPassword() {
        return (await prompts({
            type: 'text',
            name: 'password',
            message: 'Enter Password:',
        })).password
    }

    async function startListener() {
        console.log('[+] starting listener')
        setInterval(() => mtproto.call('updates.getState', {}), 3000)

        mtproto.updates.on('updates', async ({ updates }) => {
            const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object
            for (const message of newChannelMessages) {

                //console.log(message)   
                // printing new channel messages

                try {
                    const channele = await mtproto.call('channels.getChannels', {
                        id: [{
                            _: "inputChannel",
                            channel_id: message.peer_id.channel_id,
                            access_hash: accessHass
                        }]
                    }).catch(err => {
                        console.log(err);
                    })

                    if (message.message === undefined) {
                        return;
                    }
                    let channelName = channele.chats[0].title;

                    let guild = await client.guilds.cache.find(guild => guild.id === guildId);
                    let channel = await guild.channels.cache.find(channel => channel.id === chId);

                    if (message.message === "" || message.message === " ") {
                        return console.log("image posted")
                    }
                    if (channelName === undefined) {
                        channelName = " Name Not Found"
                    }


                    let emb = new MessageEmbed()
                        .setTitle(`Sent From ${channelName}`)
                        .setDescription(
                            `
                        ${message.message}
                    `
                        ).setColor("PURPLE")
                    channel.send({ embeds: [emb] })
                } catch (err) {
                    console.log(err);
                }

            }
        });
    }


    // checking authentication status
    mtproto
        .call('users.getFullUser', {
            id: {
                _: 'inputUserSelf',
            },
        })
        .then(startListener) // means the user is logged in -> so start the listener
        .catch(async error => {

            // The user is not logged in
            console.log('[+] You must log in')
            const phone_number = await getPhone()

            mtproto.call('auth.sendCode', {
                phone_number: phone_number,
                settings: {
                    _: 'codeSettings',
                },
            })
                .catch(error => {
                    if (error.error_message.includes('_MIGRATE_')) {
                        const [type, nextDcId] = error.error_message.split('_MIGRATE_');

                        mtproto.setDefaultDc(+nextDcId);

                        return sendCode(phone_number);
                    }
                })
                .then(async result => {
                    return mtproto.call('auth.signIn', {
                        phone_code: await getCode(),
                        phone_number: phone_number,
                        phone_code_hash: result.phone_code_hash,
                    });
                })
                .catch(error => {
                    if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
                        return mtproto.call('account.getPassword').then(async result => {
                            const { srp_id, current_algo, srp_B } = result;
                            const { salt1, salt2, g, p } = current_algo;

                            const { A, M1 } = await getSRPParams({
                                g,
                                p,
                                salt1,
                                salt2,
                                gB: srp_B,
                                password: await getPassword(),
                            });

                            return mtproto.call('auth.checkPassword', {
                                password: {
                                    _: 'inputCheckPasswordSRP',
                                    srp_id,
                                    A,
                                    M1,
                                },
                            });
                        });
                    }
                })
                .then(result => {
                    console.log('[+] successfully authenticated');
                    // start listener since the user has logged in now
                    startListener()
                });
        })

}



client.login(token);