/** @type {import('next').NextConfig} */
const API = process.env.REZO_API_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // The API and media are served by the FastAPI service. Proxying them
    // through Next keeps everything same-origin in the browser, so the widget
    // works inside an iframe and cookies/CORS never become a demo problem.
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/media/:path*", destination: `${API}/media/:path*` },
      { source: "/health", destination: `${API}/health` },
    ];
  },
  async headers() {
    return [
      {
        // The widget is meant to be embedded on a merchant's own domain.
        source: "/widget",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
