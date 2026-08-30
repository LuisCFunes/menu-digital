# 🍽️ Digital Menu Platform

A modern, dynamic, and fully responsive Digital Menu platform designed for restaurants. This project features a beautiful public-facing menu and a secure, comprehensive admin dashboard for real-time menu content management.

## ✨ Features

- **Public Menu Interface**: A fast, mobile-friendly menu for customers to browse categories, dishes, descriptions, and prices.
- **Admin Dashboard**: Secure, password-protected backend to manage the restaurant's offerings.
- **Real-time CRUD Operations**: Create, Read, Update, and Delete categories and menu items on the fly.
- **Category Reordering**: Intuitively move categories up or down to prioritize what customers see first.
- **Cloud Image Uploads**: Direct integration with Cloudinary to seamlessly upload and store food photography.
- **Theming**: Configurable restaurant branding (colors, logos, and cover images).
- **QR Code Generator**: Integrated tool in the dashboard to instantly generate and download a printable QR code linked to the live menu.

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/) (Server-Side Rendering mode)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database**: [Turso](https://turso.tech/) (LibSQL/SQLite at the edge)
- **Storage**: [Cloudinary](https://cloudinary.com/) SDK for image management
- **Authentication**: Custom session-based auth with Argon2 password hashing
- **Deployment**: [Render](https://render.com/)

## 🚀 Getting Started

### Prerequisites

- Node.js (v22+)
- A Turso database
- A Cloudinary account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/LuisCFunes/menu-digital.git
   cd menu-digital
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory and add your keys:
   ```env
   TURSO_DATABASE_URL=libsql://your-db-name.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
   ADMIN_PASSWORD=<at-least-8-chars-admin-password>
   ```

4. **Seed the database**
   Set `ADMIN_PASSWORD` in `.env` first. The seed refuses to run against a remote Turso database unless you pass `--force`.
   Populate your database with the initial schema and example data:
   ```bash
   npm run seed
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```
   *The app will be available at `http://localhost:4321`*

## 🔒 Security

- **Argon2 Hashing**: The admin dashboard password is stored using Argon2 (legacy plaintext
  passwords are upgraded to Argon2 on first login).
- **Session Management**: HTTP-only, SameSite=Strict cookies backed by 24h sessions in the database;
  cookies carry the `Secure` flag in production builds.
- **Rate Limiting**: Failed dashboard logins are limited to 10 attempts per 15 minutes per IP.
- **Route Protection**: API routes and dashboard pages are guarded by server-side auth checks.
- **Input Validation**: Name, colors, and logo sizes are validated on the server before they reach the
  database (colors must be `#rgb`/`#rrggbb`).
- **Security Headers**: All responses include a Content-Security-Policy, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- **Secrets**: Turso and Cloudinary credentials live only in environment variables; `.env` is gitignored
  and database files are no longer tracked. Rotate any credential that has been shared in plain text.

---
*Developed by Luis Funes.*
