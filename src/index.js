import { Client, Events, GatewayIntentBits } from 'discord.js';
import { readConfig } from './config.js';
import { handleInteraction } from './handlers.js';

const config = readConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] } });
client.once(Events.ClientReady, ready => console.log(`TakumiStudios conectado como ${ready.user.tag}.`));
client.on(Events.InteractionCreate, interaction => {
  handleInteraction(interaction, config).catch(error => console.error('No se pudo responder a la interacción:', error.code ?? error.name));
});
client.on(Events.Error, error => console.error('Error de conexión:', error.code ?? error.name));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { client.destroy(); process.exit(0); });
try { await client.login(config.token); }
catch (error) { console.error('No se pudo iniciar el bot. Revisa el token y la conexión:', error.code ?? error.name); process.exitCode = 1; }
