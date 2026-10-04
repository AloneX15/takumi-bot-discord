import { randomUUID } from 'node:crypto';
import { announcementLinks } from './announcement-links.js';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} from 'discord.js';

const PREFIX = 'takumi:announcement:';
const LINK_PREFIX = 'takumi:link:v1:';
const drafts = new Map();
const TTL = 15 * 60 * 1000;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const buttonStyles = {
  link: { label: 'Enlace directo (gris)', style: ButtonStyle.Link, emoji: '🔗' },
  primary: { label: 'Azul violáceo', style: ButtonStyle.Primary, emoji: '🔵' },
  secondary: { label: 'Gris', style: ButtonStyle.Secondary, emoji: '⚪' },
  success: { label: 'Verde', style: ButtonStyle.Success, emoji: '🟢' },
  danger: { label: 'Rojo', style: ButtonStyle.Danger, emoji: '🔴' },
};
const commonEmojis = [
  ['🔗', 'Enlace'], ['▶️', 'Vídeo'], ['📺', 'Canal'], ['🎮', 'Juegos'], ['📥', 'Descargar'],
  ['🚀', 'Lanzamiento'], ['💜', 'Corazón morado'], ['💚', 'Corazón verde'], ['❤️', 'Corazón rojo'],
  ['🟠', 'Naranja'], ['⭐', 'Estrella'], ['📢', 'Anuncio'], ['🔥', 'Fuego'], ['✅', 'Confirmación'],
].map(([value, label]) => ({ value, label, emoji: { name: value } }));
export const colorPalette = [
  { label: 'Azul', value: '#3498DB', emoji: '🔵' },
  { label: 'Verde', value: '#2ECC71', emoji: '🟢' },
  { label: 'Naranja', value: '#F39C12', emoji: '🟠' },
  { label: 'Rojo', value: '#E74C3C', emoji: '🔴' },
  { label: 'Morado Takumi', value: '#7C3AED', emoji: '🟣' },
  { label: 'Rosa', value: '#EB459E', emoji: '🌸' },
  { label: 'Amarillo', value: '#F1C40F', emoji: '🟡' },
  { label: 'Turquesa', value: '#1ABC9C', emoji: '💠' },
  { label: 'Blanco', value: '#FFFFFF', emoji: '⚪' },
  { label: 'Gris', value: '#95A5A6', emoji: '🔘' },
  { label: 'Negro', value: '#000000', emoji: '⚫' },
];
export const importanceLevels = {
  informativo: { label: 'Informativo', color: 0x3498db },
  novedad: { label: 'Novedad', color: 0x2ecc71 },
  importante: { label: 'Importante', color: 0xf39c12 },
  urgente: { label: 'Urgente', color: 0xe74c3c },
};

export function validateAnnouncement(data, complete = true) {
  if (complete && (!data.title?.trim() || !data.body?.trim())) throw new Error('Completa el título y el mensaje.');
  if ((data.title?.length ?? 0) > 256 || (data.body?.length ?? 0) > 4000) throw new Error('El título admite 256 caracteres y el mensaje 4000.');
  if (!Object.hasOwn(importanceLevels, data.importance)) throw new Error('Selecciona una importancia válida.');
  if (data.color && !/^#[\da-f]{6}$/i.test(data.color)) throw new Error('El color debe tener el formato #FF8800.');
  validateLinkButton({ url: data.url, label: data.label, emoji: data.emoji, style: data.buttonStyle }, complete);
  if (data.buttons) {
    if (!Array.isArray(data.buttons) || data.buttons.length > 5) throw new Error('El anuncio admite hasta 5 botones.');
    for (const button of data.buttons) if (button) validateLinkButton(button);
  }
}

export function parseButtonEmoji(value = '') {
  if (!value) return undefined;
  const custom = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(value);
  if (custom) return { animated: custom[1] === 'a', name: custom[2], id: custom[3] };
  if (/^\d{17,20}$/.test(value)) return { id: value };
  // Accept a single Unicode emoji, including flags, skin tones and ZWJ sequences.
  const segments = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(value)];
  if (segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)) return { name: value };
  throw new Error('Usa un emoji como 🔗, <:nombre:ID>, <a:nombre:ID> o su ID de Discord.');
}

