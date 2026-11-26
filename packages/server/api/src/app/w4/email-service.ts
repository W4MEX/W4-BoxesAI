import { FastifyBaseLogger } from 'fastify'
import nodemailer from 'nodemailer'

function isConfigured(): boolean {
    return Boolean(process.env.AP_SMTP_HOST && process.env.AP_SMTP_SENDER_EMAIL)
}

async function send({ to, subject, text }: { to: string, subject: string, text: string }): Promise<void> {
    if (!isConfigured()) throw new Error('Configure SMTP to send W4 email')
    const port = Number(process.env.AP_SMTP_PORT ?? 587)
    const transport = nodemailer.createTransport({
        host: process.env.AP_SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: process.env.AP_SMTP_USERNAME ? { user: process.env.AP_SMTP_USERNAME, pass: process.env.AP_SMTP_PASSWORD } : undefined,
        tls: { rejectUnauthorized: true },
    })
    await transport.sendMail({ from: { name: 'W4-BoxesAI', address: process.env.AP_SMTP_SENDER_EMAIL! }, to, subject, text })
}

export const smtpEmailSender = (_log: FastifyBaseLogger) => ({ isSmtpConfigured: isConfigured })

export const emailService = (_log: FastifyBaseLogger) => ({
    async sendInvitation({ userInvitation, invitationLink }: { userInvitation: { email: string }, invitationLink: string }) {
        await send({ to: userInvitation.email, subject: 'Invitación a W4-BoxesAI', text: `Has recibido una invitación a W4-BoxesAI. Para revisarla abre este enlace: ${invitationLink}` })
    },
    async sendProjectMemberAdded({ userInvitation }: { userInvitation: { email: string } }) {
        await send({ to: userInvitation.email, subject: 'Acceso a un proyecto en W4-BoxesAI', text: 'Se ha añadido tu cuenta a un proyecto. Inicia sesión en W4-BoxesAI para consultarlo.' })
    },
    async sendOtp({ userIdentity, otp }: { platformId?: string | null, userIdentity: { email: string }, otp: string, type: unknown }) {
        await send({ to: userIdentity.email, subject: 'Verificación de W4-BoxesAI', text: `Tu código de verificación es: ${otp}` })
    },
})
