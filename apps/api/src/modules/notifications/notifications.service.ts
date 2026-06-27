import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service.js";
import { EmailService } from "./email.service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SubscribeRequest = {
  email?: unknown;
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService
  ) {}

  async subscribe(input: SubscribeRequest) {
    const email = this.normalizeEmail(input.email);
    const existingSubscriber = await this.prisma.notificationSubscriber.findUnique({
      where: { email },
      select: {
        email: true,
        status: true,
        buyAlertEnabled: true,
        subscribedAt: true
      }
    });

    if (existingSubscriber?.status === "active" && existingSubscriber.buyAlertEnabled) {
      return {
        email: existingSubscriber.email,
        status: existingSubscriber.status,
        buyAlertEnabled: existingSubscriber.buyAlertEnabled,
        subscribedAt: existingSubscriber.subscribedAt.toISOString(),
        alreadySubscribed: true,
        confirmationEmailSent: false
      };
    }

    if (existingSubscriber) {
      const subscriber = await this.activateSubscriber(email);
      const confirmationEmailSent = await this.emailService.sendSubscriptionConfirmation(email);
      return {
        email: subscriber.email,
        status: subscriber.status,
        buyAlertEnabled: subscriber.buyAlertEnabled,
        subscribedAt: subscriber.subscribedAt.toISOString(),
        alreadySubscribed: false,
        confirmationEmailSent
      };
    }

    const result = await this.createSubscriber(email);
    const subscriber = result.subscriber;
    const confirmationEmailSent = result.alreadySubscribed
      ? false
      : await this.emailService.sendSubscriptionConfirmation(email);

    return {
      email: subscriber.email,
      status: subscriber.status,
      buyAlertEnabled: subscriber.buyAlertEnabled,
      subscribedAt: subscriber.subscribedAt.toISOString(),
      alreadySubscribed: result.alreadySubscribed,
      confirmationEmailSent
    };
  }

  private async activateSubscriber(email: string) {
    return this.prisma.notificationSubscriber.update({
      where: { email },
      data: {
        status: "active",
        buyAlertEnabled: true,
        unsubscribedAt: null,
        subscribedAt: new Date(),
        source: "web"
      },
      select: {
        email: true,
        status: true,
        buyAlertEnabled: true,
        subscribedAt: true
      }
    });
  }

  private async createSubscriber(email: string) {
    try {
      const subscriber = await this.prisma.notificationSubscriber.create({
        data: {
          email,
          status: "active",
          buyAlertEnabled: true,
          source: "web"
        },
        select: {
          email: true,
          status: true,
          buyAlertEnabled: true,
          subscribedAt: true
        }
      });
      return { subscriber, alreadySubscribed: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const subscriber = await this.activateSubscriber(email);
        return { subscriber, alreadySubscribed: true };
      }
      throw error;
    }
  }

  private normalizeEmail(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException("Email không hợp lệ");
    }

    const email = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new BadRequestException("Email không hợp lệ");
    }

    return email;
  }
}