function validateLinkButton(data, complete = true) {
  if (!Object.hasOwn(buttonStyles, data.style || 'link')) throw new Error('Selecciona un estilo de botón válido.');
  if (data.url) {
    let url;
    try { url = new URL(data.url); } catch { throw new Error('Introduce un enlace HTTP o HTTPS válido.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || data.url.length > 512) throw new Error('Introduce un enlace HTTP o HTTPS válido, sin credenciales y de hasta 512 caracteres.');
  }
  if (complete && data.label && !data.url) throw new Error('Añade un enlace para usar el texto del botón.');
  if (complete && data.emoji && !data.url) throw new Error('Añade un enlace para usar el emoji del botón.');
  if ((data.label?.length ?? 0) > 80) throw new Error('El texto del botón admite 80 caracteres.');
  parseButtonEmoji(data.emoji);
}

function linkButtons(data) {
  return data.buttons || (data.url ? [{ url: data.url, label: data.label, emoji: data.emoji, style: data.buttonStyle || 'link' }] : []);
}

function setFirstButton(data, button) {
  const buttons = [...linkButtons(data)];
  buttons[0] = button?.url ? button : null;
  return { ...data, buttons, url: button?.url || '', label: button?.label || '', emoji: button?.emoji || '', buttonStyle: button?.style || 'link' };
}

function applyImage(data, attachment, sizeLimit = MAX_IMAGE_SIZE) {
  if (!Object.hasOwn(IMAGE_TYPES, attachment.contentType)) throw new Error('La imagen debe ser PNG, JPEG, GIF o WebP.');
  if (attachment.size > Math.min(sizeLimit, MAX_IMAGE_SIZE)) throw new Error('La imagen supera el límite permitido (máximo 10 MiB).');
  return { ...data, image: attachment.url, imageAttachment: { url: attachment.url, contentType: attachment.contentType, size: attachment.size } };
}

export function announcementPayload(data, uploadImage = false, buttonId = (slot => `${PREFIX}unavailable:preview:${slot}`)) {
  validateAnnouncement(data);
  const level = importanceLevels[data.importance];
  const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.body)
    .setColor(data.color ? Number.parseInt(data.color.slice(1), 16) : level.color)
    .setFooter({ text: `Creado por TakumiStudios · ${level.label}` }).setTimestamp();
  const files = [];
  if (data.image) {
    if (uploadImage && data.imageAttachment) {
      const name = `anuncio.${IMAGE_TYPES[data.imageAttachment.contentType]}`;
      files.push({ attachment: data.imageAttachment.url, name });
      embed.setImage(`attachment://${name}`);
    } else embed.setImage(data.image);
  }
  const buttons = linkButtons(data).map((button, slot) => {
    if (!button) return null;
    const style = buttonStyles[button.style || 'link'].style;
    const builder = new ButtonBuilder().setStyle(style).setLabel(button.label || 'Abrir enlace');
    if (style === ButtonStyle.Link) builder.setURL(button.url);
    else builder.setCustomId(buttonId(slot));
    if (button.emoji) builder.setEmoji(parseButtonEmoji(button.emoji));
    return builder;
  }).filter(Boolean);
  const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
  return { embeds: [embed], components, ...(files.length ? { files } : {}), allowedMentions: { parse: [] } };
}

function addText(form, key, label, max, required, style, value, placeholder) {
  const input = new TextInputBuilder().setCustomId(key).setMaxLength(max).setRequired(required).setStyle(style);
  if (value) input.setValue(value);
  if (placeholder) input.setPlaceholder(placeholder);
  form.addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(input));
}

function modal(id, data) {
  const form = new ModalBuilder().setCustomId(`${PREFIX}form:${id}`).setTitle('Preparar anuncio');
  for (const [key, label, max, required, style] of [
    ['title', 'Título', 256, true, TextInputStyle.Short],
    ['body', 'Mensaje', 4000, true, TextInputStyle.Paragraph],
    ['url', 'Enlace HTTP/HTTPS (opcional)', 512, false, TextInputStyle.Short],
    ['label', 'Texto del botón (opcional)', 80, false, TextInputStyle.Short],
  ]) {
    addText(form, key, label, max, required, style, data[key]);
  }
  form.addLabelComponents(new LabelBuilder().setLabel('Imagen (opcional)')
    .setDescription(data.image ? 'Sube otra para reemplazarla; sin archivo se conserva la imagen actual.' : 'PNG, JPEG, GIF o WebP. Máximo 10 MiB.')
    .setFileUploadComponent(new FileUploadBuilder().setCustomId('image').setMinValues(0).setMaxValues(1).setRequired(false)));
  return form;
}

