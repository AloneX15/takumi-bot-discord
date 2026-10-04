import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';

export const VERIFY_ID = 'takumi:verify:v1';
const footer = { text: 'Creado por TakumiStudios' };
const administrativePermissions = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers,
];

export function validateRole(role, guild, bot) {
  if (!role || role.id === guild.id || role.managed) throw new Error('Configura un rol de verificado normal, distinto de @everyone.');
  if (administrativePermissions.some(p => role.permissions.has(p))) throw new Error('El rol de verificado tiene permisos administrativos. Retíralos antes de continuar.');
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) throw new Error('El bot necesita Gestionar roles y su rol debe estar por encima de Verificado.');
}

async function getRole(guild, roleId) {
  const [role, bot] = await Promise.all([guild.roles.fetch(roleId), guild.members.fetchMe()]);
  validateRole(role, guild, bot);
  return role;
}

export async function handleInteraction(interaction, config) {
  const verifying = interaction.isButton() && interaction.customId === VERIFY_ID;
  const command = interaction.isChatInputCommand() && ['anuncio', 'verificacion'].includes(interaction.commandName);
  if (!verifying && !command) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) throw new Error('Este bot solo está configurado para su servidor.');
    if (verifying) {
      const role = await getRole(interaction.guild, config.roleId);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(role.id)) return await interaction.editReply('Ya estás verificado. Puedes acceder a los canales habilitados.');
      await member.roles.add(role, 'Verificación mediante el botón de TakumiStudios');
      await interaction.editReply('✅ Verificación completada. Ya tienes el rol de acceso.');
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Necesitas el permiso Gestionar servidor para usar este comando.');
    const channel = interaction.options.getChannel('canal', true);
    const bot = await interaction.guild.members.fetchMe();
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (!channel.permissionsFor(bot)?.has(needed)) throw new Error('El bot necesita Ver canal, Enviar mensajes e Insertar enlaces en ese canal.');
    // Prevent staff from using the bot to publish in channels they cannot access.
    if (!channel.permissionsFor(interaction.member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('Necesitas poder ver el canal y enviar mensajes en él.');
    let message;
    if (interaction.commandName === 'verificacion') {
      await getRole(interaction.guild, config.roleId);
      message = await channel.send({
        embeds: [new EmbedBuilder().setColor(0x7c3aed).setTitle('Bienvenido a TakumiStudios')
          .setDescription('Lee las normas del servidor y pulsa **Verificarme** para obtener acceso al resto de canales.')
          .setFooter(footer)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(VERIFY_ID).setLabel('Verificarme').setEmoji('✅').setStyle(ButtonStyle.Success))],
        allowedMentions: { parse: [] },
      });
    } else {
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle(interaction.options.getString('titulo', true))
        .setDescription(interaction.options.getString('mensaje', true)).setTimestamp().setFooter(footer);
      const attachment = interaction.options.getAttachment('imagen');
      if (attachment) {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(attachment.contentType)) throw new Error('La imagen debe ser PNG, JPEG, GIF o WebP.');
        embed.setImage(attachment.url);
      }
      message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    await interaction.editReply(`✅ Publicado: ${message.url}`);
  } catch (error) {
    // API errors are logged by code only, never with tokens or request headers.
    console.error('Interacción fallida:', error.code ?? error.name);
    const message = error.code ? 'Discord no pudo completar la acción. Revisa los permisos del bot y vuelve a intentarlo.' : error.message;
    await interaction.editReply({ content: `❌ ${message}`, allowedMentions: { parse: [] } });
  }
}
