import { REST, Routes } from 'discord.js';
import { readConfig } from './config.js';
import { commands } from './commands.js';

const config = readConfig();
try {
  const rest = new REST({ version: '10' }).setToken(config.token);
  // Update only our commands; preserve any other application commands.
  for (const command of commands) await rest.post(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: command.toJSON() });
  console.log('Comandos /anuncio y /verificacion registrados.');
} catch (error) {
  console.error('No se pudieron registrar los comandos. Revisa token e IDs:', error.code ?? error.name);
  if (error.code === 50001) {
    console.error('Falta acceso para registrar comandos. Comprueba DISCORD_GUILD_ID y vuelve a autorizar la aplicación en ese servidor con bot y applications.commands:');
    console.error(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&scope=bot%20applications.commands&permissions=268454912`);
  }
  process.exitCode = 1;
}
