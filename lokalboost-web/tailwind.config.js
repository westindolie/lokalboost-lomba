/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FCF9F2",
          100: "#FBF7EE",
          200: "#F5EFE1",
          300: "#EFE7D4",
        },
        navy: {
          DEFAULT: "#0F2C4C",
          light: "#1C3F63",
          700: "#12314F",
          900: "#0A1F38",
        },
        gold: {
          DEFAULT: "#FFF2BA",
          border: "#F0DE93",
          text: "#8A6D1B",
        },
        ink: {
          DEFAULT: "#1E2A38",
          soft: "#5B6672",
          muted: "#8A94A0",
        },
        skyfoot: "#C9DAEF",
        // Warna status — sebelumnya dipakai ad-hoc (red-500, green-600, dst.)
        success: {
          DEFAULT: "#15803D",
          soft: "#E9F6EE",
          border: "#A7D8B9",
        },
        warning: {
          DEFAULT: "#B45309",
          soft: "#FDF3E3",
          border: "#EFD8A8",
        },
        danger: {
          DEFAULT: "#DC2626",
          soft: "#FDECEC",
          border: "#F3B7B7",
        },
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,44,76,0.06), 0 1px 2px rgba(15,44,76,0.04)",
        cardhover: "0 10px 30px rgba(15,44,76,0.10)",
        soft: "0 4px 20px rgba(15,44,76,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      maxWidth: {
        shell: "1200px",
      },
    },
  },
  plugins: [],
};
