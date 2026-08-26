import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT || '5173', 10);
const host = '0.0.0.0';
const server = createApp();

server.listen(port, host, () => {
  console.log(`Things Are Down running at http://${host}:${port}`);
});
