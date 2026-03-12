import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from './db';
import { env } from '@/env';
import { magicLink } from 'better-auth/plugins';
import LoginEmail from '../../emails/templates/login';
import { resend, sendEmail } from './resend';
import { allowedOrigins } from '../config';

export const auth = betterAuth({
  appName: 'Usul',
  trustedOrigins: allowedOrigins,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          email,
          subject: 'Your Usul login link',
          react: LoginEmail({ loginLink: url, email, domain: 'https://usul.ai' }),
        });
      },
    }),
  ],
  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain:
        env.NODE_ENV === "production" ? "usul.ai" : undefined,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (!user.email) return;

          try {
            await resend.contacts.create({
              email: user.email,
              audienceId: env.RESEND_AUDIENCE_ID,
            });
          } catch (e) {
            console.error('Failed to add user to mailing list:', e);
          }
        },
      },
    },
  },
});
