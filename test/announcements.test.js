import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { commands } from '../src/commands.js';
import { handleInteraction } from '../src/handlers.js';
import { announcementPayload, colorPalette, parseButtonEmoji, validateAnnouncement } from '../src/announcements.js';

const config = { guildId: '123456789012345678' };
const base = { title: 'Nueva versión', body: 'Descarga disponible', importance: 'novedad', color: '', url: '', label: '' };
const permissions = new PermissionsBitField([
  PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
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
    options: { getString: key => options[key] ?? null, getBoolean: key => options[key] ?? false, getChannel: () => options.canal ? channel : null, getAttachment: () => options.imagen ?? null },
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
      isStringSelectMenu: () => ['importance', 'palette', 'buttonslot'].includes(kind), isFromMessage: () => false,
      reply: async payload => { state.replies.push(payload); },
      deferReply: async function () { this.deferred = true; },
      deferUpdate: async function () { this.deferred = true; }, ...extra };
  }
  return { interaction, state, channel, component };
}

function fields(values, attachment) {
  return { getTextInputValue: key => values[key] || '', getUploadedFiles: () => attachment ? { first: () => attachment } : null };
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
  assert.equal(embed.image.url, 'attachment://anuncio.png');
  assert.equal(state.sent[0].files[0].attachment, 'https://example.com/image.png');
  assert.equal(state.sent[0].components[0].toJSON().components[0].url, 'https://example.com/mod');
  assert.deepEqual(state.sent[0].allowedMentions, { parse: [] });
});

