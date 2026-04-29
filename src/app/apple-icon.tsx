import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #0D2E7F 0%, #0A57C6 55%, #27C3D9 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize: 96,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          borderRadius: 36,
        }}
      >
        UA
      </div>
    ),
    { ...size }
  );
}
