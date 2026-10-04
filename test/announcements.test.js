import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { commands } from '../src/commands.js';
import { handleInteraction } from '../src/handlers.js';
import { announcementPayload, validateAnnouncement } from '../src/announcements.js';

const config = { guildId: '123456789012345678' };
const base = { title: 'Nueva versión', body: 'Descarga disponible', importance: 'novedad', color: '', url: '', label: '' };
const permissions = new PermissionsBitField([
  PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
]);

function fixture(options = {}) {
  const state = { sent: [], replies: [], modal: null, deferred: false };
  const channel = { id: '223456789012345678', type: ChannelType.GuildText,
    permissionsFor: () => permissions,
    send: async payload => { state.sent.push(payload); return { url: 'https://discord.com/channels/g/c/m' }; },
  };
  const interaction = {
    user: { id: 'owner' }, memberPermissions: permissions, guildId: config.guildId,
    inGuild: () => true, isChatInputCommand: () => true, isButton: () => false,
    isModalSubmit: () => false, isChannelSelectMenu: () => false, isStringSelectMenu: () => false,
    commandName: 'anuncio',
    options: { getString: key => options[key] ?? null, getChannel: () => options.canal ? channel : null, getAttachment: () => options.imagen ?? null },
    guild: { channels: { fetch: async () => channel }, members: { fetchMe: async () => ({ permissions }), fetch: async () => ({ permissions }) } },
    showModal: async modal => { state.modal = modal.toJSON(); interaction.replied = true; },
    reply: async payload => { state.replies.push(payload); interaction.replied = true; },
    editReply: async payload => { state.replies.push(payload); },
    update: async payload => { state.replies.push(payload); interaction.replied = true; },
    deferReply: async () => { state.deferred = true; interaction.deferred = true; },
    deferUpdate: async () => { state.deferred = true; interaction.deferred = true; },
  };
  function component(customId, kind = 'button', extra = {}) {
    return { ...interaction, options: undefined, commandName: undefined, deferred: false, replied: false, customId,
      isChatInputCommand: () => false, isButton: () => kind === 'button',
      isModalSubmit: () => kind === 'form', isChannelSelectMenu: () => kind === 'channel',
      isStringSelectMenu: () => kind === 'importance', isFromMessage: () => false,
      reply: async payload => { state.replies.push(payload); },
      deferReply: async function () { this.deferred = true; },
      deferUpdate: async function () { this.deferred = true; }, ...extra };
  }
  return { interaction, state, channel, component };
}

test('Parámetros opcionales conservan publicación directa, imagen, enlace y color', async () => {
  const json = commands[0].toJSON();
  assert.ok(json.options.every(option => !option.required));
  const { interaction, state } = fixture({ canal: true, titulo: base.title, mensaje: base.body,
    importancia: 'urgente', color: '#123ABC', enlace: 'https://example.com/mod', boton: 'Descargar',
    imagen: { contentType: 'image/png', url: 'https://example.com/image.png' } });
  await handleInteraction(interaction, config);
  assert.equal(state.sent.length, 1);
  const embed = state.sent[0].embeds[0].toJSON();
  assert.equal(embed.color, 0x123abc);
  assert.match(embed.footer.text, /Urgente/);
  assert.equal(embed.image.url, 'https://example.com/image.png');
  assert.equal(state.sent[0].components[0].toJSON().components[0].url, 'https://example.com/mod');
  assert.deepEqual(state.sent[0].allowedMentions, { parse: [] });
});

test('Formulario conserva parámetros parciales y llega a preview, canal, importancia y publicación', async () => {
  const { interaction, state, channel, component } = fixture({ titulo: 'Título previo', imagen: { contentType: 'image/png', url: 'https://example.com/image.png' } });
  await handleInteraction(interaction, config);
  assert.equal(state.sent.length, 0);
  assert.equal(state.modal.components[0].components[0].value, 'Título previo');
  const id = state.modal.custom_id.split(':').at(-1);
  const prefix = 'takumi:announcement:';
  await handleInteraction(component(`${prefix}form:${id}`, 'form', {
    fields: { getTextInputValue: key => base[key] || '' },
  }), config);
  let panel = state.replies.at(-1);
  assert.equal(panel.embeds[0].toJSON().image.url, 'https://example.com/image.png');
  assert.equal(panel.components.at(-1).toJSON().components[1].disabled, true);
  await handleInteraction(component(`${prefix}channel:${id}`, 'channel', { values: [channel.id] }), config);
  await handleInteraction(component(`${prefix}importance:${id}`, 'importance', { values: ['urgente'] }), config);
  panel = state.replies.at(-1);
  assert.equal(panel.embeds[0].toJSON().color, 0xe74c3c);
  assert.equal(panel.components.at(-1).toJSON().components[1].disabled, false);
  await handleInteraction(component(`${prefix}edit:${id}`), config);
  assert.equal(state.modal.components[0].components[0].value, base.title);
  await handleInteraction(component(`${prefix}form:${id}`, 'form', {
    isFromMessage: () => true,
    fields: { getTextInputValue: key => ({ ...base, title: 'Título editado', color: '#112233' })[key] || '' },
  }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0x112233);
  await handleInteraction(component(`${prefix}publish:${id}`), config);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].embeds[0].toJSON().title, 'Título editado');
  await handleInteraction(component(`${prefix}publish:${id}`), config);
  assert.equal(state.sent.length, 1);
  assert.match(state.replies.at(-1).content, /caducado/);
});

