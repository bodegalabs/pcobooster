import { createFileRoute } from "@tanstack/react-router";

/** Apple verifies these routes before handing an HTTPS invitation or product link to iOS. */
export const Route = createFileRoute("/.well-known/apple-app-site-association")(
  {
    server: {
      handlers: {
        GET: () =>
          Response.json(
            {
              applinks: {
                details: [
                  {
                    appIDs: ["6C46GY4Z38.com.pcobooster.ios"],
                    components: [
                      { "/": "/demo/*" },
                      { "/": "/services/*" },
                      { "/": "/people/*" },
                      { "/": "/songs/*" },
                    ],
                  },
                ],
              },
            },
            { headers: { "Cache-Control": "public, max-age=3600" } }
          ),
      },
    },
  }
);
