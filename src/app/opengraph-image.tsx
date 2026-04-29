import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "UNIQAssess — AI-era professional assessment";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0D2E7F 0%, #0A57C6 55%, #0C74D6 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#48D3E4",
          }}
        >
          UNIQAssess
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            Hire for judgement, not for prompts.
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              color: "rgba(255,255,255,0.82)",
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            Scenario-based competency simulations for the AI era. Memo work,
            live AI tools, blind marking with reveal.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "rgba(255,255,255,0.7)",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex" }}>Powered by UNICC</div>
          <div style={{ display: "flex" }}>AI-era professional assessment</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