test('El borrador pertenece al autor y cancelar impide publicar', async () => {
  const { interaction, state, component } = fixture({ titulo: base.title, mensaje: base.body });
  await handleInteraction(interaction, config);
  const button = state.replies.at(-1).components.at(-1).toJSON().components[2].custom_id;
  await handleInteraction(component(button, 'button', { user: { id: 'otro' } }), config);
  assert.match(state.replies.at(-1).content, /Solo quien creó/);
  await handleInteraction(component(button), config);
  assert.deepEqual(state.replies.at(-1).components, []);
  await handleInteraction(component(button.replace(':cancel:', ':publish:')), config);
  assert.equal(state.sent.length, 0);
});

test('No publica sin permisos de canal ni con enlaces o colores inválidos', async () => {
  for (const data of [{ color: '#oops' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' }, { label: 'Abrir' }, { body: ' ' }]) {
    assert.throws(() => validateAnnouncement({ ...base, ...data }));
  }
  assert.equal(announcementPayload(base).embeds[0].toJSON().color, 0x2ecc71);
  const { interaction, state, channel } = fixture({ canal: true, titulo: base.title, mensaje: base.body });
  channel.permissionsFor = () => new PermissionsBitField();
  await handleInteraction(interaction, config);
  assert.equal(state.sent.length, 0);
  assert.match(state.replies.at(-1).content, /ver el canal/);
});

test('La publicación bloquea clics simultáneos y vuelve a comprobar Gestionar servidor', async () => {
  const { interaction, state, channel, component } = fixture({ canal: true, titulo: base.title });
  await handleInteraction(interaction, config);
  const id = state.modal.custom_id.split(':').at(-1);
  await handleInteraction(component(`takumi:announcement:form:${id}`, 'form', { fields: { getTextInputValue: key => base[key] || '' } }), config);
  let release;
  channel.send = async payload => {
    state.sent.push(payload);
    await new Promise(resolve => { release = resolve; });
    return { url: 'https://discord.com/channels/g/c/m' };
  };
  const first = handleInteraction(component(`takumi:announcement:publish:${id}`), config);
  await new Promise(resolve => setImmediate(resolve));
  await handleInteraction(component(`takumi:announcement:publish:${id}`), config);
  assert.match(state.replies.at(-1).content, /ya se está publicando/);
  release();
  await first;
  assert.equal(state.sent.length, 1);
  const denied = fixture({ canal: true, titulo: base.title, mensaje: base.body });
  denied.interaction.guild.members.fetch = async () => ({ permissions: new PermissionsBitField() });
  await handleInteraction(denied.interaction, config);
  assert.equal(denied.state.sent.length, 0);
  assert.match(denied.state.replies.at(-1).content, /Gestionar servidor/);
});

test('Caducidad, servidor e imagen inválida impiden publicar', async t => {
  const { interaction, state, component } = fixture({ titulo: base.title, mensaje: base.body });
  await handleInteraction(interaction, config);
  const button = state.replies.at(-1).components.at(-1).toJSON().components[1].custom_id;
  await handleInteraction(component(button, 'button', { guildId: 'otro-servidor' }), config);
  assert.match(state.replies.at(-1).content, /solo está configurado/);
  const future = Date.now() + 16 * 60 * 1000;
  t.mock.method(Date, 'now', () => future);
  await handleInteraction(component(button), config);
  assert.match(state.replies.at(-1).content, /caducado/);
  assert.equal(state.sent.length, 0);
  const invalid = fixture({ canal: true, titulo: base.title, mensaje: base.body, imagen: { contentType: 'application/pdf' } });
  await handleInteraction(invalid.interaction, config);
  assert.equal(invalid.state.sent.length, 0);
  assert.match(invalid.state.replies.at(-1).content, /PNG/);
});

test('El formulario inválido permite corregir sin perder los campos introducidos', async () => {
  const { interaction, state, component } = fixture();
  await handleInteraction(interaction, config);
  const customId = state.modal.custom_id;
  await handleInteraction(component(customId, 'form', {
    fields: { getTextInputValue: key => ({ ...base, color: '#ZZZZZZ' })[key] || '' },
  }), config);
  const reply = state.replies.at(-1);
  assert.match(reply.content, /color/);
  const retry = reply.components[0].toJSON().components[0].custom_id;
  await handleInteraction(component(retry), config);
  assert.equal(state.modal.components[0].components[0].value, base.title);
  assert.equal(state.modal.components[4].components[0].value, '#ZZZZZZ');
  await handleInteraction(component(customId, 'form', {
    fields: { getTextInputValue: key => ({ ...base, color: '#112233' })[key] || '' },
  }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0x112233);
  assert.equal(state.sent.length, 0);
});
