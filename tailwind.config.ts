import type { Config } from "tailwindcss";

// Colours are CSS variables, which Tailwind can't add alpha to on its own — `bg-win/10`,
// `text-faint/40` etc. would silently produce no CSS. color-mix() makes the opacity modifier work.
const v = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        border: {
          DEFAULT: v("border"),
          soft: v("border-soft"),
        },
        ink: v("text"),
        dim: v("text-dim"),
        faint: v("text-faint"),
        accent: {
          DEFAULT: v("accent"),
          hover: v("accent-hover"),
          soft: v("accent-soft"),
        },
        win: v("green"),
        loss: v("red"),
        rate: v("blue"),
        neutral: v("neutral"),
        danger: v("danger-border"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      aspectRatio: {
        day: "5 / 4",
      },
    },
  },
  plugins: [],
};

export default config;
