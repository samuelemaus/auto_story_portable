require('dotenv').config();
const Discord = require("discord.js");
const axios = require('axios');
const channelIdManager = require('./channel-id-manager');

const OPEN_AI_COMPLETION_URL = 'https://api.openai.com/v1/completions';

const SET_CHANNEL_CMD = 'here';


const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMessageReactions,
        Discord.GatewayIntentBits.DirectMessageReactions,
        Discord.GatewayIntentBits.GuildEmojisAndStickers
    ]
});

const BASIC_REQUEST = {
    "model": "text-davinci-002",
    "temperature": 0.0,
    "top_p": 1,
    "n": 1,
    "stream": false,
    "logprobs": null
}


const COMMAND_HANDLERS = {
    'freeform': async (completionPrompt, msg) => {
        const finalPrompt = `${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'story': async (completionPrompt, msg) => {
        const finalPrompt = `Write a short story from this: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'how to': async (completionPrompt, msg) => {
        const finalPrompt = `Write an article about how to: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'news': async (completionPrompt, msg) => {
        const finalPrompt = `Write a breaking news article on: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'sitcom': async (completionPrompt, msg) => {
        const finalPrompt = `Write a sitcom scene based on: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'movie': async (completionPrompt, msg) => {
        const finalPrompt = `Write a movie trailer script based on: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'mad lib': async (completionPrompt, msg) => {
        const finalPrompt = `Write a mad libs story based on the following key words: \n ${completionPrompt}`;
        basicGenerationHandlerFunction(finalPrompt, msg);
    },
    'continue': async (completionPrompt, msg) => {
        if (msg.type === Discord.MessageType.Reply) {
            let msgBeingRepliedTo = null;
            await msg.channel.messages.fetch(msg.reference.messageId)
                .then((message) => {
                    msgBeingRepliedTo = message;
                    console.log(message.content)
                }).catch(console.error);


            const originalContent = msgBeingRepliedTo.content;
            const finalPrompt = `Continue this: \"${originalContent} \"`;
            const req = buildRequestBody(finalPrompt, 0.8);
            const channel = msg.channel;
            await getCompletionResult(req, channel, null, msgBeingRepliedTo.embeds[0].data.fields[0].value, originalContent, originalContent);
        } else {
            msg.reply('I can only continue something if you reply to the message that you want me to continue.');
        }
    }
}

function getBotInstructions() {
    let instructions = "Type a message which begins with one of the following key phrases: \n";
    const keys = Object.keys(COMMAND_HANDLERS);
    keys.forEach((key) => {
        instructions += " * \"" + key + "\"";

        switch (key) {
            case 'freeform':
                instructions += " (this will send whatever you type directly to the AI - try saying things like \"write song lyrics about [blank]\" or \"write a passage from a book about [blank]\")";
                break;
            case 'continue':
                instructions += " (you must be replying to one of the bot's message for this to work -- this will attempt to continue on what the AI generated, but often it will just send back the same thing.";
                break;
            case 'mad lib':
                instructions += " (this works best when using a list of words separated by commas";
                break;
        }

        instructions += "\n";

    });

    instructions += "\n";

    instructions += "The AI generations generally only take seconds.  Have fun.";

    return instructions;
}

function generateAndSendGptContent(msg) {
    console.log('received message: ' + msg.content);
    const keys = Object.keys(COMMAND_HANDLERS);
    const processedMsg = getProcessedMessageContent(msg);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (processedMsg.toLowerCase().startsWith(key)) {
            msg.channel.sendTyping();
            console.log(`identified ${key} request`);

            const completionPrompt = getCompletionPrompt(key, processedMsg);
            const handlerFunction = COMMAND_HANDLERS[key];
            handlerFunction(completionPrompt, msg);
        }
    }
}

async function basicGenerationHandlerFunction(finalPrompt, msg, embedFields) {
    const req = buildRequestBody(finalPrompt, 0.8);
    const channel = msg.channel;
    await getCompletionResult(req, channel, embedFields, finalPrompt);
}

function buildRequestBody(prompt, temperature) {
    const maxTokens = 4096 - (prompt.length + 1);
    const temp = temperature || `0.${Math.floor(Math.random() * 6) * 2}`;
    console.log(`temp: ${temp}`);
    return {
        ...BASIC_REQUEST,
        'prompt': prompt,
        'temperature': parseFloat(temp),
        'max_tokens': maxTokens
    }
}


async function getCompletionResult(request, channel, embedDescription, embedPrompt, continuationText) {

    const config = {
        headers: {
            Authorization: `Bearer ${process.env.OPEN_AI_TOKEN}`
        }
    }

    console.log(JSON.stringify({
        request: request,
        config: config
    }, null, 4));

    let result = null;

    console.log('making request');
    await axios.post(
        OPEN_AI_COMPLETION_URL,
        request,
        config
    ).then((res) => {
        console.log(`got response ${res.status}`);
        console.log(JSON.stringify(res.data, null, 4));
        result = res.data;
    }).catch((error) => {
        console.log(error);
    })

    if (result && result.choices.length > 0) {
        result.choices.forEach((choice) => {
            let storyText = choice.text.trim();

            if (continuationText) {
                storyText = `${continuationText} \n ${storyText}`;
            }

            const content = storyText;
            const embed = {
                fields: [
                    {
                        name: 'Prompt',
                        value: embedPrompt
                    }
                ]
            };

            if (embedDescription) {
                embed['description'] = embedDescription;
            }

            channel.send({
                content: content,
                embeds: [embed]
            }).catch((error) => {
                console.log(error);
            });

        });
    }
}

function getProcessedMessageContent(msg) {

    let msgContent = msg.content.trim();
    msgContent = msg.content.replace(/[\\<>@#&!]/g, "");

    if (msg.mentions) {
        msg.mentions.users.forEach((user) => {
            const join = (user.id === client.user.id) ? '' : user.username;
            msgContent = msgContent.split(user.id).join(join);
        });
    }

    msgContent = msgContent.trim();
    return msgContent;
}

function isSelf(msg) {
    return msg.author.id === client.user.id;
}

function isSelfTagged(msg) {
    if (msg.mentions) {
        return msg.mentions.users.has(client.user.id);
    }
}

function isStoriesChannel(msg) {
    return msg.channelId === STORIES_CHANNEL_ID || msg.channelId === TEST_CHANNEL_ID;
}

function tryGenerate(msg) {
    return !isSelf(msg) && isStoriesChannel(msg);
}

function getCompletionPrompt(key, processedMsg) {
    const first = processedMsg.indexOf(key);
    return processedMsg.substring(first + (key.length + 1) + 1).trim();
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async msg => {
    try {
        if (!isSelf(msg)) {
            if (channelIdManager.isBotChannel(msg)) {
                generateAndSendGptContent(msg);
            }
            else {
                if (isSelfTagged(msg)) {
                    if (getProcessedMessageContent(msg).toLowerCase() == SET_CHANNEL_CMD) {
                        channelIdManager.addNewBotChannel(msg.channel);
                        msg.reply('All set - here is how you use me:');
                        msg.channel.send(getBotInstructions());
                    }
                    else {
                        msg.reply(`If you want me to generate content on this channel, tag me in a message and type \"${SET_CHANNEL_CMD}\"`);
                    }
                }
            }
        }

    } catch (error) {
        console.log(error);
    }
});

client.login(process.env.DISCORD_TOKEN);

