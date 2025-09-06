# SecureWipe Server

This is a Node.js Express backend for SecureWipe, providing device wipe, certificate management, authentication, and drive health prediction APIs. It integrates with a FastAPI backend for advanced operations.

## Features

- User authentication (JWT)
- Device registration and management
- Certificate storage and retrieval
- Drive health prediction
- PDF signature verification
- FastAPI integration

## Endpoints

- `/auth/register` & `/auth/login`: User registration and login
- `/wipe`: Start device wipe and store device/certificate info
- `/certificates/:cert_id`: Get certificate JSON
- `/certificates/:cert_id/pdf`: Download signed certificate PDF
- `/verify-pdf`: Verify PDF signature
- `/drive/health`: Predict drive health

## Setup

1. Clone the repo and install dependencies:
   ```sh
   npm install
   ```
2. Set environment variables (see `.env.example`):
   - `JWT_SECRET`
   - MongoDB connection string
   - FastAPI base URL
3. Start the server:
   ```sh
   npm run dev
   ```

## Deployment

- Use environment variables for secrets and config
- Recommended: Deploy with PM2, Docker, or a cloud platform
- Ensure MongoDB and FastAPI are accessible

## License

MIT
