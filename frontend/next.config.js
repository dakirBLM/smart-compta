/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // opencv.js is a large (~10MB), version-pinned, self-hosted asset used
        // by the document scanner. Cache it aggressively so it's downloaded
        // once per browser, not on every scanner open.
        source: "/opencv/opencv.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