function emojiOptions(guild) {
  const server = [...(guild.emojis?.cache?.values() || [])].filter(emoji => emoji.available !== false).map(emoji => ({
    label: emoji.name || 'Emoji del servidor', value: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
    emoji: { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) },
  }));
  return [...server, ...commonEmojis];
}

function buttonModal(id, slot, data, values, guild) {
  const button = values || linkButtons(data)[slot] || {};
  const form = new ModalBuilder().setCustomId(`${PREFIX}buttonform:${id}:${slot}`).setTitle(`Botón ${slot + 1}`);
  addText(form, 'label', 'Texto (vacío: Abrir enlace)', 80, false, TextInputStyle.Short, button.label);
  addText(form, 'url', 'Enlace (vacío: eliminar este botón)', 512, false, TextInputStyle.Short, button.url, 'https://...');
  addText(form, 'emoji', 'Emoji Unicode o personalizado (opcional)', 100, false, TextInputStyle.Short, button.emoji, '🔗 o <:nombre:123456789012345678>');
  const style = new StringSelectMenuBuilder().setCustomId('style').setRequired(true).addOptions(
    Object.entries(buttonStyles).map(([value, option]) => ({ label: option.label, value, emoji: option.emoji,
      description: value === 'link' ? 'Abre la URL directamente.' : 'Muestra el enlace en privado al pulsar.', default: value === (button.style || 'link') })),
  );
  form.addLabelComponents(new LabelBuilder().setLabel('Color / comportamiento del botón').setStringSelectMenuComponent(style));
  const picker = new StringSelectMenuBuilder().setCustomId('emojiChoice').setRequired(true).addOptions(
    { label: 'Usar el emoji del campo de texto', value: 'text', emoji: '✏️', default: true },
    { label: 'Sin emoji', value: 'none', emoji: '➖' },
    { label: 'Ver todos los emojis…', value: 'catalog', emoji: '🔎' },
    ...emojiOptions(guild).slice(0, 22),
  );
  form.addLabelComponents(new LabelBuilder().setLabel('Seleccionar emoji').setStringSelectMenuComponent(picker));
  return form;
}

function emojiPanel(id, slot, draft, page = 0) {
  const catalog = draft.emojiCatalog;
  const pages = Math.max(1, Math.ceil(catalog.length / 24));
  page = Math.max(0, Math.min(page, pages - 1));
  const picker = new StringSelectMenuBuilder().setCustomId(`${PREFIX}emoji:${id}:${slot}`).setPlaceholder('Elige un emoji').addOptions(
    { label: 'Sin emoji', value: 'none', emoji: '➖' }, ...catalog.slice(page * 24, (page + 1) * 24),
  );
  return { ...announcementPayload(draft.data, false, position => `${PREFIX}open:${id}:${position}`),
    content: `Emojis del servidor y habituales · botón ${slot + 1} · página ${page + 1}/${pages}`,
    components: [new ActionRowBuilder().addComponents(picker), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}emojipage:${id}:${slot}:${page - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${PREFIX}emojipage:${id}:${slot}:${page + 1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
      new ButtonBuilder().setCustomId(`${PREFIX}buttons:${id}`).setLabel('Volver a botones').setStyle(ButtonStyle.Secondary),
    )] };
}

function colorModal(id, data, value) {
  const form = new ModalBuilder().setCustomId(`${PREFIX}colorform:${id}`).setTitle('Color personalizado');
  addText(form, 'color', 'Color #RRGGBB (vacío: según importancia)', 7, false, TextInputStyle.Short, value ?? data.color, '#7C3AED');
  return form;
}

