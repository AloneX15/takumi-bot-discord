export function readConfig(env = process.env) {
  const keys = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'VERIFIED_ROLE_ID'];
  for (const key of keys) {
    if (!env[key] || env[key].startsWith('pon_aqui')) throw new Error(`Configura ${key} en .env.`);
    if (key !== 'DISCORD_TOKEN' && !/^\d{17,20}$/.test(env[key])) throw new Error(`${key} debe ser un ID de Discord válido.`);
  }
  return { token: env.DISCORD_TOKEN, clientId: env.DISCORD_CLIENT_ID, guildId: env.DISCORD_GUILD_ID, roleId: env.VERIFIED_ROLE_ID };
}
