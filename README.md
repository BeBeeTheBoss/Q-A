# SD Training Feedback Survey

Run the application with Node.js 18 or newer:

```bash
npm start
```

Open http://localhost:2233 in a browser. Survey responses are persisted in `data.json` in this project folder. For development with automatic server restarts, run `npm run dev`.

After `npm start`, the terminal also prints a `Network` URL. Devices on the same Wi-Fi/LAN can open that IP address (for example, `http://192.168.1.10:5000`).

Open `/report` directly to view the separate password-protected report page. Change `ADMIN_PASSWORD` near the top of `server.js` to set a new password.