function buttonPanel(id, data) {
  const payload = announcementPayload(data, false, slot => `${PREFIX}open:${id}:${slot}`);
  const slots = linkButtons(data);
  const select = new StringSelectMenuBuilder().setCustomId(`${PREFIX}buttonslot:${id}`)
    .setPlaceholder('Añade o edita un botón').addOptions(Array.from({ length: 5 }, (_, slot) => ({
      label: slots[slot] ? `Editar botón ${slot + 1}: ${slots[slot].label || 'Abrir enlace'}`.slice(0, 100) : `Añadir botón ${slot + 1}`,
      description: slots[slot] ? 'Modifica su enlace y emoji; vacía el enlace para eliminarlo.' : 'Introduce el texto, enlace y emoji opcional.',
      value: String(slot),
    })));
  return { ...payload, content: 'Botones del anuncio · hasta 5 enlaces. Selecciona uno para añadirlo, editarlo o eliminarlo.',
    components: [...payload.components, new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}back:${id}`).setLabel('Volver a la vista previa').setStyle(ButtonStyle.Secondary),
    )] };
}

function preview(id, data) {
  const payload = announcementPayload(data, false, slot => `${PREFIX}open:${id}:${slot}`);
  const channel = new ChannelSelectMenuBuilder().setCustomId(`${PREFIX}channel:${id}`)
    .setPlaceholder('Selecciona el canal de publicación').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (data.channelId) channel.setDefaultChannels(data.channelId);
  const importance = new StringSelectMenuBuilder().setCustomId(`${PREFIX}importance:${id}`)
    .setPlaceholder('Importancia').addOptions(Object.entries(importanceLevels).map(([value, level]) => ({
      label: level.label, value, default: value === data.importance,
    })));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}edit:${id}`).setLabel('Editar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}publish:${id}`).setLabel('Publicar').setStyle(ButtonStyle.Success).setDisabled(!data.channelId),
    new ButtonBuilder().setCustomId(`${PREFIX}cancel:${id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${PREFIX}buttons:${id}`).setLabel('Botones').setStyle(ButtonStyle.Secondary),
  );
  if (data.image) buttons.addComponents(new ButtonBuilder().setCustomId(`${PREFIX}removeimage:${id}`).setLabel('Quitar imagen').setStyle(ButtonStyle.Secondary));
  const color = new StringSelectMenuBuilder().setCustomId(`${PREFIX}palette:${id}`).setPlaceholder('🎨 Paleta de colores').addOptions(
    { label: 'Según importancia', value: 'automatic', emoji: '🎨', description: 'Usar el color predeterminado de la importancia.', default: !data.color },
    ...colorPalette.map(option => ({ ...option, description: option.value, default: data.color?.toUpperCase() === option.value })),
    { label: 'Color personalizado…', value: 'custom', emoji: '🖌️', description: data.color || 'Introduce cualquier color #RRGGBB.',
      default: Boolean(data.color) && !colorPalette.some(option => option.value === data.color.toUpperCase()) },
  );
  return { ...payload, content: `Vista previa privada · ${data.channelId ? `Canal: <#${data.channelId}>` : 'Selecciona un canal.'}\nEl borrador caduca a los 15 minutos o al reiniciar el bot.${data.color ? '\nColor personalizado activo; tiene prioridad sobre la importancia.' : ''}`,
    components: [...payload.components, new ActionRowBuilder().addComponents(channel), new ActionRowBuilder().addComponents(importance), new ActionRowBuilder().addComponents(color), buttons] };
}

