/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  serverExternalPackages: ["pdfjs-dist", "exceljs", "@prisma/client", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
