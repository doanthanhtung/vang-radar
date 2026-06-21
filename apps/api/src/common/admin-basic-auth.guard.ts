import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { loadConfig } from "@vang-radar/config";

@Injectable()
export class AdminBasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; adminUsername?: string }>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Basic ")) {
      throw new UnauthorizedException("Admin authentication required");
    }

    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const [username, password] = decoded.split(":");
    const config = loadConfig();

    if (username !== config.ADMIN_USERNAME || password !== config.ADMIN_PASSWORD) {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    request.adminUsername = username;
    return true;
  }
}
