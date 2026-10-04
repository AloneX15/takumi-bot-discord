import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { readConfig } from '../src/config.js';
import { commands } from '../src/commands.js';
import { handleInteraction, VERIFY_ID, validateRole } from '../src/handlers.js';

const config = { guildId: '123456789012345678', roleId: '223456789012345678' };
function fixture({ verified = false, staff = false, guildId = config.guildId, dangerous = false } = {}) {
  const state = { added: 0, replies: [] };
  const role = { id: config.roleId, managed: false, editable: true, permissions: new PermissionsBitField(dangerous ? PermissionFlagsBits.Administrator : 0n) };
  const member = { roles: { cache: new Map(verified ? [[role.id, role]] : []), add: async () => { state.added++; } } };
  const bot = { permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles) };
  const interaction = {
    isButton: () => true, isChatInputCommand: () => false, customId: VERIFY_ID,
    deferReply: async () => {}, editReply: async reply => { state.replies.push(reply); },
    reply: async reply => { state.replies.push(reply); },
    inGuild: () => true, guildId, user: { id: 'user' },
    memberPermissions: new PermissionsBitField(staff ? PermissionFlagsBits.ManageGuild : 0n),
    guild: { id: config.guildId, roles: { fetch: async () => role }, members: { fetchMe: async () => bot, fetch: async () => member } },
  };
  return { interaction, state, role, bot };
}

test('La verificación asigna el rol una vez y responde en privado', async () => {
  const { interaction, state } = fixture();
  let flags;
  interaction.deferReply = async options => { flags = options.flags; };
  await handleInteraction(interaction, config);
  assert.equal(state.added, 1);
  assert.equal(flags, 64);
  assert.match(state.replies[0], /completada/);
});
test('No vuelve a asignar el rol a un miembro verificado', async () => {
  const { interaction, state } = fixture({ verified: true });
  await handleInteraction(interaction, config);
  assert.equal(state.added, 0);
  assert.match(state.replies[0], /Ya estás/);
});
test('Rechaza botones de otro servidor y roles administrativos', async () => {
  for (const options of [{ guildId: 'other' }, { dangerous: true }]) {
    const { interaction, state } = fixture(options);
    await handleInteraction(interaction, config);
    assert.equal(state.added, 0);
    assert.match(state.replies[0].content, /❌/);
  }
});
test('Rechaza comandos de usuarios sin Gestionar servidor antes de publicar', async () => {
  const { interaction, state } = fixture();
  interaction.isButton = () => false;
  interaction.isChatInputCommand = () => true;
  interaction.commandName = 'anuncio';
  interaction.options = { getChannel: () => { assert.fail('No debe intentar publicar'); } };
  await handleInteraction(interaction, config);
  assert.match(state.replies[0].content, /Gestionar servidor/);
});
test('Rechaza roles de integración, @everyone y roles fuera de alcance', () => {
  const { interaction, role, bot } = fixture();
  for (const changes of [{ managed: true }, { id: config.guildId }, { editable: false }]) {
    assert.throws(() => validateRole({ ...role, ...changes }, interaction.guild, bot));
  }
});
test('Valida configuración y serializa comandos con acceso restringido', () => {
  assert.throws(() => readConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => readConfig({ DISCORD_TOKEN: 'example', DISCORD_CLIENT_ID: 'invalid' }), /ID de Discord/);
  for (const command of commands) {
    const json = command.toJSON();
    assert.equal(json.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    assert.equal(json.dm_permission, false);
  }
});
