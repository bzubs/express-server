# Delton Inc Express Server

A Node.js + Express backend for SecureWipe, developed and maintained by **Delton Inc**, providing secure device wipe, certificate management, authentication, and drive health prediction APIs. Integrates with a FastAPI backend for advanced operations and supports PDF signature verification.

## Features

- User authentication (JWT-based)
- Device registration and management (MongoDB)
- Certificate storage and retrieval
- Drive health prediction endpoint
- PDF signature verification
- FastAPI integration for advanced wipe and PDF operations
- Cloudinary integration for PDF storage (optional)

## API Endpoints

### Auth

- `POST /auth/register` — Register a new user
- `POST /auth/login` — Login and receive JWT

### Device & Certificate

- `POST /api/wipe-data` — Start device wipe, store device/certificate info, proxy to FastAPI
- `GET /api/certificates/:cert_id` — Get certificate JSON
- `GET /api/certificates/:cert_id/pdf` — Download signed certificate PDF

### Health & Verification

- `POST /api/verify-pdf` — Verify PDF signature (unprotected)
- `POST /api/drive/health` — Predict drive health

### Chatbot

- `POST /api/chatbot` — Ask questions to the AI chatbot (requires `{ question: "..." }` in body)

## Setup

1. **Clone the repository:**

   ```sh
   git clone https://github.com/bzubs/express-server.git
   cd express-server
   ```

---

## **Organization:** Delton Inc

````

2. **Install dependencies:**

```sh
npm install
````

3. **Configure environment variables:**

   - Copy `.env.example` to `.env` and fill in:
     - `MONGO_URI` — MongoDB connection string
     - `JWT_SECRET` — Secret for JWT signing
     - `FASTAPI_BASE` — FastAPI backend URL
     - `FRONTEND_URL` — Allowed CORS origin
     - (Optional) Cloudinary keys for PDF uploads

4. **Start the server:**
   ```sh
   npm run dev
   ```
   or for production:
   ```sh
   npm start
   ```

## Deployment

- Use environment variables for all secrets and config.
- Recommended: Deploy with PM2, Docker, or a cloud platform.
- Ensure MongoDB and FastAPI are accessible from your server.
- Do **not** commit your `.env` file.

## Project Structure

```
.
├── index.js
├── models/
│   ├── user.js
│   ├── device.js
│   └── certificate.js
├── routes/
│   ├── auth.js
│   └── fastapi.js
├── middlewares/
│   └── verify.js
├── config/
│   └── cloudinary.js
├── .env.example
├── .gitignore
└── README.md
```

## License

MIT
