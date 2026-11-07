/**
 * Cấu hình Tailwind dùng chung cho toàn bộ dự án QMath.
 * Được gộp từ các khối `tailwind.config` inline trước đây của từng trang.
 *
 * Cách build lại CSS (sau khi sửa HTML/JS có dùng class mới):
 *   npm install        (lần đầu)
 *   npm run build:css
 * Kết quả sinh ra file styles.css ở thư mục gốc.
 */
module.exports = {
  content: ["./*.html", "./*.js"],
  // Dark mode bật/tắt bằng class 'dark' trên <html> (student.html và dashboard.html tự toggle)
  darkMode: "class",
  // Các class được ghép động trong JS (vd: `bg-${levelColor}-50`) mà trình quét
  // không nhìn thấy được -> phải khai báo safelist để không bị thiếu khi build.
  safelist: [
    {
      pattern: /^(bg|text|border)-(gray|green|blue|red|orange|primary)-(50|100|200|500|600)$/,
    },
  ],
  theme: {
    extend: {
      colors: {
        brand: "#0F766E",
        // accent qua biến CSS --color-accent (mặc định #F97316 trong tailwind-input.css)
        // -> sau này muốn đổi màu accent toàn site chỉ cần đổi 1 biến rồi build lại.
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        dark: "#111827",
        darker: "#030712",
        primary: {
          50: "rgb(var(--color-primary-50) / <alpha-value>)",
          100: "rgb(var(--color-primary-100) / <alpha-value>)",
          200: "rgb(var(--color-primary-200) / <alpha-value>)",
          500: "rgb(var(--color-primary-500) / <alpha-value>)",
          600: "rgb(var(--color-primary-600) / <alpha-value>)",
          700: "rgb(var(--color-primary-700) / <alpha-value>)",
          800: "rgb(var(--color-primary-800) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-primary-600) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        // Giữ bản fade nhẹ (chỉ opacity) của dashboard — an toàn cho các trang khác
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(15px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
};
