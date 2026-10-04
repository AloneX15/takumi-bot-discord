import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} from 'discord.js';

const PREFIX = 'takumi:announcement:';
const drafts = new Map();
const TTL = 15 * 60 * 1000;
export const importanceLevels = {
  informativo: { label: 'Informativo', color: 0x3498db },
  novedad: { label: 'Novedad', color: 0x2ecc71 },
  importante: { label: 'Importante', color: 0xf39c12 },
  urgente: { label: 'Urgente', color: 0xe74c3c },
};

export function validateAnnouncement(data, complete = true) {
  if (complete && (!data.title?.trim() || !data.body?.trim())) throw new Error('Completa el título y el mensaje.');
  if ((data.title?.length ?? 0) > 256 || (data.body?.length ?? 0) > 4000) throw new Error('El título admite 256 caracteres y el mensaje 4000.');
  if (!importanceLevels[data.importance]) throw new Error('Selecciona una importancia válida.');
  if (data.color && !/^#[\da-f]{6}$/i.test(data.color)) throw new Error('El color debe tener el formato #FF8800.');
  if (data.url) {
    let url;
    try { url = new URL(data.url); } catch { throw new Error('Introduce un enlace HTTP o HTTPS válido.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || data.url.length > 512) throw new Error('Introduce un enlace HTTP o HTTPS válido, sin credenciales y de hasta 512 caracteres.');
  }
  if (complete && data.label && !data.url) throw new Error('Añade un enlace para usar el texto del botón.');
  if ((data.label?.length ?? 0) > 80) throw new Error('El texto del botón admite 80 caracteres.');
}

export function announcementPayload(data) {
  validateAnnouncement(data);
  const level = importanceLevels[data.importance];
  const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.body)
    .setColor(data.color ? Number.parseInt(data.color.slice(1), 16) : level.color)
    .setFooter({ text: `Creado por TakumiStudios · ${level.label}` }).setTimestamp();
  if (data.image) embed.setImage(data.image);
  const components = data.url ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(data.label || 'Abrir enlace').setURL(data.url),
  )] : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function modal(id, data) {
  const form = new ModalBuilder().setCustomId(`${PREFIX}form:${id}`).setTitle('Preparar anuncio');
  for (const [key, label, max, required, style] of [
    ['title', 'Título', 256, true, TextInputStyle.Short],
    ['body', 'Mensaje', 4000, true, TextInputStyle.Paragraph],
    ['url', 'Enlace HTTP/HTTPS (opcional)', 512, false, TextInputStyle.Short],
    ['label', 'Texto del botón (opcional)', 80, false, TextInputStyle.Short],
    ['color', 'Color #RRGGBB (vacío: según importancia)', 7, false, TextInputStyle.Short],
  ]) {
    const input = new TextInputBuilder().setCustomId(key).setLabel(label).setMaxLength(max).setRequired(required).setStyle(style);
    if (data[key]) input.setValue(data[key]);
    form.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return form;
}

function preview(id, data) {
  const payload = announcementPayload(data);
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
  );
  return { ...payload, content: `Vista previa privada · ${data.channelId ? `Canal: <#${data.channelId}>` : 'Selecciona un canal.'}\nEl borrador caduca a los 15 minutos o al reiniciar el bot.${data.color ? '\nColor personalizado activo; tiene prioridad sobre la importancia.' : ''}`,
    components: [...payload.components, new ActionRowBuilder().addComponents(channel), new ActionRowBuilder().addComponents(importance), buttons] };
}

async function publish(interaction, data) {
  const payload = announcementPayload(data);
  if (!data.channelId) throw new Error('Selecciona un canal.');
  const channel = await interaction.guild.channels.fetch(data.channelId);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Selecciona un canal de texto o de anuncios del servidor.');
  const [bot, member] = await Promise.all([
    interaction.guild.members.fetchMe(), interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) throw new Error('Necesitas el permiso Gestionar servidor para publicar.');
  if (!channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('Necesitas poder ver el canal y enviar mensajes en él.');
  if (!channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('El bot necesita Ver canal, Enviar mensajes e Insertar enlaces en ese canal.');
  return channel.send(payload);
}

export async function handleAnnouncement(interaction, config) {
  const command = interaction.isChatInputCommand() && interaction.commandName === 'anuncio';
  const component = (interaction.isButton() || interaction.isModalSubmit?.() || interaction.isChannelSelectMenu?.() || interaction.isStringSelectMenu?.()) && interaction.customId?.startsWith(PREFIX);
  if (!command && !component) return false;
  try {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) throw new Error('Este bot solo está configurado para su servidor.');
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Necesitas el permiso Gestionar servidor para usar este comando.');
    for (const [key, draft] of drafts) if (draft.expires <= Date.now() && !draft.busy) drafts.delete(key);
    if (command) {
      const data = {
        channelId: interaction.options.getChannel('canal')?.id,
        title: interaction.options.getString('titulo') || '', body: interaction.options.getString('mensaje') || '',
        importance: interaction.options.getString('importancia') || 'informativo',
        color: interaction.options.getString('color')?.trim() || '', url: interaction.options.getString('enlace')?.trim() || '',
        label: interaction.options.getString('boton')?.trim() || '',
      };
      const attachment = interaction.options.getAttachment('imagen');
      if (attachment) {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(attachment.contentType)) throw new Error('La imagen debe ser PNG, JPEG, GIF o WebP.');
        data.image = attachment.url;
      }
      validateAnnouncement(data, false);
      if (data.channelId && data.title.trim() && data.body.trim()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await publish(interaction, data);
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
    const [action, id] = interaction.customId.slice(PREFIX.length).split(':');
    const draft = drafts.get(id);
    if (!draft || draft.expires <= Date.now()) throw new Error('El borrador ha caducado o el bot se ha reiniciado. Usa /anuncio de nuevo.');
    if (draft.owner !== interaction.user.id || draft.guildId !== interaction.guildId) throw new Error('Solo quien creó el anuncio puede modificarlo o publicarlo.');
    if (draft.busy) throw new Error('El anuncio ya se está publicando.');
    if (action === 'edit' && interaction.isButton()) await interaction.showModal(modal(id, draft.data));
    else if (action === 'cancel' && interaction.isButton()) {
      drafts.delete(id);
      await interaction.update({ content: 'Anuncio cancelado.', embeds: [], components: [] });
    } else if (action === 'form' && interaction.isModalSubmit?.()) {
      const data = { ...draft.data };
      for (const key of ['title', 'body', 'url', 'label', 'color']) data[key] = interaction.fields.getTextInputValue(key).trim();
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
        const message = await publish(interaction, draft.data);
        drafts.delete(id);
        await interaction.editReply({ content: `✅ Publicado: ${message.url}`, embeds: [], components: [], allowedMentions: { parse: [] } });
      } finally { draft.busy = false; }
    } else throw new Error('Acción de anuncio desconocida.');
  } catch (error) {
    console.error('Anuncio fallido:', error.code ?? error.name);
    const payload = { content: `❌ ${error.code ? 'Discord no pudo completar la acción. Revisa los permisos y vuelve a intentarlo.' : error.message}`, allowedMentions: { parse: [] } };
    if (interaction.isModalSubmit?.()) {
      const id = interaction.customId.slice(PREFIX.length).split(':')[1];
      const draft = drafts.get(id);
      if (draft && draft.owner === interaction.user.id && draft.guildId === interaction.guildId && draft.expires > Date.now() && !draft.busy) {
        payload.components = [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${PREFIX}edit:${id}`).setLabel('Corregir formulario').setStyle(ButtonStyle.Primary),
        )];
      }
    }
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return true;
}
