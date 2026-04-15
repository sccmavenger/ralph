import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/faq", "/privacy", "/terms", "/subscribe"],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/roster",
          "/heroes",
          "/teams",
          "/analyze",
          "/planner",
          "/inventory",
          "/profile",
          "/farming",
          "/subscribe/success",
        ],
      },
    ],
    sitemap: "https://themsftoolkit.com/sitemap.xml",
  };
}