test('Formulario conserva parámetros parciales y llega a preview, canal, importancia y publicación', async () => {
  const { interaction, state, channel, component } = fixture({ titulo: 'Título previo', imagen: { contentType: 'image/png', url: 'https://example.com/image.png' } });
  await handleInteraction(interaction, config);
  assert.equal(state.sent.length, 0);
  assert.equal(state.modal.components[0].component.value, 'Título previo');
  const id = state.modal.custom_id.split(':').at(-1);
  const prefix = 'takumi:announcement:';
  await handleInteraction(component(`${prefix}form:${id}`, 'form', {
    fields: fields(base),
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
  assert.equal(state.modal.components[0].component.value, base.title);
  await handleInteraction(component(`${prefix}form:${id}`, 'form', {
    isFromMessage: () => true,
    fields: fields({ ...base, title: 'Título editado' }),
  }), config);
  await handleInteraction(component(`${prefix}palette:${id}`, 'palette', { values: ['custom'] }), config);
  await handleInteraction(component(`${prefix}colorform:${id}`, 'form', { isFromMessage: () => true, fields: fields({ color: '#112233' }) }), config);
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
  await handleInteraction(component(`takumi:announcement:form:${id}`, 'form', { fields: fields(base) }), config);
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
    fields: fields({ ...base, url: 'javascript:alert(1)' }),
  }), config);
  const reply = state.replies.at(-1);
  assert.match(reply.content, /HTTP/);
  const retry = reply.components[0].toJSON().components[0].custom_id;
  await handleInteraction(component(retry), config);
  assert.equal(state.modal.components[0].component.value, base.title);
  assert.equal(state.modal.components[2].component.value, 'javascript:alert(1)');
  await handleInteraction(component(customId, 'form', {
    fields: fields(base),
  }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0x3498db);
  assert.equal(state.sent.length, 0);
});

test('Imagen del formulario: subida, conservación al editar, reemplazo y archivo final', async () => {
  const { interaction, state, component } = fixture({ canal: true });
  await handleInteraction(interaction, config);
  const form = state.modal;
  assert.equal(form.components.length, 5);
  assert.equal(form.components[4].component.type, 19);
  assert.equal(form.components[4].component.required, false);
  assert.equal(form.components[4].component.max_values, 1);
  const id = form.custom_id.split(':').at(-1);
  const upload = { contentType: 'image/webp', size: 1024, url: 'https://cdn.discordapp.com/attachments/g/c/photo.webp' };
  await handleInteraction(component(form.custom_id, 'form', { fields: fields(base, upload) }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().image.url, upload.url);
  await handleInteraction(component(form.custom_id, 'form', { isFromMessage: () => true, fields: fields({ ...base, title: 'Cambio' }) }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().image.url, upload.url);
  const replacement = { contentType: 'image/png', size: 1024, url: 'https://cdn.discordapp.com/attachments/g/c/replacement.png' };
  await handleInteraction(component(form.custom_id, 'form', { isFromMessage: () => true, fields: fields(base, replacement) }), config);
  const panel = state.replies.at(-1);
  assert.ok(panel.components.length <= 5);
  for (const row of panel.components) assert.ok(row.toJSON().components.length <= 5);
  await handleInteraction(component(`takumi:announcement:publish:${id}`), config);
  assert.equal(state.sent[0].files[0].attachment, replacement.url);
  assert.equal(state.sent[0].embeds[0].toJSON().image.url, 'attachment://anuncio.png');
});

test('Imagen del formulario: rechaza formato y tamaño, permite quitarla y exige Adjuntar archivos', async () => {
  for (const attachment of [
    { contentType: 'application/pdf', size: 100, url: 'https://example.com/doc.pdf' },
    { contentType: 'image/png', size: 11 * 1024 * 1024, url: 'https://example.com/big.png' },
  ]) {
    const { interaction, state, component } = fixture();
    await handleInteraction(interaction, config);
    await handleInteraction(component(state.modal.custom_id, 'form', { fields: fields(base, attachment) }), config);
    assert.match(state.replies.at(-1).content, /PNG|límite/);
    assert.equal(state.sent.length, 0);
  }
  const image = { contentType: 'image/png', size: 100, url: 'https://example.com/image.png' };
  const { interaction, state, channel, component } = fixture({ canal: true, titulo: base.title, mensaje: base.body, imagen: image, editor: true });
  await handleInteraction(interaction, config);
  assert.equal(state.sent.length, 0);
  const cancelId = state.replies.at(-1).components.at(-1).toJSON().components[2].custom_id;
  channel.permissionsFor = () => new PermissionsBitField(permissions.bitfield & ~PermissionFlagsBits.AttachFiles);
  await handleInteraction(component(cancelId.replace(':cancel:', ':publish:')), config);
  assert.equal(state.sent.length, 0);
  assert.match(state.replies.at(-1).content, /Adjuntar archivos/);
  await handleInteraction(component(cancelId.replace(':cancel:', ':removeimage:')), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().image, undefined);
  await handleInteraction(component(cancelId.replace(':cancel:', ':publish:')), config);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].files, undefined);
});

test('Cinco botones: creación, Unicode y emoji de Discord, edición, eliminación y publicación', async () => {
  const { interaction, state, component } = fixture({ canal: true, titulo: base.title, mensaje: base.body, editor: true,
    enlace: 'https://example.com/original', boton: 'Original', emoji: '🔗' });
  await handleInteraction(interaction, config);
  const id = state.replies.at(-1).components.at(-1).toJSON().components[0].custom_id.split(':').at(-1);
  await handleInteraction(component(`takumi:announcement:buttons:${id}`), config);
  const slots = state.replies.at(-1).components.at(-2).toJSON().components[0].options;
  assert.equal(slots.length, 5);
  const emojis = ['🔗', '<:takumi:123456789012345678>', '<a:takumi:223456789012345678>', '👩🏽‍💻', '🇪🇸'];
  for (let slot = 0; slot < 5; slot++) {
    await handleInteraction(component(`takumi:announcement:buttonslot:${id}`, 'buttonslot', { values: [String(slot)] }), config);
    assert.equal(state.modal.title, `Botón ${slot + 1}`);
    const form = state.modal.custom_id;
    await handleInteraction(component(form, 'form', { isFromMessage: () => true,
      fields: fields({ label: `Botón ${slot + 1}`, url: `https://example.com/${slot}`, emoji: emojis[slot] }),
    }), config);
  }
  const buttons = state.replies.at(-1).components[0].toJSON().components;
  assert.equal(buttons.length, 5);
  assert.equal(buttons[1].emoji.id, '123456789012345678');
  assert.equal(buttons[2].emoji.animated, true);
  await handleInteraction(component(`takumi:announcement:back:${id}`), config);
  assert.equal(state.replies.at(-1).components.length, 5);
  await handleInteraction(component(`takumi:announcement:edit:${id}`), config);
  assert.equal(state.modal.components[2].component.value, 'https://example.com/0');
  await handleInteraction(component(state.modal.custom_id, 'form', { isFromMessage: () => true, fields: fields({ ...base, url: 'https://example.com/new', label: 'Primero editado' }) }), config);
  assert.equal(state.replies.at(-1).components[0].toJSON().components.length, 5);
  await handleInteraction(component(`takumi:announcement:buttonform:${id}:2`, 'form', { isFromMessage: () => true, fields: fields({ url: '' }) }), config);
  assert.equal(state.replies.at(-1).components[0].toJSON().components.length, 4);
  await handleInteraction(component(`takumi:announcement:publish:${id}`), config);
  const published = state.sent[0].components[0].toJSON().components;
  assert.equal(published.length, 4);
  assert.equal(published[0].url, 'https://example.com/new');
  assert.equal(published[0].emoji.name, '🔗');
});

test('Botón inválido permite corregirlo sin perder valores ni cambiar los otros botones', async () => {
  assert.throws(() => parseButtonEmoji(':takumi:'), /emoji/);
  assert.throws(() => parseButtonEmoji('🔗🔗'), /emoji/);
  assert.deepEqual(parseButtonEmoji('123456789012345678'), { id: '123456789012345678' });
  assert.throws(() => announcementPayload({ ...base, buttons: Array(6).fill({ url: 'https://example.com' }) }), /5 botones/);
  const { interaction, state, component } = fixture({ titulo: base.title, mensaje: base.body });
  await handleInteraction(interaction, config);
  const id = state.replies.at(-1).components.at(-1).toJSON().components[0].custom_id.split(':').at(-1);
  await handleInteraction(component(`takumi:announcement:buttonform:${id}:0`, 'form', { fields: fields({ label: 'Mi enlace', url: 'https://example.com', emoji: ':takumi:' }) }), config);
  const retry = state.replies.at(-1).components[0].toJSON().components[0].custom_id;
  await handleInteraction(component(retry), config);
  assert.equal(state.modal.components[0].component.value, 'Mi enlace');
  assert.equal(state.modal.components[2].component.value, ':takumi:');
  await handleInteraction(component(state.modal.custom_id, 'form', { isFromMessage: () => true, fields: fields({ label: 'Mi enlace', url: 'https://example.com', emoji: '✅' }) }), config);
  assert.equal(state.replies.at(-1).components[0].toJSON().components[0].emoji.name, '✅');
  await handleInteraction(component(`takumi:announcement:buttonslot:${id}`, 'buttonslot', { values: ['5'] }), config);
  assert.match(state.replies.at(-1).content, /botón válido/);
});

test('Paleta muestra muestras y códigos, aplica color, permite personalizar y recuperar importancia', async () => {
  const { interaction, state, component } = fixture({ titulo: base.title, mensaje: base.body });
  await handleInteraction(interaction, config);
  const id = state.replies.at(-1).components.at(-1).toJSON().components[0].custom_id.split(':').at(-1);
  const palette = state.replies.at(-1).components.at(-2).toJSON().components[0];
  assert.equal(palette.options.length, colorPalette.length + 2);
  assert.ok(palette.options.every(option => option.emoji && option.description));
  await handleInteraction(component(`takumi:announcement:palette:${id}`, 'palette', { values: ['#7C3AED'] }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0x7c3aed);
  await handleInteraction(component(`takumi:announcement:importance:${id}`, 'importance', { values: ['urgente'] }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0x7c3aed);
  await handleInteraction(component(`takumi:announcement:palette:${id}`, 'palette', { values: ['custom'] }), config);
  const form = state.modal.custom_id;
  await handleInteraction(component(form, 'form', { fields: fields({ color: '#ZZZZZZ' }) }), config);
  assert.match(state.replies.at(-1).content, /color/);
  const retry = state.replies.at(-1).components[0].toJSON().components[0].custom_id;
  await handleInteraction(component(retry), config);
  assert.equal(state.modal.components[0].component.value, '#ZZZZZZ');
  await handleInteraction(component(form, 'form', { isFromMessage: () => true, fields: fields({ color: '#000000' }) }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0);
  await handleInteraction(component(`takumi:announcement:palette:${id}`, 'palette', { values: ['automatic'] }), config);
  assert.equal(state.replies.at(-1).embeds[0].toJSON().color, 0xe74c3c);
});
