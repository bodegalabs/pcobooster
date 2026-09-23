import { oAuthProxy } from "better-auth/plugins/oauth-proxy";

export const createPreviewProxy = (configuration: {
  currentURL: string;
  productionURL: string;
  secret: string;
  production: boolean;
}) => {
  const proxy = oAuthProxy(configuration);
  // Production brokers the provider callback, but never accepts preview login payloads.
  return configuration.production ? { ...proxy, endpoints: {} } : proxy;
};