async function publish(interaction, data, config) {
  let payload = announcementPayload(data, true);
  if (!data.channelId) throw new Error('Selecciona un canal.');
  const channel = await interaction.guild.channels.fetch(data.channelId);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Selecciona un canal de texto o de anuncios del servidor.');
  const [bot, member] = await Promise.all([
    interaction.guild.members.fetchMe(), interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) throw new Error('Necesitas el permiso Gestionar servidor para publicar.');
  if (!channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('Necesitas poder ver el canal y enviar mensajes en él.');
  if (!channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('El bot necesita Ver canal, Enviar mensajes e Insertar enlaces en ese canal.');
  if (payload.files && !channel.permissionsFor(bot)?.has(PermissionFlagsBits.AttachFiles)) throw new Error('El bot necesita Adjuntar archivos para publicar la imagen.');
  if (data.imageAttachment?.size > (interaction.attachmentSizeLimit ?? MAX_IMAGE_SIZE)) throw new Error('La imagen supera el tamaño permitido por Discord en este servidor.');
  if (linkButtons(data).some(button => button && button.style && button.style !== 'link')) {
    const id = await (config.linkStore || announcementLinks).save(interaction.guildId, linkButtons(data));
    payload = announcementPayload(data, true, slot => `${LINK_PREFIX}${id}:${slot}`);
  }
  return channel.send(payload);
}

async function replyWithLink(interaction, button) {
  if (!button?.url) throw new Error('Este botón ya no tiene un enlace disponible.');
  validateLinkButton(button);
  const payload = { content: 'Pulsa el botón para abrir el enlace.', allowedMentions: { parse: [] },
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(button.label || 'Abrir enlace').setURL(button.url))] };
  if (interaction.deferred) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

export async function handleAnnouncement(interaction, config) {
  const command = interaction.isChatInputCommand() && interaction.commandName === 'anuncio';
  const publicLink = interaction.isButton() && interaction.customId?.startsWith(LINK_PREFIX);
  const component = (interaction.isButton() || interaction.isModalSubmit?.() || interaction.isChannelSelectMenu?.() || interaction.isStringSelectMenu?.()) && interaction.customId?.startsWith(PREFIX);
  if (!command && !component && !publicLink) return false;
  try {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) throw new Error('Este bot solo está configurado para su servidor.');
    if (publicLink) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const [id, slot] = interaction.customId.slice(LINK_PREFIX.length).split(':');
      const record = await (config.linkStore || announcementLinks).load(id);
      if (!record || record.guildId !== interaction.guildId || !/^[0-4]$/.test(slot || '')) throw new Error('No se encuentra el enlace de este botón. Comprueba que se conserve la carpeta .data del bot.');
      await replyWithLink(interaction, record.buttons[Number(slot)]);
      return true;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Necesitas el permiso Gestionar servidor para usar este comando.');
    for (const [key, draft] of drafts) if (draft.expires <= Date.now() && !draft.busy) drafts.delete(key);
    if (command) {
      let data = {
        channelId: interaction.options.getChannel('canal')?.id,
        title: interaction.options.getString('titulo') || '', body: interaction.options.getString('mensaje') || '',
        importance: interaction.options.getString('importancia') || 'informativo',
        color: interaction.options.getString('color')?.trim() || '', url: interaction.options.getString('enlace')?.trim() || '',
        label: interaction.options.getString('boton')?.trim() || '',
        emoji: interaction.options.getString('emoji')?.trim() || '',
        buttonStyle: interaction.options.getString('estilo_boton') || 'link',
      };
      const attachment = interaction.options.getAttachment('imagen');
      if (attachment) {
        data = applyImage(data, attachment, interaction.attachmentSizeLimit);
      }
      validateAnnouncement(data, false);
      if (data.channelId && data.title.trim() && data.body.trim() && !interaction.options.getBoolean('editor')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await publish(interaction, data, config);
        await interaction.editReply({ content: `✅ Publicado: ${message.url}`, allowedMentions: { parse: [] } });
      } else {
        if (drafts.size >= 500) throw new Error('Hay demasiados borradores abiertos. Vuelve a intentarlo más tarde.');
        const id = randomUUID();
        drafts.set(id, { data, owner: interaction.user.id, guildId: interaction.guildId, expires: Date.now() + TTL, busy: false });
        if (data.title.trim() && data.body.trim()) await interaction.reply({ ...preview(id, data), flags: MessageFlags.Ephemeral });
        else await interaction.showModal(modal(id, data));
      }
      return true;
    }
    const [action, id, slotValue, pageValue] = interaction.customId.slice(PREFIX.length).split(':');
    const draft = drafts.get(id);
    if (!draft || draft.expires <= Date.now()) throw new Error('El borrador ha caducado o el bot se ha reiniciado. Usa /anuncio de nuevo.');
    if (draft.owner !== interaction.user.id || draft.guildId !== interaction.guildId) throw new Error('Solo quien creó el anuncio puede modificarlo o publicarlo.');
    if (draft.busy) throw new Error('El anuncio ya se está publicando.');
    if (action === 'open' && interaction.isButton()) {
      if (!/^[0-4]$/.test(slotValue || '')) throw new Error('Selecciona un botón válido.');
      await replyWithLink(interaction, linkButtons(draft.data)[Number(slotValue)]);
    } else if (action === 'edit' && interaction.isButton()) await interaction.showModal(modal(id, draft.data));
    else if (action === 'retrycolor' && interaction.isButton()) await interaction.showModal(colorModal(id, draft.data, draft.pendingColor));
    else if (action === 'retrybutton' && interaction.isButton()) {
      const slot = Number(slotValue);
      if (!/^\d$/.test(slotValue ?? '') || slot > 4 || draft.pendingButton?.slot !== slot) throw new Error('Selecciona un botón válido.');
      await interaction.showModal(buttonModal(id, slot, draft.data, draft.pendingButton.values, interaction.guild));
    } else if (action === 'buttons' && interaction.isButton()) await interaction.update(buttonPanel(id, draft.data));
    else if (action === 'back' && interaction.isButton()) await interaction.update(preview(id, draft.data));
    else if (action === 'removeimage' && interaction.isButton()) {
      delete draft.data.image;
      delete draft.data.imageAttachment;
      await interaction.update(preview(id, draft.data));
    } else if (action === 'buttonslot' && interaction.isStringSelectMenu?.()) {
      const slot = Number(interaction.values[0]);
      if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new Error('Selecciona un botón válido.');
      await interaction.showModal(buttonModal(id, slot, draft.data, draft.pendingButton?.slot === slot ? draft.pendingButton.values : undefined, interaction.guild));
    } else if (action === 'buttonform' && interaction.isModalSubmit?.()) {
      const slot = Number(slotValue);
      if (!/^\d$/.test(slotValue ?? '') || slot > 4) throw new Error('Selecciona un botón válido.');
      const button = Object.fromEntries(['label', 'url', 'emoji'].map(key => [key, interaction.fields.getTextInputValue(key).trim()]));
      button.style = interaction.fields.getStringSelectValues('style')[0];
      const emojiChoice = interaction.fields.getStringSelectValues('emojiChoice')[0];
      if (emojiChoice === 'none') button.emoji = '';
      else if (emojiChoice === 'catalog') button.emoji = linkButtons(draft.data)[slot]?.emoji || '';
      else if (!['text', 'catalog'].includes(emojiChoice)) {
        if (!emojiOptions(interaction.guild).some(option => option.value === emojiChoice)) throw new Error('Selecciona un emoji válido del catálogo.');
        button.emoji = emojiChoice;
      }
      draft.pendingButton = { slot, values: button };
      // Clearing the URL explicitly removes the selected button.
      if (button.url) validateLinkButton(button);
      let data = { ...draft.data, buttons: [...linkButtons(draft.data)] };
      data.buttons[slot] = button.url ? button : null;
      if (slot === 0) data = setFirstButton(data, button.url ? button : null);
      validateAnnouncement(data);
      draft.data = data;
      await interaction.deferUpdate();
      if (emojiChoice === 'catalog' && button.url) {
        if (interaction.guild.emojis?.fetch) await interaction.guild.emojis.fetch();
        draft.emojiCatalog = emojiOptions(interaction.guild);
        await interaction.editReply(emojiPanel(id, slot, draft));
      } else await interaction.editReply(buttonPanel(id, data));
      delete draft.pendingButton;
    } else if (action === 'emojipage' && interaction.isButton()) {
      if (!/^[0-4]$/.test(slotValue || '') || !/^-?\d{1,4}$/.test(pageValue || '') || !draft.emojiCatalog) throw new Error('Abre de nuevo el selector de emojis.');
      await interaction.update(emojiPanel(id, Number(slotValue), draft, Number(pageValue)));
    } else if (action === 'emoji' && interaction.isStringSelectMenu?.()) {
      const slot = Number(slotValue);
      if (!/^[0-4]$/.test(slotValue || '') || !linkButtons(draft.data)[slot]) throw new Error('Selecciona un botón válido.');
      const choice = interaction.values[0];
      if (choice !== 'none' && !draft.emojiCatalog?.some(option => option.value === choice)) throw new Error('Selecciona un emoji válido del catálogo.');
      let data = { ...draft.data, buttons: [...linkButtons(draft.data)] };
      data.buttons[slot] = { ...data.buttons[slot], emoji: choice === 'none' ? '' : choice };
      if (slot === 0) data = setFirstButton(data, data.buttons[slot]);
      validateAnnouncement(data);
      draft.data = data;
      await interaction.update(buttonPanel(id, data));
    } else if (action === 'palette' && interaction.isStringSelectMenu?.()) {
      const choice = interaction.values[0];
      if (choice === 'custom') await interaction.showModal(colorModal(id, draft.data, draft.pendingColor));
      else {
        if (choice !== 'automatic' && !colorPalette.some(option => option.value === choice)) throw new Error('Selecciona un color de la paleta.');
        draft.data.color = choice === 'automatic' ? '' : choice;
        delete draft.pendingColor;
        await interaction.update(preview(id, draft.data));
      }
    } else if (action === 'colorform' && interaction.isModalSubmit?.()) {
      const color = interaction.fields.getTextInputValue('color').trim();
      draft.pendingColor = color;
      const data = { ...draft.data, color };
      validateAnnouncement(data);
      draft.data = data;
      delete draft.pendingColor;
      await interaction.deferUpdate();
      await interaction.editReply(preview(id, data));
    } else if (action === 'cancel' && interaction.isButton()) {
      drafts.delete(id);
      await interaction.update({ content: 'Anuncio cancelado.', embeds: [], components: [] });
    } else if (action === 'form' && interaction.isModalSubmit?.()) {
      let data = { ...draft.data };
      for (const key of ['title', 'body', 'url', 'label']) data[key] = interaction.fields.getTextInputValue(key).trim();
      data = setFirstButton(data, { url: data.url, label: data.label, emoji: data.url ? data.emoji : '', style: data.buttonStyle });
      draft.data = data;
      const uploads = interaction.fields.getUploadedFiles('image');
      const attachment = uploads?.first();
      if (attachment) data = applyImage(data, attachment, interaction.attachmentSizeLimit);
      draft.data = data;
      validateAnnouncement(data);
      if (interaction.isFromMessage()) {
        await interaction.deferUpdate();
        await interaction.editReply(preview(id, data));
      } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply(preview(id, data));
      }
    } else if (action === 'channel' && interaction.isChannelSelectMenu?.()) {
      draft.data.channelId = interaction.values[0];
      await interaction.update(preview(id, draft.data));
    } else if (action === 'importance' && interaction.isStringSelectMenu?.()) {
      const data = { ...draft.data, importance: interaction.values[0] };
      validateAnnouncement(data);
      draft.data = data;
      await interaction.update(preview(id, data));
    } else if (action === 'publish' && interaction.isButton()) {
      draft.busy = true;
      try {
        await interaction.deferUpdate();
        const message = await publish(interaction, draft.data, config);
        drafts.delete(id);
        await interaction.editReply({ content: `✅ Publicado: ${message.url}`, embeds: [], components: [], allowedMentions: { parse: [] } });
      } finally { draft.busy = false; }
    } else throw new Error('Acción de anuncio desconocida.');
  } catch (error) {
    console.error('Anuncio fallido:', error.code ?? error.name);
    const payload = { content: `❌ ${error.code ? 'Discord no pudo completar la acción. Revisa los permisos y vuelve a intentarlo.' : error.message}`, allowedMentions: { parse: [] } };
    if (interaction.isModalSubmit?.()) {
      const [action, id, slot] = interaction.customId.slice(PREFIX.length).split(':');
      const draft = drafts.get(id);
      if (draft && draft.owner === interaction.user.id && draft.guildId === interaction.guildId && draft.expires > Date.now() && !draft.busy) {
        const retry = action === 'buttonform' ? `${PREFIX}retrybutton:${id}:${slot}` : action === 'colorform' ? `${PREFIX}retrycolor:${id}` : `${PREFIX}edit:${id}`;
        payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(retry).setLabel('Corregir formulario').setStyle(ButtonStyle.Primary))];
      }
    }
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return true;
}
