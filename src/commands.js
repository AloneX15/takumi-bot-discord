import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('anuncio').setDescription('Publica un anuncio de TakumiStudios.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('canal').setDescription('Dónde publicar el anuncio.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título del anuncio.').setMaxLength(256).setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Texto del anuncio.').setMaxLength(4000).setRequired(true))
    .addAttachmentOption(o => o.setName('imagen').setDescription('Imagen opcional (PNG, JPEG, GIF o WebP).')),
  new SlashCommandBuilder().setName('verificacion').setDescription('Publica el panel con el botón de verificación.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('canal').setDescription('Canal público de verificación.').addChannelTypes(ChannelType.GuildText).setRequired(true)),
];
