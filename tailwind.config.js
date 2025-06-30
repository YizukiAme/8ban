/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"], // 确保这里指向你的 index.html 文件
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
  'fas', 'fa-sync-alt', 'fa-upload', 'fa-cloud-download-alt', 
  'fa-arrows-rotate', 'fa-solid'
],
}