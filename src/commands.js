import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('anuncio').setDescription('Publica un anuncio de TakumiStudios.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('canal').setDescription('Dónde publicar el anuncio.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(o => o.setName('titulo').setDescription('Título del anuncio.').setMaxLength(256))
    .addStringOption(o => o.setName('mensaje').setDescription('Texto del anuncio.').setMaxLength(4000))
    .addAttachmentOption(o => o.setName('imagen').setDescription('Imagen opcional (PNG, JPEG, GIF o WebP).'))
    .addStringOption(o => o.setName('importancia').setDescription('Importancia y color predeterminado.').addChoices(
      { name: 'Informativo', value: 'informativo' }, { name: 'Novedad', value: 'novedad' },
      { name: 'Importante', value: 'importante' }, { name: 'Urgente', value: 'urgente' }))
    .addStringOption(o => o.setName('color').setDescription('Color personalizado, por ejemplo #FF8800.').setMaxLength(7))
    .addStringOption(o => o.setName('enlace').setDescription('Enlace HTTP o HTTPS del anuncio.').setMaxLength(512))
    .addStringOption(o => o.setName('boton').setDescription('Texto del botón de enlace.').setMaxLength(80))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji del botón: Unicode, <:nombre:ID> o ID de Discord.').setMaxLength(100))
    .addBooleanOption(o => o.setName('editor').setDescription('Abre la vista previa para añadir botones y elegir un color antes de publicar.')),
  new SlashCommandBuilder().setName('verificacion').setDescription('Publica el panel con el botón de verificación.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('canal').setDescription('Canal público de verificación.').addChannelTypes(ChannelType.GuildText).setRequired(true)),
];
